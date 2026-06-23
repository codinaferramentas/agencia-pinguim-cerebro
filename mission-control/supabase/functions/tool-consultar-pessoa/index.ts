// Edge Function: tool-consultar-pessoa
// Unifica consulta de pessoa em 5 fontes em paralelo:
//   - Hotmart (API direta /sales/history)
//   - Clint (API direta /v1/contacts)
//   - Supabase ProAlt (profiles)
//   - Supabase Elo (profiles)
//   - Supabase Sirius (profiles)
//
// Auto-detecta o tipo do identificador (email, telefone, CPF, nome).
// Cada fonte busca pelo campo mais apropriado pro tipo detectado.
//
// Auth: requireAuthTool (x-internal-token de function-to-function OU JWT do usuario).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { getChave } from '../_shared/cofre.ts';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { variantesTelefoneBR, orTelefonePostgrest } from '../_shared/telefone-br.ts';

// ============================================================
// Tipo do identificador
// ============================================================
type TipoIdentificador = 'email' | 'telefone' | 'cpf' | 'nome' | 'desconhecido';

function detectarTipo(identificador: string): TipoIdentificador {
  const s = (identificador || '').trim();
  if (!s) return 'desconhecido';
  if (s.includes('@') && s.includes('.')) return 'email';
  const soDigitos = s.replace(/\D/g, '');
  if (soDigitos.length === 11 && /^[1-9]/.test(soDigitos) && !/(\d)\1{10}/.test(soDigitos)) {
    // 11 digitos: pode ser CPF ou celular BR. CPF começa com qualquer digito 0-9, celular começa com DDD (11-99)
    // Heuristica: se começa com 9 ou tem DDD válido (11-99 seguido de 9), trata como telefone
    const ddd = parseInt(soDigitos.slice(0, 2), 10);
    if (ddd >= 11 && ddd <= 99 && soDigitos[2] === '9') return 'telefone';
    return 'cpf';
  }
  if (soDigitos.length >= 10 && soDigitos.length <= 13) return 'telefone';
  if (soDigitos.length === 11) return 'cpf';
  if (s.length >= 3 && /[a-zA-ZÀ-ÿ]/.test(s)) return 'nome';
  return 'desconhecido';
}

function normalizarTelefone(s: string): string {
  // Remove tudo que nao for digito. Pra Hotmart aceita varios formatos.
  return s.replace(/\D/g, '');
}

// ============================================================
// Hotmart auth (porta do tool-consultar-hotmart)
// ============================================================
const _cacheTokenHotmart = { access_token: '', expira_em_ms: 0 };

