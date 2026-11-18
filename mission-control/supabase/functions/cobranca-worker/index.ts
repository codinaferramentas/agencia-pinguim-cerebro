// ========================================================================
// Edge Function: cobranca-worker
// ========================================================================
// Robô da Gestão de Cobrança do CRM (/cobranca) — André 18/11/2026.
// Roda a cada 2 minutos, das 8h às 20h (Brasília). A cada rodada:
//   1. LEITURA: traz da Hotmart (crm_compra) quem tem parcela recorrente em aberto e fecha quem pagou
//      (pinguim.crm_cobranca_sincronizar).
//   2. FILA DO DIA: a partir do horário das Regras, monta uma vez por dia a fila dos pendentes, uma fila
//      por número, com pausa sorteada entre os envios e limite diário por número. Primeiro entram os
//      atrasos recentes; o que sobrar do limite do dia é preenchido com a CARTEIRA ANTIGA (atraso acima
//      de config.antiga dias), que assim vai sendo esvaziada um pouco por dia.
//      No modo «com aprovação», só monta depois que a tutora aprova na tela.
//   3. ALERTA: envia pelo WhatsApp da tutora do produto (Evolution), UMA ÚNICA VEZ por caso.
//   4. AVISO DE PAUSA: publica no Discord marcando Rafael, Djairo e a tutora. É SÓ AVISO: o sistema
//      não tira acesso de app, de área de membros nem remove de grupo.
// Regras de segurança:
//   - Trava geral (config.envio): desligada, o robô só faz a leitura. Nada sai por WhatsApp nem no Discord.
//   - No máximo uma vez: o caso é carimbado ANTES do envio. Se a função cair no meio, não reenvia.
//   - Início (config.envio_desde): com a trava ligada, os envios só começam nesse dia.
//   - Antes de enviar, a leitura acabou de rodar: quem pagou já saiu da fila.
//   - CONFERÊNCIA NA HOTMART na hora do envio (André 18/11): o robô pergunta direto à Hotmart, nas duas contas,
//     se existe pagamento aprovado do produto desde o vencimento. Existe → não envia e o caso vai para
//     conferência manual. A Hotmart não respondeu → não envia e tenta de novo mais tarde. Só envia com «sem pagamento».
//   - LINK DE PAGAMENTO (André 18/11): para Pix e boleto, logo antes do envio o robô gera na Hotmart um Pix da
//     dívida (negociação de parcelas) e manda o link na mensagem. Vale 48 horas. Se a Hotmart não gerar,
//     o alerta sai sem o link. Parcelamento Hotmart e cartão não têm esse link.
//   - Forma de pagamento fora das Regras (padrão: só Pix e boleto): o caso fica no quadro, mas o robô não envia.
//   - Número sem WhatsApp: marca o caso para contato manual, sem nova tentativa.
//   - Falha técnica: DM só para o Codina, nunca em canal do time.
// Modos (body): {} = cron · {id, por} = «Enviar alerta agora» da tela · {dry_run:true} = lista o que faria, sem enviar
//               · {id, teste_para, teste_nome?} = envia o texto do caso para um número de teste, sem carimbar
//               · {id, gerar_link:true, por} = «Gerar link de pagamento» da tela: devolve o Pix do caso (reaproveita o que ainda vale)
//               · {id, teste_pausa:true} = manda o aviso de pausa do caso só no privado do Codina
//               · {conferir:true} = confere na Hotmart todos os pendentes e devolve quem aparece pago (só leitura)
//               · {conferir:'pagos'} = prova inversa: os casos já fechados como pagos têm de aparecer pagos na Hotmart
//               · {prova:{cliente_id, prod, venc}} = diagnóstico: o que a conferência na Hotmart responde para um cliente.
// As regras de etapa repetem as de crm-pinguim/lib/cobranca.js; ao mudar lá, mudar aqui.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE, { auth: { persistSession: false }, db: { schema: 'pinguim' } });
const CONSUMIDOR = 'cobranca-worker';
const VIA: Record<string, { nome: string; chave: string; discord: string }> = {
  ingrid: { nome: 'Ingrid', chave: 'EVOLUTION_INSTANCE_ALERTAS_GRUPOS', discord: '1205120597433122846' },
  fernanda: { nome: 'Fernanda', chave: 'EVOLUTION_INSTANCE_ELO_FERNANDA', discord: '1210285892489449603' },
};
const DISCORD_RAFAEL = '1083728715726463068', DISCORD_DJAIRO = '1083731934238228590', DISCORD_CODINA = '1077338884981133413';
const FIM_DO_DIA = 20 * 60, TENTATIVAS = 3;

