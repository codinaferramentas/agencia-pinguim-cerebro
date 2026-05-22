// Edge Function: gerar-variacao-anuncio
// Endpoint pra projeto externo solicitar variacao de anuncio.
//
// POST /functions/v1/gerar-variacao-anuncio
// Headers: Authorization: Bearer <TOKEN_PROJETO_EXTERNO_CRIATIVOS>
// Body: { produto_slug, anuncio_referencia, clone_slugs[], modo, briefing, formato_alvo?, metadata_externa? }
//
// Modelo assincrono:
// 1. Valida input + token
// 2. Cria linha em geracoes_externas (status='processando')
// 3. Retorna {geracao_id, status, polling_url} imediato
// 4. Background (waitUntil): invoca agente-executar do gerador-variacao-anuncio
// 5. Quando termina, UPDATE com outputs

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { validarTokenExterno, corsExterno, jsonResp } from '../_shared/auth-externa.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'pinguim' },
});

const SUBCATEGORIAS_VALIDAS_CLONE = ['copy', 'storytelling', 'traffic-masters', 'design'];

// =====================================================
// Background: dispara geracao real e atualiza linha
// =====================================================
async function executarGeracaoBackground(geracaoId: string, body: any, persona: any, cerebroId: string) {
  const tInicio = Date.now();
  const execucoesIds: string[] = [];

  // Headers padrao pra invocar agente-executar (function-to-function exige apikey + Authorization)
  const headersAgenteExecutar = {
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };

  try {
    // Briefing rico que vai pro agente-executar
    const briefingRico = `
## Pedido do projeto externo

**Produto:** ${body.produto_slug}
**Persona alvo (v${persona?.versao || '?'}):** ${persona?.identidade?.nome_ficticio || 'sem nome'} — ${persona?.identidade?.profissao || ''}
**Anuncio de referencia (concorrente):**
\`\`\`
${body.anuncio_referencia}
\`\`\`

**Briefing humano:** ${body.briefing}

**Formato alvo:** ${body.formato_alvo || 'anuncio_meta'}
**Modo:** ${body.modo}
**Clones escolhidos:** ${body.clone_slugs.join(', ')}

## Sua tarefa
Gere variacao(oes) autoral(is) inspirada(s) na estrutura do anuncio de referencia, na voz do(s) clone(s) acima, calibrada(s) pra persona do produto. NUNCA copie literal — pegue o gancho, a logica de oferta, o tipo de prova social e reescreva 100% no idioma e voz da persona+clone.
`.trim();

    let outputs: any[] = [];
    let custoTotal = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    let modeloPrincipal = '';

    if (body.modo === 'unico') {
      // Invoca o clone direto via agente-executar
      const r = await fetch(`${SUPABASE_URL}/functions/v1/agente-executar`, {
        method: 'POST',
        headers: headersAgenteExecutar,
        body: JSON.stringify({
          agente_slug: body.clone_slugs[0],
          tenant_id: '00000000-0000-0000-0000-000000000000',
          cliente_id: '00000000-0000-0000-0000-000000000000',
          solicitante_id: 'projeto-externo-criativos',
          briefing: briefingRico,
          contexto_extra: { produto_slug: body.produto_slug, cerebro_id: cerebroId, persona_resumo: persona ? { identidade: persona.identidade, vocabulario: persona.vocabulario, nivel_consciencia: persona.nivel_consciencia } : null },
        }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(`agente-executar [unico:${body.clone_slugs[0]}] retornou ${r.status}: ${JSON.stringify(data).slice(0, 400)}`);
      execucoesIds.push(data.entregavel_id);
      custoTotal += data.uso?.custo_usd || 0;
      tokensIn += data.uso?.tokens_in || 0;
      tokensOut += data.uso?.tokens_out || 0;
      modeloPrincipal = data.uso?.modelo || '';
      outputs.push({
        clone_slug: body.clone_slugs[0],
        copy_md: data.conteudo_md || JSON.stringify(data.conteudo_estruturado, null, 2),
        raciocinio: data.conteudo_estruturado?.raciocinio || '',
        skills_aplicadas: data.conteudo_estruturado?.skills_aplicadas || [],
        entregavel_id: data.entregavel_id,
      });
    } else if (body.modo === 'paralelo') {
      // Promise.all em cada clone
      const promessas = body.clone_slugs.map((slug: string) =>
        fetch(`${SUPABASE_URL}/functions/v1/agente-executar`, {
          method: 'POST',
          headers: headersAgenteExecutar,
          body: JSON.stringify({
            agente_slug: slug,
            tenant_id: '00000000-0000-0000-0000-000000000000',
            cliente_id: '00000000-0000-0000-0000-000000000000',
            solicitante_id: 'projeto-externo-criativos',
            briefing: briefingRico,
            contexto_extra: { produto_slug: body.produto_slug, cerebro_id: cerebroId, persona_resumo: persona ? { identidade: persona.identidade, vocabulario: persona.vocabulario, nivel_consciencia: persona.nivel_consciencia } : null },
          }),
        }).then(r => r.json().then(d => ({ slug, data: d, ok: r.ok }))).catch(e => ({ slug, error: e.message }))
      );
      const resultados = await Promise.all(promessas);
      for (const res of resultados as any[]) {
        if (res.error || !res.ok || res.data?.error) {
          outputs.push({ clone_slug: res.slug, erro: res.error || res.data?.detalhe || 'falhou' });
          continue;
        }
        const d = res.data;
        execucoesIds.push(d.entregavel_id);
        custoTotal += d.uso?.custo_usd || 0;
        tokensIn += d.uso?.tokens_in || 0;
        tokensOut += d.uso?.tokens_out || 0;
        modeloPrincipal = d.uso?.modelo || modeloPrincipal;
        outputs.push({
          clone_slug: res.slug,
          copy_md: d.conteudo_md || JSON.stringify(d.conteudo_estruturado, null, 2),
          raciocinio: d.conteudo_estruturado?.raciocinio || '',
          skills_aplicadas: d.conteudo_estruturado?.skills_aplicadas || [],
          entregavel_id: d.entregavel_id,
        });
      }
    } else if (body.modo === 'consenso') {
      // Delega pro copy-chief
      const r = await fetch(`${SUPABASE_URL}/functions/v1/agente-executar`, {
        method: 'POST',
        headers: headersAgenteExecutar,
        body: JSON.stringify({
          agente_slug: 'copy-chief',
          tenant_id: '00000000-0000-0000-0000-000000000000',
          cliente_id: '00000000-0000-0000-0000-000000000000',
          solicitante_id: 'projeto-externo-criativos',
          briefing: briefingRico + `\n\n## Modo consenso\nMonte time com no maximo 3 dos clones recomendados (${body.clone_slugs.join(', ')}), use tool delegar-mestre para cada um, depois consolidar-roteiro em 1 copia unica que captura o melhor de cada voz.`,
          contexto_extra: { produto_slug: body.produto_slug, cerebro_id: cerebroId, persona_resumo: persona ? { identidade: persona.identidade, vocabulario: persona.vocabulario, nivel_consciencia: persona.nivel_consciencia } : null, clones_recomendados: body.clone_slugs },
        }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.detalhe || data.error || 'copy-chief falhou');
      execucoesIds.push(data.entregavel_id);
      // Mestres invocados internamente tambem geraram custo, mas agente-executar ja consolidou
      custoTotal += data.uso?.custo_usd || 0;
      tokensIn += data.uso?.tokens_in || 0;
      tokensOut += data.uso?.tokens_out || 0;
      modeloPrincipal = data.uso?.modelo || '';
      outputs.push({
        clone_slug: 'copy-chief',
        copy_md: data.conteudo_md || JSON.stringify(data.conteudo_estruturado, null, 2),
        raciocinio: data.conteudo_estruturado?.justificativa || '',
        mestres_invocados: data.mestres_invocados || [],
        skills_aplicadas: [],
        entregavel_id: data.entregavel_id,
      });
    }

    await sb.from('geracoes_externas').update({
      status: 'concluido',
      concluido_em: new Date().toISOString(),
      outputs,
      execucoes_internas: execucoesIds,
      modelo_principal: modeloPrincipal,
      custo_total_usd: Number(custoTotal.toFixed(6)),
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      latencia_ms: Date.now() - tInicio,
    }).eq('id', geracaoId);
  } catch (e: any) {
    console.error('[gerar-variacao-anuncio] background ERRO:', e.message, e.stack);
    await sb.from('geracoes_externas').update({
      status: 'falhou',
      concluido_em: new Date().toISOString(),
      erro_codigo: 'EXECUCAO_FALHOU',
      erro_mensagem: (e.message || 'erro desconhecido') + (e.stack ? ' | stack: ' + e.stack.slice(0, 300) : ''),
      latencia_ms: Date.now() - tInicio,
    }).eq('id', geracaoId);
  }
}

// =====================================================
// Handler principal
// =====================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsExterno });
  if (req.method !== 'POST') return jsonResp({ erro: 'Use POST', codigo: 'METHOD_NOT_ALLOWED' }, 405);

  const auth = await validarTokenExterno(req);
  if (!auth.ok) return jsonResp({ erro: 'Token invalido ou ausente', codigo: 'UNAUTHORIZED' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ erro: 'JSON invalido', codigo: 'INVALID_JSON' }, 400); }

  // ===== Validacao de input =====
  const { produto_slug, anuncio_referencia, clone_slugs, modo, briefing, formato_alvo, metadata_externa } = body;

  if (!produto_slug || typeof produto_slug !== 'string') return jsonResp({ erro: 'produto_slug obrigatorio', codigo: 'INPUT_INVALID' }, 400);
  if (!anuncio_referencia || typeof anuncio_referencia !== 'string' || anuncio_referencia.length < 20) {
    return jsonResp({ erro: 'anuncio_referencia obrigatorio (min 20 chars)', codigo: 'INPUT_INVALID' }, 400);
  }
  if (!Array.isArray(clone_slugs) || clone_slugs.length < 1) {
    return jsonResp({ erro: 'clone_slugs deve ter pelo menos 1 slug', codigo: 'INPUT_INVALID' }, 400);
  }
  if (clone_slugs.length > 5) {
    return jsonResp({ erro: 'maximo 5 clone_slugs por chamada', codigo: 'INPUT_INVALID' }, 400);
  }
  if (!['unico', 'paralelo', 'consenso'].includes(modo)) {
    return jsonResp({ erro: 'modo deve ser: unico | paralelo | consenso', codigo: 'INPUT_INVALID' }, 400);
  }
  if (!briefing || typeof briefing !== 'string' || briefing.length < 10) {
    return jsonResp({ erro: 'briefing obrigatorio (min 10 chars)', codigo: 'INPUT_INVALID' }, 400);
  }
  if (modo === 'unico' && clone_slugs.length !== 1) {
    return jsonResp({ erro: 'modo unico exige exatamente 1 clone', codigo: 'INPUT_INVALID' }, 400);
  }

  // ===== Validar produto + persona =====
  const { data: produto, error: errProd } = await sb.from('produtos').select('id, slug, categoria').eq('slug', produto_slug).maybeSingle();
  if (errProd || !produto) return jsonResp({ erro: `Produto '${produto_slug}' nao encontrado`, codigo: 'PRODUTO_NAO_ENCONTRADO' }, 404);
  if (produto.categoria !== 'interno') return jsonResp({ erro: `Produto '${produto_slug}' nao eh interno (categoria=${produto.categoria}). Use produtos da Pinguim, nao clones.`, codigo: 'PRODUTO_NAO_INTERNO' }, 400);

  const { data: cerebro } = await sb.from('cerebros').select('id').eq('produto_id', produto.id).maybeSingle();
  if (!cerebro) return jsonResp({ erro: `Produto '${produto_slug}' nao tem cerebro`, codigo: 'CEREBRO_INEXISTENTE' }, 404);

  const { data: persona } = await sb.from('personas').select('*').eq('cerebro_id', cerebro.id).maybeSingle();
  if (!persona) return jsonResp({ erro: `Produto '${produto_slug}' nao tem persona pronta. Pinguim ainda nao gerou. Escolha outro produto.`, codigo: 'PERSONA_INEXISTENTE' }, 404);

  // ===== Validar clones =====
  // Aceita slug com ou sem prefixo "clone-". Resolve pro formato canonico de agente (sem prefixo).
  const cloneSlugsNormalizados: string[] = clone_slugs.map((s: string) => s.replace(/^clone-/, ''));
  const slugsComPrefixo = cloneSlugsNormalizados.map((s: string) => 'clone-' + s);

  const { data: clonesValidos } = await sb.from('produtos')
    .select('slug, subcategoria')
    .eq('categoria', 'clone')
    .in('slug', slugsComPrefixo);

  const slugsEncontrados = (clonesValidos || []).map((c: any) => c.slug.replace(/^clone-/, ''));
  const slugsNaoEncontrados = cloneSlugsNormalizados.filter((s: string) => !slugsEncontrados.includes(s));
  if (slugsNaoEncontrados.length > 0) {
    return jsonResp({
      erro: `Clones nao encontrados: ${slugsNaoEncontrados.join(', ')}. Verifique a lista via produtos categoria=clone.`,
      codigo: 'CLONE_NAO_DISPONIVEL',
    }, 404);
  }

  const clonesForaDoEscopo = (clonesValidos || []).filter((c: any) => !SUBCATEGORIAS_VALIDAS_CLONE.includes(c.subcategoria));
  if (clonesForaDoEscopo.length > 0) {
    return jsonResp({
      erro: `Clones fora do escopo criativo: ${clonesForaDoEscopo.map((c: any) => c.slug.replace(/^clone-/, '') + ' (' + c.subcategoria + ')').join(', ')}. Permitidos: ${SUBCATEGORIAS_VALIDAS_CLONE.join(', ')}`,
      codigo: 'CLONE_FORA_ESCOPO',
    }, 400);
  }

  // Verifica quais clones tem agente em producao (status protege contra agente quebrado/em construcao)
  const { data: agentesExecutaveis } = await sb.from('agentes')
    .select('slug, status')
    .in('slug', cloneSlugsNormalizados)
    .eq('status', 'em_producao');
  const slugsExecutaveis = (agentesExecutaveis || []).map((a: any) => a.slug);
  const slugsSemAgente = cloneSlugsNormalizados.filter((s: string) => !slugsExecutaveis.includes(s));

  // Se modo=unico e nao tem agente, falha. Se modo=consenso, copy-chief vira fallback.
  if (modo === 'unico' && slugsSemAgente.length > 0) {
    return jsonResp({
      erro: `Clone '${slugsSemAgente[0]}' ainda nao foi implementado como agente executavel. Use modo=consenso (copy-chief aplica o metodo do clone) ou escolha outro.`,
      codigo: 'CLONE_SEM_AGENTE',
      clones_executaveis_disponiveis: slugsExecutaveis,
    }, 400);
  }
  if (modo === 'paralelo' && slugsExecutaveis.length === 0) {
    return jsonResp({
      erro: `Nenhum dos clones escolhidos tem agente executavel ainda. Use modo=consenso.`,
      codigo: 'CLONE_SEM_AGENTE',
    }, 400);
  }

  // Substitui clone_slugs por versao normalizada (sem prefixo, so executaveis em paralelo)
  const cloneSlugsFinal = modo === 'paralelo'
    ? slugsExecutaveis  // so executa os que tem agente
    : cloneSlugsNormalizados;

  // ===== Cria linha em geracoes_externas =====
  const { data: geracao, error: errIns } = await sb.from('geracoes_externas').insert({
    origem: auth.origem,
    token_usado_hash: auth.tokenHash,
    produto_slug,
    produto_id: produto.id,
    cerebro_id: cerebro.id,
    persona_id: persona.id,
    persona_versao: persona.versao,
    anuncio_referencia,
    clone_slugs: cloneSlugsFinal,
    modo,
    briefing,
    formato_alvo: formato_alvo || 'anuncio_meta',
    metadata_externa: metadata_externa || {},
    status: 'processando',
  }).select('id').single();

  if (errIns || !geracao) return jsonResp({ erro: 'Falha ao registrar solicitacao: ' + errIns?.message, codigo: 'DB_INSERT_FAIL' }, 500);

  // ===== Dispara background =====
  // EdgeRuntime.waitUntil garante que o background continua mesmo apos resposta
  // @ts-ignore — EdgeRuntime eh global no Deno Deploy do Supabase
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(executarGeracaoBackground(geracao.id, { ...body, clone_slugs: cloneSlugsFinal }, persona, cerebro.id));
  } else {
    // Fallback sem waitUntil: dispara sem aguardar (fire-and-forget)
    executarGeracaoBackground(geracao.id, { ...body, clone_slugs: cloneSlugsFinal }, persona, cerebro.id);
  }

  return jsonResp({
    geracao_id: geracao.id,
    status: 'processando',
    polling_url: `/functions/v1/consultar-geracao?id=${geracao.id}`,
    estimativa_segundos: modo === 'consenso' ? 40 : modo === 'paralelo' ? 18 : 10,
    persona_versao_usada: persona.versao,
  }, 202);
});
