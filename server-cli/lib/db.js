// ============================================================
// db.js — V2.7+V2.11 (persistência + versionamento)
// Wrapper de queries Supabase via Management API (mesmo padrão do
// rodarSQL existente em orquestrador.js — extraído pra módulo dedicado
// agora que vários endpoints precisam).
//
// Tabelas usadas (já existem no banco, RLS ativo, padrão estabelecido):
//   pinguim.conversas    — mensagens user/assistant (papel = 'humano' | 'chief')
//   pinguim.entregaveis  — peças geradas com versionamento (versao + parent_id)
//
// Multi-tenancy: convenção do banco é tenant_id fixo + cliente_id placeholder.
// V3 vai amarrar cliente_id ao OAuth do sócio (cada sócio = 1 cliente).
// ============================================================

const path = require('path');
const fs = require('fs');

// Carrega .env.local (mesmo padrão do orquestrador, replicado aqui pra
// módulo ser auto-suficiente)
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

// IDs canônicos do Pinguim OS (descobertos via inspeção do banco em 2026-05-08)
const TENANT_ID_PINGUIM = '00000000-0000-0000-0000-000000000001';
const CLIENTE_ID_PADRAO = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'; // placeholder — V3 OAuth substitui por sócio
const AGENTE_ID_PINGUIM = '2699b1b1-769b-4b76-a8c1-4111d2e1d142'; // Atendente Pinguim

// ============================================================
// rodarSQL — POST direto na Management API
// ============================================================
async function rodarSQL(sql) {
  const projectRef = ENV_LOCAL.SUPABASE_PROJECT_REF || process.env.SUPABASE_PROJECT_REF;
  const accessToken = ENV_LOCAL.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;
  if (!projectRef || !accessToken) {
    throw new Error('SUPABASE_PROJECT_REF/SUPABASE_ACCESS_TOKEN nao definidos em .env.local');
  }
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const data = await r.json();
  if (data && data.message && /^Failed/.test(data.message)) {
    throw new Error(`SQL error: ${data.message.slice(0, 500)}`);
  }
  return data;
}

// Escapa string SQL ('foo' -> 'foo' sem aspas simples internas)
function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// ============================================================
// THREADS / CONVERSAS
// Thread = sequência de mensagens (cliente_id, agente_id, papel, conteudo, criado_em).
// Não há tabela `threads` — a thread é virtual: é o conjunto ordenado por criado_em
// pra um (cliente_id, agente_id).
// ============================================================

async function salvarMensagem({ cliente_id = CLIENTE_ID_PADRAO, agente_id = AGENTE_ID_PINGUIM, papel, conteudo, artefatos = null }) {
  // papel = 'humano' | 'chief' (convenção do sistema antigo, preservada)
  const sql = `
    INSERT INTO pinguim.conversas (tenant_id, cliente_id, agente_id, papel, conteudo, artefatos)
    VALUES (
      ${esc(TENANT_ID_PINGUIM)},
      ${esc(cliente_id)},
      ${esc(agente_id)},
      ${esc(papel)},
      ${esc(conteudo)},
      ${artefatos ? esc(JSON.stringify(artefatos)) + '::jsonb' : 'NULL'}
    )
    RETURNING id, criado_em;
  `;
  const data = await rodarSQL(sql);
  return Array.isArray(data) && data[0] ? data[0] : null;
}

async function carregarHistorico({ cliente_id = CLIENTE_ID_PADRAO, agente_id = AGENTE_ID_PINGUIM, limite = 20 }) {
  // Retorna últimas N mensagens em ordem cronológica (mais antiga primeiro).
  // Filtra papel IN ('humano','chief') pra não vazar mensagens 'sistema'
  // (V2.12 Fix 2 grava drive_op em mensagens 'sistema' que não devem
  // aparecer no histórico do CLI).
  const sql = `
    SELECT id, papel, conteudo, criado_em
    FROM pinguim.conversas
    WHERE tenant_id = ${esc(TENANT_ID_PINGUIM)}
      AND cliente_id = ${esc(cliente_id)}
      AND agente_id = ${esc(agente_id)}
      AND papel IN ('humano', 'chief')
    ORDER BY criado_em DESC
    LIMIT ${parseInt(limite, 10)};
  `;
  const data = await rodarSQL(sql);
  if (!Array.isArray(data)) return [];
  return data.reverse(); // cronológico
}

// ============================================================
// ENTREGAVEIS — com versionamento built-in (versao + parent_id)
// V1: parent_id=null, versao=1
// V2: parent_id=V1.id, versao=2
// V3: parent_id=V2.id, versao=3 (cadeia)
// ============================================================

