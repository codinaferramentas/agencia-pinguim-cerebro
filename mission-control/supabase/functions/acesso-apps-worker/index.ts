// ========================================================================
// Edge Function: acesso-apps-worker
// ========================================================================
// Liberação automática de APP pedida no Discord #liberacao-de-acessos (André 13/11/2026).
// Só os apps: ProAlt, Elo e Sirius. Área de membros da Hotmart e Escola continuam com o Rafa e o Jairo.
// Regras:
//   Pedido de ProAlt → app ProAlt no plano Full (igual compra na Hotmart).
//   Pedido de Elo    → app Elo ativo por 1 ano + Sirius no CICLO (997) por 1 ano, com todas as funcionalidades.
//   Pedido de Sirius → só o Sirius (CICLO, 1 ano, todas as funcionalidades).
//   Conta nova: senha padrão mudar@1234. Conta existente: NUNCA troca a senha.
//   Nunca encurta validade nem rebaixa plano (Sirius com plano de R$ 997+ ou vitalício fica como está).
// Depois de liberar, confere no app e responde no canal marcando quem pediu.
// Ficha no CRM: crm_acesso_registrar cria o cliente se ele não existir.
// Modos (body): {} = cron · {dry_run:true} = só lê e mostra o que faria (não libera, não responde)
//   {simular:{texto}} = teste com pedido escrito à mão (libera de verdade; resposta só no privado do Codina)
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false }, db: { schema: 'pinguim' } });
const CONSUMIDOR = 'acesso-apps-worker';
const SENHA_PADRAO = 'mudar@1234';
const SIRIUS_CICLO = '6c29e3f5-8e66-4324-88dd-39ad1c486a70'; // "CICLO", R$ 997, anual, 120k tokens
const SIRIUS_FEATURES = ['access_personas', 'access_viral_scripts', 'access_products', 'access_headlines', 'access_marketing_creatives',
  'access_challenges', 'access_challenge_templates', 'access_templates', 'access_stories', 'access_analysis', 'access_ganchos', 'access_nicho_nutricao'];
const CODINA = '1077338884981133413';
const MAX_PEDIDOS = 3; // por rodada (cada pedido chama vários apps; o resto fica para os próximos 10 min)

const umAno = () => new Date(Date.now() + 365 * 864e5);
// data gravada como meia-noite UTC (Sirius) é só data: não puxa para o dia anterior no fuso de SP
const dataBR = (s: string | Date) => { const t = new Date(s); const d = t.toISOString().endsWith('T00:00:00.000Z') ? t : new Date(t.getTime() - 3 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
const maior = (a: string | null | undefined, b: Date) => (a && new Date(a) > b ? new Date(a) : b);
const normEmail = (e: string) => String(e || '').trim().toLowerCase().replace(/[.,;:)\]]+$/, '')
  .replace(/@(gmail|icloud|outlook|live|msn|me)\.com\.br$/, '@$1.com');

