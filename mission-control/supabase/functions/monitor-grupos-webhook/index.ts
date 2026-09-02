// ========================================================================
// Edge Function: monitor-grupos-webhook
// Monitor de sentimento nos grupos de WhatsApp dos alunos.
//
// A Evolution (instância elo_1775155882289, membro dos 10 grupos) manda
// cada MESSAGES_UPSERT pra cá em tempo real. Em cada mensagem:
//   1. valida o token do webhook (header x-monitor-token OU query ?t=)
//   2. descarta: grupo não monitorado, fromMe, sem texto
//   3. classifica com os padrões de pinguim.monitor_grupos_padroes
//      (regex sobre texto normalizado; peso >=3 dispara sozinho; limiar 3;
//      empate/prioridade: chateado_risco > reclamacao > pedido_ajuda)
//      + R2: aluno respondendo msg de ADM → 'resposta_adm' (sempre alerta)
//      + R1: "?" sem responder nem marcar ninguém → 'pedido_ajuda'
//        (URLs removidas antes do teste; ordem: conteúdo > R2 > R1)
//   4. grava TODA mensagem em pinguim.monitor_grupos_mensagens
//      (não-flagadas = corpus pra evoluir os padrões depois)
//   5. flagou e autor NÃO é admin do grupo → DM Discord (Codina + Ingrid)
//      · admins em cache jsonb no grupo (refresh lazy a cada 6h)
//      · debounce 5 min por autor+grupo (não spamma DM em rajada)
//
// Teste (com token válido): body { "teste_classificar": "texto..." }
// → devolve a classificação sem gravar nem alertar.
//
// Zero LLM, zero token de IA. Padrões calibrados em 26/08/2026 contra
// 2.634 mensagens reais dos grupos (10 capturas, zero falso positivo).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'pinguim' },
});

const CANAL_FALLBACK = '1372556339578011701'; // #novo-grupo-pinguim (só se DM falhar)
const DESTINOS_DM = [
  '1077338884981133413', // Codina
  '1205120597433122846', // Ingrid Nascimento
  '1210285892489449603', // Fernanda Lisboa
];
const LIMIAR = 3;
const DEBOUNCE_MIN = 5;
const ADMINS_TTL_H = 6;
const TZ_OFFSET_MS = -3 * 3600 * 1000; // America/Sao_Paulo

const ROTULOS: Record<string, { emoji: string; titulo: string }> = {
  pedido_ajuda: { emoji: '🆘', titulo: 'PEDIDO DE AJUDA' },
  reclamacao: { emoji: '📣', titulo: 'RECLAMAÇÃO' },
  chateado_risco: { emoji: '🚨', titulo: 'ALUNO CHATEADO — RISCO' },
  resposta_adm: { emoji: '💬', titulo: 'RESPOSTA AO ADM' },
};

// ---------- caches em memória (por instância da função) ----------
const CACHE_TTL_MS = 2 * 60 * 1000;
interface Participante { tel: string; nome: string; adm: boolean }
interface Grupo {
  jid: string; nome: string; ativo: boolean;
  admins: string[]; admins_atualizado_em: string | null;
  participantes: Record<string, Participante>;
  discord_canal_id: string | null;
}
interface Padrao { categoria: string; re: RegExp; peso: number; descricao: string }
let _grupos: { at: number; mapa: Map<string, Grupo> } | null = null;
let _padroes: { at: number; lista: Padrao[] } | null = null;

async function grupos(): Promise<Map<string, Grupo>> {
  if (_grupos && Date.now() - _grupos.at < CACHE_TTL_MS) return _grupos.mapa;
  const { data, error } = await sb.from('monitor_grupos')
    .select('jid, nome, ativo, admins, admins_atualizado_em, participantes, discord_canal_id').eq('ativo', true);
  if (error) throw new Error(`ler monitor_grupos: ${error.message}`);
  const mapa = new Map<string, Grupo>();
  for (const g of data ?? []) mapa.set(g.jid, g as Grupo);
  _grupos = { at: Date.now(), mapa };
  return mapa;
}

