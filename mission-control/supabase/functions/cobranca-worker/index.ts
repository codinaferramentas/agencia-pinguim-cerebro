// ========================================================================
// Edge Function: cobranca-worker
// ========================================================================
// Robô da Gestão de Cobrança do CRM (/cobranca) — André 18/11/2026.
// Roda a cada 2 minutos, das 8h às 20h (Brasília). A cada rodada:
//   1. LEITURA: traz da Hotmart (crm_compra) quem tem parcela recorrente em aberto e fecha quem pagou
//      (pinguim.crm_cobranca_sincronizar).
//   2. FILA DO DIA: a partir do horário das Regras, monta uma vez por dia a fila dos pendentes
//      (do maior atraso para o menor), uma fila por número, com pausa sorteada entre os envios e
//      limite diário por número. No modo «com aprovação», só monta depois que a tutora aprova na tela.
//   3. ALERTA: envia pelo WhatsApp da tutora do produto (Evolution), UMA ÚNICA VEZ por caso.
//   4. AVISO DE PAUSA: publica no Discord marcando Rafael, Djairo e a tutora. É SÓ AVISO: o sistema
//      não tira acesso de app, de área de membros nem remove de grupo.
// Regras de segurança:
//   - Trava geral (config.envio): desligada, o robô só faz a leitura. Nada sai por WhatsApp nem no Discord.
//   - No máximo uma vez: o caso é carimbado ANTES do envio. Se a função cair no meio, não reenvia.
//   - Antes de enviar, a leitura acabou de rodar: quem pagou já saiu da fila.
//   - Número sem WhatsApp: marca o caso para contato manual, sem nova tentativa.
//   - Falha técnica: DM só para o Codina, nunca em canal do time.
// Modos (body): {} = cron · {id, por} = «Enviar alerta agora» da tela · {dry_run:true} = lista o que faria, sem enviar
//               · {id, teste_para} = envia o texto do caso para um número de teste, sem carimbar.
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
const OPCOES: Record<string, any[]> = { alerta: [3, 5, 7, 10], pausa: [15, 20, 30, 45], hora: ['8h', '9h', '10h', '14h'], modo: ['auto', 'aprovacao'], lote: [1, 2], imin: [1, 2, 3, 5], imax: [5, 10, 15], teto: [10, 20, 30] };
const PADRAO: any = { alerta: 7, pausa: 15, hora: '9h', modo: 'auto', lote: 1, imin: 2, imax: 10, teto: 20, formas: { pix: true, boleto: true, parcelado: true, cartao: true },
  dono: { 'ProAlt': 'ingrid', 'Taurus Low Ticket': 'ingrid', 'Taurus Master': 'ingrid', 'Mastermind Orion': 'ingrid', 'Comunidade Elo': 'fernanda', 'Lyra': 'fernanda' },
  copy: 'Olá, {nome}! Tudo bem?\n\nAqui é a {tutora}, da equipe do {expert}. Identificamos uma parcela em aberto do {produto}:\n\n*{valor}*, com vencimento em {vencimento}.\n\nEstou avisando para ajudar você a regularizar o quanto antes e manter os seus acessos liberados.\n\nSe o pagamento já foi feito, por favor desconsidere esta mensagem. Se precisar de ajuda ou de outra forma de pagamento, responda por aqui.',
  envio: false, discord_canal: '' };
