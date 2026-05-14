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
const jobs = require('./jobs');
const oficina = require('./oficina');

// V2.14.5 + Discord — aceita cliente_id (sócio) OU contexto_extra (Discord funcionário).
async function blocoIdentidadeSocio(cliente_id_dinamico = null, contexto_extra = null) {
  try {
    // Caso 1: Discord funcionário (não é sócio, mas autorizado a usar o bot)
    if (contexto_extra && contexto_extra.papel === 'funcionario') {
      return `[IDENTIDADE — FUNCIONÁRIO PINGUIM (Discord)]
Você está conversando com: **${contexto_extra.nome}** (papel: funcionário do time Pinguim)
Canal: ${contexto_extra.canal} · #${contexto_extra.discord_canal_nome || contexto_extra.discord_canal_id}
Discord ID: ${contexto_extra.discord_user_id}

REGRA: este é um FUNCIONÁRIO (não sócio). Trate pelo primeiro nome (${(contexto_extra.nome || '').split(' ')[0]}). Tom direto e operacional, sem familiaridade de sócio. Aplicar Categoria K do AGENTS.md: escopo de permissões reduzido — pode consultar/operar Hotmart com confirmação, mexer no Drive, postar no Discord. NÃO pode acessar Gmail/Calendar dos sócios, Meta, ou relatórios estratégicos. Se pedir algo fora do escopo, recusa honesto sem confirmar.`;
    }

    // Caso 2: sócio (via cliente_id dinâmico ou contexto_extra com papel=socio)
    let s;
    const cid = cliente_id_dinamico || contexto_extra?.cliente_id;
    if (cid) {
      const rows = await db.rodarSQL(`
        SELECT cliente_id, slug, nome, email, empresa, ativo
          FROM pinguim.socios
         WHERE cliente_id = '${cid}'::uuid AND ativo = true
         LIMIT 1;
      `);
      s = Array.isArray(rows) && rows[0] ? rows[0] : null;
    }
    if (!s) {
      // Fallback: estático do .env.local (chat web, CLI direto)
      const socio = require('./socio');
      s = await socio.getSocioAtual();
    }

    // Acrescenta info do canal Discord se veio de lá
    const canalInfo = contexto_extra && contexto_extra.canal === 'discord'
      ? `\nCanal: discord · #${contexto_extra.discord_canal_nome || contexto_extra.discord_canal_id}\nDiscord ID: ${contexto_extra.discord_user_id}`
      : '';

    return `[IDENTIDADE DO SÓCIO]
Você está conversando com: **${s.nome}** (slug: ${s.slug}${s.empresa ? `, ${s.empresa}` : ''})
Email: ${s.email || '(não cadastrado)'}
Cliente_id: ${s.cliente_id}${canalInfo}

REGRA: trate o sócio pelo nome dele (${s.nome.split(' ')[0]}). Cada sócio tem preferências pessoais próprias — quando ele der feedback ou expressar preferência, classifique se é pessoal (só pra ele) ou geral (afeta todos os sócios). Ver Categoria J do AGENTS.md.`;
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

// V2.14.5 — bloco de aprendizados do agente (geral) + do sócio (pessoal)
// Geral: vale pra todos os sócios. Pessoal: específico do sócio identificado.
async function blocoAprendizados(cliente_id) {
  try {
    const aprendizados = require('./aprendizados');
    const [geral, pessoal] = await Promise.all([
      aprendizados.lerAprendizadosGerais().catch(() => null),
      cliente_id ? aprendizados.lerAprendizadosDoSocio(cliente_id).catch(() => null) : null,
    ]);
    const partes = [];
    if (geral?.conteudo_md && geral.conteudo_md.trim()) {
      partes.push(`[APRENDIZADOS GERAIS DO AGENTE] (válidos pra TODOS os sócios)
${geral.conteudo_md.trim().slice(0, 32000)}`);
    }
    if (pessoal?.conteudo_md && pessoal.conteudo_md.trim()) {
      partes.push(`[APRENDIZADOS PESSOAIS DESTE SÓCIO]
${pessoal.conteudo_md.trim().slice(0, 32000)}

REGRA: estes são GOSTOS E PREFERÊNCIAS do sócio atual. Aplicar SEMPRE que relevante. Quando este sócio der feedback novo, classificar antes de gravar (ver Categoria J do AGENTS.md): pessoal (vai aqui) vs geral (vai pros APRENDIZADOS GERAIS).`);
    }
    return partes.length > 0 ? partes.join('\n\n') : null;
  } catch (e) {
    return null;
  }
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
// V2.15 Fase 2 — bloco [JOBS PENDENTES] (polling de cortesia)
// Mostra ao Pinguim, a cada turno:
//   - jobs do socio em execucao (worker rodando agora)
//   - jobs concluidos NAO-notificados (Pinguim deve entregar link e chamar /api/jobs/notificar)
//   - jobs aguardando aprovacao (socio talvez esqueceu de responder)
// Se nenhum, retorna null (omite bloco do contexto).
// ============================================================
async function blocoJobsPendentes(cliente_id) {
  if (!cliente_id) return null;
  try {
    const ativos = await jobs.listarJobsDoSocio({
      cliente_id,
      status_filtro: ['aguardando_aprovacao', 'executando', 'concluido'],
      limite: 10,
    });
    if (!ativos.length) return null;
    // So mostra concluidos que ainda nao foram notificados
    const filtrados = ativos.filter((j) => {
      if (j.status === 'concluido') return !j.notificado_em;
      return true;
    });
    if (!filtrados.length) return null;
    const linhas = filtrados.map((j) => {
      const idCurto = String(j.id).slice(0, 8);
      const pedidoCurto = (j.pedido_original || '').slice(0, 90);
      const briefing = (j.briefing_resumo || '').slice(0, 110);
      if (j.status === 'concluido') {
        return `- **concluido** | job=${idCurto} | entregavel=/entregavel/${j.entregavel_id} | "${pedidoCurto}"`;
      }
      if (j.status === 'executando') {
        return `- **executando** | job=${idCurto} | desde ${j.aprovado_em || '?'} | "${pedidoCurto}"`;
      }
      // aguardando_aprovacao — extrai perguntas_pendentes do plano_json
      const brief = briefing ? ` | briefing: "${briefing}"` : '';
      const perguntas = (j.plano_json && Array.isArray(j.plano_json.perguntas_pendentes))
        ? j.plano_json.perguntas_pendentes.filter(Boolean)
        : [];
      if (perguntas.length) {
        const lista = perguntas.map((p, i) => `  ${i + 1}. ${p}`).join('\n');
        return `- **aguardando aprovacao** | job=${idCurto} | "${pedidoCurto}"${brief}\n  PERGUNTAS PENDENTES (socio precisa responder ANTES de aprovar):\n${lista}`;
      }
      return `- **aguardando aprovacao** | job=${idCurto} | "${pedidoCurto}"${brief}`;
    });
    return `[JOBS PENDENTES DESTE SOCIO]
${linhas.join('\n')}

REGRAS sobre estes jobs:
- Se ha "concluido" NAO-notificado E socio acabou de entrar OU pergunta status ("tá pronto?", "saiu?") → entrega o link /entregavel/<id> em UMA mensagem natural + chama POST /api/jobs/notificar com job_id pra marcar entregue. NUNCA repete entrega.
- Se ha "executando" e socio pergunta status → diz honesto que ainda esta rodando, evita prometer prazo se nao tem.
- Se ha "aguardando aprovacao" COM perguntas pendentes → faz as perguntas pro socio AGORA (numa mensagem natural, sem template) ANTES de pedir aprovacao. Quando socio responder, chama POST /api/jobs/replanejar com job_id + respostas_socio pra regerar plano com criterios definidos. NUNCA aprova job com pergunta sem resposta.
- Se ha "aguardando aprovacao" SEM perguntas pendentes e socio nao tocou no assunto, NAO empurra (espera ele responder). Se ele perguntar "que jobs eu tenho?" → lista.`;
  } catch (e) {
    console.warn(`[contexto-rico] erro carregando jobs pendentes: ${e.message}`);
    return null;
  }
}

// ============================================================
// V2.15 — bloco [OFICINA DE RELATÓRIOS]
// Catálogo de relatórios prontos (Skills ativas) + tickets pendentes do sócio.
// Agente OLHA antes de tentar executar relatório complexo. Se o pedido bate
// com slug do catálogo, executa direto. Se não bate, abre ticket via
// POST /api/oficina/criar e coleta requisitos com sócio.
// ============================================================
async function blocoOficina(cliente_id) {
  try {
    const [catalogo, pendentes] = await Promise.all([
      oficina.listarCatalogo({ status: 'ativo' }).catch(() => []),
      cliente_id ? oficina.listarPendentesDoSocio({ cliente_id, limite: 5 }).catch(() => []) : Promise.resolve([]),
    ]);

    if (!catalogo.length && !pendentes.length) return null;

    let bloco = `[OFICINA DE RELATÓRIOS]\n`;

    if (catalogo.length) {
      bloco += `\n**Relatórios PRONTOS (executa direto, NÃO abre ticket):**\n`;
      for (const c of catalogo) {
        const ex = (c.exemplos_pedido || []).slice(0, 2).join(' / ');
        bloco += `- \`${c.slug}\` — ${c.nome}. Ex: "${ex}". Como: ${c.como_invocar}\n`;
      }
    }

    if (pendentes.length) {
      bloco += `\n**Tickets EM ANDAMENTO deste sócio (na oficina):**\n`;
      for (const p of pendentes) {
        const idCurto = String(p.id).slice(0, 8);
        const pedidoCurto = (p.pedido_original || '').slice(0, 100);
        const briefingKeys = Object.keys(p.briefing_estruturado || {});
        const briefingResumo = briefingKeys.length ? `briefing: {${briefingKeys.join(', ')}}` : 'briefing vazio (perguntar requisitos)';
        bloco += `- **${p.status.replace(/_/g, ' ')}** | ticket=${idCurto} | "${pedidoCurto}" | ${briefingResumo}\n`;
      }
    }

    bloco += `\n**REGRA DE USO da Oficina:**
- Sócio pediu relatório que CASA com slug do catálogo acima → executa DIRETO (sem ticket).
- Sócio pediu relatório COMPLEXO que NÃO casa (multi-fonte com cruzamento, KPI customizado, formato novo) → abre ticket via POST /api/oficina/criar e COLETA REQUISITOS conversando. NÃO tenta executar em runtime.
- Se ha ticket EM ANDAMENTO desse sócio e ele tocar no assunto → atualiza briefing via POST /api/oficina/atualizar-briefing (merge de campos) ou anexa via POST /api/oficina/anexar.
- Coleta canônica (perguntar UM por vez, natural): (1) métricas exatas, (2) fontes/dimensões, (3) frequência (1 vez vs recorrente), (4) formato/audiência. Aceita anexos: HTML exemplo, link de referência, descrição extra, screenshot URL.
- Quando coletar TUDO, confirma com sócio e muda status pra 'aguardando_aprovacao' (via atualizar-briefing com status='aguardando_aprovacao').`;

    return bloco;
  } catch (e) {
    console.warn(`[contexto-rico] erro carregando oficina: ${e.message}`);
    return null;
  }
}

// ============================================================
// montarContexto — função principal
// Monta TODOS os blocos que vão ANTES do prompt do usuário.
// Retorna string única pronta pra concatenar.
// ============================================================
async function montarContexto({ thread_id, canal = 'chat-web', cliente_id = null, contexto_extra = null }) {
  const blocos = [];

  // 1. Temporal (síncrono)
  blocos.push(contextoTemporal.blocoDataAtual());

  // 2-5. Em paralelo (N queries no banco)
  // V2.14.5 — passa cliente_id pra identidade + aprendizados resolverem multi-sócio
  // V2.14 D — contexto_extra (Discord) entrega papel (sócio/funcionário) + nome
  const ehFuncionario = contexto_extra && contexto_extra.papel === 'funcionario';
  const [identidade, entregaveis, historico, drive, aprendizados, jobsPendentes, oficinaBloco] = await Promise.all([
    blocoIdentidadeSocio(cliente_id, contexto_extra).catch(() => '[IDENTIDADE DO SÓCIO]\n(erro)'),
    // Funcionário NÃO tem entregáveis pessoais — pula
    ehFuncionario ? Promise.resolve(null) : blocoEntregaveisRecentes(cliente_id).catch(() => '[ENTREGÁVEIS RECENTES]\n(erro consultando)'),
    blocoHistorico(thread_id).catch(() => '[HISTORICO]\n(erro consultando)'),
    blocoContextoDrive().catch(() => null),
    // Funcionário NÃO tem aprendizados pessoais — pula
    ehFuncionario ? Promise.resolve(null) : blocoAprendizados(cliente_id).catch(() => null),
    // V2.15 Fase 2 — jobs ativos do socio (executando/aguardando aprovacao/concluido nao notificado)
    ehFuncionario ? Promise.resolve(null) : blocoJobsPendentes(cliente_id).catch(() => null),
    // V2.15 Oficina — catálogo de relatórios prontos + tickets pendentes
    ehFuncionario ? Promise.resolve(null) : blocoOficina(cliente_id).catch(() => null),
  ]);

  blocos.push(identidade);
  if (aprendizados) blocos.push(aprendizados); // só inclui se há aprendizados
  if (entregaveis) blocos.push(entregaveis);   // funcionário não tem
  if (jobsPendentes) blocos.push(jobsPendentes); // V2.15 — só inclui se ha jobs ativos
  if (oficinaBloco) blocos.push(oficinaBloco); // V2.15 — catálogo + tickets oficina
  blocos.push(historico);
  if (drive) blocos.push(drive); // só inclui se tem arquivos recentes

  // 6. Canal (síncrono, baseado em parâmetro)
  blocos.push(blocoCanal(canal));

  return blocos.join('\n\n');
}

module.exports = { montarContexto, blocoIdentidadeSocio, blocoEntregaveisRecentes, blocoHistorico, blocoContextoDrive, blocoAprendizados, blocoCanal, blocoJobsPendentes, blocoOficina };
