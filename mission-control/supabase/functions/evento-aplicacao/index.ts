// Edge Function: evento-aplicacao
// POST /functions/v1/evento-aplicacao
// Headers: Authorization: Bearer <EVENTO_TOKEN>
//
// CRUD da tela de captura de aplicações no evento. ÚNICO ponto que escreve
// em vendas_eventos. A tela pública NUNCA fala com o banco direto — só com
// esta função, protegida por EVENTO_TOKEN.
//
// vendas_eventos não é exposto no PostgREST; o acesso é via RPCs pinguim.ve_*
// (SECURITY DEFINER, grant só service_role).
//
// Body: { acao, ...params }
//   listar_eventos | criar_evento | listar_consultores | buscar
//   criar | atualizar | adicionar_pessoa | listar

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { validarTokenEvento, corsEvento, jsonEvento, sbEventos, mascararCpf } from '../_shared/auth-evento.ts';

function soDigitos(s?: string | null): string { return (s || '').replace(/\D/g, ''); }

// Valida dígito verificador de CPF (defesa server-side; a UI também valida)
function cpfValido(cpf?: string | null): boolean {
  const c = soDigitos(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(c[i]) * (10 - i);
  let d1 = 11 - (s % 11); if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(c[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(c[i]) * (11 - i);
  let d2 = 11 - (s % 11); if (d2 >= 10) d2 = 0;
  return d2 === parseInt(c[10]);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsEvento });
  if (req.method !== 'POST') return jsonEvento({ erro: 'Use POST' }, 405);

  const auth = await validarTokenEvento(req);
  if (!auth.ok) return jsonEvento({ erro: 'Token invalido ou ausente' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonEvento({ erro: 'JSON invalido' }, 400); }

  const sb = sbEventos();
  const acao = body?.acao;

  try {
    switch (acao) {
      case 'listar_eventos': {
        const { data, error } = await sb.rpc('ve_listar_eventos');
        if (error) throw error;
        return jsonEvento({ ok: true, eventos: data });
      }
      case 'criar_evento': {
        const { slug, nome, data_evento, local, product_ids } = body;
        if (!slug || !nome) return jsonEvento({ erro: 'slug e nome obrigatorios' }, 400);
        const { data, error } = await sb.rpc('ve_criar_evento', {
          p_slug: slug, p_nome: nome, p_data_evento: data_evento || null,
          p_local: local || null, p_product_ids: Array.isArray(product_ids) ? product_ids : [],
        });
        if (error) throw error;
        return jsonEvento({ ok: true, evento: data }, 201);
      }
      case 'listar_consultores': {
        const { data, error } = await sb.rpc('ve_listar_consultores');
        if (error) throw error;
        return jsonEvento({ ok: true, consultores: data });
      }
      case 'criar_consultor': {
        const { nome, whatsapp } = body;
        if (!nome) return jsonEvento({ erro: 'nome obrigatorio' }, 400);
        const { data, error } = await sb.rpc('ve_criar_consultor', { p_nome: nome, p_whatsapp: whatsapp || null });
        if (error) throw error;
        return jsonEvento({ ok: true, consultor: data }, 201);
      }
      case 'buscar': {
        const termoRaw = (body.termo || '').trim();
        if (termoRaw.length < 2) return jsonEvento({ erro: 'termo muito curto' }, 400);
        const dig = soDigitos(termoRaw);
        const termo = termoRaw.replace(/[%,]/g, ' ');
        const { data, error } = await sb.rpc('ve_buscar_cache', {
          p_evento_id: body.evento_id || null, p_termo: termo, p_dig: dig,
        });
        if (error) throw error;
        const resultados = (data || []).map((r: any) => ({ ...r, cpf: mascararCpf(r.cpf), cpf_ok: !!r.cpf }));
        return jsonEvento({ ok: true, resultados, total: resultados.length });
      }
      case 'criar': {
        const { evento_id, aplicacao, pessoas } = body;
        if (!evento_id) return jsonEvento({ erro: 'evento_id obrigatorio' }, 400);
        if (!aplicacao?.consultor_nome) return jsonEvento({ erro: 'consultor_nome obrigatorio' }, 400);
        const lista = Array.isArray(pessoas) ? pessoas : [];
        if (!lista.length || lista.length > 2) return jsonEvento({ erro: '1 ou 2 cadeiras' }, 400);

        const resp = lista.filter((p: any) => p.is_responsavel_financeiro);
        if (resp.length !== 1) return jsonEvento({ erro: 'marque exatamente 1 responsavel financeiro' }, 400);
        if (!cpfValido(resp[0].cpf)) return jsonEvento({ erro: 'CPF do responsavel financeiro invalido' }, 400);

        // Soft-warning de duplicata por CPF (não bloqueia)
        const cpfs = lista.map((p: any) => soDigitos(p.cpf)).filter((c: string) => c.length === 11);
        let aviso_duplicata: any = null;
        if (cpfs.length) {
          const { data: dups } = await sb.rpc('ve_checar_duplicata', { p_cpfs: cpfs });
          if (dups && dups.length) aviso_duplicata = dups;
        }

        const { data, error } = await sb.rpc('ve_criar_aplicacao', {
          p_evento_id: evento_id, p_aplicacao: aplicacao, p_pessoas: lista,
        });
        if (error) throw error;
        return jsonEvento({ ok: true, ...data, aviso_duplicata }, 201);
      }
      case 'atualizar': {
        const { aplicacao_id, campos } = body;
        if (!aplicacao_id || !campos) return jsonEvento({ erro: 'aplicacao_id e campos obrigatorios' }, 400);
        const { data, error } = await sb.rpc('ve_atualizar_aplicacao', { p_id: aplicacao_id, p_campos: campos });
        if (error) throw error;
        return jsonEvento({ ok: true, aplicacao: data });
      }
      case 'adicionar_pessoa': {
        const { aplicacao_id, pessoa } = body;
        if (!aplicacao_id || !pessoa?.nome) return jsonEvento({ erro: 'aplicacao_id e pessoa.nome obrigatorios' }, 400);
        const { data, error } = await sb.rpc('ve_adicionar_pessoa', { p_aplicacao_id: aplicacao_id, p_pessoa: pessoa });
        if (error) throw error;
        return jsonEvento({ ok: true, pessoa: data }, 201);
      }
      case 'listar': {
        const { data, error } = await sb.rpc('ve_listar_aplicacoes', { p_evento_id: body.evento_id || null });
        if (error) throw error;
        return jsonEvento({ ok: true, aplicacoes: data, total: Array.isArray(data) ? data.length : 0 });
      }
      default:
        return jsonEvento({ erro: `acao desconhecida: ${acao}` }, 400);
    }
  } catch (e) {
    return jsonEvento({ erro: (e as Error).message || 'erro interno' }, 500);
  }
});
