#!/usr/bin/env node
/**
 * Enriquece os SOULs rasos dos Clones de Especialistas via LLM,
 * elevando do nivel "template generico" pro padrao dos Copywriters
 * (5 secoes: contexto, metodologia, estilo, padroes, exemplos).
 *
 * Mantem inalterados: socios, copywriters, storytellers (ja sao ricos).
 * Atualiza no banco (cerebro_fontes.conteudo_md) e revetoriza.
 *
 * Idempotente por threshold: pula clones com SOUL ja > THRESHOLD chars.
 *
 * Uso:
 *   node src/enriquecer-souls-clones.mjs --dry-run         # so lista
 *   node src/enriquecer-souls-clones.mjs                   # roda tudo
 *   node src/enriquecer-souls-clones.mjs --limite=3        # so 3 (teste)
 */
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { env } from '../lib/env.mjs';
import { supabase } from '../lib/supabase.mjs';
import { openai, embed, custoEmbedding } from '../lib/openai.mjs';
import { chunkText } from '../lib/chunk.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limiteFlag = args.find(a => a.startsWith('--limite='));
const limite = limiteFlag ? parseInt(limiteFlag.split('=')[1], 10) : null;

const THRESHOLD_RICO = 3000;  // SOUL acima disso ja esta rico (Copy/Story ~7k)
const PULA_SOCIOS = true;     // socios mexidos manualmente pelos sócios
const cfg = env();
const sb = supabase();
const oai = openai();

// Lista de squads -> dominio (pra dar contexto ao prompt)
const SQUAD_DOMINIO = {
  'advisory-board':    'People & Psychology',
  'copy':              'Content & Marketing',
  'storytelling':      'Content & Marketing',
  'traffic-masters':   'Content & Marketing',
  'design':            'Design & UX',
  'data':              'Data & Analytics',
  'deep-research':     'Data & Analytics',
  'finops':            'Business Operations',
  'legal':             'Business Operations',
  'cybersecurity':     'Technical',
  'translate':         'Communication',
  'squad-creator-pro': 'Meta & Frameworks',
};

// Le o JSON canonico pra extrair role/funcao de cada agente
const ROOT = path.resolve(new URL('../../', import.meta.url).pathname.replace(/^\/([a-z]:)/i, '$1'));
const JSON_PATH = path.join(ROOT, 'ecossistema-mapeamento.json');
const ECOSISTEMA = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));

function rolePorNome(nome) {
  for (const sq of ECOSISTEMA) {
    for (const ag of sq.agents) {
      if (ag.name === nome) return ag.role;
    }
  }
  return null;
}

const SYSTEM_PROMPT = `Voce e um pesquisador especializado em destilar a voz, metodo e estilo de profissionais reconhecidos em formato SOUL.md — uma ficha viva que sera usada como fonte de voz por agentes de IA Pinguim.

Voce vai gerar um SOUL.md no padrao das 5 secoes a seguir, baseado em conhecimento publico do profissional:

# SOUL.md — <Nome>

## 1. CONTEXTO
Quem e essa pessoa, o que ela e conhecida por fazer, qual sua especialidade central, em qual squad da Pinguim ela atua. 2-3 paragrafos densos.

## 2. METODOLOGIA CENTRAL
Frameworks, modelos, principios que essa pessoa criou ou que sao centrais ao trabalho dela. Use blocos com ":" e listas. Nomeie os conceitos com letras maiusculas iniciais (ex.: "Value Equation", "StoryBrand 7"). Se houver formula, mostra em bloco de codigo.

## 3. ESTILO DE ESCRITA / FALA
- Tom: como ela soa. Brutal? Didatico? Provocador?
- Cadencia: ritmo das frases. Curtas? Longas? Mistura?
- Vocabulario: palavras que ela usa muito. Frases que repete.
- Recursos retoricos: metafora, analogia, lista, contraste. O que e marca dela?

## 4. PADROES DE TRABALHO
Como ela estrutura o output dela. Se for copywriter, estrutura de copy. Se for advisor, estrutura de pensamento. Se for designer, processo de design. Liste em formato de etapas ou regras.

## 5. EXEMPLOS ANOTADOS
2-3 exemplos curtos de output dela (citacao real ou citacao reconstruida fiel ao estilo), com anotacoes em colchetes mostrando que tecnica usa onde. Tipo:
\`\`\`
[GANCHO] "frase de abertura"
[DESENVOLVIMENTO] ...
[VIRADA] ...
\`\`\`

REGRAS DURAS:
- Nada de "como modelo de IA". Voce escreve em terceira pessoa sobre o profissional.
- Nada de "esta secao foi escrita por IA". Sem meta-comentario.
- Use o conhecimento publico real do profissional. Nao invente livro/framework que ele nao escreveu.
- Tom: profissional e denso. Nao floreado. Pode ser longo (~1200-2500 palavras).
- Em portugues do Brasil.
- Termina o documento — sem "[continua]" ou afins.
- Se nao souber muito sobre o profissional, ainda assim escreve o melhor possivel a partir do nome + funcao + squad. NUNCA admite que nao sabe.`;