async function obterAccessTokenHotmart(): Promise<string> {
  const agora = Date.now();
  if (_cacheTokenHotmart.access_token && _cacheTokenHotmart.expira_em_ms > agora + 300_000) {
    return _cacheTokenHotmart.access_token;
  }
  const [clientId, clientSecret, basicToken] = await Promise.all([
    getChave('HOTMART_CLIENT_ID', 'tool-consultar-pessoa'),
    getChave('HOTMART_CLIENT_SECRET', 'tool-consultar-pessoa'),
    getChave('HOTMART_BASIC_TOKEN', 'tool-consultar-pessoa'),
  ]);
  const url = `https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Authorization': `Basic ${basicToken}` } });
  const json = await r.json();
  if (!r.ok || !json.access_token) {
    throw new Error(`Hotmart auth ${r.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  _cacheTokenHotmart.access_token = json.access_token;
  _cacheTokenHotmart.expira_em_ms = agora + (parseInt(json.expires_in, 10) * 1000);
  return _cacheTokenHotmart.access_token;
}

// Hotmart API NAO aceita filtro por telefone nem por documento — so email, nome, transaction, product_id, datas.
// (Validado 2026-05-23: doc oficial + lib hotmart.js empirico)
// Estrategia pra telefone/CPF: a 2a fase descobre emails via Clint/ProAlt/Elo/Sirius e consulta Hotmart por cada email.
async function consultarHotmartPorEmail(email: string): Promise<any> {
  try {
    const token = await obterAccessTokenHotmart();
    const base = 'https://developers.hotmart.com/payments/api/v1/sales/history';
    const params = new URLSearchParams();
    params.append('transaction_status', 'APPROVED,COMPLETE,REFUNDED,CHARGEBACK,CANCELLED');
    params.append('max_results', '50');
    params.append('buyer_email', email);
    const r = await fetch(`${base}?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    if (!r.ok) return { ok: false, email, erro: `Hotmart ${r.status}`, items: [] };
    const json = await r.json();
    return { ok: true, email, items: json.items || [] };
  } catch (e: any) {
    return { ok: false, email, erro: e.message, items: [] };
  }
}

async function consultarHotmartPorNome(nome: string): Promise<any> {
  try {
    const token = await obterAccessTokenHotmart();
    const base = 'https://developers.hotmart.com/payments/api/v1/sales/history';
    const params = new URLSearchParams();
    params.append('transaction_status', 'APPROVED,COMPLETE,REFUNDED,CHARGEBACK,CANCELLED');
    params.append('max_results', '50');
    params.append('buyer_name', nome);
    const r = await fetch(`${base}?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    if (!r.ok) return { ok: false, erro: `Hotmart ${r.status}`, items: [] };
    const json = await r.json();
    return { ok: true, items: json.items || [] };
  } catch (e: any) {
    return { ok: false, erro: e.message, items: [] };
  }
}

// Junta resultados de varias consultas Hotmart (1 por email) em 1 panorama unico
function consolidarHotmart(resultados: any[]): any {
  const todosItems: any[] = [];
  const erros: string[] = [];
  const emailsConsultados: string[] = [];
  for (const r of resultados) {
    if (r.email) emailsConsultados.push(r.email);
    if (!r.ok) { erros.push(r.erro); continue; }
    todosItems.push(...(r.items || []));
  }
  if (todosItems.length === 0) {
    return {
      fonte: 'hotmart',
      ok: erros.length === 0,
      encontrado: false,
      emails_consultados: emailsConsultados,
      ...(erros.length > 0 ? { erro: erros.join('; ') } : {}),
    };
  }
  // Deduplica por transaction code
  const seen = new Set<string>();
  const itemsUnicos = todosItems.filter((it: any) => {
    const tid = it.purchase?.transaction;
    if (!tid || seen.has(tid)) return false;
    seen.add(tid);
    return true;
  });
  const buyer = itemsUnicos[0]?.buyer || {};
  const produtos = new Map<string, any>();
  let gastoTotal = 0, valorReembolsado = 0;
  for (const it of itemsUnicos) {
    const valor = Number(it.purchase?.price?.value || 0);
    const status = it.purchase?.status || 'UNKNOWN';
    if (status === 'REFUNDED' || status === 'CHARGEBACK') valorReembolsado += valor;
    else if (status === 'APPROVED' || status === 'COMPLETE') gastoTotal += valor;
    const pid = String(it.product?.id);
    if (!produtos.has(pid)) produtos.set(pid, { id: it.product?.id, nome: it.product?.name, compras: [] });
    produtos.get(pid).compras.push({
      transaction: it.purchase?.transaction,
      status,
      valor,
      data: it.purchase?.order_date ? new Date(it.purchase.order_date).toISOString() : null,
    });
  }
  return {
    fonte: 'hotmart',
    ok: true,
    encontrado: true,
    pessoa: { nome: buyer.name, email: buyer.email, telefone: buyer.phone, documento: buyer.document },
    emails_consultados: emailsConsultados,
    total_transacoes: itemsUnicos.length,
    gasto_total: Number(gastoTotal.toFixed(2)),
    valor_reembolsado: Number(valorReembolsado.toFixed(2)),
    produtos: [...produtos.values()],
  };
}

// ============================================================
// Clint
// ============================================================
async function consultarClint(identificador: string, tipo: TipoIdentificador): Promise<any> {
  try {
    const token = await getChave('CLINT_API_TOKEN', 'tool-consultar-pessoa');
    // Clint API /v1/contacts aceita filtros nativos: ?email=X, ?phone=X (sem DDI), ?name=X
    // CPF nao tem filtro direto.
    let queryParam = '';
    if (tipo === 'email') {
      queryParam = `email=${encodeURIComponent(identificador.trim())}`;
    } else if (tipo === 'telefone') {
      // Clint guarda phone SEM DDI (ex: 11985879361), fullPhone com DDI (+5511985879361)
      // Passa sem DDI — pega so os ultimos 11 digitos
      const tel = normalizarTelefone(identificador);
      const tel11 = tel.length > 11 ? tel.slice(-11) : tel;
      queryParam = `phone=${encodeURIComponent(tel11)}`;
    } else if (tipo === 'nome') {
      queryParam = `name=${encodeURIComponent(identificador.trim())}`;
    } else if (tipo === 'cpf') {
      // Clint nao indexa CPF — declarar nao encontrado direto
      return { fonte: 'clint', ok: true, encontrado: false, motivo: 'Clint nao indexa CPF' };
    }
    const url = `https://api.clint.digital/v1/contacts?${queryParam}&limit=10`;
    const r = await fetch(url, { headers: { 'api-token': token, 'Accept': 'application/json' } });
    if (!r.ok) {
      return { fonte: 'clint', ok: false, erro: `Clint ${r.status}`, encontrado: false };
    }
    const json = await r.json();
    const arr = Array.isArray(json.data) ? json.data : [];
    if (arr.length === 0) {
      return { fonte: 'clint', ok: true, encontrado: false };
    }
    return {
      fonte: 'clint',
      ok: true,
      encontrado: true,
      total: json.totalCount || arr.length,
      contatos: arr.slice(0, 5).map((c: any) => ({
        id: c.id,
        nome: c.name,
        email: c.email,
        telefone: c.fullPhone || (c.ddi && c.phone ? `+${c.ddi}${c.phone}` : c.phone),
        criado_em: c.created_at,
        tags: (c.tags || []).map((t: any) => t.name),
      })),
    };
  } catch (e: any) {
    return { fonte: 'clint', ok: false, erro: e.message, encontrado: false };
  }
}

// ============================================================
// Supabase externo (ProAlt, Elo, Sirius)
// ============================================================
const COLUNAS_POR_PROJETO: Record<string, { email: string; telefone: string; nome: string }> = {
  proalt: { email: 'email', telefone: 'phone', nome: 'full_name' },
  elo:    { email: 'email', telefone: 'telefone', nome: 'nome_completo' },
  sirius: { email: 'email', telefone: 'telefone', nome: 'nome' },
};

async function consultarSupabaseExterno(projeto: 'proalt' | 'elo' | 'sirius', identificador: string, tipo: TipoIdentificador): Promise<any> {
  try {
    const prefixo = projeto.toUpperCase();
    const [url, key] = await Promise.all([
      getChave(`${prefixo}_SUPABASE_URL`, 'tool-consultar-pessoa'),
      getChave(`${prefixo}_SUPABASE_KEY`, 'tool-consultar-pessoa'),
    ]);
    const cols = COLUNAS_POR_PROJETO[projeto];

    // Pra nome com acento, tenta 2 variacoes (com e sem acento) em OR — PostgREST suporta `or=(a,b)`
    let urlFinal: string;
    if (tipo === 'email') {
      urlFinal = `${url}/rest/v1/profiles?select=*&${cols.email}=ilike.${encodeURIComponent(identificador.trim())}&limit=10`;
    } else if (tipo === 'telefone') {
      // Cobre variantes BR (com/sem DDI 55, com/sem 9 do celular, com/sem +)
      // porque cada produto grava num formato diferente. Ver _shared/telefone-br.ts.
      const variantes = variantesTelefoneBR(identificador);
      const frag = orTelefonePostgrest(cols.telefone, variantes);
      urlFinal = `${url}/rest/v1/profiles?select=*&${frag}&limit=10`;
    } else if (tipo === 'nome') {
      // Tira acentos do termo de busca pra casar mesmo se a coluna tem acento — usa wildcard amplo
      const semAcento = identificador.trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
      // Pega primeira palavra (radical) pra busca mais frouxa
      const primeiroNome = semAcento.split(/\s+/)[0];
      // Casa qualquer string que comece com radical do 1o nome OU contenha a frase exata
      const padrao1 = encodeURIComponent(`*${primeiroNome}*`);
      const padrao2 = encodeURIComponent(`*${identificador.trim()}*`);
      urlFinal = `${url}/rest/v1/profiles?select=*&or=(${cols.nome}.ilike.${padrao1},${cols.nome}.ilike.${padrao2})&limit=10`;
    } else if (tipo === 'cpf') {
      return { fonte: projeto, ok: true, encontrado: false, motivo: 'projeto nao tem coluna CPF' };
    } else {
      return { fonte: projeto, ok: false, erro: 'tipo desconhecido', encontrado: false };
    }

    const r = await fetch(urlFinal, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!r.ok) {
      const txt = await r.text();
      return { fonte: projeto, ok: false, erro: `${projeto} ${r.status}: ${txt.slice(0, 100)}`, encontrado: false };
    }
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length === 0) {
      return { fonte: projeto, ok: true, encontrado: false };
    }
    return {
      fonte: projeto,
      ok: true,
      encontrado: true,
      total: arr.length,
      perfis: arr.slice(0, 5).map((p: any) => ({
        id: p.id || p.user_id,
        nome: p[cols.nome] || p.nome || p.full_name,
        email: p[cols.email],
        telefone: p[cols.telefone],
        criado_em: p.created_at || p.data_cadastro,
        plano: p.plan_status || p.plano || null,
        last_access: p.last_access_at || p.last_access || p.last_login_at || null,
      })),
    };
  } catch (e: any) {
    return { fonte: projeto, ok: false, erro: e.message, encontrado: false };
  }
}

// ============================================================
// Boleto Principia Pay (projeto Dash — public.boleto_transactions)
// v0.23 — adicionado quando descobriu que vendas de boleto não estavam sendo encontradas
// ============================================================
async function consultarBoletoPrincipia(identificador: string, tipo: TipoIdentificador): Promise<any> {
  try {
    const [url, key] = await Promise.all([
      getChave('DASHBOARD_URL', 'tool-consultar-pessoa'),
      getChave('DASHBOARD_SERVICE_ROLE_KEY', 'tool-consultar-pessoa'),
    ]);
    if (!url || !key) {
      return { fonte: 'boleto_principia', ok: false, erro: 'DASHBOARD_URL ou DASHBOARD_SERVICE_ROLE_KEY ausente', encontrado: false };
    }

    let urlFinal: string;
    const campos = 'sale_id,buyer_name,buyer_email,buyer_phone,buyer_document,product_name,variant_name,price,status,payment_method,checkout_created_at,made_effective_at,canceled_at';

    if (tipo === 'email') {
      urlFinal = `${url}/rest/v1/boleto_transactions?select=${campos}&buyer_email=ilike.${encodeURIComponent(identificador.trim())}&order=made_effective_at.desc.nullslast&limit=20`;
    } else if (tipo === 'telefone') {
      const variantes = variantesTelefoneBR(identificador);
      const frag = orTelefonePostgrest('buyer_phone', variantes);
      urlFinal = `${url}/rest/v1/boleto_transactions?select=${campos}&${frag}&order=made_effective_at.desc.nullslast&limit=20`;
    } else if (tipo === 'cpf') {
      const cpf = identificador.replace(/\D/g, '');
      urlFinal = `${url}/rest/v1/boleto_transactions?select=${campos}&buyer_document=ilike.*${cpf}*&order=made_effective_at.desc.nullslast&limit=20`;
    } else if (tipo === 'nome') {
      const primeiroNome = identificador.trim().split(/\s+/)[0];
      const padrao = encodeURIComponent(`*${primeiroNome}*`);
      urlFinal = `${url}/rest/v1/boleto_transactions?select=${campos}&buyer_name=ilike.${padrao}&order=made_effective_at.desc.nullslast&limit=20`;
    } else {
      return { fonte: 'boleto_principia', ok: false, erro: 'tipo desconhecido', encontrado: false };
    }

    const r = await fetch(urlFinal, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!r.ok) {
      const txt = await r.text();
      return { fonte: 'boleto_principia', ok: false, erro: `Dash boleto ${r.status}: ${txt.slice(0, 150)}`, encontrado: false };
    }
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length === 0) {
      return { fonte: 'boleto_principia', ok: true, encontrado: false };
    }

    // Agrupa por buyer_email pra ver pessoa única + lista compras
    const porPessoa = new Map<string, any>();
    for (const v of arr) {
      const k = (v.buyer_email || v.buyer_phone || v.buyer_document || v.sale_id || '').toLowerCase();
      if (!porPessoa.has(k)) {
        porPessoa.set(k, {
          nome: v.buyer_name,
          email: v.buyer_email,
          telefone: v.buyer_phone,
          cpf: v.buyer_document,
          compras: [],
        });
      }
      porPessoa.get(k).compras.push({
        sale_id: v.sale_id,
        produto: v.product_name,
        variante: v.variant_name,
        valor: Number(v.price || 0),
        status: v.status,
        metodo_pagamento: v.payment_method,
        checkout_em: v.checkout_created_at,
        confirmado_em: v.made_effective_at,
        cancelado_em: v.canceled_at,
      });
    }

    const pessoas = [...porPessoa.values()];
    // Totais
    const totalGasto = arr.reduce((s, v) => s + Number(v.price || 0), 0);
    const confirmadas = arr.filter(v => v.status === 'confirmed').length;

    return {
      fonte: 'boleto_principia',
      ok: true,
      encontrado: true,
      total_transacoes: arr.length,
      confirmadas,
      total_gasto_brl: totalGasto,
      pessoas,
    };
  } catch (e: any) {
    return { fonte: 'boleto_principia', ok: false, erro: e.message, encontrado: false };
  }
}

