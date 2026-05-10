// ============================================================
// contexto-rico.js — V2.14 Refator V3 (Atendente Inteligente)
// ============================================================
// Monta o bloco de contexto que vai ANTES do prompt do usuário em
// TODA chamada ao Claude CLI. Substitui os 5 detectores regex que
// rodavam ANTES do LLM (ehPedidoEdicao, ehPedidoCriativoGrande,
// detectarPapelEContexto, ack-inteligente, router-llm em /api/chat).
//
// Princípio (decidido com Andre 2026-05-09):
//   "Você é o ÚNICO ponto de decisão. Tudo o que você precisa pra
//   decidir vem AQUI no contexto. Sem regex pre-LLM."
//
// Blocos compostos:
// 1. [CONTEXTO TEMPORAL]    — data BRT (já existia em contexto-temporal.js)
// 2. [IDENTIDADE DO SÓCIO]  — quem mandou a mensagem (lib/socio.js)
// 3. [HISTORICO]            — últimas N mensagens da thread (banco, fonte da verdade)
// 4. [ENTREGÁVEIS RECENTES] — peças geradas nas últimas 48h (resolve "v2", "esse", "aquele")
// 5. [CONTEXTO DRIVE]       — arquivos manipulados nos últimos 30d (existente, V2.12 Fix 2)
// 6. [CANAL]                — whatsapp / chat-web / discord / telegram (formato resposta varia)
//
// Resultado vai concatenado ao prompt antes da mensagem do usuário.
// ============================================================

const db = require('./db');
const contextoTemporal = require('./contexto-temporal');

async function blocoIdentidadeSocio() {
  try {
    const socio = require('./socio');
    const s = await socio.getSocioAtual();
    return `[IDENTIDADE DO SÓCIO]
Você está conversando com: **${s.nome}** (slug: ${s.slug}${s.empresa ? `, ${s.empresa}` : ''})
Email: ${s.email || '(não cadastrado)'}
Cliente_id: ${s.cliente_id}`;
  } catch (e) {
    return `[IDENTIDADE DO SÓCIO]
Não foi possível identificar o sócio (${e.message}). Trate como visitante autenticado.`;
  }
}

async function blocoEntregaveisRecentes(cliente_id, limite = 5, horas = 48) {
  // Lista entregáveis criados nas últimas N horas para resolver
  // referências como "essa", "aquela", "o último", "v2".
  // Quando o sócio fala "v2", o LLM deve PRIMEIRO olhar aqui.
  const cid = await db.resolverClienteId(cliente_id);
  const sql = `
    SELECT id, tipo, titulo, versao, parent_id, criado_em
    FROM pinguim.entregaveis
    WHERE cliente_id = '${cid}'
      AND criado_em >= now() - interval '${parseInt(horas, 10)} hours'
    ORDER BY criado_em DESC
    LIMIT ${parseInt(limite, 10)};
  `;
  let rows;
  try { rows = await db.rodarSQL(sql); } catch (e) {
    return `[ENTREGÁVEIS RECENTES]\n(falha ao consultar: ${e.message})`;
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return `[ENTREGÁVEIS RECENTES]\n(nenhum entregável nas últimas ${horas}h)`;
  }
  const linhas = rows.map(r => {
    const quando = new Date(r.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
    const v = r.versao > 1 ? ` v${r.versao}` : '';
    const parent = r.parent_id ? ' (edição de versão anterior)' : '';
    return `  - ${r.tipo}${v}: "${(r.titulo || 'sem título').slice(0, 80)}" — id=${r.id.slice(0, 8)}... ${quando}${parent}`;
  }).join('\n');
  return `[ENTREGÁVEIS RECENTES — últimas ${horas}h, ordem do mais novo]
${linhas}

REGRA: quando o sócio mencionar "esse", "aquele", "o último", "v2", "outra versão", PRIMEIRO consulte esta lista. Se o pedido bate com algum entregável aqui, é referência a ele (caminho de edição). Se não bate, é pedido NOVO. Se ambíguo, PERGUNTE qual.`;
}

async function blocoHistorico(thread_id, limite = 20) {
  const historico = await db.carregarHistorico({ limite });
  if (!Array.isArray(historico) || historico.length === 0) {
    return '[HISTORICO]\n(nova conversa, sem mensagens anteriores)';
  }
  const linhas = historico.map(m => {
    const quem = m.papel === 'humano' ? 'Sócio' : 'Você (Atendente)';
    const txt = (m.conteudo || '').replace(/\n/g, ' ').slice(0, 500);
    return `  ${quem}: ${txt}`;
  }).join('\n');
  return `[HISTORICO — últimas ${historico.length} mensagens, cronológico]
${linhas}

REGRA: este histórico é a fonte da verdade do que ACONTECEU nesta conversa. Use pra responder pergunta de status (REGRA -0 do AGENTS.md). Se o sócio pergunta "enviou?" e o histórico mostra que você já confirmou ter enviado, responda **conversacional e variado** ("Sim, mandei sim", "Já foi", "Enviei pra X mais cedo") SEM tool nova e SEM template fixo. Soa como humano, não como script.`;
}

async function blocoContextoDrive() {
  try {
    const drive = await db.lerDriveContexto({ dias: 30, limite: 5 });
    if (!Array.isArray(drive) || drive.length === 0) return null;
    return db.formatarDriveContextoPraPrompt(drive);
  } catch (e) {
    return null;
  }
}

function blocoCanal(canal) {
  const desc = {
    'whatsapp':   'WhatsApp (resposta vai por mensagem de texto + áudio TTS opcional). NUNCA use tabela markdown — vira lixo. Use bullet + bold.',
    'discord':    'Discord (resposta vai como mensagem em thread). Markdown Discord (bold, italic, code) suportado.',
    'telegram':   'Telegram (resposta vai como mensagem). HTML básico suportado.',
    'chat-web':   'Chat web do Pinguim OS (renderer markdown LIMITADO — ver REGRA -1 do AGENTS.md). Bullet + bold OK, tabela GFM NÃO.',
    'cli':        'Terminal CLI (markdown padrão suportado).',
  };
  return `[CANAL]
Origem: ${canal}
Formato: ${desc[canal] || 'genérico — usar markdown padrão e ser conservador com tabelas.'}`;
}

// ============================================================
// montarContexto — função principal
// Monta TODOS os blocos que vão ANTES do prompt do usuário.
// Retorna string única pronta pra concatenar.
// ============================================================
async function montarContexto({ thread_id, canal = 'chat-web', cliente_id = null }) {
  const blocos = [];

  // 1. Temporal (síncrono)
  blocos.push(contextoTemporal.blocoDataAtual());

  // 2-5. Em paralelo (N queries no banco)
  const [identidade, entregaveis, historico, drive] = await Promise.all([
    blocoIdentidadeSocio().catch(() => '[IDENTIDADE DO SÓCIO]\n(erro)'),
    blocoEntregaveisRecentes(cliente_id).catch(() => '[ENTREGÁVEIS RECENTES]\n(erro consultando)'),
    blocoHistorico(thread_id).catch(() => '[HISTORICO]\n(erro consultando)'),
    blocoContextoDrive().catch(() => null),
  ]);

  blocos.push(identidade);
  blocos.push(entregaveis);
  blocos.push(historico);
  if (drive) blocos.push(drive); // só inclui se tem arquivos recentes

  // 6. Canal (síncrono, baseado em parâmetro)
  blocos.push(blocoCanal(canal));

  return blocos.join('\n\n');
}

module.exports = { montarContexto, blocoIdentidadeSocio, blocoEntregaveisRecentes, blocoHistorico, blocoContextoDrive, blocoCanal };