function userPrompt({ nome, role, squad, dominio, soulAtual }) {
  return `Gere o SOUL.md completo para:

**Nome:** ${nome}
**Especialidade/funcao:** ${role || '(usar conhecimento publico do profissional)'}
**Squad Pinguim:** ${squad}
**Dominio:** ${dominio}

SOUL.md atual (template raso, vai ser substituido):
---
${(soulAtual || '').slice(0, 800)}
---

Gere agora o SOUL.md completo no formato das 5 secoes. Profundidade compativel com o que faria sentido pra alimentar um agente de IA que precisa "soar como ${nome}" em outputs profissionais.`;
}

async function gerarSoulRico({ nome, role, squad, dominio, soulAtual }) {
  const resp = await oai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.4,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt({ nome, role, squad, dominio, soulAtual }) },
    ],
  });
  return {
    md: resp.choices[0].message.content.trim(),
    tokens_in: resp.usage.prompt_tokens,
    tokens_out: resp.usage.completion_tokens,
  };
}

function custoGpt4o(tin, tout) {
  // gpt-4o pricing: $2.50/MTok input, $10.00/MTok output
  return (tin / 1e6) * 2.5 + (tout / 1e6) * 10;
}

// === Pipeline ===

console.log(chalk.bold('\nEnriquecer SOULs rasos dos Clones\n'));
if (dryRun) console.log(chalk.yellow('[DRY-RUN] nao vai chamar LLM nem atualizar banco\n'));
console.log(chalk.dim(`Threshold pra considerar SOUL ja rico: ${THRESHOLD_RICO} chars`));
console.log();

// 1. Lista clones + suas fontes SOUL atuais
const { data: produtos, error: e1 } = await sb.from('produtos')
  .select('id, slug, nome, subcategoria')
  .eq('categoria', 'clone')
  .order('subcategoria, nome');
if (e1) throw e1;

const candidatos = [];
for (const p of produtos) {
  if (PULA_SOCIOS && p.subcategoria === 'socio_pinguim') continue;
  const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', p.id).single();
  if (!cer) continue;
  const { data: fontes } = await sb.from('cerebro_fontes')
    .select('id, conteudo_md, ingest_status')
    .eq('cerebro_id', cer.id);
  const fonteSoul = (fontes || []).find(f => f.conteudo_md && f.conteudo_md.length > 0);
  if (!fonteSoul) continue;
  if (fonteSoul.conteudo_md.length >= THRESHOLD_RICO) continue;
  candidatos.push({
    produto_id: p.id,
    slug: p.slug,
    nome: p.nome,
    subcategoria: p.subcategoria,
    cerebro_id: cer.id,
    fonte_id: fonteSoul.id,
    soul_atual: fonteSoul.conteudo_md,
    tamanho_atual: fonteSoul.conteudo_md.length,
  });
}