// ============================================================
// Handler
// ============================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  if (req.method !== 'POST') return jsonRespTool({ erro: 'Use POST' }, 405);
  if (!(await requireAuthTool(req))) return jsonRespTool({ erro: 'Nao autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonRespTool({ erro: 'JSON invalido' }, 400); }

  const { identificador, fontes, tipo_forcado } = body;
  if (!identificador || typeof identificador !== 'string' || identificador.trim().length < 3) {
    return jsonRespTool({ erro: 'campo "identificador" obrigatorio (min 3 chars)' }, 400);
  }

  const tipo = (tipo_forcado as TipoIdentificador) || detectarTipo(identificador);
  if (tipo === 'desconhecido') {
    return jsonRespTool({ erro: 'nao consegui detectar tipo do identificador (email/telefone/cpf/nome)' }, 400);
  }

  // Quais fontes consultar (default = todas)
  // v0.23 — adicionado 'boleto_principia' (tabela boleto_transactions no projeto Dash)
  const FONTES_DISPONIVEIS = ['hotmart', 'clint', 'proalt', 'elo', 'sirius', 'boleto_principia'];
  const fontesAtivas: string[] = Array.isArray(fontes) && fontes.length > 0
    ? fontes.filter((f: string) => FONTES_DISPONIVEIS.includes(f))
    : FONTES_DISPONIVEIS;

  const tInicio = Date.now();

  // ============================================================
  // FASE 1 — Fontes que aceitam busca direta pelo identificador
  // (Clint, ProAlt, Elo, Sirius pra qualquer tipo;
  //  Hotmart so quando email ou nome — telefone/CPF cai pra Fase 2)
  // ============================================================
  const promessasF1: Promise<any>[] = [];
  if (fontesAtivas.includes('clint'))   promessasF1.push(consultarClint(identificador, tipo));
  if (fontesAtivas.includes('proalt'))  promessasF1.push(consultarSupabaseExterno('proalt', identificador, tipo));
  if (fontesAtivas.includes('elo'))     promessasF1.push(consultarSupabaseExterno('elo', identificador, tipo));
  if (fontesAtivas.includes('sirius'))  promessasF1.push(consultarSupabaseExterno('sirius', identificador, tipo));
  if (fontesAtivas.includes('boleto_principia')) promessasF1.push(consultarBoletoPrincipia(identificador, tipo));
  // Hotmart direto so se o identificador eh email ou nome
  if (fontesAtivas.includes('hotmart') && tipo === 'email') {
    promessasF1.push(consultarHotmartPorEmail(identificador).then(r => consolidarHotmart([r])));
  } else if (fontesAtivas.includes('hotmart') && tipo === 'nome') {
    promessasF1.push(consultarHotmartPorNome(identificador).then(r => consolidarHotmart([{ ...r, email: null }])));
  }

  const resultadosF1 = await Promise.all(promessasF1);

  // ============================================================
  // FASE 2 — Se identificador eh telefone/CPF, descobre emails na Fase 1
  // e consulta Hotmart pra cada email unico em paralelo.
  // ============================================================
  let resultadoHotmart: any = resultadosF1.find(r => r.fonte === 'hotmart');
  if (fontesAtivas.includes('hotmart') && !resultadoHotmart && (tipo === 'telefone' || tipo === 'cpf')) {
    // Coleta emails unicos das outras fontes
    const emails = new Set<string>();
    for (const r of resultadosF1) {
      if (!r.ok || !r.encontrado) continue;
      if (r.fonte === 'clint') {
        for (const c of (r.contatos || [])) { if (c.email) emails.add(c.email.toLowerCase().trim()); }
      } else if (['proalt', 'elo', 'sirius'].includes(r.fonte)) {
        for (const p of (r.perfis || [])) { if (p.email) emails.add(p.email.toLowerCase().trim()); }
      } else if (r.fonte === 'boleto_principia') {
        // v0.23 — boleto também tem email do comprador
        for (const p of (r.pessoas || [])) { if (p.email) emails.add(p.email.toLowerCase().trim()); }
      }
    }
    if (emails.size > 0) {
      // Limita a 10 emails por seguranca (cada 1 = 1 chamada Hotmart)
      const emailsArr = [...emails].slice(0, 10);
      const consultasHm = await Promise.all(emailsArr.map(e => consultarHotmartPorEmail(e)));
      resultadoHotmart = consolidarHotmart(consultasHm);
      resultadoHotmart.descoberta_indireta = true; // sinaliza que veio via outra fonte
    } else {
      resultadoHotmart = { fonte: 'hotmart', ok: true, encontrado: false, motivo: 'API Hotmart nao filtra por telefone/CPF — e nenhuma outra fonte tinha email correlacionado.' };
    }
  }

  const resultados = resultadoHotmart
    ? [...resultadosF1.filter(r => r.fonte !== 'hotmart'), resultadoHotmart]
    : resultadosF1;

  // Indexa por fonte
  const porFonte: Record<string, any> = {};
  for (const r of resultados) porFonte[r.fonte] = r;

  const achadosEm = resultados.filter(r => r.ok && r.encontrado).map(r => r.fonte);
  const errosEm = resultados.filter(r => !r.ok).map(r => ({ fonte: r.fonte, erro: r.erro }));

  return jsonRespTool({
    ok: true,
    identificador: identificador.trim(),
    tipo_detectado: tipo,
    achados_em: achadosEm,
    nao_achado_em: resultados.filter(r => r.ok && !r.encontrado).map(r => r.fonte),
    erros_em: errosEm,
    resultados: porFonte,
    latencia_ms: Date.now() - tInicio,
  });
});