// ---------------- Discord ----------------
let _bot = '';
async function discord(path: string, init: RequestInit = {}) {
  _bot = _bot || await getChave('DISCORD_BOT_TOKEN', CONSUMIDOR);
  const r = await fetch('https://discord.com/api/v10' + path, { ...init, headers: { Authorization: `Bot ${_bot}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  return r.json();
}

// ---------------- leitura do pedido (IA) ----------------
const SCHEMA = { type: 'object', additionalProperties: false, required: ['tipo', 'produtos', 'pessoas'], properties: {
  tipo: { type: 'string', enum: ['pedido_acesso', 'outro'] },
  produtos: { type: 'array', items: { type: 'string', enum: ['ProAlt', 'Elo', 'Sirius'] } },
  pessoas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['nome', 'email', 'whatsapp'],
    properties: { nome: { type: 'string' }, email: { type: 'string' }, whatsapp: { type: 'string' } } } },
} };
const INSTRUCAO = `Você lê mensagens do canal interno "liberação de acessos" de uma escola de cursos (Agência Pinguim).
tipo:
- "pedido_acesso": a mensagem PEDE para liberar/dar/criar acesso de um ou mais alunos a um produto (ex.: "Meninos, segue solicitação de acesso: Produto: ProAlt, Nome…, E-mail…", "Libera o Elo para fulano@…").
- "outro": resposta de quem liberou ("liberado", "feito"), dúvida, problema de login de aluno antigo, remoção/cancelamento de acesso, reembolso, aviso automático, qualquer outra coisa.
produtos: SÓ os que o pedido cita entre ProAlt, Elo e Sirius. "Elo Black", "Mentoria Elo", "Comunidade Elo" = Elo. "Pro Alt", "Proalt" = ProAlt. "Sirius", "app Sirius" = Sirius.
  Não deduza produto a partir de mentorias (Taurus, Lyra, Orion, Express): se o pedido só cita mentoria ou só Escola/Hotmart, produtos = [].
pessoas: TODOS os alunos que devem receber o acesso, com nome, email e WhatsApp como escritos (vazio se não houver). Não invente email.`;
async function lerPedido(modelo: string, texto: string) {
  const k = await getChave('OPENAI_API_KEY', CONSUMIDOR);
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelo, messages: [{ role: 'system', content: INSTRUCAO }, { role: 'user', content: texto.slice(0, 4000) }],
      response_format: { type: 'json_schema', json_schema: { name: 'pedido', strict: true, schema: SCHEMA } } }) });
  const j = await r.json();
  if (!j.choices) throw new Error('OpenAI: ' + JSON.stringify(j.error || j).slice(0, 200));
  return JSON.parse(j.choices[0].message.content);
}

// ---------------- apps (portinhas tool-gestao-*) ----------------
async function portinha(app: string, action: string, params: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPA_URL}/functions/v1/tool-gestao-${app}`, { method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'x-internal-token': SERVICE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }) });
  const txt = await r.text(); let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = { erro: txt.slice(0, 200) }; }
  return { ok: r.ok && data?.ok !== false, data };
}
// conta do aluno no app por qualquer email dele (o pedido + os da ficha do CRM), match exato
async function acharConta(app: string, emails: string[]) {
  for (const e of emails) {
    const r = await portinha(app, 'buscar_usuario', { termo: e });
    const u = (r.data?.usuarios || []).find((x: any) => String(x.email || '').toLowerCase() === e);
    if (u) return u;
  }
  return null;
}
async function emailsDaFicha(email: string): Promise<{ clienteId: string | null; emails: string[] }> {
  const { data: idn } = await sb.from('crm_cliente_identidade').select('cliente_id').eq('tipo', 'email').eq('valor', email).limit(1);
  const cid = idn?.[0]?.cliente_id || null;
  if (!cid) return { clienteId: null, emails: [email] };
  const { data: todos } = await sb.from('crm_cliente_identidade').select('valor').eq('cliente_id', cid).eq('tipo', 'email');
  return { clienteId: cid, emails: [email, ...(todos || []).map((x: any) => String(x.valor).toLowerCase()).filter((x: string) => x !== email)] };
}
async function registrarCrm(app: string, p: any, idNoApp: string | null, plano: string, clienteId: string | null) {
  try {
    await sb.rpc('crm_acesso_registrar', { p_app: app, p_email: p.email, p_nome: p.nome, p_tel: p.tel, p_id_no_app: idNoApp, p_plano: plano, p_cliente_id: clienteId });
  } catch (_) { /* o sync dos apps corrige o cache depois */ }
}

// cada função devolve { ok, texto } — texto vai na resposta do canal
async function liberarProalt(p: any, emails: string[], clienteId: string | null) {
  const conta = await acharConta('proalt', emails);
  let uid = conta?.user_id, criou = false;
  if (conta) {
    const g = await portinha('proalt', 'garantir_plano', { user_id: uid });
    if (!g.ok) return { ok: false, texto: `App ProAlt: não consegui garantir o plano (${g.data?.erro || 'erro'})` };
  } else {
    const c = await portinha('proalt', 'criar_usuario', { email: p.email, full_name: p.nome || p.email, phone: p.tel, password: SENHA_PADRAO });
    if (!c.ok) return { ok: false, texto: `App ProAlt: não consegui criar a conta (${c.data?.erro || 'erro'})` };
    uid = c.data.user_id; criou = true;
  }
  const v = await portinha('proalt', 'obter_usuario', { user_id: uid }); // confere no app
  if (v.data?.usuario?.plano !== 'Full') return { ok: false, texto: `App ProAlt: a conta está no plano "${v.data?.usuario?.plano || '?'}", não no Full` };
  await registrarCrm('proalt', p, uid, 'Full', clienteId);
  return { ok: true, texto: `App ProAlt: plano **Full** · ${criou ? `conta criada, senha inicial **${SENHA_PADRAO}**` : `já tinha conta (${conta.email}), senha não alterada`}` };
}

