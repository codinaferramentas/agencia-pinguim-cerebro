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
// dia citado na seção DISPARO -> lista de origem + índice do dia (getUTCDay)
const MAPA_DIA: Record<string, { lista: string; idx: number }> = {
  segunda: { lista: 'Segunda', idx: 1 }, 'terça': { lista: 'Terça', idx: 2 }, terca: { lista: 'Terça', idx: 2 },
  quarta: { lista: 'Quarta', idx: 3 }, quinta: { lista: 'Quinta', idx: 4 }, sexta: { lista: 'Sexta', idx: 5 },
};
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
  // A seção DISPARO MANDA; o título é só etiqueta visual. (Lição 25/08: card
  // duplicado ficou com título "09:00" e DISPARO 16:40 — tem que valer o 16:40.)
  const h = horaDisparo || horaTitulo;
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

// ---------- monitor da instância (queda = ninguém recebe alerta de agenda) ----------
const CANAL_DISCORD = '1372556339578011701'; // #novo-grupo-pinguim (só FALLBACK se DM falhar)
const MENCOES_QUEDA = [
  '1077338884981133413', // Codina
  '1205120597433122846', // Ingrid Nascimento
  '1210285892489449603', // Fernanda Lisboa
];
const REALERTA_MIN = 60; // se seguir caída, repete o alerta a cada 1h
const CONFIRMACAO_QUEDA_MIN = 3; // espera N min caída antes de alertar (evita spam de soluço)

async function evolutionCfg() {
  const [base, inst, tok] = await Promise.all([
    getChave('EVOLUTION_API_URL', 'alertas-grupos-worker'),
    getChave('EVOLUTION_INSTANCE_ALERTAS_GRUPOS', 'alertas-grupos-worker'),
    getChave('EVOLUTION_INSTANCE_ALERTAS_GRUPOS_TOKEN', 'alertas-grupos-worker'),
  ]);
  return { base: base.replace(/\/$/, ''), inst, tok };
}

async function estadoInstancia(): Promise<string> {
  try {
    const { base, inst, tok } = await evolutionCfg();
    const r = await fetch(`${base}/instance/connectionState/${inst}`, { headers: { apikey: tok } });
    const j = await r.json().catch(() => ({}));
    return j?.instance?.state || `erro-http-${r.status}`;
  } catch (e) {
    return `inacessivel: ${e instanceof Error ? e.message.slice(0, 80) : e}`;
  }
}

// tenta pegar o QR de reconexão (só existe quando a instância está desconectada;
// expira em ~40s — por isso o alerta também ensina a gerar um novo)
async function qrReconexao(): Promise<Uint8Array | null> {
  try {
    const { base, inst, tok } = await evolutionCfg();
    const r = await fetch(`${base}/instance/connect/${inst}`, { headers: { apikey: tok } });
    const j = await r.json().catch(() => ({}));
    const b64 = (j.base64 || j.qrcode?.base64 || '').replace(/^data:image\/\w+;base64,/, '');
    if (!b64) return null;
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  } catch (_) { return null; }
}

async function postarDiscord(conteudo: string, imagemPng?: Uint8Array | null, canalId: string = CANAL_DISCORD) {
  const bot = await getChave('DISCORD_BOT_TOKEN', 'alertas-grupos-worker');
  const payload = { content: conteudo, allowed_mentions: { parse: ['users'] }, flags: 4 };
  let body: BodyInit; const headers: Record<string, string> = { Authorization: `Bot ${bot}` };
  if (imagemPng) {
    const fd = new FormData();
    fd.append('payload_json', JSON.stringify(payload));
    fd.append('files[0]', new Blob([imagemPng.buffer as ArrayBuffer], { type: 'image/png' }), 'qr-reconexao.png');
    body = fd;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload);
  }
  const r = await fetch(`https://discord.com/api/v10/channels/${canalId}/messages`, { method: 'POST', headers, body });
  if (!r.ok) throw new Error(`Discord ${r.status}: ${(await r.text()).slice(0, 150)}`);
}

