// Insere as 6 Skills do advisory-board no banco lendo os SKILL.md do disco.
// Uso: node .tmp-sql/seed-advisory-skills.js
//
// Idempotente: ON CONFLICT (slug) DO UPDATE — pode rodar quantas vezes quiser.

const fs = require('fs');
const path = require('path');

const ENV = {};
const envPath = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) ENV[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const SKILLS = [
  { slug: 'diagnostico-estrategico',                familia: 'advisory', formato: 'receita-orquestracao', prioridade: 'P1', clones: ['board-chair'] },
  { slug: 'cenarios-3-otimista-central-pessimista', familia: 'advisory', formato: 'framework-decisao',    prioridade: 'P1', clones: ['ray-dalio'] },
  { slug: 'inversion-mental-model',                 familia: 'advisory', formato: 'framework-decisao',    prioridade: 'P1', clones: ['charlie-munger'] },
  { slug: 'monopolio-vs-competicao',                familia: 'advisory', formato: 'framework-decisao',    prioridade: 'P1', clones: ['peter-thiel'] },
  { slug: 'leverage-sem-permissao',                 familia: 'advisory', formato: 'framework-decisao',    prioridade: 'P1', clones: ['naval-ravikant'] },
  { slug: 'checklist-pre-decisao',                  familia: 'advisory', formato: 'checklist',            prioridade: 'P1', clones: ['board-chair', 'charlie-munger'] },
];

async function rodarSQL(sql) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${ENV.SUPABASE_PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ENV.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    }
  );
  return r.json();
}

function lerSkill(slug) {
  const arq = path.join(__dirname, '..', 'cerebro', 'skills', slug, 'SKILL.md');
  return fs.readFileSync(arq, 'utf-8');
}

function descricaoFromMd(md) {
  const m = md.match(/description:\s*(.+?)$/m);
  return m ? m[1].trim() : '';
}

function nomeFromSlug(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

(async () => {
  for (const s of SKILLS) {
    const conteudo = lerSkill(s.slug);
    const descricao = descricaoFromMd(conteudo);
    const nome = nomeFromSlug(s.slug);
    const conteudoEscaped = conteudo.replace(/'/g, "''");
    const descricaoEscaped = descricao.replace(/'/g, "''");
    const nomeEscaped = nome.replace(/'/g, "''");
    const clonesJson = JSON.stringify(s.clones);

    const sql = `
INSERT INTO pinguim.skills (slug, nome, descricao, conteudo_md, familia, formato, clones, status, prioridade, universal, versao)
VALUES (
  '${s.slug}',
  '${nomeEscaped}',
  '${descricaoEscaped}',
  '${conteudoEscaped}',
  '${s.familia}',
  '${s.formato}',
  '${clonesJson}'::jsonb,
  'em_construcao',
  '${s.prioridade}',
  false,
  '1.0'
)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  conteudo_md = EXCLUDED.conteudo_md,
  familia = EXCLUDED.familia,
  formato = EXCLUDED.formato,
  clones = EXCLUDED.clones,
  prioridade = EXCLUDED.prioridade,
  atualizado_em = now();
`;
    const result = await rodarSQL(sql);
    if (result.message) {
      console.log(`ERRO ${s.slug}:`, result.message);
    } else {
      console.log(`OK   ${s.slug} (${conteudo.length} chars, clones=[${s.clones.join(',')}])`);
    }
  }
})();
