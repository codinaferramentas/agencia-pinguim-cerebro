// Injeta persona em todos os agentes de ProAlt, Tuarus, Lyra, Mentoria Express
// Mesmo template usado pro Elo. Idempotente (marker permite re-rodar).
const fs = require('fs');
const env = {};
fs.readFileSync('c:/Squad/.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim();
});
const { createClient } = require('c:/Squad/ingest-engine/node_modules/@supabase/supabase-js');
const sb = createClient('https://wmelierxzpjamiofeemh.supabase.co', env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'pinguim' } });

function montarBlocoPersona(persona, slugProduto, nomeProduto) {
  const id = persona.identidade || {};
  const rotina = persona.rotina || {};
  const consciencia = persona.nivel_consciencia || {};

  const vozes = (persona.vozes_cabeca || []).slice(0, 6).map(v => `  - "${v}"`).join('\n');
  const dores = (persona.dores_latentes || []).slice(0, 5).map(d => `  - ${d}`).join('\n');
  const desejos = (persona.desejos_reais || []).slice(0, 5).map(d => `  - ${d}`).join('\n');
  const objecoes = (persona.objecoes_compra || []).slice(0, 5).map(o => `  - "${o}"`).join('\n');
  const vocabulario = (persona.vocabulario || []).slice(0, 8).map(v => v.palavra).join(', ');

  const markerInicio = `<!-- PERSONA_${slugProduto.toUpperCase().replace(/-/g, '_')}_V1 -->`;
  const markerFim = `<!-- /PERSONA_${slugProduto.toUpperCase().replace(/-/g, '_')}_V1 -->`;

  const nomePersona = id.nome_ficticio || 'Persona';

  return {
    markerInicio,
    markerFim,
    bloco: `${markerInicio}
## 👤 PERSONA ${nomeProduto.toUpperCase()} — Quem você atende/escreve para

Use ESTA persona como base SEMPRE. Não fale com "qualquer pessoa" — fale com **${nomePersona}**.

**Identidade:**
- ${id.idade || ''}
- ${id.profissao || ''}
- Momento de vida: ${id.momento_de_vida || ''}

**Como é o dia dele(a):** ${rotina.como_e_o_dia || ''}

**Desafios diários:** ${rotina.desafios_diarios || ''}

**Dor principal:** ${persona.dor_principal || ''}

**Vozes na cabeça** (use literalmente quando fizer sentido em copy/objeção):
${vozes}

**Dores latentes:**
${dores}

**Desejos reais:**
${desejos}

**Objeções típicas** (espere essas vir):
${objecoes}

**Vocabulário dele(a)** (use esses termos, não os técnicos):
${vocabulario}

**Estágio de consciência:** ${consciencia.estagio_predominante || ''} — ${consciencia.justificativa || ''}

**Abordagem recomendada:** ${consciencia.abordagem_recomendada || ''}

⚠️ **REGRA:** Toda mensagem que você gerar tem que SOAR como se fosse pra ${nomePersona} especificamente. Use vocabulário dele(a), ressoe com as dores dele(a), antecipe as objeções dele(a).
${markerFim}
`
  };
}

async function injetarParaProduto(slugProduto) {
  // 1. Pega produto + cerebro + persona
  const { data: produto } = await sb.from('produtos').select('id, nome').eq('slug', slugProduto).single();
  if (!produto) { console.log(`  ❌ Produto ${slugProduto} não achado`); return; }

  const { data: cerebro } = await sb.from('cerebros').select('id').eq('produto_id', produto.id).single();
  if (!cerebro) { console.log(`  ❌ Sem cérebro pra ${slugProduto}`); return; }

  const { data: persona } = await sb.from('personas')
    .select('*')
    .eq('cerebro_id', cerebro.id)
    .order('gerado_em', { ascending: false })
    .limit(1)
    .single();
  if (!persona) { console.log(`  ❌ Sem persona pra ${slugProduto}`); return; }

  const nomePersona = persona.identidade?.nome_ficticio || 'Persona';
  console.log(`\n=== ${produto.nome} (persona: ${nomePersona}) ===`);

  const { bloco, markerInicio, markerFim } = montarBlocoPersona(persona, slugProduto, produto.nome);

  // 2. Pega todos agentes do produto
  const { data: agentes } = await sb.from('agentes')
    .select('id, slug, system_prompt')
    .eq('produto_inferido', slugProduto)
    .eq('status_publicacao', 'liberado');

  let ok = 0, jaTinha = 0;
  for (const ag of agentes || []) {
    const promptAtual = ag.system_prompt || '';
    let promptNovo;

    if (promptAtual.includes(markerInicio)) {
      // Substitui bloco existente
      const regex = new RegExp(`${markerInicio}[\\s\\S]*?${markerFim}\\n?`, 'g');
      const semBloco = promptAtual.replace(regex, '');
      promptNovo = bloco + '\n' + semBloco.trimStart();
      jaTinha++;
    } else {
      promptNovo = bloco + '\n' + promptAtual;
    }

    const { error } = await sb.from('agentes')
      .update({ system_prompt: promptNovo })
      .eq('id', ag.id);
    if (error) console.log(`  ❌ ${ag.slug}: ${error.message}`);
    else ok++;
  }
  console.log(`  ✅ ${ok} atualizados | ♻️ ${jaTinha} já tinham (atualizado)`);
}

(async () => {
  const PRODUTOS = ['proalt', 'tuarus', 'lyra', 'mentoria-express'];
  for (const p of PRODUTOS) {
    await injetarParaProduto(p);
  }

  // Validação: pega 1 amostra de cada produto pra ver bloco
  console.log('\n\n=== VALIDAÇÃO ===');
  for (const slug of PRODUTOS) {
    const { data } = await sb.from('agentes')
      .select('slug, system_prompt')
      .eq('produto_inferido', slug)
      .eq('status_publicacao', 'liberado')
      .limit(1)
      .single();
    if (data) {
      const inicio = data.system_prompt.slice(0, 200);
      console.log(`\n${slug} - amostra (${data.slug}):`);
      console.log(inicio);
    }
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