async function salvarEntregavel({ cliente_id = CLIENTE_ID_PADRAO, agente_que_fez = AGENTE_ID_PINGUIM, tipo, titulo, conteudo_md, conteudo_estruturado = null, parent_id = null, versao = null }) {
  // Se parent_id existe, calcula versao automaticamente (parent.versao + 1)
  let versaoFinal = versao;
  if (parent_id && !versaoFinal) {
    const parent = await carregarEntregavelPorId(parent_id);
    if (!parent) throw new Error(`Parent ${parent_id} nao encontrado`);
    versaoFinal = parent.versao + 1;
  }
  if (!versaoFinal) versaoFinal = 1;

  const sql = `
    INSERT INTO pinguim.entregaveis (
      tenant_id, cliente_id, agente_que_fez, tipo, titulo,
      conteudo_md, conteudo_estruturado, versao, parent_id
    ) VALUES (
      ${esc(TENANT_ID_PINGUIM)},
      ${esc(cliente_id)},
      ${esc(agente_que_fez)},
      ${esc(tipo)},
      ${esc(titulo)},
      ${esc(conteudo_md)},
      ${conteudo_estruturado ? esc(JSON.stringify(conteudo_estruturado)) + '::jsonb' : "'{}'::jsonb"},
      ${versaoFinal},
      ${parent_id ? esc(parent_id) : 'NULL'}
    )
    RETURNING id, versao, parent_id, criado_em;
  `;
  const data = await rodarSQL(sql);
  return Array.isArray(data) && data[0] ? data[0] : null;
}

async function carregarEntregavelPorId(id) {
  const sql = `
    SELECT id, tenant_id, cliente_id, agente_que_fez, tipo, titulo,
           conteudo_md, conteudo_estruturado, versao, parent_id, criado_em
    FROM pinguim.entregaveis
    WHERE id = ${esc(id)}
    LIMIT 1;
  `;
  const data = await rodarSQL(sql);
  return Array.isArray(data) && data[0] ? data[0] : null;
}

// Carrega cadeia inteira de versões a partir de qualquer ID (V3 -> V2 -> V1)
// Retorna array em ordem crescente (V1, V2, V3...)
async function carregarCadeiaVersoes(id) {
  // CTE recursiva sobe pelo parent_id e desce pelos filhos
  const sql = `
    WITH RECURSIVE
    raiz AS (
      SELECT id, parent_id, versao FROM pinguim.entregaveis WHERE id = ${esc(id)}
      UNION ALL
      SELECT e.id, e.parent_id, e.versao
      FROM pinguim.entregaveis e
      JOIN raiz r ON e.id = r.parent_id
    ),
    raiz_origem AS (
      SELECT id FROM raiz ORDER BY versao ASC LIMIT 1
    ),
    cadeia AS (
      SELECT id, parent_id, versao FROM pinguim.entregaveis WHERE id = (SELECT id FROM raiz_origem)
      UNION ALL
      SELECT e.id, e.parent_id, e.versao
      FROM pinguim.entregaveis e
      JOIN cadeia c ON e.parent_id = c.id
    )
    SELECT e.id, e.tipo, e.titulo, e.versao, e.parent_id, e.conteudo_md,
           e.conteudo_estruturado, e.criado_em
    FROM cadeia c
    JOIN pinguim.entregaveis e ON e.id = c.id
    ORDER BY e.versao ASC;
  `;
  const data = await rodarSQL(sql);
  return Array.isArray(data) ? data : [];
}

// Lista entregáveis recentes do cliente — usado pra detectar "mude o entregável anterior"
async function listarEntregaveisRecentes({ cliente_id = CLIENTE_ID_PADRAO, agente_que_fez = AGENTE_ID_PINGUIM, limite = 5 }) {
  const sql = `
    SELECT id, tipo, titulo, versao, parent_id, criado_em,
           length(conteudo_md) AS tamanho_chars
    FROM pinguim.entregaveis
    WHERE tenant_id = ${esc(TENANT_ID_PINGUIM)}
      AND cliente_id = ${esc(cliente_id)}
      AND agente_que_fez = ${esc(agente_que_fez)}
    ORDER BY criado_em DESC
    LIMIT ${parseInt(limite, 10)};
  `;
  const data = await rodarSQL(sql);
  return Array.isArray(data) ? data : [];
}

// Pega o último entregável do cliente (mais recente) — pra detectar edição "muda X" sem ID explícito
async function ultimoEntregavelDoCliente({ cliente_id = CLIENTE_ID_PADRAO, agente_que_fez = AGENTE_ID_PINGUIM }) {
  const lista = await listarEntregaveisRecentes({ cliente_id, agente_que_fez, limite: 1 });
  return lista[0] || null;
}