// ---------------- regras (espelho de lib/cobranca.js) ----------------
const PROD: [RegExp, string][] = [[/taurus.*low/i, 'Taurus Low Ticket'], [/taurus/i, 'Taurus Master'], [/orion/i, 'Mastermind Orion'], [/lyra/i, 'Lyra'], [/elo/i, 'Comunidade Elo'], [/pro\s?alt/i, 'ProAlt']];
const EXPERT: Record<string, string> = { 'ProAlt': 'Pedro Aredes', 'Taurus Low Ticket': 'Pedro Aredes', 'Taurus Master': 'Pedro Aredes', 'Mastermind Orion': 'Pedro Aredes', 'Comunidade Elo': 'Micha Menezes', 'Lyra': 'Micha Menezes' };
const GRUPO: Record<string, string> = { PIX: 'pix', PIX_AUTOMATIC: 'pix', BILLET: 'boleto', HOTMART_INSTALLMENTS: 'parcelado', CREDIT_CARD: 'cartao', WALLET: 'cartao', APPLE_PAY: 'cartao' };
const OPCOES: Record<string, any[]> = { alerta: [3, 5, 7, 10], pausa: [15, 20, 30, 45], hora: ['8h', '9h', '10h', '14h'], modo: ['auto', 'aprovacao'], lote: [1, 2], imin: [1, 2, 3, 5], imax: [5, 10, 15], teto: [10, 20, 30, 40], antiga: [30, 45, 60] };
const PADRAO: any = { alerta: 7, pausa: 15, hora: '10h', modo: 'auto', lote: 1, imin: 2, imax: 10, teto: 20, antiga: 30, formas: { pix: true, boleto: true, parcelado: false, cartao: false },
  dono: { 'ProAlt': 'ingrid', 'Taurus Low Ticket': 'ingrid', 'Taurus Master': 'ingrid', 'Mastermind Orion': 'ingrid', 'Comunidade Elo': 'fernanda', 'Lyra': 'fernanda' },
  copy: 'Olá, {nome}! Tudo bem?\n\nAqui é a {tutora}, da equipe do {expert}. Identificamos uma parcela em aberto do {produto}:\n\n*{valor}*, com vencimento em {vencimento}.\n\n{pagamento}Estou avisando para ajudar você a regularizar o quanto antes e manter os seus acessos liberados.\n\nSe o pagamento já foi feito, por favor desconsidere esta mensagem. Se precisar de ajuda ou de outra forma de pagamento, responda por aqui.',
  envio: false, envio_desde: '', discord_canal: '' };
function normalizarConfig(d: any) {
  const x = d && typeof d === 'object' ? d : {}, c: any = { ...PADRAO, formas: { ...PADRAO.formas }, dono: { ...PADRAO.dono } };
  for (const k of Object.keys(OPCOES)) if (OPCOES[k].includes(x[k])) c[k] = x[k];
  for (const k of Object.keys(c.formas)) if (typeof x.formas?.[k] === 'boolean') c.formas[k] = x.formas[k];
  for (const k of Object.keys(c.dono)) if (VIA[x.dono?.[k]]) c.dono[k] = x.dono[k];
  if (typeof x.copy === 'string' && x.copy.trim().length >= 20) c.copy = x.copy.slice(0, 2000);
  c.envio = x.envio === true;
  c.envio_desde = /^\d{4}-\d\d-\d\d$/.test(String(x.envio_desde || '')) ? String(x.envio_desde) : '';
  c.discord_canal = /^\d{17,20}$/.test(String(x.discord_canal || '')) ? String(x.discord_canal) : '';
  return c;
}
// envios valendo: trava ligada e, se houver data de início, só a partir dela
const ligado = (cfg: any, hoje: string) => cfg.envio && (!cfg.envio_desde || hoje >= cfg.envio_desde);
const brl = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dm = (iso: string) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
const brt = (d = new Date()) => { const x = new Date(+d - 3 * 3600e3); return { dia: x.toISOString().slice(0, 10), min: x.getUTCHours() * 60 + x.getUTCMinutes() }; };
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const nomeBonito = (n: string) => String(n || '').split('|')[0].trim().toLowerCase().replace(/(^|\s)(\S)/g, (_m, a, b) => a + b.toUpperCase()).replace(/\s(De|Da|Do|Dos|Das|E)\s/g, (m) => m.toLowerCase());
const primeiro = (n: string) => String(n || '').split(' ')[0];
const curto = (n: string) => { const a = String(n || '').split(' ').filter(Boolean); return a.length > 1 ? a[0] + ' ' + a[a.length - 1] : a[0] || ''; };
const alertaRef = (p: any) => (p.alerta_em && p.alerta_status !== 'erro' ? p.alerta_em : p.manual === 'alerta' ? p.manual_em : null);
function etapa(p: any, cfg: any, hoje: string) {
  if (p.fechado_motivo === 'pago' || p.manual === 'pago') return 'pago';
  if (p.manual === 'negociando') return 'negociando';
  if (p.dias < cfg.alerta) return 'atraso';
  const ref = alertaRef(p);
  if (!ref) return 'pendente';
  if (p.pausa_em) return 'pausa';
  if (p.dias >= cfg.pausa && diasEntre(brt(new Date(ref)).dia, hoje) >= cfg.pausa - cfg.alerta) return 'pausa';
  return 'alerta';
}
// trecho do link de pagamento: entra no lugar de {pagamento} (ou no fim, se o texto das Regras não tiver o campo)
const quandoBR = (iso: string) => { const x = new Date(Date.parse(iso) - 3 * 3600e3).toISOString(); return `${x.slice(8, 10)}/${x.slice(5, 7)} às ${x.slice(11, 13)}h${x.slice(14, 16) === '00' ? '' : x.slice(14, 16)}`; };
const linkVale = (p: any, folgaH = 0) => !!p.link_url && !!p.link_expira && Date.parse(p.link_expira) > Date.now() + folgaH * 3600e3;
const trechoLink = (l: any) => (l ? `Para facilitar, este é o link para pagamento por Pix (${brl(l.link_valor)}), válido até ${quandoBR(l.link_expira)}:\n${l.link_url}\n\n` : '');
const mensagem = (p: any, cfg: any, link: any = null) => (cfg.copy.includes('{pagamento}') ? cfg.copy.replace(/\{pagamento\}/g, trechoLink(link)) : cfg.copy + (link ? '\n\n' + trechoLink(link).trim() : '')).replace(/\{nome\}/g, primeiro(p.nome)).replace(/\{tutora\}/g, VIA[p.via].nome).replace(/\{expert\}/g, EXPERT[p.prod] || 'Pedro Aredes').replace(/\{produto\}/g, p.prod)
  .replace(/\{valor\}/g, p.n_abertas > 1 ? `${p.n_abertas} parcelas de ${brl(p.parcela)}` : `Parcela de ${brl(p.parcela)}`)
  .replace(/\{vencimento\}/g, dm(p.venc) + (p.n_abertas > 1 ? ' (a mais antiga)' : ''));