async function padroes(): Promise<Padrao[]> {
  if (_padroes && Date.now() - _padroes.at < CACHE_TTL_MS) return _padroes.lista;
  const { data, error } = await sb.from('monitor_grupos_padroes')
    .select('categoria, expressao, peso, descricao').eq('ativo', true);
  if (error) throw new Error(`ler monitor_grupos_padroes: ${error.message}`);
  const lista: Padrao[] = [];
  for (const p of data ?? []) {
    try { lista.push({ categoria: p.categoria, re: new RegExp(p.expressao), peso: p.peso, descricao: p.descricao || p.expressao }); }
    catch (_) { /* regex inválida cadastrada no painel não derruba o monitor */ }
  }
  _padroes = { at: Date.now(), lista };
  return lista;
}

// ---------- classificador ----------
function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

function classificar(texto: string, regras: Padrao[]) {
  const t = normalizar(texto);
  const scores: Record<string, number> = {};
  const bateram: Record<string, string[]> = {};
  if (t.length >= 4) {
    for (const p of regras) {
      if (p.re.test(t)) {
        scores[p.categoria] = (scores[p.categoria] || 0) + p.peso;
        (bateram[p.categoria] ??= []).push(p.descricao);
      }
    }
  }
  let categoria: string | null = null, score = 0;
  for (const cat of ['chateado_risco', 'reclamacao', 'pedido_ajuda']) {
    const s = scores[cat] || 0;
    if (s >= LIMIAR && s > score) { categoria = cat; score = s; }
  }
  return { categoria, score, padroes: categoria ? bateram[categoria] : [] };
}

// ---------- participantes do grupo (cache lazy no banco) ----------
function soDigitos(jid: string): string { return (jid || '').split('@')[0].replace(/\D/g, ''); }

// WhatsApp identifica membros por LID (@lid) — id interno que não diz nada
// pro consultor. O /group/participants entrega o de-para pro número real.
async function refreshParticipantes(grupo: Grupo): Promise<void> {
  try {
    const [base, tok] = await Promise.all([
      getChave('EVOLUTION_API_URL', 'monitor-grupos-webhook'),
      getChave('EVOLUTION_API_KEY', 'monitor-grupos-webhook'),
    ]);
    const r = await fetch(`${base.replace(/\/$/, '')}/group/participants/elo_1775155882289?groupJid=${encodeURIComponent(grupo.jid)}`,
      { headers: { apikey: tok } });
    if (!r.ok) return;
    const j = await r.json();
    const parts = j.participants ?? j ?? [];
    const admins: string[] = [];
    const mapa: Record<string, Participante> = {};
    for (const p of (Array.isArray(parts) ? parts : [])) {
      const adm = p.admin === 'admin' || p.admin === 'superadmin';
      if (adm) admins.push(p.id);
      mapa[p.id] = { tel: soDigitos(p.phoneNumber || (String(p.id).endsWith('@s.whatsapp.net') ? p.id : '')), nome: p.name || '', adm };
    }
    grupo.admins = admins;
    grupo.participantes = mapa;
    grupo.admins_atualizado_em = new Date().toISOString();
    await sb.from('monitor_grupos')
      .update({ admins, participantes: mapa, admins_atualizado_em: grupo.admins_atualizado_em, atualizado_em: grupo.admins_atualizado_em })
      .eq('jid', grupo.jid);
  } catch (_) { /* Evolution fora → usa cache velho; melhor alertar admin que perder alerta */ }
}

async function garantirParticipantes(grupo: Grupo, jidProcurado?: string): Promise<void> {
  const idade = grupo.admins_atualizado_em ? Date.now() - new Date(grupo.admins_atualizado_em).getTime() : Infinity;
  const desconhecido = jidProcurado && !(grupo.participantes || {})[jidProcurado];
  // refresh se cache velho OU se apareceu membro fora do cache (entrou no grupo depois)
  if (idade > ADMINS_TTL_H * 3600 * 1000 || (desconhecido && idade > 2 * 60 * 1000)) {
    await refreshParticipantes(grupo);
  }
}

