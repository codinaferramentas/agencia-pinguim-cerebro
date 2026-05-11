// ============================================================
// agent-manifest.js — V2.15 Fase 1 (Andre 2026-05-11)
// ============================================================
// Bloco dinâmico injetado no prompt do Pinguim a cada turno listando
// CAPACIDADES que ele tem disponível AGORA:
//
//   - Squads acionáveis (lê de pinguim.squads, agrupa por populadas)
//   - Categorias de tools principais (Hotmart G1-G8, Drive E1-E3, Gmail E4-E6,
//     Calendar E7, Discord E8/L, WhatsApp E9, Meta H1-H5, Supabases externos M)
//   - Skills universais (lê de pinguim.skills onde universal=true)
//
// Objetivo: agente PARAR de improvisar caminho. Ver o que tem disponível,
// declarar 1 linha "vou usar X porque Y" antes de executar.
//
// Cache: 5min. Manifest muda raro — squad nova entra raríssimo.
// ============================================================

const db = require('./db');

let _cache = null;
let _cacheExpiraEm = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ============================================================
// Catálogo de categorias de tools (estático — anatomia canônica do AGENTS.md)
// ============================================================
// Em vez de listar 50+ scripts shell, agrupa por CATEGORIA com 1 linha cada.
// Quando agente vê isso, sabe ONDE procurar. Detalhe técnico tá no AGENTS.md
// que ele já tem como referência canônica.
const CATEGORIAS_TOOLS = [
  { sigla: 'A', nome: 'Saudação',          quando: 'oi/tudo bem/obrigado — responde curto, ZERO tool' },
  { sigla: 'B', nome: 'Factual produto',   quando: 'O que é Elo? ProAlt? — buscar-cerebro + buscar-persona' },
  { sigla: 'C', nome: 'Criativo',          quando: 'copy/headline/email/VSL — DELEGA via delegar-chief.sh <squad>' },
  { sigla: 'D', nome: 'Admin sistema',     quando: 'lista X, atualiza Y — script de leitura direto' },
  { sigla: 'E1-3', nome: 'Drive',          quando: 'buscar/ler/editar arquivo Drive — buscar-drive.sh, ler-drive.sh, editar-drive.sh' },
  { sigla: 'E4-6', nome: 'Gmail',          quando: 'listar/ler/enviar email — gmail-listar.sh, gmail-ler.sh, gmail-responder.sh' },
  { sigla: 'E7',   nome: 'Calendar',       quando: 'agenda hoje/semana — calendar-listar.sh (READ-only)' },
  { sigla: 'E8',   nome: 'Discord leitura',quando: 'últimas msg Discord — POST /api/discord/listar-24h, buscar' },
  { sigla: 'E9',   nome: 'WhatsApp envio', quando: 'mandar zap pra número — whatsapp-enviar.sh (confirmar antes)' },
  { sigla: 'F',    nome: 'Relatórios',     quando: 'triagem/diagnóstico/executivo/TOP N — DELEGA pra squad data' },
  { sigla: 'G1-8', nome: 'Hotmart',        quando: 'consulta aluno, vendas, refund, cupom — hotmart-*.sh' },
  { sigla: 'G4b',  nome: 'Hotmart Club',   quando: 'aluno tem acesso?último login? — hotmart-verificar-acesso-membros.sh <email> [produto]' },
  { sigla: 'H1-5', nome: 'Meta Marketing', quando: 'ad accounts, campanhas, insights, Pages — meta-*.sh' },
  { sigla: 'J',    nome: 'Feedback',       quando: 'sócio dá feedback — classificar A/B/C antes de gravar (Categoria J)' },
  { sigla: 'K',    nome: 'Funcionário',    quando: 'Rafa/Djairo/LuizG pedindo no Discord — escopo reduzido' },
  { sigla: 'L1-3', nome: 'Cross-canal Discord', quando: 'POST/edit/apagar Discord — POST /api/discord/postar' },
  { sigla: 'M1-3', nome: 'Supabases externos', quando: 'ProAlt/Elo/Sirius — projeto-listar-tabelas.sh, projeto-descrever-tabela.sh, projeto-consultar.sh' },
];

