// ============================================================
// Edge Function: mundo-ia-gestao
// ============================================================
// CRUD da gestão do "Mundo IA" — chamada pela aba 🌎 do Mission Control.
// Qualquer sócio adiciona/remove alvos (perfis IG / canais YT), edita config
// (WhatsApp, liga/desliga envio) e dispara relatório na hora.
//
// Ações (body.acao):
//   listar_alvos        { dono_socio }
//   add_alvo            { dono_socio, tipo, url, apelido? }   -> normaliza handle da url
//   toggle_alvo         { id }
//   remover_alvo        { id }
//   carregar_config     { dono_socio }
//   salvar_config       { dono_socio, whatsapp_destino?, envia_whatsapp?, hora_envio? }
//   ultimas_execucoes   { dono_socio, limite? }
//   carregar_execucao   { id }               -> devolve html + resumo_grupo
//   rodar_agora         { dono_socio, fase } -> chama mundo-ia-motor
//   agendar_crons       { }                  -> ativa os 2 pg_cron
//   desagendar_crons    { }
//
// Auth: requireAuthTool (JWT do sócio).
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }, db: { schema: 'pinguim' },
  });
}

// Extrai o handle (sem @) de uma url de perfil IG ou canal YT.
function extrairHandle(tipo: string, url: string): string {
  try {
    const u = new URL(url.trim());
    const path = u.pathname.replace(/\/+$/, '');
    if (tipo === 'youtube') {
      // youtube.com/@handle  ou  youtube.com/c/nome  ou  /channel/ID
      const m = path.match(/\/@([^/]+)/) || path.match(/\/(?:c|user|channel)\/([^/]+)/);
      return (m ? m[1] : path.split('/').pop() || '').replace(/^@/, '').toLowerCase();
    }
    // instagram.com/handle
    return (path.split('/').filter(Boolean)[0] || '').replace(/^@/, '').toLowerCase();
  } catch {
    return url.trim().replace(/^@/, '').toLowerCase();
  }
}

async function listarAlvos(body: any) {
  if (!body.dono_socio) throw new Error('dono_socio obrigatorio');
  const { data, error } = await sb().from('mundo_ia_alvos')
    .select('*').eq('dono_socio', body.dono_socio).order('tipo').order('handle');
  if (error) throw error;
  return { ok: true, alvos: data || [] };
}

async function addAlvo(body: any) {
  const { dono_socio, tipo, url, apelido = null } = body;
  if (!dono_socio || !tipo || !url) throw new Error('dono_socio, tipo, url sao obrigatorios');
  if (!['instagram', 'youtube'].includes(tipo)) throw new Error('tipo deve ser instagram ou youtube');
  const handle = extrairHandle(tipo, url);
  if (!handle) throw new Error('nao consegui extrair o handle da url');
  const { data, error } = await sb().rpc('mundo_ia_upsert_alvo', {
    p_dono_socio: dono_socio, p_tipo: tipo, p_handle: handle, p_url: url, p_apelido: apelido,
  });
  if (error) throw error;
  return { ok: true, alvo: data };
}

async function toggleAlvo(body: any) {
  if (!body.id) throw new Error('id obrigatorio');
  const { data, error } = await sb().rpc('mundo_ia_toggle_alvo', { p_id: body.id });
  if (error) throw error;
  return { ok: true, alvo: data };
}

async function removerAlvo(body: any) {
  if (!body.id) throw new Error('id obrigatorio');
  const { error } = await sb().rpc('mundo_ia_remover_alvo', { p_id: body.id });
  if (error) throw error;
  return { ok: true, removido: true };
}

async function carregarConfig(body: any) {
  if (!body.dono_socio) throw new Error('dono_socio obrigatorio');
  const { data, error } = await sb().from('mundo_ia_config')
    .select('*').eq('dono_socio', body.dono_socio).maybeSingle();
  if (error) throw error;
  return { ok: true, config: data };
}

async function salvarConfig(body: any) {
  const { dono_socio, whatsapp_destino = null, envia_whatsapp = true, hora_envio = '07:00' } = body;
  if (!dono_socio) throw new Error('dono_socio obrigatorio');
  const { data, error } = await sb().rpc('mundo_ia_upsert_config', {
    p_dono_socio: dono_socio, p_whatsapp_destino: whatsapp_destino,
    p_envia_whatsapp: envia_whatsapp, p_hora_envio: hora_envio,
  });
  if (error) throw error;
  return { ok: true, config: data };
}

async function ultimasExecucoes(body: any) {
  if (!body.dono_socio) throw new Error('dono_socio obrigatorio');
  const limite = parseInt(String(body.limite || 15), 10);
  const { data, error } = await sb().from('mundo_ia_execucoes')
    .select('id,gerado_em,janela_inicio,janela_fim,total_posts,total_acionaveis,status,enviado_whatsapp,resumo_grupo,link_publico')
    .eq('dono_socio', body.dono_socio).order('gerado_em', { ascending: false }).limit(limite);
  if (error) throw error;
  return { ok: true, execucoes: data || [] };
}

async function carregarExecucao(body: any) {
  if (!body.id) throw new Error('id obrigatorio');
  const { data, error } = await sb().from('mundo_ia_execucoes')
    .select('*').eq('id', body.id).maybeSingle();
  if (error) throw error;
  return { ok: true, execucao: data };
}

async function rodarAgora(body: any) {
  const fase = body.fase === 'raspagem' ? 'raspagem' : 'envio';
  const r = await fetch(`${SUPABASE_URL}/functions/v1/mundo-ia-motor`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fase, dono_socio: body.dono_socio || null }),
  });
  const j = await r.json();
  return { ok: r.ok, resultado: j };
}

async function agendarCrons() {
  const { data, error } = await sb().rpc('mundo_ia_agendar_crons');
  if (error) throw error;
  return { ok: true, msg: data };
}

async function desagendarCrons() {
  const { data, error } = await sb().rpc('mundo_ia_desagendar_crons');
  if (error) throw error;
  return { ok: true, msg: data };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  if (req.method !== 'POST') return jsonRespTool({ erro: 'Use POST' }, 405);
  if (!(await requireAuthTool(req))) return jsonRespTool({ erro: 'Nao autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonRespTool({ erro: 'JSON invalido' }, 400); }
  const acao = String(body.acao || '').trim();

  try {
    let resp: any;
    switch (acao) {
      case 'listar_alvos':      resp = await listarAlvos(body); break;
      case 'add_alvo':          resp = await addAlvo(body); break;
      case 'toggle_alvo':       resp = await toggleAlvo(body); break;
      case 'remover_alvo':      resp = await removerAlvo(body); break;
      case 'carregar_config':   resp = await carregarConfig(body); break;
      case 'salvar_config':     resp = await salvarConfig(body); break;
      case 'ultimas_execucoes': resp = await ultimasExecucoes(body); break;
      case 'carregar_execucao': resp = await carregarExecucao(body); break;
      case 'rodar_agora':       resp = await rodarAgora(body); break;
      case 'agendar_crons':     resp = await agendarCrons(); break;
      case 'desagendar_crons':  resp = await desagendarCrons(); break;
      default: return jsonRespTool({ erro: `acao desconhecida: ${acao}` }, 400);
    }
    return jsonRespTool(resp);
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : (e?.message || JSON.stringify(e));
    return jsonRespTool({ erro: msg, acao }, 500);
  }
});
