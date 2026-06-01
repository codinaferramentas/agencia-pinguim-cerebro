// Injeta bloco compacto da Persona Elo no início do system_prompt de cada agente Elo
const fs = require('fs');
const env = {};
fs.readFileSync('c:/Squad/.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim();
});
const { createClient } = require('c:/Squad/ingest-engine/node_modules/@supabase/supabase-js');
const sb = createClient('https://wmelierxzpjamiofeemh.supabase.co', env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'pinguim' } });

// Marca que o bloco foi injetado (pra não duplicar em re-runs)
const MARKER_INICIO = '<!-- PERSONA_ELO_V1 -->';
const MARKER_FIM = '<!-- /PERSONA_ELO_V1 -->';

function montarBlocoPersona(persona) {
  const id = persona.identidade || {};
  const rotina = persona.rotina || {};
  const consciencia = persona.nivel_consciencia || {};

  const vozes = (persona.vozes_cabeca || []).slice(0, 6).map(v => `  - "${v}"`).join('\n');
  const dores = (persona.dores_latentes || []).slice(0, 5).map(d => `  - ${d}`).join('\n');
  const desejos = (persona.desejos_reais || []).slice(0, 5).map(d => `  - ${d}`).join('\n');
  const objecoes = (persona.objecoes_compra || []).slice(0, 5).map(o => `  - "${o}"`).join('\n');
  const vocabulario = (persona.vocabulario || []).slice(0, 8).map(v => v.palavra).join(', ');

  return `${MARKER_INICIO}
## 👤 PERSONA ELO — Quem você atende/escreve para

Use ESTA persona como base SEMPRE. Não fale com "qualquer pessoa" — fale com **${id.nome_ficticio || 'Natália'}**.

**Identidade:**
- ${id.idade || 'Entre 25 e 40 anos'}
- ${id.profissao || 'Profissional autônoma'}
- Momento de vida: ${id.momento_de_vida || ''}

**Como é o dia dela:** ${rotina.como_e_o_dia || ''}

**Desafios diários:** ${rotina.desafios_diarios || ''}

**Dor principal:** ${persona.dor_principal || ''}

**Vozes na cabeça dela** (use literalmente quando fizer sentido em copy/objeção):
${vozes}

**Dores latentes:**
${dores}

**Desejos reais:**
${desejos}

**Objeções típicas dela** (espere essas vir):
${objecoes}

**Vocabulário dela** (use esses termos, não os técnicos):
${vocabulario}

**Estágio de consciência:** ${consciencia.estagio_predominante || 'solução-aware'} — ${consciencia.justificativa || ''}

**Abordagem recomendada:** ${consciencia.abordagem_recomendada || ''}

⚠️ **REGRA:** Toda copy/mensagem que você gerar tem que SOAR como se fosse pra Natália especificamente. Use vocabulário dela, ressoe com as dores dela, antecipe as objeções dela.
${MARKER_FIM}
`;
}

(async () => {
  // 1. Pega a Persona Elo
  const { data: produtoElo } = await sb.from('produtos').select('id').eq('slug', 'elo').single();
  const { data: cerebroElo } = await sb.from('cerebros').select('id').eq('produto_id', produtoElo.id).single();
  const { data: persona } = await sb.from('personas')
    .select('*')
    .eq('cerebro_id', cerebroElo.id)
    .order('gerado_em', { ascending: false })
    .limit(1)
    .single();

  console.log(`Persona Elo: ${persona.identidade?.nome_ficticio || '?'} (v${persona.versao})`);

  const blocoPersona = montarBlocoPersona(persona);

  // 2. Pega todos agentes Elo liberados
  const { data: agentes } = await sb.from('agentes')
    .select('id, slug, nome, system_prompt')
    .eq('produto_inferido', 'elo')
    .eq('status_publicacao', 'liberado');

  console.log(`\nAgentes Elo a atualizar: ${agentes.length}`);

  let ok = 0, fail = 0, jaTinha = 0;
  for (const ag of agentes) {
    const promptAtual = ag.system_prompt || '';

    // Já tem? Atualiza in-place (remove bloco antigo + adiciona novo)
    let promptNovo;
    if (promptAtual.includes(MARKER_INICIO)) {
      // Remove bloco antigo
      const regex = new RegExp(`${MARKER_INICIO}[\\s\\S]*?${MARKER_FIM}\\n?`, 'g');
      const promptSemBloco = promptAtual.replace(regex, '');
      promptNovo = blocoPersona + '\n' + promptSemBloco.trimStart();
      jaTinha++;
    } else {
      // Insere no INÍCIO do prompt (antes da primeira linha)
      promptNovo = blocoPersona + '\n' + promptAtual;
    }

    const { error } = await sb.from('agentes')
      .update({ system_prompt: promptNovo })
      .eq('id', ag.id);

    if (error) {
      fail++;
      console.log(`  ❌ ${ag.slug}: ${error.message}`);
    } else {
      ok++;
      if (ok % 10 === 0) console.log(`  ${ok}/${agentes.length}`);
    }
  }

  console.log(`\n✅ ${ok} atualizados | ❌ ${fail} falhas | ♻️ ${jaTinha} que já tinham (atualizei)`);

  // Verifica 1 amostra
  const { data: amostra } = await sb.from('agentes')
    .select('slug, system_prompt')
    .eq('slug', 'copy-pagina-venda-elo')
    .single();
  console.log('\n=== AMOSTRA: copy-pagina-venda-elo (primeiros 1500 chars) ===');
  console.log(amostra.system_prompt.slice(0, 1500));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
