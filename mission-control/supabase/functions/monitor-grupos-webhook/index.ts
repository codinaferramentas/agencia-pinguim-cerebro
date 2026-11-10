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
//   6. ATENDIMENTO (schema-045): pergunta de aluno abre linha em
//      monitor_atendimentos; ADM respondendo (reply citando o aluno ou @)
//      fecha e posta pergunta+resposta+tempo no destino de atendimento.
//      Mensagens do próprio número da instância (fromMe) contam como ADM.
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
function extrairContexto(msg: any): { respondeuJid: string; respondeuMsgId: string; mencionados: string[]; citada: string } {
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
    respondeuMsgId: (ci.stanzaId ?? '').toString(),
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

// ---------- atendimento: pergunta → resposta do ADM (schema-045) ----------
const AGRUPAR_MIN = 30;        // msgs seguidas do mesmo aluno = 1 atendimento
const RESPOSTA_JANELA_D = 3;   // reply sem msg exata citada fecha atendimento de até 3 dias
interface ConfigAtend { ativo: boolean; canal_id: string | null; dm_user_ids: string[]; postar_respondidas: boolean }
let _cfgAtend: { at: number; cfg: ConfigAtend | null } | null = null;

async function configAtendimento(): Promise<ConfigAtend | null> {
  if (_cfgAtend && Date.now() - _cfgAtend.at < CACHE_TTL_MS) return _cfgAtend.cfg;
  const { data } = await sb.from('monitor_atendimento_config').select('ativo, canal_id, dm_user_ids, postar_respondidas').eq('id', 1).maybeSingle();
  _cfgAtend = { at: Date.now(), cfg: (data as ConfigAtend) ?? null };
  return _cfgAtend.cfg;
}

function ehPerguntaAtendimento(categoria: string | null, texto: string): boolean {
  if (!categoria) return false;
  if (categoria === 'resposta_adm') return texto.replace(/https?:\/\/\S+/g, '').includes('?');
  return true;
}

async function abrirAtendimento(grupo: Grupo, m: {
  jid: string; nome: string; tel: string; categoria: string; texto: string; msgId: string; quando: string;
}) {
  const desde = new Date(new Date(m.quando).getTime() - AGRUPAR_MIN * 60 * 1000).toISOString();
  const { data: aberto } = await sb.from('monitor_atendimentos')
    .select('id, pergunta_texto, pergunta_msg_ids')
    .eq('grupo_jid', grupo.jid).eq('aluno_jid', m.jid).eq('status', 'pendente')
    .gte('ultima_msg_em', desde).order('ultima_msg_em', { ascending: false }).limit(1);
  if (aberto && aberto.length > 0) {
    const a = aberto[0];
    await sb.from('monitor_atendimentos').update({
      pergunta_texto: `${a.pergunta_texto}\n${m.texto}`,
      pergunta_msg_ids: [...(a.pergunta_msg_ids || []), m.msgId],
      ultima_msg_em: m.quando,
    }).eq('id', a.id);
    return;
  }
  await sb.from('monitor_atendimentos').insert({
    grupo_jid: grupo.jid, grupo_nome: grupo.nome,
    aluno_jid: m.jid, aluno_nome: m.nome || null, aluno_telefone: m.tel || null,
    categoria: m.categoria, pergunta_texto: m.texto, pergunta_msg_ids: [m.msgId],
    perguntado_em: m.quando, ultima_msg_em: m.quando,
  });
}

function fmtDuracao(seg: number): string {
  const min = Math.max(1, Math.round(seg / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  if (h < 24) return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
  const d = Math.floor(h / 24), hr = h % 24;
  return hr ? `${d}d ${hr}h` : `${d}d`;
}

function citar(texto: string, max: number): string {
  const t = texto.length > max ? texto.slice(0, max) + '…' : texto;
  return t.split('\n').map((l) => `> ${l}`).join('\n');
}

function horaIsoBRT(iso: string): string {
  const d = new Date(new Date(iso).getTime() + TZ_OFFSET_MS);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

async function enviarAtendimento(cfg: ConfigAtend, conteudo: string) {
  const bot = await getChave('DISCORD_BOT_TOKEN', 'monitor-grupos-webhook');
  if (cfg.canal_id) { await postarDiscord(bot, cfg.canal_id, conteudo); return; }
  let ok = 0;
  for (const userId of cfg.dm_user_ids || []) {
    const r = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { Authorization: `Bot ${bot}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: userId }),
    });
    if (!r.ok) continue;
    try { await postarDiscord(bot, (await r.json()).id, conteudo); ok++; } catch (_) { /* tenta o próximo */ }
  }
  if (ok === 0) throw new Error('nenhuma DM entregue');
}

// ADM respondeu (reply citando aluno ou @aluno) → fecha o atendimento pendente
// e posta pergunta + resposta. Prioridade: msg exata citada > reply ao aluno > @aluno.
async function fecharAtendimento(grupo: Grupo, r: {
  admJid: string; admNome: string; texto: string; msgId: string; quando: string;
  respondeuJid: string; respondeuMsgId: string; mencionados: string[];
}) {
  const cfg = await configAtendimento();
  if (!cfg || !cfg.ativo) return;
  const desde = new Date(new Date(r.quando).getTime() - RESPOSTA_JANELA_D * 86400 * 1000).toISOString();
  let alvo: any = null, como: 'reply' | 'mencao' = 'reply';
  if (r.respondeuMsgId) {
    const { data } = await sb.from('monitor_atendimentos').select('*')
      .eq('grupo_jid', grupo.jid).eq('status', 'pendente')
      .contains('pergunta_msg_ids', [r.respondeuMsgId]).limit(1);
    alvo = data?.[0] ?? null;
  }
  const porAluno = async (jid: string) => {
    const { data } = await sb.from('monitor_atendimentos').select('*')
      .eq('grupo_jid', grupo.jid).eq('aluno_jid', jid).eq('status', 'pendente')
      .gte('ultima_msg_em', desde).order('ultima_msg_em', { ascending: false }).limit(1);
    return data?.[0] ?? null;
  };
  if (!alvo && r.respondeuJid) alvo = await porAluno(r.respondeuJid);
  if (!alvo) {
    for (const jid of r.mencionados) {
      alvo = await porAluno(jid);
      if (alvo) { como = 'mencao'; break; }
    }
  }
  if (!alvo) return;
  await concluirAtendimento(cfg, alvo, grupo.nome, como, r);
}

// fecha (se ainda pendente) e posta pergunta + resposta + tempo no Painel CS
async function concluirAtendimento(cfg: ConfigAtend, alvo: any, canalNome: string, como: string, r: {
  admJid: string; admNome: string; texto: string; msgId: string; quando: string;
}) {
  const seg = Math.max(0, Math.round((new Date(r.quando).getTime() - new Date(alvo.perguntado_em).getTime()) / 1000));
  const { data: fechado } = await sb.from('monitor_atendimentos').update({
    status: 'respondida', adm_jid: r.admJid, adm_nome: r.admNome || null,
    resposta_texto: r.texto, resposta_msg_id: r.msgId, respondido_em: r.quando,
    tempo_resposta_seg: seg, como_respondeu: como,
  }).eq('id', alvo.id).eq('status', 'pendente').select('id, numero, tempo_util_seg');
  if (!fechado || fechado.length === 0) return; // outro ADM fechou antes

  const aluno = `${alvo.aluno_nome || 'sem nome'}${alvo.aluno_telefone ? ` (${fmtTel(alvo.aluno_telefone)})` : ''}`;
  // tempo útil (seg-sex 9h-18h, calculado por trigger no banco); corrido só quando difere
  const util = fechado[0].tempo_util_seg ?? seg;
  const tempo = util === 0 ? 'fora do horário de atendimento'
    : Math.abs(util - seg) < 60 ? fmtDuracao(seg) : `${fmtDuracao(util)} úteis (${fmtDuracao(seg)} corridos)`;
  const post = [
    '━━━━━━━━━━━━━━━━━━━━',
    `✅ **RESPONDIDA** · \`A-${String(fechado[0].numero).padStart(4, '0')}\` · ${canalNome}`,
    '',
    `**Aluno:** ${aluno} · ${horaIsoBRT(alvo.perguntado_em)}${alvo.fora_horario ? ' · 🌙 fora do horário' : ''}`,
    citar(alvo.pergunta_texto, 750),
    '',
    `**Resposta de ${r.admNome || 'ADM'}** · ${horaIsoBRT(r.quando)} · ⏱️ ${tempo}`,
    citar(r.texto, 850),
  ].join('\n').slice(0, 1990);
  // Q&A fica sempre no banco (base de FAQ); post no Discord só se ligado
  if (!cfg.postar_respondidas) return;
  try {
    await enviarAtendimento(cfg, post);
    await sb.from('monitor_atendimentos').update({ postado_em: new Date().toISOString() }).eq('id', alvo.id);
  } catch (e) {
    await sb.from('monitor_atendimentos').update({ postar_erro: String(e).slice(0, 200) }).eq('id', alvo.id);
  }
}

// ---------- atendimento no PRIVADO dos números de CS (schema-047) ----------
// Grupos são lidos só pela instância principal; as demais também estão nos
// grupos e contariam em dobro.
const INSTANCIA_GRUPOS = 'elo_1775155882289';
interface Instancia { instancia: string; canal_nome: string; atendente: string; telefone: string | null; monitora_privado: boolean }
let _instancias: { at: number; mapa: Map<string, Instancia> } | null = null;

async function instancias(): Promise<Map<string, Instancia>> {
  if (_instancias && Date.now() - _instancias.at < CACHE_TTL_MS) return _instancias.mapa;
  const { data } = await sb.from('monitor_instancias').select('instancia, canal_nome, atendente, telefone, monitora_privado');
  const mapa = new Map<string, Instancia>();
  for (const i of data ?? []) mapa.set(i.instancia, i as Instancia);
  _instancias = { at: Date.now(), mapa };
  return mapa;
}

// mídia sem legenda também é pedido no privado (aluno manda muito áudio)
function extrairMidia(msg: any): string {
  const m = msg?.message ?? {};
  if (m.audioMessage) return '[áudio]';
  if (m.imageMessage) return '[imagem]';
  if (m.videoMessage) return '[vídeo]';
  if (m.documentMessage || m.documentWithCaptionMessage) return '[documento]';
  return ''; // figurinha, reação, protocolo etc. não contam
}

// "obrigado", "ok", "👍" sozinhos não abrem atendimento
const PALAVRAS_ACK = new Set(['ok', 'okay', 'oks', 'okk', 'obrigado', 'obrigada', 'obrigadao', 'obrigadaa', 'obg', 'brigado',
  'brigada', 'valeu', 'vlw', 'blz', 'beleza', 'show', 'perfeito', 'top', 'certo', 'entendi', 'combinado', 'ta', 'bom',
  'otimo', 'muito', 'mt', 'mto', 'sim', 'amem', 'kkk', 'kkkk', 'kkkkk', 'rs', 'rsrs', 'de', 'nada', 'tudo', 'joia', 'massa',
  'demais', 'maravilha', 'ah', 'aah', 'tbm', 'tambem', 'gratidao', 'grata', 'grato', 'deus', 'abencoe', 'te', 'e', 'pra', 'voce', 'vc']);
function ehSoAgradecimento(texto: string): boolean {
  const t = normalizar(texto).replace(/[\p{Extended_Pictographic}️‍!.,;:)(❤]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return true; // só emoji/pontuação
  const palavras = t.split(' ');
  return palavras.length <= 6 && palavras.every((p) => PALAVRAS_ACK.has(p));
}

// "oi", "bom dia", "tudo bem?" sozinhos esperam a próxima msg pra abrir
const PALAVRAS_SAUDACAO = new Set(['oi', 'oii', 'oiii', 'ola', 'opa', 'eai', 'e', 'ai', 'bom', 'boa', 'dia', 'tarde', 'noite',
  'tudo', 'td', 'bem', 'bom', 'joia', 'como', 'vai', 'voce', 'vc', 'esta', 'ta', 'tudo', 'certo', 'querida', 'querido', 'amiga', 'amigo']);
function ehSoSaudacao(texto: string, atendente: string): boolean {
  const nomes = normalizar(atendente).split(' ');
  const t = normalizar(texto).replace(/[\p{Extended_Pictographic}️‍!.,;:?)(❤]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return true;
  const palavras = t.split(' ');
  return palavras.length <= 8 && palavras.every((p) => PALAVRAS_SAUDACAO.has(p) || nomes.includes(p));
}

// equipe | aluno | desconhecido (schema-048). Só 'aluno' vira atendimento;
// os outros nem são gravados (conversa pessoal/de equipe não entra).
const _classe = new Map<string, { at: number; classe: string }>();
async function classificarContato(tel: string): Promise<string> {
  if (!tel) return 'desconhecido';
  const c = _classe.get(tel);
  if (c && Date.now() - c.at < 10 * 60 * 1000) return c.classe;
  const { data, error } = await sb.rpc('monitor_classificar_contato', { p_tel: tel });
  if (error) throw new Error(`classificar contato: ${error.message}`);
  const classe = String(data || 'desconhecido');
  _classe.set(tel, { at: Date.now(), classe });
  return classe;
}

// ---------- filtro de IA do privado (schema-049) ----------
// Confirmação ("feito", "respondi"), agradecimento e papo não são pedido.
// Testado em 11 casos reais/sintéticos (11/11). Modelo de classificação = mini.
const PROMPT_FILTRO = `Você filtra mensagens que alunos mandam no WhatsApp PRIVADO da equipe de atendimento (CS) de uma escola de marketing digital (cursos, mentorias, comunidade). Decida se o que o aluno escreveu EXIGE resposta ou ação da equipe.

precisa_resposta = true quando há: dúvida; pedido de ajuda; problema de acesso, pagamento, cobrança ou reembolso; pedido de reagendar, adiar, cancelar ou trocar algo; reclamação ou insatisfação; pedido de informação; relato que pede retorno, opinião ou orientação.

precisa_resposta = false quando é só: cumprimento; agradecimento; confirmação de que fez o que foi pedido ("feito", "respondi", "preenchi", "já salvei"); aviso que não pede nada de volta; conversa social; emoji; resposta que encerra um assunto.

Leia a conversa inteira: se a atendente pediu algo e o aluno só confirmou, é false. Se houver qualquer pergunta ou pedido explícito do aluno, é true.

Responda só JSON: {"precisa_resposta": true|false, "motivo": "até 10 palavras", "resumo": "o pedido em 1 frase curta começando pelo verbo, sem sujeito (ex.: 'Pede para adiar o onboarding'); vazio se false"}`;

async function filtrarPedido(canalId: string, contato: string): Promise<{ filtro: string; motivo: string; resumo: string }> {
  try {
    const { data } = await sb.from('monitor_grupos_mensagens').select('eh_admin, texto, criado_em')
      .eq('grupo_jid', canalId).or(`remetente_jid.eq."${contato}",respondeu_jid.eq."${contato}"`)
      .order('criado_em', { ascending: false }).limit(12);
    const conversa = (data ?? []).reverse()
      .map((m) => `${m.eh_admin ? 'ATENDENTE' : 'ALUNO'} (${horaIsoBRT(m.criado_em)}): ${m.texto.slice(0, 600)}`).join('\n');
    const key = await getChave('OPENAI_API_KEY', 'monitor-grupos-webhook');
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.4-mini', response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: PROMPT_FILTRO }, { role: 'user', content: `Conversa (mais antiga primeiro):\n${conversa}` }],
      }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}`);
    const o = JSON.parse((await r.json()).choices[0].message.content);
    return { filtro: o.precisa_resposta ? 'pedido' : 'sem_pedido', motivo: String(o.motivo || '').slice(0, 200), resumo: String(o.resumo || '').slice(0, 300) };
  } catch (e) {
    console.error('filtro IA falhou:', e);
    return { filtro: 'erro', motivo: String(e).slice(0, 200), resumo: '' }; // melhor sobrar que sumir pedido
  }
}

async function tratarPrivado(inst: Instancia, item: any) {
  const key = item?.key ?? {};
  const midia = extrairMidia(item);
  const texto = extrairTexto(item) || midia;
  if (!texto) return;
  const ts = Number(item.messageTimestamp) || null;
  const quando = ts ? new Date(ts * 1000).toISOString() : new Date().toISOString();
  const canalId = `privado:${inst.instancia}`;
  // o mesmo contato chega como @lid ou @s.whatsapp.net conforme o evento:
  // a chave da conversa é o TELEFONE (resposta da atendente acha a conversa certa)
  const jid = String(key.remoteJid || ''), alt = String(key.remoteJidAlt || key.senderPn || '');
  const tel = jid.endsWith('@s.whatsapp.net') ? soDigitos(jid) : alt.endsWith('@s.whatsapp.net') ? soDigitos(alt) : '';
  if (!tel) return;
  const contato = `${tel}@s.whatsapp.net`;
  const msgId = key.id || crypto.randomUUID();

  // só conversa com ALUNO entra — equipe e desconhecidos nem são gravados
  if (await classificarContato(tel) !== 'aluno') return;

  const { data: ins } = await sb.from('monitor_grupos_mensagens').upsert({
    grupo_jid: canalId, grupo_nome: inst.canal_nome, message_id: msgId,
    remetente_jid: key.fromMe ? inst.instancia : contato,
    remetente_nome: key.fromMe ? inst.atendente : (item.pushName || null),
    remetente_telefone: key.fromMe ? inst.telefone : tel,
    respondeu_jid: key.fromMe ? contato : null, // msg da atendente: com quem é a conversa
    eh_admin: !!key.fromMe, texto, msg_timestamp: ts ? quando : null,
  }, { onConflict: 'grupo_jid,message_id', ignoreDuplicates: true }).select('id');
  if (!ins || ins.length === 0) return; // duplicada

  const cfg = await configAtendimento();
  if (!cfg || !cfg.ativo) return;
  // aberto = pendente, ou descartado pela IA que ninguém respondeu ainda
  const { data: abertos } = await sb.from('monitor_atendimentos').select('*')
    .eq('grupo_jid', canalId).eq('aluno_jid', contato)
    .or('status.eq.pendente,and(status.eq.descartada,respondido_em.is.null)')
    .order('perguntado_em', { ascending: false }).limit(1);
  const aberto = abertos?.[0] ?? null;

  // atendente escreveu na conversa → fecha
  if (key.fromMe) {
    if (aberto?.status === 'pendente') {
      await concluirAtendimento(cfg, aberto, `📱 ${inst.canal_nome}`, 'privado', {
        admJid: inst.instancia, admNome: inst.atendente, texto, msgId, quando,
      });
    } else if (aberto) {
      await sb.from('monitor_atendimentos').update({ respondido_em: quando, adm_nome: inst.atendente }).eq('id', aberto.id);
    }
    return;
  }

  // aluno escreveu: sem nada aberto, cumprimento/agradecimento sozinho nem chega na IA
  if (!aberto && (ehSoAgradecimento(texto) || ehSoSaudacao(texto, inst.atendente))) return;

  const f = await filtrarPedido(canalId, contato);
  const status = f.filtro === 'sem_pedido' ? 'descartada' : 'pendente';
  const classificacao = { status, filtro: f.filtro, filtro_motivo: f.motivo, resumo: f.resumo || null };

  if (aberto) {
    await sb.from('monitor_atendimentos').update({
      ...classificacao,
      pergunta_texto: `${aberto.pergunta_texto}\n${texto}`,
      pergunta_msg_ids: [...(aberto.pergunta_msg_ids || []), msgId],
      ultima_msg_em: quando,
    }).eq('id', aberto.id);
    return;
  }

  // abriu: puxa o "oi/bom dia" que veio antes (última 1h, depois da última msg da atendente)
  const { data: ultAtend } = await sb.from('monitor_grupos_mensagens').select('criado_em')
    .eq('grupo_jid', canalId).eq('respondeu_jid', contato).eq('eh_admin', true)
    .order('criado_em', { ascending: false }).limit(1);
  const corte = new Date(Math.max(Date.now() - 3600 * 1000,
    ultAtend?.[0]?.criado_em ? new Date(ultAtend[0].criado_em).getTime() : 0)).toISOString();
  const { data: antes } = await sb.from('monitor_grupos_mensagens').select('message_id, texto, msg_timestamp, criado_em')
    .eq('grupo_jid', canalId).eq('remetente_jid', contato).neq('message_id', msgId)
    .gt('criado_em', corte).order('criado_em');
  const previas = antes ?? [];
  await sb.from('monitor_atendimentos').insert({
    ...classificacao,
    grupo_jid: canalId, grupo_nome: inst.canal_nome, canal_tipo: 'privado',
    aluno_jid: contato, aluno_nome: item.pushName || null, aluno_telefone: tel,
    categoria: 'privado',
    pergunta_texto: [...previas.map((m) => m.texto), texto].join('\n'),
    pergunta_msg_ids: [...previas.map((m) => m.message_id), msgId],
    perguntado_em: previas[0]?.msg_timestamp || previas[0]?.criado_em || quando,
    ultima_msg_em: quando,
  });
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
      if (!grupoJid) continue;
      const instanciaNome = String(body?.instance || '');

      // conversa privada (1:1) num número de atendimento cadastrado
      if (grupoJid.endsWith('@s.whatsapp.net') || grupoJid.endsWith('@lid')) {
        const inst = (await instancias()).get(instanciaNome);
        if (inst && inst.monitora_privado) await tratarPrivado(inst, item);
        continue;
      }
      if (!grupoJid.endsWith('@g.us')) continue; // status, canal, broadcast
      if (instanciaNome && instanciaNome !== INSTANCIA_GRUPOS) continue; // grupos só pela instância principal
      const mapa = await grupos();
      const grupo = mapa.get(grupoJid);
      if (!grupo) continue;

      const texto = extrairTexto(item);
      if (!texto) continue;

      const ts = Number(item.messageTimestamp) || null;
      const quando = ts ? new Date(ts * 1000).toISOString() : new Date().toISOString();
      const ctx = extrairContexto(item);

      // fromMe = o próprio número da instância (ADM do grupo) falando.
      // Não é aluno: não classifica nem alerta — só grava e, se for reply/@,
      // pode fechar um atendimento.
      if (key.fromMe) {
        const meuJid = (key.participant || body?.sender || 'instancia') as string;
        const meuNome = (item.pushName || 'ADM (número monitor)') as string;
        const { data: ins } = await sb.from('monitor_grupos_mensagens').upsert({
          grupo_jid: grupoJid, grupo_nome: grupo.nome, message_id: key.id || crypto.randomUUID(),
          remetente_jid: meuJid, remetente_nome: meuNome, eh_admin: true, texto,
          respondeu_jid: ctx.respondeuJid || null, respondeu_msg_id: ctx.respondeuMsgId || null,
          mencionados: ctx.mencionados, msg_timestamp: ts ? quando : null,
        }, { onConflict: 'grupo_jid,message_id', ignoreDuplicates: true }).select('id');
        if (ins && ins.length > 0 && (ctx.respondeuJid || ctx.mencionados.length > 0)) {
          await fecharAtendimento(grupo, {
            admJid: meuJid, admNome: meuNome, texto, msgId: key.id || '', quando,
            respondeuJid: ctx.respondeuJid, respondeuMsgId: ctx.respondeuMsgId, mencionados: ctx.mencionados,
          }).catch((e) => console.error('atendimento (fromMe) falhou:', e));
        }
        continue;
      }

      const remetenteJid = (key.participant || key.participantAlt || '') as string;
      const remetenteNome = (item.pushName || '') as string;
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
          respondeu_msg_id: ctx.respondeuMsgId || null,
          mencionados: ctx.mencionados,
          msg_timestamp: ts ? new Date(ts * 1000).toISOString() : null,
        }, { onConflict: 'grupo_jid,message_id', ignoreDuplicates: true })
        .select('id');
      if (errIns) throw new Error(`insert: ${errIns.message}`);
      if (!inserida || inserida.length === 0) continue; // duplicada
      processadas++;
      const linhaId = inserida[0].id;

      // ADM respondendo aluno (reply/@) → pode fechar atendimento
      if ((ctx.respondeuJid || ctx.mencionados.length > 0) && await ehAdmin(grupo, remetenteJid)) {
        await sb.from('monitor_grupos_mensagens').update({ eh_admin: true }).eq('id', linhaId);
        await fecharAtendimento(grupo, {
          admJid: remetenteJid, admNome: remetenteNome || await resolverNome(grupo, remetenteJid),
          texto, msgId: key.id || '', quando,
          respondeuJid: ctx.respondeuJid, respondeuMsgId: ctx.respondeuMsgId, mencionados: ctx.mencionados,
        }).catch((e) => console.error('atendimento (adm) falhou:', e));
      }

      if (!categoria) continue;
      flagadas++;

      // admin do grupo chacoalhando não é reclamação de aluno
      const admin = await ehAdmin(grupo, remetenteJid);
      if (admin) {
        await sb.from('monitor_grupos_mensagens').update({ eh_admin: true, alerta_suprimido: 'admin' }).eq('id', linhaId);
        continue;
      }

      // pergunta de aluno → abre/agrupa atendimento (independe do debounce do alerta)
      if (ehPerguntaAtendimento(categoria, texto)) {
        await abrirAtendimento(grupo, {
          jid: remetenteJid, nome: remetenteNome, tel: telefone, categoria, texto, msgId: key.id || '', quando,
        }).catch((e) => console.error('abrir atendimento falhou:', e));
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
