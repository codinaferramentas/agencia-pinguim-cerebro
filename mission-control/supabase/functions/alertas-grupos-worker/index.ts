// ========================================================================
// Edge Function: alertas-grupos-worker
// Alertas nos grupos de WhatsApp dos alunos — Trello (programação) +
// agenda contato@ (confirmação) + Evolution (entrega).
//
// Roda via pg_cron a cada 5 min. Em cada execução:
//   1. Lê os cards da lista do dia (Segunda..Sexta) + "Avulso" + "🔁 Enviar Agora"
//   2. Card no horário → resolve grupos pelos LINKS da seção PÚBLICO
//      (match exato na tabela pinguim.grupos_whatsapp_alertas)
//   3. Confirma na agenda contato@ se existe evento HOJE com o link do grupo
//      na descrição (produção: sem evento → não dispara; teste: dispara e anota)
//   4. TRAVA no banco ANTES de enviar (unique card+grupo+dia) — no máximo 1x.
//      Erro da Evolution NÃO reenvia sozinho (vira status 'erro', decisão humana).
//   5. Envia via Evolution (modo_teste: tudo vai pro grupo TESTES com carimbo
//      do destino real). Comenta no card (mantém só os 4 últimos logs).
//   6. Avulso disparado → move card pra "Concluidos". "Enviar Agora" → dispara
//      ignorando a trava (tipo manual) e devolve o card pra lista do dia dele.
//
// Corpo opcional (POST, service_role):
//   { dry_run: true }        → calcula e devolve JSON, não envia nem grava
//   { simular_agora: "ISO" } → trava o relógio (testes)
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

const BOARD = '4HP5oboa';
const CONTA_ROBO = 'ferramenta@agenciapinguim.com';
const AGENDA_CONFIRMACAO = 'contato@agenciapinguim.com';
const TZ_OFFSET_MS = -3 * 3600 * 1000; // America/Sao_Paulo (sem horário de verão desde 2019)
const LISTAS_DIA = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', '']; // index = getUTCDay do relógio BRT
const MARCA_LOG = '🤖'; // prefixo dos comentários do robô (usado na rotação)
const MAX_LOGS_POR_CARD = 4;
const ATRASO_MAX_MIN = 55; // até quanto tempo depois do horário ainda dispara

function brt(d: Date): Date { return new Date(d.getTime() + TZ_OFFSET_MS); }
function horaBRT(d: Date): string {
  const b = brt(d);
  return `${String(b.getUTCHours()).padStart(2, '0')}:${String(b.getUTCMinutes()).padStart(2, '0')}`;
}

// ---------- trello ----------
let _trello: { key: string; token: string } | null = null;
async function trelloAuth(): Promise<string> {
  if (!_trello) {
    const [key, token] = await Promise.all([
      getChave('TRELLO_API_KEY', 'alertas-grupos-worker'),
      getChave('TRELLO_TOKEN', 'alertas-grupos-worker'),
    ]);
    _trello = { key, token };
  }
  return `key=${_trello.key}&token=${_trello.token}`;
}
async function trello(path: string, init?: RequestInit): Promise<any> {
  const auth = await trelloAuth();
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`https://api.trello.com/1/${path}${sep}${auth}`, init);
  const txt = await r.text();
  if (!r.ok) throw new Error(`Trello ${r.status} em ${path.split('?')[0]}: ${txt.slice(0, 150)}`);
  try { return JSON.parse(txt); } catch { return txt; }
}

// ---------- parse do card (formato canônico do quadro Agenda Pinguim) ----------
interface CardParsed {
  id: string;
  nome: string;
  lista: string;
  links: string[];          // links chat.whatsapp.com da seção PÚBLICO
  hora: string | null;      // HH:MM (título tem prioridade; fallback DISPARO)
  dataExplicita: string | null; // DD/MM se houver na seção DISPARO (avulsos)
  diaSemana: string | null; // "Segunda"... se citado no DISPARO
  mensagem: string;         // texto final pro WhatsApp (markdown convertido)
}

function secao(desc: string, nome: string): string {
  // pega o texto entre **NOME** e o próximo **CABEÇALHO** (ou fim)
  const re = new RegExp(`\\*\\*${nome}\\*\\*([\\s\\S]*?)(?=\\n\\*\\*[A-ZÀ-Ú]|$)`, 'i');
  const m = desc.match(re);
  return m ? m[1].trim() : '';
}

