const fs = require('fs');
const env = fs.readFileSync('c:/Squad/.env.local', 'utf8');
env.split(/\r?\n/).forEach(line => { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });
const db = require('c:/Squad/server-cli/lib/db');

(async () => {
  const sql = fs.readFileSync('c:/Squad/.tmp-sql/migration-V2.15-finops-jobs.sql', 'utf8');
  console.log('Rodando migration V2.15 FinOps por Job...');
  try {
    const r = await db.rodarSQL(sql);
    console.log('OK:', JSON.stringify(r).slice(0, 600));
  } catch (e) {
    console.log('ERRO:', e.message);
  }
  process.exit(0);
})();