// Aviso PRIVADO (DM) pro Codina e pra Ingrid — o resto do servidor não vê.
// Se a DM de alguém falhar (privacidade bloqueando), cai no canal como
// fallback marcando a pessoa — alerta de instância nunca pode se perder.
async function avisarResponsaveis(conteudo: string, imagemPng?: Uint8Array | null) {
  const bot = await getChave('DISCORD_BOT_TOKEN', 'alertas-grupos-worker');
  const falharam: string[] = [];
  for (const userId of MENCOES_QUEDA) {
    try {
      const r = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST', headers: { Authorization: `Bot ${bot}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: userId }),
      });
      const dm = await r.json();
      if (!r.ok) throw new Error(`abrir DM: ${r.status}`);
      await postarDiscord(conteudo, imagemPng, dm.id);
    } catch (_) { falharam.push(userId); }
  }
  if (falharam.length) {
    const menc = falharam.map(id => `<@${id}>`).join(' ');
    await postarDiscord(`${menc} (não consegui te mandar DM — avisando por aqui)\n${conteudo}`, imagemPng, CANAL_DISCORD);
  }
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

    // ---------- saúde da instância Evolution (sem ela, nenhum aviso sai) ----------
    const estado = body.simular_queda ? 'close (simulação)' : await estadoInstancia();
    log.instancia = estado;
    if (estado !== 'open') {
      if (cfg?.instancia_status === 'open' && !body.simular_queda) {
        // 1ª vez que vê caída: anota EM SILÊNCIO — pode ser soluço de 30s.
        // Só alerta se continuar caída por CONFIRMACAO_QUEDA_MIN minutos.
        if (!dryRun) {
          await sb.from('alertas_grupos_config').update({
            instancia_status: estado, instancia_caiu_em: agora.toISOString(), atualizado_em: agora.toISOString(),
          }).eq('id', 1);
        }
        log.instancia_obs = `queda detectada — aguardando ${CONFIRMACAO_QUEDA_MIN}min de confirmação antes de alertar`;
      } else {
        const caiuEm = cfg?.instancia_caiu_em ? new Date(cfg.instancia_caiu_em).getTime() : agora.getTime();
        const minCaida = (agora.getTime() - caiuEm) / 60000;
        const ultimoAlerta = cfg?.instancia_ultimo_alerta ? new Date(cfg.instancia_ultimo_alerta).getTime() : 0;
        const confirmada = minCaida >= CONFIRMACAO_QUEDA_MIN;
        const precisaAlertar = confirmada && (!ultimoAlerta || agora.getTime() - ultimoAlerta > REALERTA_MIN * 60000);
        if ((precisaAlertar || body.simular_queda) && !dryRun) {
          const qr = await qrReconexao();
          const cabecalho = body.simular_queda ? '🧪 *[TESTE do alerta de queda — a instância está OK, ignora]*\n' : '';
          await avisarResponsaveis(
            `${cabecalho}🚨 **EVOLUTION CAIU — instância da Ingrid (alertas de agenda no WhatsApp)**\n` +
            `Fora do ar há ${body.simular_queda ? '(simulação)' : Math.round(minCaida) + ' min'} (estado: \`${estado}\`). Enquanto estiver assim, NENHUM aviso sai nos grupos — reconectar é urgente.\n` +
            (qr
              ? `📷 QR de reconexão anexado — **expira em ~40 segundos!** Se não der tempo: WhatsApp da Ingrid → Aparelhos conectados → Conectar aparelho → escanear um QR novo no painel do Evolution (instância elo_1775155882289).`
              : `⚠️ Não consegui gerar o QR automaticamente — reconectar pelo painel do Evolution (instância elo_1775155882289).`) +
            `\nTe aviso aqui assim que reconectar. 🤖`,
            qr,
          );
          if (!body.simular_queda) {
            await sb.from('alertas_grupos_config').update({
              instancia_status: estado, instancia_ultimo_alerta: agora.toISOString(), atualizado_em: agora.toISOString(),
            }).eq('id', 1);
          }
          log.alerta_queda_enviado = true;
        } else if (!confirmada) {
          log.instancia_obs = `caída há ${minCaida.toFixed(1)}min — ainda aguardando confirmação`;
        }
      }
      if (!body.simular_queda) {
        // NÃO processa disparos com a instância caída: as travas ficam
        // preservadas e, se reconectar dentro da janela de 55min, tudo sai.
        log.pulados.push({ motivo: `instância Evolution fora do ar (${estado}) — disparos adiados` });
        return new Response(JSON.stringify({ ok: true, ...log }), { headers: { 'Content-Type': 'application/json' } });
      }
    } else if (cfg?.instancia_status && cfg.instancia_status !== 'open') {
      // voltou ao ar. Aviso de recuperação SÓ se o alerta de queda chegou a
      // sair — soluço curto reconecta em silêncio, ninguém é incomodado.
      const tinhaAlertado = !!cfg.instancia_ultimo_alerta;
      if (tinhaAlertado && !dryRun) {
        await avisarResponsaveis(`✅ **Evolution reconectada** — a instância da Ingrid está ON. Disparos de agenda voltam ao normal (o que ficou pendente dentro da janela de 55 min ainda sai). 🤖`);
      }
      if (!dryRun) {
        await sb.from('alertas_grupos_config').update({ instancia_status: 'open', instancia_caiu_em: null, instancia_ultimo_alerta: null, atualizado_em: agora.toISOString() }).eq('id', 1);
      }
      log.instancia_recuperada = tinhaAlertado ? 'com aviso' : 'soluço curto — silêncio';
    }
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

      // confirmação na agenda — SÓ pros cards recorrentes (Segunda..Sexta).
      // Exceções que dispensam agenda (Andre 25/08): lista Avulso (disparo
      // pontual agendado na mão) e Enviar Agora (manual).
      const isAvulso = card.lista === 'Avulso';
      let agendaOk = true;
      if (!manual && !isAvulso) {
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
        const statusAgenda = isAvulso ? '📌 avulso — dispensa agenda'
          : agendaOk ? '✅ evento confirmado na agenda'
          : '⚠️ SEM evento na agenda (em produção NÃO enviaria)';
        const texto = modoTeste
          ? `🧪 *[TESTE — destino real: ${dest.nome}]*\n${statusAgenda}${manual ? '\n🔁 reenvio manual' : ''}\n———\n${card.mensagem}`
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
        const destinoLista = card.diaSemana ? MAPA_DIA[card.diaSemana.toLowerCase()]?.lista : null;
        await mover(destinoLista || 'Concluidos');
      }
    }

    // ---------- Reserva: card ali NUNCA dispara (bloqueio consciente do time).
    // Quando o horário dele passa no dia dele, o robô devolve sozinho pra
    // lista de origem — pronto pra semana seguinte, sem gestão manual (Andre 25/08).
    log.reserva = [];
    const lReserva = listas.find(x => x.name === 'Reserva');
    if (lReserva) {
      const cardsReserva = await trello(`lists/${lReserva.id}/cards?fields=name,desc`) as any[];
      for (const c of cardsReserva) {
        const card = parseCard(c, 'Reserva');
        const janelaPassou = (() => {
          if (!card.hora) return false;
          const [hh, mm] = card.hora.split(':').map(Number);
          return agora.getTime() > inicioDia.getTime() + (hh * 60 + mm + ATRASO_MAX_MIN) * 60000;
        })();
        const dia = card.diaSemana ? MAPA_DIA[card.diaSemana.toLowerCase()] : null;

        if (dia && b.getUTCDay() === dia.idx && janelaPassou) {
          // dia do card, horário já passou → devolve pra lista de origem
          if (!dryRun) {
            const lDestino = listas.find(x => x.name === dia.lista);
            if (lDestino) await trello(`cards/${card.id}?idList=${lDestino.id}`, { method: 'PUT' });
            await comentarCard(card.id, `⏭️ Hoje (${dataRefDDMM}) NÃO foi disparado — estava na Reserva. Devolvido pra ${dia.lista}: volta a valer na próxima semana.`).catch(() => {});
          }
          log.reserva.push({ card: card.nome, acao: `devolvido pra ${dia.lista}` });
        } else if (!dia && card.dataExplicita) {
          // card avulso com data: passou a data/janela → Concluidos (não foi enviado)
          const [dd, mm2] = card.dataExplicita.split('/').map(Number);
          const passouData = (mm2 < b.getUTCMonth() + 1) || (mm2 === b.getUTCMonth() + 1 && dd < b.getUTCDate())
            || (card.dataExplicita === dataRefDDMM && janelaPassou);
          if (passouData) {
            if (!dryRun) {
              const lConc = listas.find(x => x.name === 'Concluidos');
              if (lConc) await trello(`cards/${card.id}?idList=${lConc.id}`, { method: 'PUT' });
              await comentarCard(card.id, `⏭️ NÃO disparado (estava na Reserva quando a data ${card.dataExplicita} passou). Movido pra Concluidos.`).catch(() => {});
            }
            log.reserva.push({ card: card.nome, acao: 'movido pra Concluidos (data passou sem disparo)' });
          }
        }
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
