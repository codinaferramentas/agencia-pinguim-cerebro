// crm-sync-perfis — batch diario que reconcilia os ACESSOS dos 3 apps (ProAlt/Elo/Sirius)
// na base CRM. ProAlt/Sirius: incremental por updated_at (so o que mudou). Elo: full (703, pequeno).
// Atualiza crm_acesso_app (cache) + cria cliente/identidade se inedito. Roda 4h (cron).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }, db: { schema: 'pinguim' },
});
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

function telCanon(s: string | null): string | null {
  const d = String(s || '').replace(/\D/g, ''); let n = d;
  if (n.startsWith('55') && (n.length === 12 || n.length === 13)) n = n.slice(2);
  if (n.length === 11 && n[2] === '9') n = n.slice(0, 2) + n.slice(3);
  else if (n.length === 11 && n[2] !== '9') n = n.slice(-10);
  return n.length >= 10 ? n : null;
}
const nEmail = (s: string | null) => String(s || '').trim().toLowerCase();

// config por app: como ler e mapear cada profiles pro formato comum
const APPS = [
  { app: 'proalt', urlKey: 'PROALT_SUPABASE_URL', keyKey: 'PROALT_SUPABASE_KEY', incremental: true,
    cols: 'email,phone,full_name,created_at,last_access_at,access_count,blocked_at,blocked_reason,updated_at',
    map: (r: any) => ({ email: r.email, tel: r.phone, nome: r.full_name, status: r.blocked_at ? 'bloqueado' : 'ativo',
      plano: null, vigencia: null, ult: r.last_access_at, nac: r.access_count, cad: r.created_at,
      attrs: r.blocked_at ? { bloqueado: r.blocked_reason } : {} }) },
  { app: 'elo', urlKey: 'ELO_SUPABASE_URL', keyKey: 'ELO_SUPABASE_KEY', incremental: false,
    cols: 'email,telefone,nome_completo,data_cadastro,last_access,plano,plan_status,vigencia_ate,ciclo_atual,semana_atual,elo_10k',
    map: (r: any) => ({ email: r.email, tel: r.telefone, nome: r.nome_completo, status: r.plan_status || 'ativo',
      plano: r.plano || r.plan_status, vigencia: r.vigencia_ate, ult: r.last_access, nac: null, cad: r.data_cadastro,
      attrs: { ciclo: r.ciclo_atual, semana: r.semana_atual, elo_10k: r.elo_10k } }) },
  { app: 'sirius', urlKey: 'SIRIUS_SUPABASE_URL', keyKey: 'SIRIUS_SUPABASE_KEY', incremental: true,
    cols: 'email,telefone,nome,created_at,last_login_at,login_count,plan_status,plan_expires_at,last_payment_at,updated_at',
    map: (r: any) => ({ email: r.email, tel: r.telefone, nome: r.nome, status: r.plan_status || 'ativo',
      plano: r.plan_status, vigencia: r.plan_expires_at, ult: r.last_login_at, nac: r.login_count, cad: r.created_at,
      attrs: { last_payment_at: r.last_payment_at } }) },
];