// ---------------- Evolution ----------------
class SemWhatsApp extends Error {}
async function enviarWhats(via: string, tel: string, texto: string): Promise<string> {
  const chave = VIA[via].chave;
  const [base, inst, tok] = await Promise.all([getChave('EVOLUTION_API_URL', CONSUMIDOR), getChave(chave, CONSUMIDOR), getChave(chave + '_TOKEN', CONSUMIDOR)]);
  const raiz = base.replace(/\/$/, ''), i = encodeURIComponent(inst), h = { 'Content-Type': 'application/json', apikey: tok };
  const dig = String(tel || '').replace(/\D/g, '');
  // O cadastro guarda DDD + 8 dígitos. O próprio WhatsApp diz qual é o número certo (com ou sem o nono dígito).
  const numeros = dig.length === 10 ? ['55' + dig, '55' + dig.slice(0, 2) + '9' + dig.slice(2)] : dig.length === 11 ? ['55' + dig, '55' + dig.slice(0, 2) + dig.slice(3)] : [dig];
  let destino = '';
  const c = await fetch(`${raiz}/chat/whatsappNumbers/${i}`, { method: 'POST', headers: h, body: JSON.stringify({ numbers: numeros }) });
  if (c.ok) {
    const j = await c.json().catch(() => []);
    const achado = (Array.isArray(j) ? j : []).find((x: any) => x?.exists);
    if (!achado) throw new SemWhatsApp('o número ' + numeros[0] + ' não tem WhatsApp');
    destino = achado.jid || achado.number;
  } else throw new Error(`o WhatsApp da ${VIA[via].nome} não respondeu à conferência do número (${c.status})`);
  const url = `${raiz}/message/sendText/${i}`;
  let r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ number: destino, text: texto }) });
  if (r.status === 400) r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ number: destino, textMessage: { text: texto } }) });
  if (!r.ok) throw new Error(`o WhatsApp da ${VIA[via].nome} recusou o envio (${r.status}): ` + (await r.text()).slice(0, 160));
  return String(destino).replace(/@.*/, '');
}