async function liberarElo(p: any, emails: string[], clienteId: string | null) {
  const alvo = umAno();
  const conta = await acharConta('elo', emails);
  let uid = conta?.id, criou = false;
  if (conta) {
    const vig = maior(conta.vigencia_ate, alvo);
    const a = await portinha('elo', 'atualizar_usuario', { user_id: uid, plan_status: 'active', vigencia_ate: vig.toISOString(), plano: conta.plano || 'Elo' });
    if (!a.ok) return { ok: false, texto: `App Elo: não consegui atualizar (${a.data?.erro || 'erro'})` };
  } else {
    const c = await portinha('elo', 'criar_usuario', { email: p.email, nome: p.nome || p.email, telefone: p.tel, password: SENHA_PADRAO, vigencia_ate: alvo.toISOString() });
    if (!c.ok) return { ok: false, texto: `App Elo: não consegui criar a conta (${c.data?.erro || 'erro'})` };
    uid = c.data.user_id; criou = true;
  }
  const v = await acharConta('elo', [conta?.email?.toLowerCase() || p.email]);
  if (!v || v.plan_status !== 'active' || new Date(v.vigencia_ate) < new Date(alvo.getTime() - 864e5))
    return { ok: false, texto: `App Elo: depois de liberar, a conta ficou ${v?.plan_status || 'sem conta'} até ${v?.vigencia_ate ? dataBR(v.vigencia_ate) : '?'}` };
  await registrarCrm('elo', p, uid, v.plano || 'Elo', clienteId);
  return { ok: true, texto: `App Elo: completo até **${dataBR(v.vigencia_ate)}** · ${criou ? `conta criada, senha inicial **${SENHA_PADRAO}**` : `já tinha conta (${conta.email}), senha não alterada`}` };
}

let _planos: Record<string, any> | null = null;
async function planosSirius() {
  if (_planos) return _planos;
  const r = await portinha('sirius', 'listar_planos');
  _planos = Object.fromEntries((r.data?.planos || []).map((x: any) => [x.id, x]));
  return _planos;
}
// plano que já vale tanto quanto o CICLO (R$ 997+ em reais, ou vitalício) não é trocado
const planoAlto = (pl: any) => !!pl && (pl.cycle_type === 'lifetime' || (pl.currency === 'BRL' && Number(pl.price) >= 997));

async function liberarSirius(p: any, emails: string[], clienteId: string | null) {
  const alvo = umAno();
  const planos = await planosSirius();
  const todas = Object.fromEntries(SIRIUS_FEATURES.map((k) => [k, true]));
  const conta = await acharConta('sirius', emails);
  let uid = conta?.user_id, criou = false, manteve = false;
  if (conta) {
    manteve = planoAlto(planos[conta.plan_id]);
    const patch: Record<string, unknown> = { user_id: uid, plan_status: 'active', plan_expires_at: maior(conta.plan_expires_at, alvo).toISOString(), ...todas };
    if (!manteve) { patch.plan_id = SIRIUS_CICLO; patch.token_limit_override = Math.max(Number(conta.token_limit_override) || 0, 120000); }
    const a = await portinha('sirius', 'atualizar_usuario', patch);
    if (!a.ok) return { ok: false, texto: `App Sirius: não consegui atualizar (${a.data?.erro || 'erro'})` };
  } else {
    const c = await portinha('sirius', 'criar_usuario', { email: p.email, nome: p.nome || p.email, telefone: p.tel, password: SENHA_PADRAO,
      plan_id: SIRIUS_CICLO, features: todas, token_limit_override: 120000 });
    if (!c.ok) return { ok: false, texto: `App Sirius: não consegui criar a conta (${c.data?.erro || 'erro'})` };
    uid = c.data?.user_id || c.data?.usuario?.user_id || c.data?.id; criou = true;
    await portinha('sirius', 'atualizar_usuario', { user_id: uid, plan_status: 'active', plan_expires_at: alvo.toISOString(), ...todas });
  }
  const v = await acharConta('sirius', [conta?.email?.toLowerCase() || p.email]);
  const faltam = SIRIUS_FEATURES.filter((k) => v?.[k] !== true);
  if (!v || v.plan_status !== 'active' || new Date(v.plan_expires_at) < new Date(alvo.getTime() - 864e5) || faltam.length || (!manteve && v.plan_id !== SIRIUS_CICLO))
    return { ok: false, texto: `App Sirius: depois de liberar, a conta ficou ${v?.plan_status || 'sem conta'} até ${v?.plan_expires_at ? dataBR(v.plan_expires_at) : '?'}${faltam.length ? `, ${faltam.length} funcionalidade(s) desligada(s)` : ''}` };
  const nomePlano = planos[v.plan_id]?.name || 'CICLO';
  await registrarCrm('sirius', p, uid, nomePlano, clienteId);
  return { ok: true, texto: `App Sirius: plano **${nomePlano}**${manteve ? ' (já era igual ou maior que o CICLO, mantido)' : ''} até **${dataBR(v.plan_expires_at)}**, todas as funcionalidades · ${criou ? `conta criada, senha inicial **${SENHA_PADRAO}**` : `já tinha conta (${conta.email}), senha não alterada`}` };
}