// mapas em memoria (email/tel -> cliente_id) pra evitar 1 query por perfil
const mapEmail = new Map<string, string>();
const mapTel = new Map<string, string>();
async function carregarIdentidades() {
  // Supabase limita resposta a 1000 linhas/chamada — paginar de 1000 em 1000 de verdade.
  let off = 0; const passo = 1000;
  while (true) {
    const { data, error } = await sb.from('crm_cliente_identidade').select('tipo,valor,cliente_id').range(off, off + passo - 1);
    if (error) throw new Error('carregarIdentidades: ' + error.message);
    if (!data || !data.length) break;
    for (const r of data) { if (r.tipo === 'email') mapEmail.set(r.valor, r.cliente_id); else if (r.tipo === 'tel') mapTel.set(r.valor, r.cliente_id); }
    off += data.length;
    if (data.length < passo) break;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const t0 = Date.now();
  const resumo: Record<string, unknown> = {};
  try {
    await carregarIdentidades();
    for (const cfg of APPS) {
      const url = await getChave(cfg.urlKey, 'crm-sync-perfis');
      const key = await getChave(cfg.keyKey, 'crm-sync-perfis');
      // marca d'agua por app
      const fonte = `app_${cfg.app}`;
      const { data: est } = await sb.from('crm_sync_estado').select('ultima_marca').eq('fonte', fonte).maybeSingle();
      const desde = est?.ultima_marca || '2000-01-01T00:00:00Z';

      let filtro = '';
      if (cfg.incremental) filtro = `&updated_at=gt.${encodeURIComponent(desde)}&order=updated_at.asc`;
      // pagina
      let off = 0; const passo = 1000; let total = 0; let maxUpd = desde;
      while (true) {
        const r = await fetch(`${url}/rest/v1/profiles?select=${cfg.cols}${filtro}&limit=${passo}&offset=${off}`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } });
        if (!r.ok) { resumo[cfg.app] = `erro ${r.status}`; break; }
        const rows = await r.json();
        if (!rows.length) break;
        for (const raw of rows) {
          const m = cfg.map(raw);
          if (cfg.incremental && raw.updated_at && raw.updated_at > maxUpd) maxUpd = raw.updated_at;
          const cid = await resolverCliente(m.email, m.tel, m.nome);
          if (!cid) continue;
          await sb.from('crm_acesso_app').upsert({
            cliente_id: cid, app: cfg.app, status: m.status, plano: m.plano,
            vigencia_ate: m.vigencia || null, ultimo_acesso: m.ult || null, n_acessos: m.nac ?? null,
            cadastro_em: m.cad || null, atributos: m.attrs, sincronizado_em: new Date().toISOString(),
          }, { onConflict: 'cliente_id,app' });
          total++;
        }
        off += passo;
        if (rows.length < passo) break;
        if (off > 30000) break; // trava de seguranca
      }
      // avanca marca (incremental)
      if (cfg.incremental) {
        await sb.from('crm_sync_estado').upsert({ fonte, ultima_marca: maxUpd, ultima_rodada: new Date().toISOString(), itens_ultima: total }, { onConflict: 'fonte' });
      }
      resumo[cfg.app] = total;
    }
    return json({ ok: true, atualizados: resumo, ms: Date.now() - t0 });
  } catch (e) {
    console.error('crm-sync-perfis', e);
    return json({ ok: false, erro: String(e), parcial: resumo }, 500);
  }
});

async function resolverCliente(email: string | null, tel: string | null, nome: string | null): Promise<string | null> {
  const e = nEmail(email); const tc = telCanon(tel);
  // lookup instantaneo nos mapas em memoria
  if (e && mapEmail.has(e)) return mapEmail.get(e)!;
  if (tc && mapTel.has(tc)) return mapTel.get(tc)!;
  // inedito: cria ficha. O nome que vem do app é nome de PERFIL (pode ser o do Instagram, com emoji):
  // entra como nome provisório e fica guardado em nome_perfil; a primeira compra na Hotmart põe o nome
  // padrão (crm_cliente_nome_hotmart). Ficha que já existe pelo email NUNCA tem o nome trocado aqui.
  let cid: string | null = null;
  const perfil = { nome, nome_perfil: nome, nome_origem: 'perfil' };
  if (e) {
    const { data: ja } = await sb.from('crm_cliente').select('cliente_id').eq('email_canon', e).limit(1).maybeSingle();
    cid = ja?.cliente_id ?? null;
    if (!cid) {
      const { data } = await sb.from('crm_cliente').insert({ ...perfil, email_canon: e, tel_canon: tc }).select('cliente_id').maybeSingle();
      cid = data?.cliente_id ?? null;
      if (!cid) { // corrida (outra rodada criou) ou telefone principal já usado em outra ficha
        const { data: d2 } = await sb.from('crm_cliente').select('cliente_id').eq('email_canon', e).limit(1).maybeSingle();
        cid = d2?.cliente_id ?? null;
        if (!cid) { const { data: d3 } = await sb.from('crm_cliente').insert({ ...perfil, email_canon: e }).select('cliente_id').maybeSingle(); cid = d3?.cliente_id ?? null; }
      }
    }
  } else {
    const { data } = await sb.from('crm_cliente').insert({ ...perfil, tel_canon: tc }).select('cliente_id').maybeSingle();
    cid = data?.cliente_id ?? null;
  }
  if (!cid) return null;
  const ids = [];
  if (e) { ids.push({ cliente_id: cid, tipo: 'email', valor: e, confianca: 'forte', origem: 'app' }); mapEmail.set(e, cid); }
  if (tc) { ids.push({ cliente_id: cid, tipo: 'tel', valor: tc, confianca: 'fraca', origem: 'app' }); mapTel.set(tc, cid); }
  if (ids.length) await sb.from('crm_cliente_identidade').upsert(ids, { onConflict: 'tipo,valor' });
  return cid;
}
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } }); }