// ============================================================
// Carrega squads populadas (lê do banco)
// ============================================================
async function carregarSquads() {
  const sql = `
    SELECT
      s.slug,
      s.nome,
      s.emoji,
      s.caso_de_uso,
      COUNT(a.id) as qtd_agentes,
      bool_or(a.slug = s.slug || '-chief' OR a.slug ILIKE '%chief%') as tem_chief
    FROM pinguim.squads s
    LEFT JOIN pinguim.agentes a ON a.squad_id = s.id
    GROUP BY s.slug, s.nome, s.emoji, s.caso_de_uso
    HAVING COUNT(a.id) > 0
    ORDER BY s.slug
  `;
  try {
    const r = await db.rodarSQL(sql);
    return Array.isArray(r) ? r : [];
  } catch (e) {
    console.warn(`[agent-manifest] erro carregando squads: ${e.message}`);
    return [];
  }
}

// ============================================================
// Monta bloco de texto pra injetar no prompt
// ============================================================
async function montarManifest() {
  // Cache
  if (_cache && Date.now() < _cacheExpiraEm) return _cache;

  const squads = await carregarSquads();

  // Bloco squads (somente as populadas, com escopo claro de quando acionar)
  const squadsLinha = squads.length === 0
    ? '(nenhuma squad populada — todas as squads-conselheiras estão em construção)'
    : squads.map(s => {
        // Caso de uso resumido em 1 linha
        const escopo = (s.caso_de_uso || '').split(/\n|\./)[0].slice(0, 100);
        return `  - ${s.slug.padEnd(18)} (${s.qtd_agentes} agentes) — ${escopo}`;
      }).join('\n');

  // Bloco categorias de tools
  const toolsLinha = CATEGORIAS_TOOLS.map(c =>
    `  - ${('[' + c.sigla + ']').padEnd(8)} ${c.nome.padEnd(22)} → ${c.quando}`
  ).join('\n');

  const bloco = `[CAPACIDADES AGORA] — manifest dinâmico, lido no boot deste turno

🎯 SQUADS QUE VOCÊ PODE ACIONAR (via bash scripts/delegar-chief.sh <slug> "<briefing>"):
${squadsLinha}

🛠 CATEGORIAS DE TOOLS (detalhe técnico no AGENTS.md):
${toolsLinha}

⚠ REGRA-MÃE DA DECISÃO (lê isso ANTES de executar pedido com >1 passo):

1. Pedido envolve criação criativa (copy/VSL/headline/email/oferta)? → DELEGA pra squad **copy** (NUNCA escreve direto)
2. Pedido envolve relatório/análise/TOP N/métricas/engajamento? → DELEGA pra squad **data** (NUNCA consulta banco direto pra montar relatório)
3. Pedido envolve narrativa/história/pitch? → DELEGA pra squad **storytelling**
4. Pedido envolve design/identidade visual? → DELEGA pra squad **design**
5. Pedido envolve decisão estratégica/dilema/conselho? → DELEGA pra squad **advisory-board**
6. Pedido é consulta pontual (1 aluno, 1 venda, 1 arquivo, 1 evento)? → executa direto com tool da categoria certa

⚠ DELEGAR é tool call: \`bash scripts/delegar-chief.sh <slug-squad> "<briefing-rico-com-5-fontes>"\` — o Chief da squad recebe, distribui pros mestres, retorna output consolidado. Você devolve INTEGRALMENTE ao sócio sem cortar/reescrever.

⚠ Se NÃO sabe qual caminho seguir, DECLARE EM 1 LINHA antes de executar: "Vou usar [tool/squad X] porque [Y]". Isso força você a checar se faz sentido antes de chamar.

⚠ Se uma tool FALHAR (fetch failed, 403, timeout), você NÃO desiste. Você (a) investiga qual endpoint/script deu erro, (b) tenta abordagem alternativa (outro script, outra fonte), (c) só DEPOIS de 2-3 tentativas reporta com diagnóstico estruturado: "tentei A (falhou por X), B (falhou por Y), preciso Z". NUNCA devolve "Erro técnico: <msg>" cru pro sócio.
`;

  _cache = bloco;
  _cacheExpiraEm = Date.now() + CACHE_TTL_MS;
  return bloco;
}

// ============================================================
// Invalida cache (chamar quando squad/agente novo for cadastrado)
// ============================================================
function invalidarCache() {
  _cache = null;
  _cacheExpiraEm = 0;
}

module.exports = {
  montarManifest,
  invalidarCache,
};