// ============================================================
// V2.12 Fix 2 — DRIVE_CONTEXTO PERSISTIDO (Princípios 11+12)
// ============================================================
// Reusa pinguim.conversas.artefatos JSONB (já existe desde V2.7+V2.11) —
// não cria tabela paralela (Princípio 11: não inventar 2ª solução).
// Persistido no banco, não em RAM (Princípio 12: funciona no servidor V3).
//
// Convenção do JSONB:
//   { "drive_op": { "fileId": "...", "nome": "...", "link": "...",
//                   "aba": "...", "op": "buscar"|"ler"|"editar" } }
//
// Estratégia: ao invés de tentar atualizar a última mensagem da thread
// (que pode estar bloqueada/em escrita ou nem existir ainda), inserimos
// uma mensagem de papel='sistema' com a operação Drive. Não polui o
// histórico do agente porque carregarHistorico filtra por papel
// IN ('humano','chief'). Mas drive_contexto enxerga todas.
// ============================================================

// Insere uma "mensagem de sistema" registrando a operação Drive.
// Não aparece no histórico do CLI porque carregarHistorico filtra papel.
async function registrarOpDrive({
  cliente_id = CLIENTE_ID_PADRAO,
  agente_id = AGENTE_ID_PINGUIM,
  fileId,
  nome,
  link = null,
  aba = null,
  op, // 'buscar' | 'ler' | 'editar'
}) {
  if (!fileId || !op) return null; // busca pode não ter fileId específico — não registra
  const artefatos = { drive_op: { fileId, nome: nome || null, link, aba, op } };
  const sql = `
    INSERT INTO pinguim.conversas (tenant_id, cliente_id, agente_id, papel, conteudo, artefatos)
    VALUES (
      ${esc(TENANT_ID_PINGUIM)},
      ${esc(cliente_id)},
      ${esc(agente_id)},
      'sistema',
      ${esc(`drive_op:${op} ${nome || fileId}`)},
      ${esc(JSON.stringify(artefatos))}::jsonb
    )
    RETURNING id;
  `;
  try {
    const data = await rodarSQL(sql);
    return Array.isArray(data) && data[0] ? data[0] : null;
  } catch (e) {
    console.error('[registrarOpDrive] falhou (nao bloqueante):', e.message);
    return null;
  }
}

// Lê drive_contexto: últimos N fileIds únicos manipulados pelo cliente
// nos últimos K dias. Mais recente vence (dedupa por fileId, mantém o
// último uso). Retorna lista pronta pra injetar no prompt.
async function lerDriveContexto({
  cliente_id = CLIENTE_ID_PADRAO,
  agente_id = AGENTE_ID_PINGUIM,
  dias = 30,
  limite = 5,
} = {}) {
  const sql = `
    WITH ops AS (
      SELECT
        artefatos->'drive_op'->>'fileId' AS file_id,
        artefatos->'drive_op'->>'nome'   AS nome,
        artefatos->'drive_op'->>'link'   AS link,
        artefatos->'drive_op'->>'aba'    AS aba,
        artefatos->'drive_op'->>'op'     AS op,
        criado_em
      FROM pinguim.conversas
      WHERE tenant_id = ${esc(TENANT_ID_PINGUIM)}
        AND cliente_id = ${esc(cliente_id)}
        AND agente_id = ${esc(agente_id)}
        AND artefatos ? 'drive_op'
        AND criado_em > NOW() - INTERVAL '${parseInt(dias, 10)} days'
    ),
    dedup AS (
      SELECT DISTINCT ON (file_id) file_id, nome, link, aba, op, criado_em
      FROM ops
      WHERE file_id IS NOT NULL
      ORDER BY file_id, criado_em DESC
    )
    SELECT file_id AS "fileId", nome, link, aba, op, criado_em
    FROM dedup
    ORDER BY criado_em DESC
    LIMIT ${parseInt(limite, 10)};
  `;
  try {
    const data = await rodarSQL(sql);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('[lerDriveContexto] falhou (nao bloqueante):', e.message);
    return [];
  }
}

// Formata drive_contexto pra texto que o Atendente lê no prompt
function formatarDriveContextoPraPrompt(contexto) {
  if (!Array.isArray(contexto) || contexto.length === 0) return '';
  const linhas = contexto.map((c, i) => {
    const quando = c.criado_em ? new Date(c.criado_em).toISOString().slice(0, 16).replace('T', ' ') : '?';
    const aba = c.aba ? ` aba "${c.aba}"` : '';
    return `${i + 1}. **${c.nome || '(sem nome)'}** — fileId \`${c.fileId}\`${aba} — última op: ${c.op} (${quando})`;
  });
  return [
    '[CONTEXTO DRIVE DESTA CONVERSA]',
    'Arquivos do Drive recém-manipulados (mais recente primeiro):',
    ...linhas,
    '',
    'Quando o sócio disser "essa planilha"/"nessa planilha"/"o arquivo"/"continua nesse"/"altera mais uma coisa" SEM nomear arquivo:',
    contexto.length === 1
      ? '- Use o fileId acima direto (sem rodar buscar-drive de novo).'
      : `- Se o pedido bate claramente com 1 deles, use direto. Se é ambíguo, pergunte "qual delas? mexemos com ${contexto.slice(0, Math.min(3, contexto.length)).map(c => `"${c.nome || c.fileId.slice(0, 8)}"`).join(' e ')} agora há pouco".`,
  ].join('\n');
}