function parseCard(c: { id: string; name: string; desc: string }, lista: string): CardParsed {
  const desc = c.desc || '';
  const publico = secao(desc, 'PÚBLICO') || secao(desc, 'PUBLICO');
  const links = [...new Set(publico.match(/https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/g) || [])];

  const disparo = secao(desc, 'DISPARO');
  const horaTitulo = c.name.match(/(\d{1,2}):(\d{2})/);
  const horaDisparo = disparo.match(/(\d{1,2}):(\d{2})/);
  const h = horaTitulo || horaDisparo;
  const hora = h ? `${h[1].padStart(2, '0')}:${h[2]}` : null;
  const dataM = disparo.match(/(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?/);
  const diaM = disparo.match(/segunda|terça|terca|quarta|quinta|sexta/i);

  // MENSAGEM: blockquote -> texto puro pro WhatsApp
  let msg = secao(desc, 'MENSAGEM');
  msg = msg.split('\n')
    .map(l => l.replace(/^>\s?/, ''))
    // remove linha que seja SÓ link de grupo (roteamento perdido no meio da mensagem)
    .filter(l => !/^\s*\[?https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.test(l.trim()))
    .join('\n').trim();
  // markdown Trello -> WhatsApp: [texto](url) -> texto (url) | **negrito** -> *negrito*
  msg = msg
    .replace(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, t, u) => (t === u || !t) ? u : `${t}: ${u}`)
    .replace(/\*\*(.+?)\*\*/g, '*$1*');

  return {
    id: c.id, nome: c.name, lista, links, hora,
    dataExplicita: dataM ? `${dataM[1].padStart(2, '0')}/${dataM[2].padStart(2, '0')}` : null,
    diaSemana: diaM ? diaM[0] : null,
    mensagem: msg,
  };
}

// ---------- google (confirmação na agenda contato@) ----------
async function linksNaAgendaHoje(inicioDia: Date, fimDia: Date): Promise<Set<string>> {
  const { data: conexao } = await sb.from('conexoes_google')
    .select('refresh_token').eq('email_google', CONTA_ROBO).is('revogado_em', null).limit(1).maybeSingle();
  if (!conexao) throw new Error('conexão Google ferramenta@ não encontrada');
  const [cid, csec] = await Promise.all([
    getChave('GOOGLE_OAUTH_CLIENT_ID', 'alertas-grupos-worker'),
    getChave('GOOGLE_OAUTH_CLIENT_SECRET', 'alertas-grupos-worker'),
  ]);
  const tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: conexao.refresh_token, client_id: cid, client_secret: csec, grant_type: 'refresh_token' }),
  });
  const tj = await tr.json();
  if (!tr.ok) throw new Error(`token Google: ${tj.error}`);
  const params = new URLSearchParams({
    singleEvents: 'true', maxResults: '100',
    timeMin: inicioDia.toISOString(), timeMax: fimDia.toISOString(),
  });
  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(AGENDA_CONFIRMACAO)}/events?${params}`,
    { headers: { Authorization: `Bearer ${tj.access_token}` } },
  );
  const j = await r.json();
  if (!r.ok) throw new Error(`agenda: ${j.error?.message}`);
  const links = new Set<string>();
  for (const e of j.items || []) {
    for (const l of (`${e.description || ''} ${e.location || ''}`).match(/https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/g) || []) links.add(l);
  }
  return links;
}

// ---------- evolution ----------
async function enviarWhats(jid: string, texto: string) {
  const [base, inst, tok] = await Promise.all([
    getChave('EVOLUTION_API_URL', 'alertas-grupos-worker'),
    getChave('EVOLUTION_INSTANCE_ALERTAS_GRUPOS', 'alertas-grupos-worker'),
    getChave('EVOLUTION_INSTANCE_ALERTAS_GRUPOS_TOKEN', 'alertas-grupos-worker'),
  ]);
  const url = `${base.replace(/\/$/, '')}/message/sendText/${inst}`;
  let r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: tok },
    body: JSON.stringify({ number: jid, text: texto }),
  });
  if (r.status === 400) { // fallback formato v1
    r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: tok },
      body: JSON.stringify({ number: jid, textMessage: { text: texto } }),
    });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Evolution ${r.status}: ${JSON.stringify(j).slice(0, 180)}`);
  return j;
}