function normalizarConfig(d: any) {
  const x = d && typeof d === 'object' ? d : {}, c: any = { ...PADRAO, formas: { ...PADRAO.formas }, dono: { ...PADRAO.dono } };
  for (const k of Object.keys(OPCOES)) if (OPCOES[k].includes(x[k])) c[k] = x[k];
  for (const k of Object.keys(c.formas)) if (typeof x.formas?.[k] === 'boolean') c.formas[k] = x.formas[k];
  for (const k of Object.keys(c.dono)) if (VIA[x.dono?.[k]]) c.dono[k] = x.dono[k];
  if (typeof x.copy === 'string' && x.copy.trim().length >= 20) c.copy = x.copy.slice(0, 2000);
  c.envio = x.envio === true;
  c.discord_canal = /^\d{17,20}$/.test(String(x.discord_canal || '')) ? String(x.discord_canal) : '';
  return c;
}
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
const mensagem = (p: any, cfg: any) => cfg.copy.replace(/\{nome\}/g, primeiro(p.nome)).replace(/\{tutora\}/g, VIA[p.via].nome).replace(/\{expert\}/g, EXPERT[p.prod] || 'Pedro Aredes').replace(/\{produto\}/g, p.prod)
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
  return `<@${DISCORD_RAFAEL}> <@${DISCORD_DJAIRO}> <@${t.discord}>\n**Pausa de acesso · ${p.prod}**\n${p.nome} está há ${p.dias} dias com parcela em aberto (${brl(p.total)}, vencida em ${dm(p.venc)}). ` +
    `Alerta ${p.alerta_em ? 'enviado' : 'dado'} em ${dm(brt(new Date(ref)).dia)} pelo WhatsApp da ${t.nome}, sem pagamento até agora.\n\n` +
    `Rafael e Djairo: pausar o acesso na área de membros.\n${t.nome}: retirar do grupo de alunos.\n\nNenhum acesso foi alterado pelo sistema.\n— agente IA Pinguim`;
}
async function postarPausa(canal: string, p: any) {
  const r = await fetch(`https://discord.com/api/v10/channels/${canal}/messages`, { method: 'POST', headers: { Authorization: `Bot ${await bot()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: textoPausa(p), allowed_mentions: { users: [DISCORD_RAFAEL, DISCORD_DJAIRO, VIA[p.via].discord] } }) });
  if (!r.ok) throw new Error('o Discord recusou o aviso (' + r.status + '): ' + (await r.text()).slice(0, 160));
}

// ---------------- base ----------------
const evento = (id: string | null, tipo: string, texto: string, por = 'robô') => sb.from('crm_cobranca_evento').insert({ cobranca_id: id, tipo, texto, por });
async function carregar(cfg: any, soId?: string) {
  let q = sb.from('crm_cobranca').select('*');
  q = soId ? q.eq('id', soId) : q.is('fechado_em', null);
  const { data: casos, error } = await q;
  if (error) throw new Error(error.message);
  const ids = [...new Set((casos || []).map((c) => c.cliente_id))], cli = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('crm_cliente').select('cliente_id, nome, tel_canon').in('cliente_id', ids.slice(i, i + 200));
    for (const c of data || []) cli.set(c.cliente_id, c);
  }
  return (casos || []).map((c) => {
    const prod = (PROD.find(([r]) => r.test(c.produto_nome)) || [0, c.produto_nome])[1] as string, k = cli.get(c.cliente_id) || {};
    return { ...c, prod, via: cfg.dono[prod] || 'ingrid', grp: GRUPO[String(c.formas || '').split('+')[0]] || 'cartao', nome: nomeBonito(k.nome || ''), tel: k.tel_canon || '' };
  });
}
// pode receber o alerta: pendente, com WhatsApp, forma de pagamento dentro das Regras e sem tentativa esgotada
const elegivel = (p: any, cfg: any, hoje: string) => etapa(p, cfg, hoje) === 'pendente' && !!p.tel && cfg.formas[p.grp] && p.alerta_status !== 'sem_whatsapp' && (p.alerta_tentativas || 0) < TENTATIVAS;

// Envia o alerta de um caso (carimbo antes do envio). Devolve o que aconteceu.
async function alertar(p: any, cfg: any, por: string) {
  const texto = mensagem(p, cfg);
  let trava = sb.from('crm_cobranca').update({ alerta_em: new Date().toISOString(), alerta_status: 'enviando', alerta_erro: null, alerta_via: p.via, alerta_texto: texto, alerta_por: por, alerta_tentativas: (p.alerta_tentativas || 0) + 1 })
    .eq('id', p.id).is('fechado_em', null).eq('alerta_tentativas', p.alerta_tentativas || 0);
  trava = p.alerta_em ? trava.eq('alerta_status', 'erro') : trava.is('alerta_em', null);
  const { data: minha } = await trava.select('id');
  if (!minha?.length) return { enviado: false, motivo: 'outro envio já pegou este caso' };
  try {
    const para = await enviarWhats(p.via, p.tel, texto);
    await sb.from('crm_cobranca').update({ alerta_status: 'enviado', alerta_em: new Date().toISOString(), alerta_para: para, manual: p.manual === 'alerta' ? null : p.manual }).eq('id', p.id);
    await evento(p.id, 'alerta', `Alerta enviado a ${curto(p.nome)} pelo WhatsApp da ${VIA[p.via].nome}`, por);
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
  const out: any = { ok: true, agora, leitura, envio: cfg.envio, modo: cfg.modo, fez: [] as string[] };
  if (estado.leitura_dia !== hoje && !dryRun) {
    await evento(null, 'leitura', `Leitura da base: ${leitura?.abertos ?? 0} alunos com parcela em aberto`);
    await sb.from('crm_cobranca_config').update({ estado: { ...estado, leitura_dia: hoje } }).eq('id', 1); estado.leitura_dia = hoje;
  }
  if (agora.min < hora || agora.min >= FIM_DO_DIA) return { ...out, fora_do_horario: true };
  if (!cfg.envio && !dryRun) return { ...out, travado: 'envios desligados: o robô só fez a leitura' };

  const casos = await carregar(cfg);
  const inicioDia = new Date(Date.parse(hoje + 'T00:00:00-03:00')).toISOString();
  const { data: deHoje } = await sb.from('crm_cobranca').select('alerta_via, alerta_em').eq('alerta_status', 'enviado').gte('alerta_em', inicioDia);
  const enviados: Record<string, number> = {}, ultimo: Record<string, number> = {};
  for (const e of deHoje || []) { enviados[e.alerta_via] = (enviados[e.alerta_via] || 0) + 1; ultimo[e.alerta_via] = Math.max(ultimo[e.alerta_via] || 0, Date.parse(e.alerta_em)); }

  // fila do dia: uma vez por dia; no modo com aprovação, só depois do «Aprovar» da tela
  const liberada = cfg.modo === 'auto' || estado.aprovado_dia === hoje;
  if (liberada && estado.fila_dia !== hoje) {
    const porVia: Record<string, any[]> = {};
    for (const p of casos.filter((p) => elegivel(p, cfg, hoje)).sort((a, b) => b.dias - a.dias)) (porVia[p.via] ||= []).push(p);
    let n = 0;
    for (const via of Object.keys(porVia)) {
      let t = Date.now(), k = enviados[via] || 0, i = 0;
      for (const p of porVia[via]) {
        if (k >= cfg.teto) break; // o resto fica para o dia seguinte
        if (i && i % cfg.lote === 0) t += (cfg.imin + Math.floor(Math.random() * (Math.max(cfg.imax, cfg.imin) - cfg.imin + 1))) * 60e3;
        p.fila_dia = hoje; p.fila_em = new Date(t).toISOString();
        if (!dryRun) await sb.from('crm_cobranca').update({ fila_dia: hoje, fila_em: p.fila_em }).eq('id', p.id);
        k++; i++; n++;
      }
    }
    if (!dryRun) {
      await sb.from('crm_cobranca_config').update({ estado: { ...estado, fila_dia: hoje } }).eq('id', 1);
      if (n) await evento(null, 'fila', `Fila de hoje montada: ${n} ${n === 1 ? 'alerta' : 'alertas'}`);
    }
    out.fez.push(`fila montada: ${n}`);
  }

  // alertas da vez: por número, no máximo o lote das Regras e respeitando a pausa mínima desde o último envio
  const daVez = casos.filter((p) => p.fila_dia === hoje && p.fila_em && Date.parse(p.fila_em) <= Date.now() && elegivel(p, cfg, hoje)).sort((a, b) => Date.parse(a.fila_em) - Date.parse(b.fila_em));
  const nesta: Record<string, number> = {};
  for (const p of daVez) {
    if ((nesta[p.via] || 0) >= cfg.lote || (enviados[p.via] || 0) + (nesta[p.via] || 0) >= cfg.teto) continue;
    if (!nesta[p.via] && ultimo[p.via] && Date.now() - ultimo[p.via] < cfg.imin * 60e3 - 30e3) continue;
    nesta[p.via] = (nesta[p.via] || 0) + 1;
    if (dryRun) { out.fez.push(`enviaria pelo número da ${VIA[p.via].nome} para ${p.nome} (${p.dias} dias, ${p.prod})`); continue; }
    const r = await alertar(p, cfg, 'robô');
    out.fez.push(`${r.enviado ? 'alerta enviado' : 'alerta não saiu (' + (r.erro || r.motivo) + ')'}: ${p.nome}`);
  }

  // avisos de pausa no Discord (só aviso)
  for (const p of casos.filter((p) => etapa(p, cfg, hoje) === 'pausa' && !p.pausa_em && cfg.formas[p.grp])) {
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
async function avulso(id: string, por: string, testePara?: string) {
  const { data: linha } = await sb.from('crm_cobranca_config').select('dados').eq('id', 1).maybeSingle();
  const cfg = normalizarConfig(linha?.dados), hoje = brt().dia;
  const [p] = await carregar(cfg, id);
  if (!p) return { ok: false, erro: 'Caso não encontrado.' };
  if (testePara) { await enviarWhats(p.via, testePara, mensagem(p, cfg)); return { ok: true, teste: true, via: p.via }; }
  if (!cfg.envio) return { ok: false, erro: 'Os envios estão desligados. Nenhuma mensagem foi enviada.' };
  if (p.fechado_em) return { ok: false, erro: 'Este caso já foi encerrado.' };
  if (!p.tel) return { ok: false, erro: 'O aluno não tem WhatsApp no cadastro.' };
  if (alertaRef(p) || p.manual === 'pago') return { ok: false, erro: 'Este aluno já recebeu o alerta desta parcela.' };
  const agora = brt().min;
  if (agora < 8 * 60 || agora >= FIM_DO_DIA) return { ok: false, erro: 'O alerta só sai entre 8h e 20h.' };
  const r = await alertar({ ...p, alerta_tentativas: p.alerta_tentativas || 0 }, cfg, por);
  return r.enviado ? { ok: true, enviado: true, via: p.via } : { ok: false, erro: r.semWhatsApp ? 'O número do cadastro não tem WhatsApp.' : 'O alerta não saiu: ' + (r.erro || r.motivo) };
}

serve(async (req) => {
  // só o CRM (servidor) e o cron chamam: os dois usam a chave de serviço
  const cracha = (req.headers.get('authorization') || '').replace('Bearer ', '');
  let papel = ''; try { papel = JSON.parse(atob(cracha.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch (_) { /* não é JWT */ }
  if (cracha !== SERVICE && papel !== 'service_role') return new Response(JSON.stringify({ ok: false, erro: 'nao autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  let body: any = {}; try { body = await req.json(); } catch (_) { /* cron sem corpo */ }
  try {
    const out = body.id ? await avulso(String(body.id), String(body.por || 'tutora').slice(0, 80), body.teste_para ? String(body.teste_para) : undefined) : await rodada(!!body.dry_run);
    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    const erro = String((e as Error).message || e);
    if (!body.dry_run) await dmCodina(`⚠️ **Cobrança:** o robô falhou.\n${erro.slice(0, 500)}`);
    return new Response(JSON.stringify({ ok: false, erro }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