// ============================================================
// V2.12 — COFRE DE CHAVES (sistema + OAuth por cliente)
// Chaves de sistema: cliente_id=NULL (ex: GOOGLE_OAUTH_CLIENT_ID,
// GOOGLE_OAUTH_CLIENT_SECRET). Le com get_chave RPC.
// Chaves por cliente: cliente_id=<uuid> (ex: GOOGLE_OAUTH_REFRESH).
// Le com get_chave_por_cliente RPC.
// ============================================================

async function lerChaveSistema(nome, consumidor = 'server-cli') {
  const sql = `SELECT pinguim.get_chave(${esc(nome)}, ${esc(consumidor)}, 'server-cli') AS valor;`;
  const data = await rodarSQL(sql);
  return Array.isArray(data) && data[0] ? data[0].valor : null;
}

async function lerChavePorCliente(nome, cliente_id = CLIENTE_ID_PADRAO) {
  const sql = `SELECT pinguim.get_chave_por_cliente(${esc(nome)}, ${esc(cliente_id)}::uuid) AS valor;`;
  const data = await rodarSQL(sql);
  return Array.isArray(data) && data[0] ? data[0].valor : null;
}

// Upsert de OAuth refresh_token (usa nome+cliente_id como chave logica)
async function salvarRefreshTokenOAuth({
  nome = 'GOOGLE_OAUTH_REFRESH',
  provedor = 'Google',
  escopo = 'drive.readonly calendar.readonly',
  refresh_token,
  cliente_id = CLIENTE_ID_PADRAO,
  observacoes = '',
}) {
  if (!refresh_token) throw new Error('refresh_token obrigatorio');
  // Tenta UPDATE primeiro (se existe pra esse cliente). Se nao afetou linha, INSERT.
  const sql = `
    WITH upd AS (
      UPDATE pinguim.cofre_chaves
      SET valor_completo = ${esc(refresh_token)},
          ultimos_4 = ${esc(refresh_token.slice(-4))},
          ultima_rotacao = now(),
          ativo = true,
          escopo = ${esc(escopo)},
          observacoes = ${esc(observacoes)},
          atualizado_em = now()
      WHERE nome = ${esc(nome)} AND cliente_id = ${esc(cliente_id)}::uuid
      RETURNING id
    )
    INSERT INTO pinguim.cofre_chaves
      (nome, provedor, escopo, onde_vive, valor_completo, ultimos_4,
       descricao, criado_em_provedor, ativo, cliente_id, observacoes)
    SELECT
      ${esc(nome)},
      ${esc(provedor)},
      ${esc(escopo)},
      'cofre',
      ${esc(refresh_token)},
      ${esc(refresh_token.slice(-4))},
      'OAuth refresh_token (V2.12 squad operacional)',
      now(),
      true,
      ${esc(cliente_id)}::uuid,
      ${esc(observacoes)}
    WHERE NOT EXISTS (SELECT 1 FROM upd)
    RETURNING id;
  `;
  const data = await rodarSQL(sql);
  return Array.isArray(data) && data[0] ? data[0] : null;
}

async function revogarOAuthToken({ nome = 'GOOGLE_OAUTH_REFRESH', cliente_id = CLIENTE_ID_PADRAO }) {
  const sql = `SELECT pinguim.revogar_chave_oauth(${esc(nome)}, ${esc(cliente_id)}::uuid) AS revogado;`;
  const data = await rodarSQL(sql);
  return Array.isArray(data) && data[0] ? !!data[0].revogado : false;
}

module.exports = {
  TENANT_ID_PINGUIM,
  CLIENTE_ID_PADRAO,
  AGENTE_ID_PINGUIM,
  rodarSQL,
  esc,
  // threads/conversas
  salvarMensagem,
  carregarHistorico,
  // entregaveis
  salvarEntregavel,
  carregarEntregavelPorId,
  carregarCadeiaVersoes,
  listarEntregaveisRecentes,
  ultimoEntregavelDoCliente,
  // cofre + OAuth (V2.12)
  lerChaveSistema,
  lerChavePorCliente,
  salvarRefreshTokenOAuth,
  revogarOAuthToken,
  // drive_contexto (V2.12 Fix 2)
  registrarOpDrive,
  lerDriveContexto,
  formatarDriveContextoPraPrompt,
};