// ---------- comentário + rotação de logs ----------
async function comentarCard(cardId: string, texto: string) {
  await trello(`cards/${cardId}/actions/comments?text=${encodeURIComponent(`${MARCA_LOG} ${texto}`)}`, { method: 'POST' });
  // rotação: mantém só os MAX_LOGS_POR_CARD comentários mais recentes do robô
  const acoes = await trello(`cards/${cardId}/actions?filter=commentCard&limit=50`);
  const doRobo = (acoes as any[]).filter(a => (a.data?.text || '').startsWith(MARCA_LOG));
  for (const velho of doRobo.slice(MAX_LOGS_POR_CARD)) {
    await trello(`actions/${velho.id}`, { method: 'DELETE' }).catch(() => {});
  }
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ erro: 'Use POST' }), { status: 405 });
  const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  let role = '';
  try { role = JSON.parse(atob(auth.split('.')[1])).role || ''; } catch (_) { /* não-JWT */ }
  if (role !== 'service_role') return new Response(JSON.stringify({ erro: 'Só service_role' }), { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* cron manda vazio */ }
  const dryRun = !!body.dry_run;
  const agora = body.simular_agora ? new Date(body.simular_agora) : new Date();
  const log: any = { agora: agora.toISOString(), hora_brt: horaBRT(agora), dry_run: dryRun, disparos: [], pulados: [] };

  try {
    const b = brt(agora);
    const dataBRT = b.toISOString().slice(0, 10);
    const dataRefDDMM = `${String(b.getUTCDate()).padStart(2, '0')}/${String(b.getUTCMonth() + 1).padStart(2, '0')}`;
    const inicioDia = new Date(`${dataBRT}T03:00:00Z`);
    const fimDia = new Date(inicioDia.getTime() + 24 * 3600 * 1000);
    const listaHoje = LISTAS_DIA[b.getUTCDay()];

    // config + de-para
    const { data: cfg } = await sb.from('alertas_grupos_config').select('*').eq('id', 1).maybeSingle();
    const modoTeste = cfg?.modo_teste !== false;
    log.modo = modoTeste ? 'TESTE' : 'PRODUCAO';
    const { data: grupos } = await sb.from('grupos_whatsapp_alertas').select('nome, link_convite, jid_evolution').eq('ativo', true);
    const porLink = new Map((grupos || []).map(g => [g.link_convite, g]));

    // trello: listas e cards de hoje + avulso + enviar agora
    const listas = await trello(`boards/${BOARD}/lists`) as any[];
    const alvos: { lista: string; manual: boolean }[] = [];
    if (listaHoje) alvos.push({ lista: listaHoje, manual: false });
    alvos.push({ lista: 'Avulso', manual: false });
    alvos.push({ lista: '🔁 Enviar Agora', manual: true });

    const cards: { parsed: CardParsed; manual: boolean }[] = [];
    for (const alvo of alvos) {
      const l = listas.find(x => x.name === alvo.lista);
      if (!l) continue;
      const cs = await trello(`lists/${l.id}/cards?fields=name,desc`) as any[];
      for (const c of cs) cards.push({ parsed: parseCard(c, alvo.lista), manual: alvo.manual });
    }

    // agenda de confirmação (1 leitura por tick)
    let linksAgenda: Set<string> | null = null;

    for (const { parsed: card, manual } of cards) {
      const pulo = (motivo: string) => log.pulados.push({ card: card.nome, lista: card.lista, motivo });

      if (!card.links.length) { pulo('sem link de grupo no PÚBLICO'); continue; }
      if (!card.mensagem) { pulo('sem MENSAGEM'); continue; }

      if (!manual) {
        if (!card.hora) { pulo('sem horário'); continue; }
        // Avulso com data explícita só dispara no dia certo
        if (card.lista === 'Avulso' && card.dataExplicita && card.dataExplicita !== dataRefDDMM) { pulo(`data ${card.dataExplicita} ≠ hoje`); continue; }
        const [hh, mm] = card.hora.split(':').map(Number);
        const alvoMs = inicioDia.getTime() + (hh * 60 + mm) * 60000;
        const atrasoMin = (agora.getTime() - alvoMs) / 60000;
        if (atrasoMin < 0) { pulo(`ainda não é ${card.hora}`); continue; }
        if (atrasoMin > ATRASO_MAX_MIN) { pulo(`janela passou (${card.hora})`); continue; }
      }

      // resolve grupos
      const destinos: { nome: string; jid: string }[] = [];
      const desconhecidos: string[] = [];
      for (const link of card.links) {
        const g = porLink.get(link);
        if (g?.jid_evolution) destinos.push({ nome: g.nome, jid: g.jid_evolution });
        else desconhecidos.push(link);
      }
      if (!destinos.length) { pulo(`nenhum link cadastrado no de-para (${desconhecidos.length} desconhecido/s)`); continue; }

      // confirmação na agenda (só automáticos; manual = vontade expressa do gestor)
      let agendaOk = true;
      if (!manual) {
        if (!linksAgenda) linksAgenda = await linksNaAgendaHoje(inicioDia, fimDia);
        agendaOk = card.links.some(l => linksAgenda!.has(l));
        if (!agendaOk && !modoTeste) { pulo('sem evento na agenda contato@ com o link do grupo'); continue; }
      }

      const enviadosNesteCard: string[] = [];
      for (const dest of destinos) {
        if (dryRun) {
          const { data: ja } = await sb.from('disparos_grupos_whatsapp').select('id')
            .eq('card_id', card.id).eq('grupo_jid', dest.jid).eq('data_ref', dataBRT).eq('tipo', 'automatico').maybeSingle();
          log.disparos.push({ card: card.nome, grupo: dest.nome, manual, agenda_ok: agendaOk, enviaria: manual || !ja, modo: log.modo });
          continue;
        }
        // TRAVA (automático): insert antes do envio; unique segura duplicata
        if (!manual) {
          const { error: insErr } = await sb.from('disparos_grupos_whatsapp').insert({
            card_id: card.id, card_nome: card.nome, grupo_jid: dest.jid, grupo_nome: dest.nome,
            data_ref: dataBRT, horario_previsto: card.hora, tipo: 'automatico',
            modo: modoTeste ? 'teste' : 'producao', agenda_confirmada: agendaOk,
          });
          if (insErr) {
            if (String(insErr.code) !== '23505') throw new Error(`trava: ${insErr.message}`);
            continue; // já disparado hoje — trava segurou
          }
        } else {
          await sb.from('disparos_grupos_whatsapp').insert({
            card_id: card.id, card_nome: card.nome, grupo_jid: dest.jid, grupo_nome: dest.nome,
            data_ref: dataBRT, horario_previsto: horaBRT(agora), tipo: 'manual',
            modo: modoTeste ? 'teste' : 'producao', agenda_confirmada: agendaOk,
          });
        }

        // envia (teste: tudo pro grupo de teste, com carimbo do destino real)
        const jidFinal = modoTeste ? cfg!.jid_grupo_teste : dest.jid;
        const texto = modoTeste
          ? `🧪 *[TESTE — destino real: ${dest.nome}]*\n${agendaOk ? '✅ evento confirmado na agenda' : '⚠️ SEM evento na agenda (em produção NÃO enviaria)'}${manual ? '\n🔁 reenvio manual' : ''}\n———\n${card.mensagem}`
          : card.mensagem;
        try {
          await enviarWhats(jidFinal, texto);
          await sb.from('disparos_grupos_whatsapp').update({ status: 'enviado' })
            .eq('card_id', card.id).eq('grupo_jid', dest.jid).eq('data_ref', dataBRT).eq('status', 'enviando');
          enviadosNesteCard.push(dest.nome);
          log.disparos.push({ card: card.nome, grupo: dest.nome, manual, enviado: true, modo: log.modo });
        } catch (e) {
          // NÃO reenvia sozinho: timeout não garante que não enviou (regra do Andre)
          const msg = e instanceof Error ? e.message : String(e);
          await sb.from('disparos_grupos_whatsapp').update({ status: 'erro', erro: msg })
            .eq('card_id', card.id).eq('grupo_jid', dest.jid).eq('data_ref', dataBRT).eq('status', 'enviando');
          log.disparos.push({ card: card.nome, grupo: dest.nome, manual, enviado: false, erro: msg });
        }
      }

      if (dryRun || !enviadosNesteCard.length) continue;

      // log no card (rotação: 4 últimos) + avisos
      const dataFmt = `${dataRefDDMM} ${horaBRT(agora)}`;
      let coment = manual
        ? `🔁 Reenvio manual ${dataFmt} → ${enviadosNesteCard.join(', ')}`
        : `✅ Enviado ${dataFmt} → ${enviadosNesteCard.join(', ')}`;
      if (modoTeste) coment += ' (modo TESTE — foi pro grupo TESTES MGS PINGUIM)';
      if (desconhecidos.length) coment += `\n⚠️ ${desconhecidos.length} link(s) NÃO cadastrado(s) no de-para — avisar o Andre`;
      await comentarCard(card.id, coment).catch(e => log.pulados.push({ card: card.nome, motivo: `comentário falhou: ${e.message}` }));

      // gestão de listas: Avulso → Concluidos; Enviar Agora → volta pro dia (ou Concluidos)
      const mover = async (nomeLista: string) => {
        const l = listas.find(x => x.name === nomeLista);
        if (l) await trello(`cards/${card.id}?idList=${l.id}`, { method: 'PUT' });
      };
      if (card.lista === 'Avulso') await mover('Concluidos');
      else if (manual) {
        const mapa: Record<string, string> = { segunda: 'Segunda', 'terça': 'Terça', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta' };
        const destinoLista = card.diaSemana ? mapa[card.diaSemana.toLowerCase()] : null;
        await mover(destinoLista || 'Concluidos');
      }
    }

    return new Response(JSON.stringify({ ok: true, ...log }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('alertas-grupos-worker:', e);
    return new Response(JSON.stringify({ ok: false, erro: e instanceof Error ? e.message : String(e), ...log }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
