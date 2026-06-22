// Edge Function: tool-promover-skill
// Chamada pelo Claude Code do socio quando ele cria uma skill local boa
// e quer que outros 3 socios usem tambem. Manda o MD pra pinguim.skills_propostas.
// Codina ve no painel "Skills propostas" do MC e aprova/rejeita.
//
// Body:
//   {
//     socio_slug: 'codina'|'pedro'|'luiz'|'micha' (obrigatorio),
//     skill_nome: string (obrigatorio - kebab-case),
//     skill_md: string (obrigatorio - conteudo completo do SKILL.md),
//     descricao_curta?: string (1 linha do que faz),
//     contexto_uso?: string (pq o socio acha util pros outros)
//   }
//
// Retorno:
//   { ok: true, id: <uuid>, msg: "Skill enviada ao Codina pra revisao" }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const SOCIOS_VALIDOS = new Set(['codina','pedro','luiz','micha']);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ ok: false, erro: 'metodo invalido' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ ok: false, erro: 'JSON invalido' }, 400); }

  const { socio_slug, skill_nome, skill_md, descricao_curta, contexto_uso } = body;

  if (!socio_slug || !SOCIOS_VALIDOS.has(socio_slug)) {
    return jsonResp({ ok: false, erro: 'socio_slug invalido (use: codina, pedro, luiz, micha)' }, 400);
  }
  if (!skill_nome || typeof skill_nome !== 'string' || skill_nome.length < 3) {
    return jsonResp({ ok: false, erro: 'skill_nome obrigatorio (kebab-case, min 3 chars)' }, 400);
  }
  if (!skill_md || typeof skill_md !== 'string' || skill_md.length < 50) {
    return jsonResp({ ok: false, erro: 'skill_md obrigatorio (min 50 chars - precisa do frontmatter + corpo)' }, 400);
  }
  // Sanity check: skill precisa ter frontmatter
  if (!skill_md.trim().startsWith('---')) {
    return jsonResp({ ok: false, erro: 'skill_md precisa comecar com frontmatter YAML (---)' }, 400);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });

  // Verifica se ja existe proposta pendente com mesmo nome do mesmo socio
  const { data: existente } = await sb.from('skills_propostas')
    .select('id, status')
    .eq('socio_slug', socio_slug)
    .eq('skill_nome', skill_nome)
    .in('status', ['pendente','em_revisao'])
    .maybeSingle();

  if (existente) {
    return jsonResp({
      ok: false,
      erro: 'ja existe proposta pendente com esse nome do mesmo socio',
      proposta_existente_id: existente.id,
    }, 409);
  }

  const { data: inserida, error } = await sb.from('skills_propostas')
    .insert({
      socio_slug,
      skill_nome,
      skill_md,
      descricao_curta: descricao_curta || null,
      contexto_uso: contexto_uso || null,
      status: 'pendente',
    })
    .select('id')
    .single();

  if (error) return jsonResp({ ok: false, erro: error.message }, 500);

  return jsonResp({
    ok: true,
    id: inserida.id,
    msg: `Skill "${skill_nome}" enviada ao Codina pra revisao. Quando aprovada, vira disponivel pros 4 socios.`,
  });
});