// ---------------- pedido ----------------
async function atender(m: any, pedido: any) {
  const apps = new Set<string>();
  for (const pr of pedido.produtos) {
    if (pr === 'ProAlt') apps.add('proalt');
    if (pr === 'Elo') { apps.add('elo'); apps.add('sirius'); }
    if (pr === 'Sirius') apps.add('sirius');
  }
  const ordem = ['proalt', 'elo', 'sirius'].filter((a) => apps.has(a));
  const blocos: string[] = [], resultado: any[] = [];
  let oks = 0, falhas = 0;
  for (const pe of pedido.pessoas) {
    const email = normEmail(pe.email);
    if (!/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(email)) { falhas++; blocos.push(`• **${pe.nome || '?'}**\n   ⚠️ sem e-mail válido no pedido`); continue; }
    const p = { email, nome: String(pe.nome || '').trim(), tel: String(pe.whatsapp || '').replace(/\D/g, '') || null };
    const { clienteId, emails } = await emailsDaFicha(email);
    const linhas: string[] = [];
    for (const app of ordem) {
      let r: { ok: boolean; texto: string };
      try {
        r = app === 'proalt' ? await liberarProalt(p, emails, clienteId) : app === 'elo' ? await liberarElo(p, emails, clienteId) : await liberarSirius(p, emails, clienteId);
      } catch (e) { r = { ok: false, texto: `App ${app}: erro ${String((e as Error).message || e).slice(0, 120)}` }; }
      r.ok ? oks++ : falhas++;
      resultado.push({ email, app, ...r });
      linhas.push(`   ${r.ok ? '✅' : '⚠️'} ${r.texto}`);
    }
    blocos.push(`• **${p.nome || email}** · ${email}\n${linhas.join('\n')}`);
  }
  const nomes = ordem.map((a) => ({ proalt: 'ProAlt', elo: 'Elo', sirius: 'Sirius' } as any)[a]);
  const nomesApps = nomes.length > 1 ? `aos apps ${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : `ao app ${nomes[0]}`;
  const topo = falhas === 0
    ? `<@${m.author.id}>, o acesso ${nomesApps} foi liberado ✅ (somente o app)`
    : `<@${m.author.id}>, liberei o que deu (acesso ${nomesApps}), mas algo não saiu como deveria. <@${CODINA}> vai olhar.`;
  const texto = `${topo}\n\n${blocos.join('\n')}\n\nA área de membros da Hotmart continua com o Rafa e o Jairo.\n🤖 _Liberação feita automaticamente pela IA da Pinguim._`;
  const status = falhas === 0 ? 'liberado' : oks ? 'parcial' : 'falhou';
  return { texto, status, resultado };
}

async function rodar(body: any) {
  const { data: cfg } = await sb.from('acesso_area_config').select('*').eq('id', 1).single();
  // {simular:{texto}}: teste de ponta a ponta com um pedido escrito à mão — libera de verdade, responde no privado do Codina
  if (body.simular?.texto) {
    const pedido = await lerPedido(cfg.modelo_extracao || 'gpt-5.5', body.simular.texto);
    if (pedido.tipo !== 'pedido_acesso') return { pedido };
    const r = await atender({ author: { id: CODINA } }, pedido);
    const dm = await discord('/users/@me/channels', { method: 'POST', body: JSON.stringify({ recipient_id: CODINA }) });
    await discord(`/channels/${dm.id}/messages`, { method: 'POST', body: JSON.stringify({ content: ('🧪 SIMULAÇÃO\n' + r.texto).slice(0, 1990), allowed_mentions: { parse: [] } }) });
    return { pedido, ...r };
  }
  const dryRun = !!body.dry_run;
  if (!cfg.apps_ativo && !dryRun && !body.forcar) return { ativo: false };
  const canal = cfg.apps_canal_id;
  // mensagens depois da última lida (até 100 por rodada; o canal é de baixo volume)
  const lote = await discord(`/channels/${canal}/messages?limit=100${cfg.apps_ultimo_id ? '&after=' + cfg.apps_ultimo_id : ''}`);
  if (!Array.isArray(lote)) throw new Error('Discord: ' + JSON.stringify(lote).slice(0, 200));
  const msgs = lote.sort((a: any, b: any) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  const feitos: any[] = [];
  let ultimoId: string | null = null, atendidos = 0;
  for (const m of msgs) {
    const t = String(m.content || '');
    const candidato = !m.author?.bot && /[\w.+-]+@[\w-]+\.[\w.]+/.test(t) && /pro ?alt|\belo\b|sirius/i.test(t);
    if (candidato && atendidos >= MAX_PEDIDOS) break; // fica para a próxima rodada
    ultimoId = m.id;
    if (!candidato) continue;
    const { data: ja } = await sb.from('acesso_app_pedido').select('id').eq('discord_msg_id', m.id).limit(1);
    if (ja?.length) continue;
    const pedido = await lerPedido(cfg.modelo_extracao || 'gpt-5.5', t);
    const autor = m.author?.global_name || m.author?.username;
    if (pedido.tipo !== 'pedido_acesso' || !pedido.produtos.length || !pedido.pessoas.length) {
      feitos.push({ msg: m.id, autor, ignorado: pedido.tipo, produtos: pedido.produtos });
      if (!dryRun) await sb.from('acesso_app_pedido').insert({ discord_msg_id: m.id, autor_id: m.author.id, autor_nome: autor, texto: t, produtos: pedido.produtos, pessoas: pedido.pessoas, status: 'ignorado' });
      continue;
    }
    atendidos++;
    if (dryRun) { feitos.push({ msg: m.id, autor, faria: pedido }); continue; }
    const r = await atender(m, pedido);
    const resp = await discord(`/channels/${canal}/messages`, { method: 'POST', body: JSON.stringify({ content: r.texto.slice(0, 1990),
      message_reference: { message_id: m.id, fail_if_not_exists: false }, allowed_mentions: { users: [m.author.id, CODINA], replied_user: false } }) });
    await sb.from('acesso_app_pedido').insert({ discord_msg_id: m.id, autor_id: m.author.id, autor_nome: autor, texto: t,
      produtos: pedido.produtos.map((x: string) => x.toLowerCase()), pessoas: pedido.pessoas, resultado: r.resultado, status: r.status, resposta_msg_id: resp?.id || null });
    feitos.push({ msg: m.id, autor, status: r.status, resultado: r.resultado });
  }
  if (!dryRun && ultimoId) await sb.from('acesso_area_config').update({ apps_ultimo_id: ultimoId }).eq('id', 1);
  return { lidas: msgs.length, feitos };
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ erro: 'Use POST' }), { status: 405 });
  const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  let role = '';
  try { role = JSON.parse(atob(auth.split('.')[1])).role || ''; } catch (_) { /* não-JWT */ }
  if (role !== 'service_role') return new Response(JSON.stringify({ erro: 'Só service_role' }), { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* cron */ }
  try { return new Response(JSON.stringify(await rodar(body)), { headers: { 'Content-Type': 'application/json' } }); }
  catch (e) { return new Response(JSON.stringify({ erro: String((e as Error).message || e) }), { status: 500 }); }
});
