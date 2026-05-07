// Lê todos cerebro/skills/<slug>/SKILL.md, parseia frontmatter YAML e popula pinguim.skills
// via Supabase Management API (POST /v1/projects/{ref}/database/query).
// Uso: node .tmp-sql/seed-skills-v2.js

const fs = require('fs');
const path = require('path');

// Carrega .env.local manualmente (sem dotenv)
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;

if (!SUPABASE_ACCESS_TOKEN || !SUPABASE_PROJECT_REF) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF in .env.local');
  process.exit(1);
}

const SKILLS_DIR = path.join(__dirname, '..', 'cerebro', 'skills');

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: md };
  const fm = {};
  const lines = m[1].split('\n');
  let inMeta = false;
  let inPinguim = false;
  for (const line of lines) {
    if (line.match(/^name:\s*(.+)$/)) fm.name = RegExp.$1.trim();
    else if (line.match(/^description:\s*(.+)$/)) fm.description = RegExp.$1.trim();
    else if (line.match(/^description:\s*$/)) { fm.description = ''; }
    else if (line.match(/^metadata:\s*$/)) inMeta = true;
    else if (inMeta && line.match(/^\s+pinguim:\s*$/)) inPinguim = true;
    else if (inPinguim && line.match(/^\s+familia:\s*(.+)$/)) fm.familia = RegExp.$1.trim();
    else if (inPinguim && line.match(/^\s+formato:\s*(.+)$/)) fm.formato = RegExp.$1.trim();
    else if (inPinguim && line.match(/^\s+clones:\s*\[([^\]]*)\]/)) {
      const list = RegExp.$1.trim();
      fm.clones = list ? list.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')) : [];
    }
  }
  return { frontmatter: fm, body: m[2] };
}

async function runSQL(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

function escapeSql(s) {
  if (s == null) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function main() {
  const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  console.log(`Encontradas ${dirs.length} pastas de Skills`);

  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const slug of dirs) {
    const skillPath = path.join(SKILLS_DIR, slug, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      console.warn(`Skip ${slug} — sem SKILL.md`);
      skipped++;
      continue;
    }

    const md = fs.readFileSync(skillPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(md);

    if (!frontmatter.name || !frontmatter.description) {
      console.warn(`Skip ${slug} — frontmatter incompleto (name=${frontmatter.name}, desc=${frontmatter.description?.slice(0,40)})`);
      skipped++;
      continue;
    }

    const familia = frontmatter.familia || null;
    const formato = frontmatter.formato || null;
    const clones = frontmatter.clones || [];
    const nome_amigavel = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const conteudoMd = md;

    const sql = `
      INSERT INTO pinguim.skills (slug, nome, descricao, conteudo_md, categoria, universal, familia, formato, clones, status, area, atualizado_em)
      VALUES (
        ${escapeSql(slug)},
        ${escapeSql(nome_amigavel)},
        ${escapeSql(frontmatter.description)},
        ${escapeSql(conteudoMd)},
        ${escapeSql(familia === 'meta' ? 'universal' : 'especifica')},
        ${familia === 'meta' ? 'TRUE' : 'FALSE'},
        ${escapeSql(familia)},
        ${escapeSql(formato)},
        ${escapeSql(JSON.stringify(clones))}::jsonb,
        'em_construcao',
        ${escapeSql(familia)},
        now()
      )
      ON CONFLICT (slug) DO UPDATE SET
        nome = EXCLUDED.nome,
        descricao = EXCLUDED.descricao,
        conteudo_md = EXCLUDED.conteudo_md,
        familia = EXCLUDED.familia,
        formato = EXCLUDED.formato,
        clones = EXCLUDED.clones,
        atualizado_em = now()
      RETURNING slug;
    `;

    const result = await runSQL(sql);
    if (Array.isArray(result) && result[0]?.slug) {
      console.log(`  ✓ ${slug}  (${familia}/${formato}, ${clones.length} clones)`);
      inserted++;
    } else {
      console.error(`  ✗ ${slug}: ${JSON.stringify(result)}`);
      errors.push({ slug, result });
    }
  }

  console.log(`\nResumo: ${inserted} inseridas/atualizadas, ${skipped} puladas, ${errors.length} erros`);
  if (errors.length > 0) {
    console.error('Erros:', JSON.stringify(errors, null, 2));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