async function ehAdmin(grupo: Grupo, remetenteJid: string): Promise<boolean> {
  await garantirParticipantes(grupo, remetenteJid);
  const alvo = soDigitos(remetenteJid);
  return (grupo.admins || []).some((a) => a === remetenteJid || soDigitos(a) === alvo);
}

// telefone real: participantAlt do payload (se vier em @s.whatsapp.net) > mapa do grupo > vazio
function resolverTelefone(grupo: Grupo, jid: string, alt?: string): string {
  if (jid.endsWith('@s.whatsapp.net')) return soDigitos(jid);
  if (alt && alt.endsWith('@s.whatsapp.net')) return soDigitos(alt);
  return (grupo.participantes || {})[jid]?.tel || '';
}

// nome de um jid (pro ADM respondido): mapa do grupo > último pushName gravado no banco
async function resolverNome(grupo: Grupo, jid: string): Promise<string> {
  const doMapa = (grupo.participantes || {})[jid]?.nome;
  if (doMapa) return doMapa;
  const { data } = await sb.from('monitor_grupos_mensagens')
    .select('remetente_nome').eq('remetente_jid', jid).not('remetente_nome', 'is', null)
    .order('criado_em', { ascending: false }).limit(1);
  return data?.[0]?.remetente_nome || '';
}

function fmtTel(tel: string): string {
  if (!tel) return '';
  // BR: +55 11 99999-9999; outros países: +numero cru
  if (tel.startsWith('55') && (tel.length === 12 || tel.length === 13)) {
    const ddd = tel.slice(2, 4), resto = tel.slice(4);
    return `+55 ${ddd} ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
  }
  return `+${tel}`;
}

// ---------- discord ----------
async function postarDiscord(bot: string, canalId: string, conteudo: string) {
  const r = await fetch(`https://discord.com/api/v10/channels/${canalId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${bot}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: conteudo, allowed_mentions: { parse: ['users'] }, flags: 4 }),
  });
  if (!r.ok) throw new Error(`Discord ${r.status}: ${(await r.text()).slice(0, 150)}`);
}

// Destino primário: canal do grupo no Discord (tag por produto). Sem canal
// configurado ou post falhou → DM do trio (nenhum alerta pode se perder).
async function enviarAlerta(grupo: Grupo, conteudo: string) {
  if (grupo.discord_canal_id) {
    try {
      const bot = await getChave('DISCORD_BOT_TOKEN', 'monitor-grupos-webhook');
      await postarDiscord(bot, grupo.discord_canal_id, conteudo);
      return;
    } catch (_) { /* cai na DM */ }
  }
  await avisarResponsaveis(conteudo);
}