console.log(chalk.bold(`Candidatos pra enriquecer: ${candidatos.length}\n`));
candidatos.forEach(c => {
  const role = rolePorNome(c.nome);
  console.log(`  [${c.subcategoria.padEnd(20)}] ${c.nome.padEnd(28)} ${c.tamanho_atual} chars  | role: ${role || '(sem role no JSON)'}`);
});

if (candidatos.length === 0) {
  console.log(chalk.green('\nTudo enriquecido, nada a fazer.'));
  process.exit(0);
}

if (dryRun) {
  console.log(chalk.yellow('\n[DRY-RUN] saindo.'));
  process.exit(0);
}

const lista = limite ? candidatos.slice(0, limite) : candidatos;
console.log(chalk.bold(`\nProcessando ${lista.length} clones...\n`));

let custoTotal = 0;
let custoEmbeddingTotal = 0;
let okCount = 0, errCount = 0;
let chunksTotais = 0;

for (const c of lista) {
  try {
    const role = rolePorNome(c.nome);
    const dominio = SQUAD_DOMINIO[c.subcategoria] || c.subcategoria;
    process.stdout.write(`  ${c.nome.padEnd(28)} ... `);

    const { md, tokens_in, tokens_out } = await gerarSoulRico({
      nome: c.nome,
      role,
      squad: c.subcategoria,
      dominio,
      soulAtual: c.soul_atual,
    });
    const cl = custoGpt4o(tokens_in, tokens_out);
    custoTotal += cl;

    // Update fonte
    const { error: errUp } = await sb.from('cerebro_fontes').update({
      conteudo_md: md,
      tamanho_bytes: md.length,
      metadata: { enriquecido_em: new Date().toISOString(), enriquecido_modelo: 'gpt-4o' },
    }).eq('id', c.fonte_id);
    if (errUp) throw new Error('UPDATE fonte: ' + errUp.message);

    // Re-vetoriza: apaga chunks antigos, regera
    await sb.from('cerebro_fontes_chunks').delete().eq('fonte_id', c.fonte_id);
    const chunks = chunkText(md);
    const BATCH = 50;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const vetores = await embed(slice.map(x => x.conteudo));
      const rows = slice.map((x, idx) => ({
        fonte_id: c.fonte_id,
        cerebro_id: c.cerebro_id,
        chunk_index: x.chunk_index,
        conteudo: x.conteudo,
        token_count: x.token_count,
        embedding: vetores[idx],
        embedding_model: cfg.EMBEDDING_MODEL,
      }));
      const { error: errIns } = await sb.from('cerebro_fontes_chunks').insert(rows);
      if (errIns) throw new Error('INSERT chunks: ' + errIns.message);
      const tokensBatch = slice.reduce((s, x) => s + (x.token_count || 0), 0);
      custoEmbeddingTotal += custoEmbedding(tokensBatch);
      chunksTotais += slice.length;
    }
    okCount++;
    console.log(chalk.green(`OK (${md.length} chars, ${chunks.length} chunks, US$ ${cl.toFixed(4)})`));
  } catch (err) {
    errCount++;
    console.log(chalk.red(`ERRO: ${err.message}`));
  }
}

console.log();
console.log(chalk.bold('Resumo'));
console.log(`  Enriquecidos OK:   ${okCount}`);
console.log(`  Erros:             ${errCount}`);
console.log(`  Chunks regerados:  ${chunksTotais}`);
console.log(`  Custo LLM:         US$ ${custoTotal.toFixed(4)}  ~ R$ ${(custoTotal*5.1).toFixed(3)}`);
console.log(`  Custo embedding:   US$ ${custoEmbeddingTotal.toFixed(4)}  ~ R$ ${(custoEmbeddingTotal*5.1).toFixed(3)}`);
console.log(`  TOTAL:             US$ ${(custoTotal+custoEmbeddingTotal).toFixed(4)}  ~ R$ ${((custoTotal+custoEmbeddingTotal)*5.1).toFixed(3)}`);