// ---------------- Hotmart: conferência na hora do envio ----------------
// Os produtos estão em duas contas da Hotmart. A consulta padrão de vendas devolve só pagamentos aprovados/completos.
const CONTAS_HOTMART = ['', '_INSTITUTO'];
const tokHotmart: Record<string, { t: string; ate: number }> = {};
async function tokenHotmart(suf: string) {
  if (tokHotmart[suf] && tokHotmart[suf].ate > Date.now() + 60e3) return tokHotmart[suf].t;
  const [id, seg, basic] = await Promise.all([getChave('HOTMART_CLIENT_ID' + suf, CONSUMIDOR), getChave('HOTMART_CLIENT_SECRET' + suf, CONSUMIDOR), getChave('HOTMART_BASIC_TOKEN' + suf, CONSUMIDOR)]);
  const r = await fetch(`https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=${id}&client_secret=${seg}`, { method: 'POST', headers: { Authorization: `Basic ${String(basic).replace(/^Basic\s+/i, '')}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('a Hotmart recusou a autenticação (' + r.status + ')');
  tokHotmart[suf] = { t: j.access_token, ate: Date.now() + (parseInt(j.expires_in, 10) || 600) * 1000 };
  return j.access_token as string;
}
const familia = (nome: string) => (PROD.find(([r]) => r.test(nome || '')) || [0, String(nome || '').trim().toLowerCase()])[1] as string;
// Devolve o pagamento aprovado do mesmo produto feito desde o vencimento (ou null). Qualquer falha de consulta
// vira erro: sem a resposta da Hotmart o robô não envia.
async function pagamentoNaHotmart(p: any): Promise<{ quando: string; produto: string } | null> {
  const { data: ids } = await sb.from('crm_cliente_identidade').select('valor').eq('cliente_id', p.cliente_id).eq('tipo', 'email').limit(8);
  const emails = [...new Set([p.email, ...(ids || []).map((i: any) => i.valor)].map((e) => String(e || '').trim().toLowerCase()).filter((e) => e.includes('@')))];
  if (!emails.length) throw new Error('o cadastro não tem e-mail para conferir na Hotmart');
  const desde = Date.parse(p.venc + 'T00:00:00-03:00') - 3 * 864e5;
  for (const suf of CONTAS_HOTMART) for (const email of emails) {
    const qs = new URLSearchParams({ buyer_email: email, start_date: String(desde), end_date: String(Date.now() + 3600e3), max_results: '100' });
    let r: Response | null = null;
    for (let k = 0; k < 3; k++) {
      r = await fetch('https://developers.hotmart.com/payments/api/v1/sales/history?' + qs, { headers: { Authorization: `Bearer ${await tokenHotmart(suf)}`, Accept: 'application/json' } });
      if (r.status === 401 && k === 0) { delete tokHotmart[suf]; continue; }
      if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 600 * (k + 1))); continue; }
      break;
    }
    if (!r || !r.ok) throw new Error('a Hotmart não respondeu à conferência (' + (r?.status ?? 'sem resposta') + ')');
    const j = await r.json().catch(() => null);
    if (!j || (j.items && !Array.isArray(j.items))) throw new Error('a Hotmart devolveu uma resposta que não deu para ler');
    for (const i of j.items || []) {
      const st = String(i?.purchase?.status || '').toUpperCase(), quando = i?.purchase?.approved_date || i?.purchase?.order_date;
      if ((st === 'APPROVED' || st === 'COMPLETE') && quando && brt(new Date(quando)).dia >= p.venc && familia(i?.product?.name) === p.prod) return { quando: brt(new Date(quando)).dia, produto: String(i.product.name) };
    }
  }
  return null;
}

// ---------------- Hotmart: link de pagamento (negociação de parcelas) ----------------
// Gera um Pix com as parcelas vencidas depois do último pagamento (no máximo 5, limite da Hotmart) e guarda no caso.
// Reaproveita o link do caso enquanto ele valer por mais de `folgaH` horas. Qualquer falha vira erro (quem chama decide).
async function hot(suf: string, caminho: string, init: any = {}) {
  let r: Response | null = null;
  for (let k = 0; k < 3; k++) {
    r = await fetch('https://developers.hotmart.com' + caminho, { ...init, headers: { Authorization: `Bearer ${await tokenHotmart(suf)}`, Accept: 'application/json', 'Content-Type': 'application/json' } });
    if (r.status === 401 && k === 0) { delete tokHotmart[suf]; continue; }
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 800 * (k + 1))); continue; }
    break;
  }
  return r!;
}
const VENCIDA = ['OVERDUE', 'DELAYED', 'EXPIRED'], PAGA = ['APPROVED', 'COMPLETE'];
async function gerarLink(p: any, por: string, folgaH = 24) {
  if (linkVale(p, folgaH)) return { link_url: p.link_url, link_pix: p.link_pix, link_valor: p.link_valor, link_parcelas: p.link_parcelas, link_expira: p.link_expira, reaproveitado: true };
  if (p.grp !== 'pix' && p.grp !== 'boleto') throw new Error('o link de pagamento só existe para Pix e boleto');
  const { data: ids } = await sb.from('crm_cliente_identidade').select('valor').eq('cliente_id', p.cliente_id).eq('tipo', 'email').limit(8);
  const emails = [...new Set([p.email, ...(ids || []).map((i: any) => i.valor)].map((e) => String(e || '').trim().toLowerCase()).filter((e) => e.includes('@')))];
  let conta = '', ass: any = null;
  busca: for (const suf of CONTAS_HOTMART) for (const email of emails) {
    const r = await hot(suf, '/payments/api/v1/subscriptions?' + new URLSearchParams({ subscriber_email: email, max_results: '50' }));
    if (!r.ok) throw new Error('a Hotmart não respondeu à busca da assinatura (' + r.status + ')');
    const j = await r.json().catch(() => ({}));
    ass = (j.items || []).find((i: any) => VENCIDA.includes(String(i.status).toUpperCase()) && familia(i?.product?.name) === p.prod);
    if (ass) { conta = suf; break busca; }
  }
  if (!ass) throw new Error('não achei na Hotmart a assinatura em atraso deste aluno');
  const rc = await hot(conta, `/payments/api/v1/subscriptions/${ass.subscriber_code}/purchases`);
  const compras = rc.ok ? await rc.json().catch(() => null) : null;
  if (!Array.isArray(compras)) throw new Error('a Hotmart não devolveu as parcelas da assinatura (' + rc.status + ')');
  const st = (c: any) => String(c.status || '').toUpperCase();
  const ultPaga = Math.max(0, ...compras.filter((c) => PAGA.includes(st(c))).map((c) => Number(c.recurrency_number) || 0));
  const preco = new Map<number, number>();
  for (const c of compras) { const n = Number(c.recurrency_number) || 0; if (n > ultPaga && VENCIDA.includes(st(c))) preco.set(n, Number(c?.price?.value) || 0); }
  let nums = [...preco.keys()].sort((a, b) => a - b).slice(-5);
  if (!nums.length) throw new Error('a Hotmart não mostra parcela vencida nesta assinatura');
  const negociar = (rec: number[]) => hot(conta, '/payments/api/v1/installments/negotiate', { method: 'POST', body: JSON.stringify({ subscription_id: ass.subscription_id, recurrences: rec, payment_type: 'PIX' }) });
  let r = await negociar(nums);
  if (!r.ok && nums.length > 1) { nums = nums.slice(-1); r = await negociar(nums); } // área de membros da Hotmart: só a última parcela
  const j = r.ok ? await r.json().catch(() => null) : null;
  if (!j?.payment?.pix_qrcode) throw new Error('a Hotmart não gerou o Pix (' + r.status + ')' + (r.ok ? '' : ': ' + (await r.text().catch(() => '')).slice(0, 160)));
  const link = { link_url: String(j.payment.pix_qrcode), link_pix: String(j.payment.pix_code || ''), link_valor: Math.round(nums.reduce((s, n) => s + (preco.get(n) || 0), 0) * 100) / 100, link_parcelas: nums.length,
    link_em: new Date().toISOString(), link_expira: new Date(Date.now() + 48 * 3600e3 - 10 * 60e3).toISOString(), link_erro: null };
  await sb.from('crm_cobranca').update({ ...link, link_txs: [...(p.link_txs || []), String(j.transaction || '')].filter(Boolean) }).eq('id', p.id);
  await evento(p.id, 'link', `Link de pagamento por Pix gerado na Hotmart (${brl(link.link_valor)}, válido até ${quandoBR(link.link_expira)})`, por);
  return link;
}

// ---------------- Discord ----------------
let botCache: string | null = null;
const bot = async () => (botCache ??= await getChave('DISCORD_BOT_TOKEN', CONSUMIDOR));
async function dmCodina(texto: string) {
  try {
    const h = { Authorization: `Bot ${await bot()}`, 'Content-Type': 'application/json' };
    const c = await (await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers: h, body: JSON.stringify({ recipient_id: DISCORD_CODINA }) })).json();
    if (c?.id) await fetch(`https://discord.com/api/v10/channels/${c.id}/messages`, { method: 'POST', headers: h, body: JSON.stringify({ content: texto.slice(0, 1900) }) });
  } catch (_) { /* aviso técnico não pode derrubar o robô */ }
}
function textoPausa(p: any) {
  const ref = alertaRef(p), t = VIA[p.via];
  return `<@${DISCORD_RAFAEL}> <@${DISCORD_DJAIRO}> <@${t.discord}>\n**Pausa de acesso · ${p.prod}**\n${p.nome}${p.email ? ' (' + p.email + ')' : ''} está há ${p.dias} dias com parcela em aberto (${brl(p.total)}, vencida em ${dm(p.venc)}). ` +
    (ref ? `Alerta ${p.alerta_em ? 'enviado' : 'dado'} em ${dm(brt(new Date(ref)).dia)} pelo WhatsApp da ${t.nome}, sem pagamento até agora.\n\n` : 'Sem pagamento até agora.\n\n') +
    `Rafael e Djairo: pausar o acesso na área de membros.\n${t.nome}: retirar do grupo de alunos.\n\nNenhum acesso foi alterado pelo sistema.\n— agente IA Pinguim`;
}
async function postarPausa(canal: string, p: any) {
  const r = await fetch(`https://discord.com/api/v10/channels/${canal}/messages`, { method: 'POST', headers: { Authorization: `Bot ${await bot()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: textoPausa(p), allowed_mentions: { users: [DISCORD_RAFAEL, DISCORD_DJAIRO, VIA[p.via].discord] } }) });
  if (!r.ok) throw new Error('o Discord recusou o aviso (' + r.status + '): ' + (await r.text()).slice(0, 160));
}

// ---------------- base ----------------
const evento = (id: string | null, tipo: string, texto: string, por = 'robô') => sb.from('crm_cobranca_evento').insert({ cobranca_id: id, tipo, texto, por });
async function carregar(cfg: any, soId?: string, pagos = false) {
  let q = sb.from('crm_cobranca').select('*');
  q = soId ? q.eq('id', soId) : pagos ? q.eq('fechado_motivo', 'pago').gte('fechado_em', new Date(Date.now() - 30 * 864e5).toISOString()) : q.is('fechado_em', null);
  const { data: casos, error } = await q;
  if (error) throw new Error(error.message);
  const ids = [...new Set((casos || []).map((c) => c.cliente_id))], cli = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('crm_cliente').select('cliente_id, nome, tel_canon, email_canon').in('cliente_id', ids.slice(i, i + 200));
    for (const c of data || []) cli.set(c.cliente_id, c);
  }
  return (casos || []).map((c) => {
    const prod = (PROD.find(([r]) => r.test(c.produto_nome)) || [0, c.produto_nome])[1] as string, k = cli.get(c.cliente_id) || {};
    return { ...c, prod, via: cfg.dono[prod] || 'ingrid', grp: GRUPO[String(c.formas || '').split('+')[0]] || 'cartao', nome: nomeBonito(k.nome || ''), tel: k.tel_canon || '', email: k.email_canon || '' };
  });
}
// pode receber o alerta: pendente, com WhatsApp, forma de pagamento dentro das Regras, sem tentativa esgotada
// e sem pagamento visto na Hotmart ('conferir' = a Hotmart mostrou pagamento; fica para a tutora olhar)
const elegivel = (p: any, cfg: any, hoje: string) => etapa(p, cfg, hoje) === 'pendente' && !!p.tel && cfg.formas[p.grp] && p.alerta_status !== 'sem_whatsapp' && p.alerta_status !== 'conferir' && (p.alerta_tentativas || 0) < TENTATIVAS;
// ordem da fila: primeiro os atrasos recentes (abaixo de config.antiga dias), depois a carteira antiga; dentro de cada grupo, do menor atraso para o maior
const ordemFila = (cfg: any) => (a: any, b: any) => (+(a.dias >= cfg.antiga) - +(b.dias >= cfg.antiga)) || a.dias - b.dias;

// Envia o alerta de um caso (carimbo antes do envio). Devolve o que aconteceu.
async function alertar(p: any, cfg: any, por: string) {
  let pg: { quando: string; produto: string } | null = null;
  try { pg = await pagamentoNaHotmart(p); } catch (e) {
    // sem a resposta da Hotmart não envia: volta para a fila daqui a 10 minutos
    const erro = String((e as Error).message || e).slice(0, 300);
    await sb.from('crm_cobranca').update({ fila_em: new Date(Date.now() + 10 * 60e3).toISOString(), alerta_erro: erro }).eq('id', p.id);
    return { enviado: false, adiado: true, erro };
  }
  if (pg) {
    await sb.from('crm_cobranca').update({ alerta_status: 'conferir', alerta_erro: `A Hotmart mostra pagamento de ${pg.produto} em ${dm(pg.quando)}`, fila_dia: null, fila_em: null }).eq('id', p.id);
    await evento(p.id, 'conferir', `Alerta de ${curto(p.nome)} não enviado: a Hotmart mostra um pagamento em ${dm(pg.quando)}. Fica para conferência`, por);
    return { enviado: false, pagoNaHotmart: true, motivo: 'a Hotmart mostra pagamento em ' + dm(pg.quando) };
  }
  // link de pagamento (só Pix e boleto): se a Hotmart não gerar, o alerta sai sem o link
  let link: any = null;
  if (p.grp === 'pix' || p.grp === 'boleto') {
    try { link = await gerarLink(p, por); } catch (e) {
      const erro = String((e as Error).message || e).slice(0, 300);
      await sb.from('crm_cobranca').update({ link_erro: erro }).eq('id', p.id);
      await evento(p.id, 'link', `Link de pagamento não gerado para ${curto(p.nome)}: ${erro}. O alerta segue sem o link`, por);
    }
  }
  const texto = mensagem(p, cfg, link);
  let trava = sb.from('crm_cobranca').update({ alerta_em: new Date().toISOString(), alerta_status: 'enviando', alerta_erro: null, alerta_via: p.via, alerta_texto: texto, alerta_por: por, alerta_tentativas: (p.alerta_tentativas || 0) + 1 })
    .eq('id', p.id).is('fechado_em', null).eq('alerta_tentativas', p.alerta_tentativas || 0);
  trava = p.alerta_em ? trava.eq('alerta_status', 'erro') : trava.is('alerta_em', null);
  const { data: minha } = await trava.select('id');
  if (!minha?.length) return { enviado: false, motivo: 'outro envio já pegou este caso' };
  try {
    const para = await enviarWhats(p.via, p.tel, texto);
    await sb.from('crm_cobranca').update({ alerta_status: 'enviado', alerta_em: new Date().toISOString(), alerta_para: para, manual: p.manual === 'alerta' ? null : p.manual }).eq('id', p.id);
    await evento(p.id, 'alerta', `Alerta enviado a ${curto(p.nome)} pelo WhatsApp da ${VIA[p.via].nome}${link ? ', com o link de pagamento' : ''} (conferido na Hotmart: sem pagamento)`, por);
    return { enviado: true };
  } catch (e) {
    const erro = String((e as Error).message || e).slice(0, 300), sem = e instanceof SemWhatsApp;
    await sb.from('crm_cobranca').update({ alerta_em: null, alerta_status: sem ? 'sem_whatsapp' : 'erro', alerta_erro: erro, fila_dia: null, fila_em: null }).eq('id', p.id);
    await evento(p.id, 'erro', sem ? `${curto(p.nome)}: o número do cadastro não tem WhatsApp. Fica para contato manual` : `O alerta de ${curto(p.nome)} não saiu. O robô tenta de novo no próximo dia`, por);
    if (!sem) await dmCodina(`⚠️ **Cobrança:** o alerta por WhatsApp não saiu.\n${p.nome} · ${p.prod} · pelo número da ${VIA[p.via].nome}\nMotivo: ${erro}`);
    return { enviado: false, erro, semWhatsApp: sem };
  }
}

// ---------------- rodada do cron ----------------
async function rodada(dryRun: boolean) {
  const { data: linha } = await sb.from('crm_cobranca_config').select('dados, estado').eq('id', 1).maybeSingle();
  const cfg = normalizarConfig(linha?.dados), estado: any = linha?.estado || {};
  const { data: leitura, error: eSync } = await sb.rpc('crm_cobranca_sincronizar');
  if (eSync) throw new Error('leitura da base: ' + eSync.message);
  const agora = brt(), hoje = agora.dia, hora = parseInt(cfg.hora) * 60;
  const out: any = { ok: true, agora, leitura, envio: ligado(cfg, hoje), envio_desde: cfg.envio_desde, modo: cfg.modo, fez: [] as string[] };
  if (estado.leitura_dia !== hoje && !dryRun) {
    await evento(null, 'leitura', `Leitura da base: ${leitura?.abertos ?? 0} alunos com parcela em aberto`);
    await sb.from('crm_cobranca_config').update({ estado: { ...estado, leitura_dia: hoje } }).eq('id', 1); estado.leitura_dia = hoje;
  }
  if (agora.min < hora || agora.min >= FIM_DO_DIA) return { ...out, fora_do_horario: true };
  if (!ligado(cfg, hoje) && !dryRun) return { ...out, travado: cfg.envio ? 'os envios começam em ' + cfg.envio_desde + ': o robô só fez a leitura' : 'envios desligados: o robô só fez a leitura' };

  const casos = await carregar(cfg);
  const inicioDia = new Date(Date.parse(hoje + 'T00:00:00-03:00')).toISOString();
  const { data: deHoje } = await sb.from('crm_cobranca').select('alerta_via, alerta_em').eq('alerta_status', 'enviado').gte('alerta_em', inicioDia);
  const enviados: Record<string, number> = {}, ultimo: Record<string, number> = {};
  for (const e of deHoje || []) { enviados[e.alerta_via] = (enviados[e.alerta_via] || 0) + 1; ultimo[e.alerta_via] = Math.max(ultimo[e.alerta_via] || 0, Date.parse(e.alerta_em)); }

  // fila do dia: uma vez por dia; no modo com aprovação, só depois do «Aprovar» da tela
  const liberada = cfg.modo === 'auto' || estado.aprovado_dia === hoje;
  if (liberada && estado.fila_dia !== hoje) {
    const porVia: Record<string, any[]> = {};
    for (const p of casos.filter((p) => elegivel(p, cfg, hoje)).sort(ordemFila(cfg))) (porVia[p.via] ||= []).push(p);
    let n = 0, antigos = 0;
    for (const via of Object.keys(porVia)) {
      let t = Date.now(), k = enviados[via] || 0, i = 0;
      for (const p of porVia[via]) {
        if (k >= cfg.teto) break; // o resto fica para o dia seguinte
        if (i && i % cfg.lote === 0) t += (cfg.imin + Math.floor(Math.random() * (Math.max(cfg.imax, cfg.imin) - cfg.imin + 1))) * 60e3;
        p.fila_dia = hoje; p.fila_em = new Date(t).toISOString();
        if (!dryRun) await sb.from('crm_cobranca').update({ fila_dia: hoje, fila_em: p.fila_em }).eq('id', p.id);
        k++; i++; n++; if (p.dias >= cfg.antiga) antigos++;
      }
    }
    if (!dryRun) {
      await sb.from('crm_cobranca_config').update({ estado: { ...estado, fila_dia: hoje } }).eq('id', 1);
      if (n) await evento(null, 'fila', `Fila de hoje montada: ${n} ${n === 1 ? 'alerta' : 'alertas'}` + (antigos ? ` (${antigos} da carteira antiga)` : ''));
    }
    out.fez.push(`fila montada: ${n} (${antigos} da carteira antiga)`);
  }

  // alertas da vez: por número, no máximo o lote das Regras e respeitando a pausa mínima desde o último envio
  const daVez = casos.filter((p) => p.fila_dia === hoje && p.fila_em && Date.parse(p.fila_em) <= Date.now() && elegivel(p, cfg, hoje)).sort((a, b) => Date.parse(a.fila_em) - Date.parse(b.fila_em));
  const nesta: Record<string, number> = {};
  for (const p of daVez) {
    if ((nesta[p.via] || 0) >= cfg.lote || (enviados[p.via] || 0) + (nesta[p.via] || 0) >= cfg.teto) continue;
    if (!nesta[p.via] && ultimo[p.via] && Date.now() - ultimo[p.via] < cfg.imin * 60e3 - 30e3) continue;
    nesta[p.via] = (nesta[p.via] || 0) + 1;
    if (dryRun) { out.fez.push(`enviaria pelo número da ${VIA[p.via].nome} para ${p.nome} (${p.dias} dias, ${p.prod})`); continue; }
    const r: any = await alertar(p, cfg, 'robô');
    out.fez.push(`${r.enviado ? 'alerta enviado' : 'alerta não saiu (' + (r.erro || r.motivo) + ')'}: ${p.nome}`);
    if (r.adiado) { // Hotmart fora do ar: para a rodada e avisa o Codina uma vez por dia
      if (estado.hotmart_falha_dia !== hoje) { await sb.from('crm_cobranca_config').update({ estado: { ...estado, fila_dia: hoje, hotmart_falha_dia: hoje } }).eq('id', 1); await dmCodina(`⚠️ **Cobrança:** não consegui conferir o pagamento na Hotmart, então o alerta não saiu (tento de novo em 10 minutos).\n${p.nome} · ${p.prod}\nMotivo: ${r.erro}`); }
      break;
    }
  }

  // avisos de pausa no Discord (só aviso)
  for (const p of casos.filter((p) => etapa(p, cfg, hoje) === 'pausa' && !p.pausa_em)) {
    if (dryRun || !cfg.discord_canal) { out.fez.push(`${cfg.discord_canal ? 'avisaria' : 'sem canal definido, não avisa'} a pausa de ${p.nome} (${p.dias} dias, ${p.prod})`); continue; }
    const { data: minha } = await sb.from('crm_cobranca').update({ pausa_em: new Date().toISOString(), pausa_status: 'enviando', pausa_erro: null }).eq('id', p.id).is('pausa_em', null).select('id');
    if (!minha?.length) continue;
    try {
      await postarPausa(cfg.discord_canal, p);
      await sb.from('crm_cobranca').update({ pausa_status: 'enviado' }).eq('id', p.id);
      await evento(p.id, 'pausa', `Discord: pausar acesso de ${curto(p.nome)} (${p.dias} dias) · Rafael, Djairo e ${VIA[p.via].nome}`);
      out.fez.push(`aviso de pausa publicado: ${p.nome}`);
    } catch (e) {
      const erro = String((e as Error).message || e).slice(0, 300);
      await sb.from('crm_cobranca').update({ pausa_em: null, pausa_status: 'erro', pausa_erro: erro }).eq('id', p.id);
      await dmCodina(`⚠️ **Cobrança:** o aviso de pausa não foi publicado.\n${p.nome} · ${p.prod}\nMotivo: ${erro}`);
      out.fez.push(`aviso de pausa falhou (${erro}): ${p.nome}`);
      break; // canal com problema: não insiste nos demais nesta rodada
    }
  }
  return out;
}

// ---------------- «Enviar alerta agora» (tela) e envio de teste ----------------
async function avulso(id: string, por: string, testePara?: string, extra: any = {}) {
  const { data: linha } = await sb.from('crm_cobranca_config').select('dados').eq('id', 1).maybeSingle();
  const cfg = normalizarConfig(linha?.dados), hoje = brt().dia;
  const [p] = await carregar(cfg, id);
  if (!p) return { ok: false, erro: 'Caso não encontrado.' };
  if (extra.teste_pausa) { await dmCodina('🧪 TESTE (iria no #liberacao-de-acessos)\n' + textoPausa(p)); return { ok: true, teste: true }; }
  if (testePara) { await enviarWhats(p.via, testePara, mensagem(extra.teste_nome ? { ...p, nome: String(extra.teste_nome) } : p, cfg, linkVale(p) ? p : null)); return { ok: true, teste: true, via: p.via, com_link: linkVale(p) }; }
  if (extra.gerar_link) {
    if (p.fechado_em) return { ok: false, erro: 'Este caso já foi encerrado.' };
    try { return { ok: true, link: await gerarLink(p, por, 12) }; }
    catch (e) { const erro = String((e as Error).message || e).slice(0, 300); await sb.from('crm_cobranca').update({ link_erro: erro }).eq('id', p.id); return { ok: false, erro: 'O link não foi gerado: ' + erro + '.' }; }
  }
  if (!ligado(cfg, hoje)) return { ok: false, erro: cfg.envio ? `Os envios começam em ${dm(cfg.envio_desde)}. Nenhuma mensagem foi enviada.` : 'Os envios estão desligados. Nenhuma mensagem foi enviada.' };
  if (p.fechado_em) return { ok: false, erro: 'Este caso já foi encerrado.' };
  if (!p.tel) return { ok: false, erro: 'O aluno não tem WhatsApp no cadastro.' };
  if (alertaRef(p) || p.manual === 'pago') return { ok: false, erro: 'Este aluno já recebeu o alerta desta parcela.' };
  const agora = brt().min;
  if (agora < 8 * 60 || agora >= FIM_DO_DIA) return { ok: false, erro: 'O alerta só sai entre 8h e 20h.' };
  const r: any = await alertar({ ...p, alerta_tentativas: p.alerta_tentativas || 0 }, cfg, por);
  if (r.pagoNaHotmart) return { ok: false, erro: 'O alerta não foi enviado: ' + r.motivo + '. Confira antes de cobrar.' };
  if (r.adiado) return { ok: false, erro: 'Não consegui conferir o pagamento na Hotmart agora, então o alerta não saiu. Tente de novo em alguns minutos.' };
  return r.enviado ? { ok: true, enviado: true, via: p.via } : { ok: false, erro: r.semWhatsApp ? 'O número do cadastro não tem WhatsApp.' : 'O alerta não saiu: ' + (r.erro || r.motivo) };
}

// Confere na Hotmart todos os pendentes (só leitura): quem aparece com pagamento e quem não deu para conferir.
// Com {conferir:'pagos'} faz a prova inversa: confere os casos que a base já fechou como pagos (a Hotmart tem de mostrar o pagamento).
async function conferirTodos(pagosDaBase: boolean) {
  const { data: linha } = await sb.from('crm_cobranca_config').select('dados').eq('id', 1).maybeSingle();
  const cfg = normalizarConfig(linha?.dados), hoje = brt().dia;
  const pend = pagosDaBase ? await carregar(cfg, undefined, true) : (await carregar(cfg)).filter((p) => etapa(p, cfg, hoje) === 'pendente');
  const pagos: any[] = [], falhas: any[] = []; let i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < pend.length) {
      const p = pend[i++];
      try { const pg = await pagamentoNaHotmart(p); if (pg) pagos.push({ id: p.id, nome: p.nome, prod: p.prod, dias: p.dias, venc: p.venc, forma: p.grp, ...pg }); }
      catch (e) { falhas.push({ nome: p.nome, prod: p.prod, erro: String((e as Error).message || e) }); }
    }
  }));
  return { ok: true, conferidos: pend.length, sem_pagamento: pend.length - pagos.length - falhas.length, pagos, falhas };
}

serve(async (req) => {
  // só o CRM (servidor) e o cron chamam: os dois usam a chave de serviço
  const cracha = (req.headers.get('authorization') || '').replace('Bearer ', '');
  let papel = ''; try { papel = JSON.parse(atob(cracha.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch (_) { /* não é JWT */ }
  if (cracha !== SERVICE && papel !== 'service_role') return new Response(JSON.stringify({ ok: false, erro: 'nao autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  let body: any = {}; try { body = await req.json(); } catch (_) { /* cron sem corpo */ }
  try {
    const out = body.prova ? { ok: true, pagamento: await pagamentoNaHotmart({ cliente_id: String(body.prova.cliente_id), email: '', venc: String(body.prova.venc), prod: String(body.prova.prod) }) }
      : body.conferir ? await conferirTodos(body.conferir === 'pagos') : body.id ? await avulso(String(body.id), String(body.por || 'tutora').slice(0, 80), body.teste_para ? String(body.teste_para) : undefined, body) : await rodada(!!body.dry_run);
    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    const erro = String((e as Error).message || e);
    if (!body.dry_run && !body.prova && !body.conferir) await dmCodina(`⚠️ **Cobrança:** o robô falhou.\n${erro.slice(0, 500)}`);
    return new Response(JSON.stringify({ ok: false, erro }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