async function avisarResponsaveis(conteudo: string) {
  const bot = await getChave('DISCORD_BOT_TOKEN', 'monitor-grupos-webhook');
  const falharam: string[] = [];
  for (const userId of DESTINOS_DM) {
    try {
      const r = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: { Authorization: `Bot ${bot}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: userId }),
      });
      const dm = await r.json();
      if (!r.ok) throw new Error(`abrir DM: ${r.status}`);
      await postarDiscord(bot, dm.id, conteudo);
    } catch (_) { falharam.push(userId); }
  }
  if (falharam.length === DESTINOS_DM.length) {
    // ninguém recebeu DM — cai no canal marcando os dois (alerta nunca se perde)
    const menc = falharam.map((id) => `<@${id}>`).join(' ');
    await postarDiscord(bot, CANAL_FALLBACK, `${menc} (DM falhou — avisando por aqui)\n${conteudo}`);
  }
}

function horaBRT(ts: number | null): string {
  const d = new Date((ts ? ts * 1000 : Date.now()) + TZ_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// ---------- extração da mensagem do payload Evolution ----------
function extrairTexto(msg: any): string {
  const m = msg?.message ?? {};
  return (m.conversation
    ?? m.extendedTextMessage?.text
    ?? m.imageMessage?.caption
    ?? m.videoMessage?.caption
    ?? m.documentMessage?.caption
    ?? '').toString().trim();
}

// contextInfo: quem a mensagem responde (reply) e quem ela marca (@)
function extrairContexto(msg: any): { respondeuJid: string; mencionados: string[]; citada: string } {
  const m = msg?.message ?? {};
  const ci = m.extendedTextMessage?.contextInfo
    ?? m.imageMessage?.contextInfo
    ?? m.videoMessage?.contextInfo
    ?? m.documentMessage?.contextInfo
    ?? msg?.contextInfo ?? {};
  const q = ci.quotedMessage ?? {};
  const citada = (q.conversation ?? q.extendedTextMessage?.text ?? q.imageMessage?.caption ?? '').toString();
  return {
    respondeuJid: (ci.participant ?? '').toString(),
    mencionados: Array.isArray(ci.mentionedJid) ? ci.mentionedJid : [],
    citada,
  };
}

// R1: "?" sem direção = pergunta jogada no grupo (não responde nem marca ninguém).
// URLs saem antes do teste — todo link tem "?".
function perguntaSemDirecao(texto: string, respondeuJid: string, mencionados: string[]): boolean {
  if (respondeuJid || mencionados.length > 0) return false;
  const semUrl = texto.replace(/https?:\/\/\S+/g, '');
  if (/@\d{6,}/.test(semUrl)) return false; // marcação que veio só no texto
  return semUrl.includes('?');
}

// ---------- handler ----------
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return new Response('método não suportado', { status: 405 });

  // auth: header x-monitor-token OU query ?t= (nem toda versão da Evolution manda headers custom)
  let esperado = '';
  try { esperado = await getChave('MONITOR_GRUPOS_WEBHOOK_TOKEN', 'monitor-grupos-webhook'); } catch (_) { /* sem chave = trava tudo */ }
  const urlObj = new URL(req.url);
  const recebido = req.headers.get('x-monitor-token') || urlObj.searchParams.get('t') || '';
  if (!esperado || recebido !== esperado) return new Response('não autorizado', { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* vazio */ }

  // modo teste: só classifica, não grava, não alerta
  if (typeof body.teste_classificar === 'string') {
    const r = classificar(body.teste_classificar, await padroes());
    return new Response(JSON.stringify({ ok: true, ...r }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Evolution v2: { event, instance, data: {...} } | v1: data em array
  const brutos = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : [];
  let processadas = 0, flagadas = 0;

  for (const item of brutos) {
    try {
      const key = item?.key ?? {};
      const grupoJid = key.remoteJid as string;
      if (!grupoJid || !grupoJid.endsWith('@g.us') || key.fromMe) continue;
      const mapa = await grupos();
      const grupo = mapa.get(grupoJid);
      if (!grupo) continue;

      const texto = extrairTexto(item);
      if (!texto) continue;

      const remetenteJid = (key.participant || key.participantAlt || '') as string;
      const remetenteNome = (item.pushName || '') as string;
      const ts = Number(item.messageTimestamp) || null;
      const ctx = extrairContexto(item);
      await garantirParticipantes(grupo, remetenteJid);
      const telefone = resolverTelefone(grupo, remetenteJid, (key.participantAlt || '') as string);

      let { categoria, score, padroes: quais } = classificar(texto, await padroes());
      // R2: aluno respondendo mensagem de ADM → sempre alerta (categoria própria)
      if (!categoria && ctx.respondeuJid && await ehAdmin(grupo, ctx.respondeuJid)) {
        categoria = 'resposta_adm'; score = 3; quais = ['respondeu mensagem de ADM'];
      }
      // R1: pergunta jogada no grupo (tem "?", não responde nem marca ninguém)
      if (!categoria && perguntaSemDirecao(texto, ctx.respondeuJid, ctx.mencionados)) {
        categoria = 'pedido_ajuda'; score = 3; quais = ['pergunta sem direção (?)'];
      }

      // grava TODA mensagem; conflito (grupo+message_id) = já processada, pula alerta
      const { data: inserida, error: errIns } = await sb.from('monitor_grupos_mensagens')
        .upsert({
          grupo_jid: grupoJid,
          grupo_nome: grupo.nome,
          message_id: key.id || crypto.randomUUID(),
          remetente_jid: remetenteJid,
          remetente_nome: remetenteNome,
          remetente_telefone: telefone || null,
          texto, // completo, sem corte — é a matéria-prima da fase 2
          categoria, score, padroes: quais,
          respondeu_jid: ctx.respondeuJid || null,
          mencionados: ctx.mencionados,
          msg_timestamp: ts ? new Date(ts * 1000).toISOString() : null,
        }, { onConflict: 'grupo_jid,message_id', ignoreDuplicates: true })
        .select('id');
      if (errIns) throw new Error(`insert: ${errIns.message}`);
      if (!inserida || inserida.length === 0) continue; // duplicada
      processadas++;
      if (!categoria) continue;
      flagadas++;
      const linhaId = inserida[0].id;

      // admin do grupo chacoalhando não é reclamação de aluno
      const admin = await ehAdmin(grupo, remetenteJid);
      if (admin) {
        await sb.from('monitor_grupos_mensagens').update({ eh_admin: true, alerta_suprimido: 'admin' }).eq('id', linhaId);
        continue;
      }

      // debounce: mesmo autor+grupo alertado nos últimos N min → não repete DM
      const desde = new Date(Date.now() - DEBOUNCE_MIN * 60 * 1000).toISOString();
      const { data: recentes } = await sb.from('monitor_grupos_mensagens')
        .select('id').eq('grupo_jid', grupoJid).eq('remetente_jid', remetenteJid)
        .gte('alertado_em', desde).limit(1);
      if (recentes && recentes.length > 0) {
        await sb.from('monitor_grupos_mensagens').update({ alerta_suprimido: 'debounce' }).eq('id', linhaId);
        continue;
      }

      const rot = ROTULOS[categoria];
      const linhas = [
        `${rot.emoji} **MONITOR DE GRUPOS — ${rot.titulo}**`,
        `**Grupo:** ${grupo.nome}`,
        `**Quem:** ${remetenteNome || 'sem nome'} (${telefone ? fmtTel(telefone) : 'número não identificado'})`,
        `**Hora:** ${horaBRT(ts)} (BRT) · score ${score}`,
        `**Padrões:** ${quais.slice(0, 3).join(' · ')}`,
      ];
      if (categoria === 'resposta_adm') {
        const admNome = await resolverNome(grupo, ctx.respondeuJid);
        const admTel = resolverTelefone(grupo, ctx.respondeuJid);
        linhas.push(`**ADM respondido:** ${admNome || 'ADM'}${admTel ? ` (${fmtTel(admTel)})` : ''}`);
        if (ctx.citada) linhas.push(`**Msg do ADM:** "${ctx.citada.slice(0, 120).replace(/\n/g, ' ')}"`);
      }
      // Discord aceita no máx 2000 chars/mensagem. O trecho usa todo o espaço
      // que sobrar do cabeçalho; se ainda cortar, avisa que o completo está no banco.
      const AVISO_CORTE = '\n> ✂️ *(mensagem maior que o limite do Discord — texto completo gravado no banco)*';
      const cabecalho = linhas.join('\n');
      const orcamento = 1990 - cabecalho.length - AVISO_CORTE.length - 2;
      let trecho = texto.split('\n').map((l) => `> ${l}`).join('\n');
      const cortou = trecho.length > orcamento;
      if (cortou) trecho = trecho.slice(0, orcamento) + AVISO_CORTE;
      const alerta = `${cabecalho}\n\n${trecho}`;

      try {
        await enviarAlerta(grupo, alerta);
        await sb.from('monitor_grupos_mensagens').update({ alertado_em: new Date().toISOString() }).eq('id', linhaId);
      } catch (e) {
        await sb.from('monitor_grupos_mensagens').update({ alerta_suprimido: `discord: ${String(e).slice(0, 180)}` }).eq('id', linhaId);
      }
    } catch (e) {
      console.error('monitor-grupos item falhou:', e);
    }
  }

  return new Response(JSON.stringify({ ok: true, processadas, flagadas }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
