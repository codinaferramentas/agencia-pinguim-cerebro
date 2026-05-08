// ============================================================
// socio.js — V2.13 (identidade do sócio em runtime)
// ============================================================
// Lê SOCIO_SLUG do .env.local e resolve pra cliente_id real do banco.
// Cada sócio (Codina, Luiz, Micha, Pedro) roda o server-cli na máquina
// dele com SOCIO_SLUG=<slug> próprio.
//
// Quando V3 chegar (servidor Pedro), essa lógica troca por sessão de
// login web. Por enquanto, env var resolve.
// ============================================================

const path = require('path');
const fs = require('fs');

// ---- Lê .env.local (mesmo padrão de db.js, replicado pra módulo
//      ser auto-suficiente sem dependência circular)
function carregarEnvLocal() {
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const result = {};
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) result[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return result;
}
const ENV_LOCAL = carregarEnvLocal();

// SOCIO_SLUG vem do .env.local. Se ausente, default 'codina' (compatibilidade
// retroativa — antes da V2.13 não tinha env var, todos os tokens estavam no
// cliente_id placeholder do Codina).
function getSocioSlug() {
  return ENV_LOCAL.SOCIO_SLUG || process.env.SOCIO_SLUG || 'codina';
}

// Cache em RAM da resolução slug -> {cliente_id, nome, email, empresa}.
// Carregado UMA vez na primeira chamada via SQL. Reusa db.rodarSQL pra evitar
// duplicar lógica de Management API.
let _cacheSocio = null;

async function getSocioAtual() {
  if (_cacheSocio) return _cacheSocio;

  // Lazy require pra evitar dependência circular (db.js também usa essa função)
  const db = require('./db');
  const slug = getSocioSlug();

  const sql = `
    SELECT cliente_id, slug, nome, email, empresa, ativo
    FROM pinguim.socios
    WHERE slug = '${slug.replace(/'/g, "''")}' AND ativo = true
    LIMIT 1;
  `;
  const data = await db.rodarSQL(sql);

  if (!Array.isArray(data) || !data[0]) {
    throw new Error(
      `SOCIO_SLUG="${slug}" nao encontrado em pinguim.socios. ` +
      `Adicionar SOCIO_SLUG=<slug> no .env.local. Slugs validos: codina, luiz, micha, pedro.`
    );
  }

  _cacheSocio = data[0];
  console.log(`[socio] identificado: ${_cacheSocio.slug} (${_cacheSocio.nome}, ${_cacheSocio.empresa})`);
  return _cacheSocio;
}

// Versão síncrona — retorna `null` se cache ainda não populou.
// Usar pra logs onde latência importa mais que ter o dado.
function getSocioAtualSync() {
  return _cacheSocio;
}

// Limpa cache (testes / quando trocar SOCIO_SLUG sem reiniciar processo)
function invalidarCache() {
  _cacheSocio = null;
}

module.exports = {
  getSocioSlug,
  getSocioAtual,
  getSocioAtualSync,
  invalidarCache,
};
