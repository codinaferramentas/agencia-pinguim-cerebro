// ============================================================
// Atendente Pinguim — runtime via Claude CLI local (Pedro model)
// ============================================================
// Express na porta 3737. Spawna `claude -p` no diretorio atual.
// Cada socio roda na propria maquina, com `claude login` (Max).
// Token externo: zero (consume a Max do socio, nao API paga).
//
// Uso:
//   1. `claude login` (1 vez, autentica Max)
//   2. `node server-cli/index.js`
//   3. abrir http://localhost:3737
// ============================================================

const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const {
  EPP_LIMITS,
  verificarOutput,
  similaridadeOutputs,
  detectarPapelEContexto,
} = require('./lib/verificador');
const {
  ehPedidoCriativoGrande,
  ehPedidoEdicao, // V2.11 — detector de pedido de edicao
  pipelineCriativo,
  planejarPipeline,
  executarMestres,
  detectarSquad,
  detectarProduto,
  SQUADS_POPULADAS, // V2.5 Commit 4 — fonte unica da verdade
} = require('./lib/orquestrador');
const { classificarMensagem } = require('./lib/router-llm'); // V2.9 — LLM router
const { renderEntregavel } = require('./lib/template-html'); // V2.10 — entregavel HTML
const db = require('./lib/db'); // V2.7+V2.11 — persistencia em pinguim.conversas + pinguim.entregaveis
const { revisarConsolidado } = require('./lib/reviewer'); // V2.6 — revisor pos-pipeline (portugues + clareza)
const oauthGoogle = require('./lib/oauth-google'); // V2.12 Fase 0 — OAuth Drive + Calendar
const googleDrive = require('./lib/google-drive'); // V2.12 Fase 1 — busca arquivos no Drive
const googleDriveContent = require('./lib/google-drive-content'); // V2.12 Fase 2+4 — ler e editar conteudo

const app = express();
const PORT = 3737;
const PROJECT_DIR = __dirname;

app.use(express.json({ limit: '10mb' }));

// CORS dev-friendly — permite qualquer origin (uso local).
// Necessario pra paginas HTML fora do server-cli (ex: mission-control) baterem na API.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Serve o mission-control inteiro em /mission-control/* — pra testar
// V2.4 Salao dos Mestres no mesmo dominio do server-cli (mata necessidade
// de servidor estatico paralelo na 8080). Quando V3 acontecer, mission-control
// sera servido aqui em definitivo.
const MISSION_CONTROL_DIR = path.join(__dirname, '..', 'mission-control');
app.use('/mission-control', express.static(MISSION_CONTROL_DIR));

// Threads em memoria — V2 vai pra banco.
const threads = {};

// ============================================================
// V2.5 Commit 3 — Cache de plano em memoria (TTL 5 min)
// /api/pipeline-plan guarda plano completo (5 fontes consultadas + briefing
// + mestresPorBloco). /api/chat com plan_id recupera e pula direto pra
// executarMestres — evita consultar fontes 2x.
// ============================================================
const PIPELINE_PLAN_TTL_MS = 5 * 60 * 1000; // 5 min
const planoCache = new Map(); // plan_id -> { plano, expiraEm, timeout }

function gerarPlanId() {
  // UUID v4 simples — sem dependencia externa
  return 'plan_' + Date.now().toString(36) + '_' +
    Math.random().toString(36).slice(2, 10);
}

function guardarPlano(planId, plano) {
  // Limpa entrada antiga se mesmo id reaparecer (paranoia)
  if (planoCache.has(planId)) {
    clearTimeout(planoCache.get(planId).timeout);
  }
  const expiraEm = Date.now() + PIPELINE_PLAN_TTL_MS;
  const timeout = setTimeout(() => {
    planoCache.delete(planId);
    console.log(`[plan-cache] expirou ${planId}`);
  }, PIPELINE_PLAN_TTL_MS);
  planoCache.set(planId, { plano, expiraEm, timeout });
}

function recuperarPlano(planId) {
  const entry = planoCache.get(planId);
  if (!entry) return null;
  if (entry.expiraEm < Date.now()) {
    planoCache.delete(planId);
    clearTimeout(entry.timeout);
    return null;
  }
  // Plano so e usado uma vez — depois vai pro lixo (evita reuso indevido)
  planoCache.delete(planId);
  clearTimeout(entry.timeout);
  return entry.plano;
}

// ============================================================
// V2.10 — Cache de entregavel HTML (TTL 60 min)
// Diferente do planoCache (que e single-use, evita reuso indevido do plano),
// o entregavel persiste enquanto o usuario quer reabrir/F5/compartilhar link.
// Indexado pelo MESMO plan_id quando o pipeline foi planejado, ou um novo
// plan_id gerado quando o pipeline foi do zero (sem /api/pipeline-plan).
// ============================================================
const ENTREGAVEL_TTL_MS = 60 * 60 * 1000; // 60 min
const ENTREGAVEL_MIN_CHARS = parseInt(process.env.ENTREGAVEL_HTML_MIN_CHARS || '2000', 10);
const entregavelCache = new Map(); // id -> { markdown, metricas, pedido, criadoEm, timeout }

function guardarEntregavel(id, dados) {
  if (entregavelCache.has(id)) {
    clearTimeout(entregavelCache.get(id).timeout);
  }
  const timeout = setTimeout(() => {
    entregavelCache.delete(id);
    console.log(`[entregavel-cache] expirou ${id}`);
  }, ENTREGAVEL_TTL_MS);
  entregavelCache.set(id, { ...dados, timeout });
}

function recuperarEntregavel(id) {
  const entry = entregavelCache.get(id);
  if (!entry) return null;
  return entry;
}

// ============================================================
// Spawna claude CLI e retorna texto de resposta.
// ============================================================
function runClaudeCLI(prompt, opts = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--output-format', 'text',
      '--allowedTools', 'Bash,Read,Glob,Grep',
    ];
    if (opts.model) args.push('--model', opts.model);

    const env = { ...process.env };
    // CRITICO: deletar (nao set vazio) — evita "cannot launch inside another Claude Code session"
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const proc = spawn('claude', args, {
      cwd: PROJECT_DIR,
      env,
      shell: true,
      // V2.6.1 — NAO passar timeout aqui (so mata fork Node, nao subprocess CLI).
      // SIGKILL real abaixo.
    });

    const timeoutMs = opts.timeout || 480_000; // 8 min — entregavel longo
    let killed = false;
    const killTimer = setTimeout(() => {
      killed = true;
      try { proc.kill('SIGKILL'); } catch (_) { /* ignore */ }
    }, timeoutMs);

    let stdout = '';
    let stderr = '';

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      clearTimeout(killTimer);
      if (killed) {
        reject(new Error(`claude CLI KILLED apos ${(timeoutMs/1000)}s (timeout SIGKILL)`));
        return;
      }
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`claude CLI exit ${code}: ${stderr.slice(-2000)}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(killTimer);
      reject(new Error(`Falha ao spawnar claude CLI: ${err.message}`));
    });
  });
}

// ============================================================
// POST /api/detectar-tipo  —  V2.5 Commit 3
// body: { message }
// resposta: { tipo, subcategoria, anima }
// Backend e fonte unica da verdade pra "isso vai chamar pipeline criativo?"
// Frontend consulta antes de chamar /api/chat pra decidir se anima.
// ~1ms (so regex puro, sem CLI nem SQL).
// ============================================================
// V2.5 Commit 4: SQUADS_POPULADAS importado do orquestrador (fonte unica).
// V3 vai virar tabela em pinguim.squads (coluna populada).

app.post('/api/detectar-tipo', async (req, res) => {
  const { message } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message obrigatorio' });
  }

  const t0 = Date.now();

  // V2.9 — Tentar LLM router primeiro. Token zero (Haiku via Claude CLI Max).
  // Se falhar (timeout/parse-erro), cai pras 3 regex como fallback.
  const llm = await classificarMensagem(message);

  let tipo, subcategoria, squad_destino, fonte_classificacao, raciocinio, confianca;

  if (llm && llm.confianca >= 0.6) {
    // === Caminho LLM ===
    fonte_classificacao = 'llm';
    raciocinio = llm.raciocinio;
    confianca = llm.confianca;
    tipo = (llm.tipo === 'criativo') ? 'criativo' : 'normal';
    subcategoria = (llm.tipo === 'criativo') ? 'criativo-grande'
                 : (llm.tipo === 'saudacao') ? 'saudacao'
                 : (llm.tipo === 'admin') ? 'comando-admin'
                 : 'factual';
    squad_destino = llm.squad || detectarSquad(message); // se LLM nao deu squad, regex completa
  } else {
    // === Caminho regex (fallback) ===
    fonte_classificacao = llm ? 'fallback-baixa-confianca' : 'fallback-llm-falhou';
    raciocinio = llm ? `LLM retornou confianca ${llm.confianca}, usando regex` : 'LLM crashou ou parse falhou';
    confianca = null;

    const ehCriativo = ehPedidoCriativoGrande(message);
    const ctx = detectarPapelEContexto(message);
    squad_destino = detectarSquad(message);
    tipo = ehCriativo ? 'criativo' : 'normal';
    if (ctx.pular_verifier) subcategoria = 'saudacao';
    else if (ehCriativo) subcategoria = 'criativo-grande';
    else if (/^(quem (e |voce )|o que (e |voce )|qual seu|como funciona|me explica)/i.test(message)) subcategoria = 'factual';
    else if (/^(lista|atualiza|verifica)/i.test(message)) subcategoria = 'comando-admin';
    else subcategoria = 'factual';
  }

  const produto_slug = detectarProduto(message);
  const squad_disponivel = SQUADS_POPULADAS.has(squad_destino);
  const anima = (tipo === 'criativo') && squad_disponivel;
  const dur_ms = Date.now() - t0;

  console.log(`[detectar-tipo] ${dur_ms}ms | fonte=${fonte_classificacao} | tipo=${tipo}/${subcategoria} | squad=${squad_destino} (disponivel=${squad_disponivel}) | conf=${confianca ?? '-'} | "${message.slice(0, 60)}"`);

  res.json({
    tipo,
    subcategoria,
    squad_destino,
    squad_disponivel,
    produto_slug,
    anima,
    // V2.9 — info do classificador, util pra debug e telemetria futura
    classificacao: {
      fonte: fonte_classificacao,
      confianca,
      raciocinio,
      latencia_ms: dur_ms,
    },
  });
});

// ============================================================
// POST /api/pipeline-plan  —  V2.5 Commit 3
// body: { message }
// resposta: { plan_id, mestres_usados, fonte_decisao, skill_usada,
//             blocos_total, fontes_consultadas, fontes_gap, expira_em }
// Roda Etapas 1+2 do pipeline (5 fontes + decide mestres). NAO roda mestres.
// Plano completo fica em cache TTL 5min — frontend usa plan_id em /api/chat
// pra pular consulta de fontes (evita 5s desperdicados + carga em Supabase).
// ============================================================
app.post('/api/pipeline-plan', async (req, res) => {
  const t0 = Date.now();
  try {
    const { message } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'message obrigatorio' });
    }
    if (!ehPedidoCriativoGrande(message)) {
      return res.status(400).json({ error: 'mensagem nao e pedido criativo grande — use /api/chat direto' });
    }

    console.log(`[${new Date().toISOString()}] pipeline-plan: ${message.slice(0, 80)}`);
    const log = (msg) => console.log(`  [pipeline-plan] ${msg}`);
    const result = await planejarPipeline({ message, log });

    if (!result.ok) {
      return res.status(400).json({ error: result.mensagem || 'planejamento falhou' });
    }

    const plan_id = gerarPlanId();
    guardarPlano(plan_id, result.plano);

    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  -> plano ${plan_id} criado em ${dur}s | mestres: ${result.plano.mestresPorBloco.length}`);

    // Devolve so o que o frontend precisa pra abrir animacao.
    // O plano completo fica no cache do servidor.
    res.json({
      plan_id,
      mestres_usados: result.plano.mestresPorBloco.map(m => m.mestre),
      mestres_ignorados: result.plano.mestresIgnorados || [],
      fonte_decisao: result.plano.fonteDecisao,
      skill_usada: result.plano.skillUsada,
      // V2.10.1 — skills aux aplicadas (so slugs, frontend nao precisa do conteudo)
      skills_auxiliares: (result.plano.skillsAux || []).map(s => ({ slug: s.slug, ok: s.ok })),
      blocos_total: result.plano.blocosTotal,
      blocos_fallback_generico: result.plano.blocosFallbackGenerico || [],
      fontes_consultadas: result.plano.fontes.length,
      fontes_gap: result.plano.fontes.filter(f => !f.ok).length,
      duracao_planejamento_s: parseFloat(dur),
      expira_em: Date.now() + PIPELINE_PLAN_TTL_MS,
    });
  } catch (err) {
    console.error('Erro pipeline-plan:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// ============================================================
// POST /api/chat
// body: { message, thread_id, plan_id? }
// V2.5 Commit 3: plan_id opcional. Se vier e for valido, executa direto
// os mestres (pula consulta de fontes — ja foi feita no /api/pipeline-plan).
// ============================================================
app.post('/api/chat', async (req, res) => {
  const t0 = Date.now();
  try {
    const { message, thread_id = 'default', plan_id } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'message obrigatorio' });
    }

    // ============================================================
    // V2.7 — Thread persistida em pinguim.conversas (banco).
    // Cache RAM continua existindo como write-through (rapido + sobrevive
    // ao restart via reload do banco quando aparece thread vazia).
    // Convencao papel: 'humano' / 'chief' (preserva sistema antigo).
    // ============================================================
    if (!threads[thread_id]) {
      // Primeira mensagem nessa thread (RAM) — tenta hidratar do banco.
      // Se nada no banco, comeca vazia. Se servidor caiu antes, retoma.
      try {
        const historico = await db.carregarHistorico({ limite: 20 });
        threads[thread_id] = historico.map(m => ({
          role: m.papel === 'humano' ? 'user' : 'assistant',
          content: m.conteudo,
        }));
        if (threads[thread_id].length > 0) {
          console.log(`  thread hidratada do banco: ${threads[thread_id].length} mensagens`);
        }
      } catch (e) {
        console.warn(`  falha ao hidratar thread do banco — iniciando vazia: ${e.message}`);
        threads[thread_id] = [];
      }
    }
    threads[thread_id].push({ role: 'user', content: message });

    // Persiste no banco (fire-and-forget — nao bloqueia o /api/chat se falhar)
    db.salvarMensagem({ papel: 'humano', conteudo: message })
      .catch(e => console.warn(`  [persistencia] erro salvando mensagem humano: ${e.message}`));

    // Monta prompt com historico (ultimas 20 mensagens)
    const recent = threads[thread_id].slice(-20);
    let prompt;
    if (recent.length === 1) {
      prompt = message;
    } else {
      const historico = recent.slice(0, -1)
        .map(m => `${m.role === 'user' ? 'Usuario' : 'Assistente'}: ${m.content}`)
        .join('\n\n');
      prompt = `--- HISTORICO ---\n${historico}\n--- FIM DO HISTORICO ---\n\nUsuario: ${message}`;
    }

    console.log(`[${new Date().toISOString()}] thread=${thread_id} pergunta: ${message.slice(0, 80)}${plan_id ? ` (plan_id=${plan_id})` : ''}`);

    // ============================================================
    // ATALHO HONESTO V2.5 Commit 3 (hotfix) — squad nao populada
    // Pedido como "monta uma estrategia de trafego pago pra Lyra" cai aqui:
    // detectarSquad retorna 'advisory-board'/'design'/'storytelling' (nao
    // implementadas), mas ehPedidoCriativoGrande retorna FALSE (regex so
    // casa copy/pagina/VSL/etc). Antes do hotfix, pedido caia no CLI normal
    // e o Atendente gastava 2-3 min consultando Cerebro tentando ajudar.
    // Agora: se a mensagem tem verbo de criacao + squad nao populada,
    // responde rapido e honesto. Sem chamar CLI.
    // Commit 4 substitui isso pelo pipelineCriativo multi-squad.
    // ============================================================
    const verboDeCriacao = /\b(monta|cria|escreve|gera|faz|desenvolve|elabora|produz|me d[aá]|planeja|estrutura)\b/i.test(message);
    const squadDetectada = detectarSquad(message);
    if (verboDeCriacao && !ehPedidoCriativoGrande(message) && !SQUADS_POPULADAS.has(squadDetectada)) {
      const dur = ((Date.now() - t0) / 1000).toFixed(1);
      const respostaHonesta = `Reconheci o pedido como **squad ${squadDetectada}** — ainda não populada no sistema.\n\nHoje só a squad **copy** tem mestres prontos pra entregar trabalho criativo (Halbert, Schwartz, Bencivenga, Hormozi, Kennedy, Carlton, Brunson, Benson). Quando você precisar de copy, página de venda, headline, oferta, VSL, anúncio — tô aqui.\n\nPra **${squadDetectada}** (esse tipo de pedido), o roadmap está em fila — pendente popular mestres no banco.`;
      threads[thread_id].push({ role: 'assistant', content: respostaHonesta });
      db.salvarMensagem({ papel: 'chief', conteudo: respostaHonesta })
        .catch(e => console.warn(`  [persistencia] erro salvando atalho honesto: ${e.message}`));
      console.log(`  -> atalho honesto (squad ${squadDetectada} nao populada): ${dur}s`);
      return res.json({
        thread_id,
        content: respostaHonesta,
        duracao_s: parseFloat(dur),
        epp: { verifier_aprovou: null, verifier_pulado: true, reflection_round: 0, problemas_encontrados: [] },
        squad_destino: squadDetectada,
        squad_disponivel: false,
      });
    }

    // ============================================================
    // V2.11 — Pedido de EDICAO/V2 do entregavel anterior
    // Detector ehPedidoEdicao casa "muda X", "refaz Y", "quero v2", "ajusta Z".
    // Busca ultimo entregavel do cliente, monta briefing com V1 + instrucao
    // de mudanca, re-roda pipeline criativo. Resultado vira V2 com
    // parent_id = V1.id (versionamento built-in da tabela pinguim.entregaveis).
    // ============================================================
    if (ehPedidoEdicao(message)) {
      const ultimo = await db.ultimoEntregavelDoCliente({}).catch(() => null);
      if (ultimo) {
        console.log(`  [V2.11] pedido de edicao detectado — base: V${ultimo.versao} (${ultimo.id})`);
        const v_anterior = await db.carregarEntregavelPorId(ultimo.id);
        if (v_anterior) {
          // Constroi mensagem combinada para o pipeline criativo entender:
          // contexto = V_anterior + instrucao de mudanca
          const messageEdicao = `${v_anterior.titulo || 'Pedido anterior'}\n\n${message}\n\n--- VERSAO ANTERIOR (V${v_anterior.versao}) ---\n${v_anterior.conteudo_md}\n--- FIM VERSAO ANTERIOR ---\n\nINSTRUCAO DO USUARIO: ${message}\n\nGere uma NOVA VERSAO incorporando a instrucao acima. Mantenha o que estava bom, ajuste o que foi pedido. NAO refaca tudo do zero — preserve estrutura e voz da versao anterior.`;

          const log = (msg) => console.log(`  [orquestrador-edicao] ${msg}`);
          const resultadoPipe = await pipelineCriativo({ message: messageEdicao, log });
          let respostaPipe = resultadoPipe.conteudo;

          // V2.6 — Reviewer pos-pipeline (portugues + clareza + tabela)
          const revisao = await revisarConsolidado(respostaPipe, {
            squad: resultadoPipe.metricas.squad,
            pedido: message,
          });
          if (revisao.aplicado) {
            console.log(`  [reviewer-edicao] aplicou ${revisao.problemas.length} correcoes em ${revisao.latencia_ms}ms`);
            respostaPipe = revisao.output_final;
          } else {
            console.log(`  [reviewer-edicao] ${revisao.motivo} (${revisao.latencia_ms}ms)`);
          }

          threads[thread_id].push({ role: 'assistant', content: respostaPipe });
          db.salvarMensagem({ papel: 'chief', conteudo: respostaPipe })
            .catch(e => console.warn(`  [persistencia] erro: ${e.message}`));

          const dur = ((Date.now() - t0) / 1000).toFixed(1);

          // Salva V2 no banco com parent_id = V1.id
          let entregavel_url = null;
          let entregavel_preview = null;
          let nova_versao = null;
          if (resultadoPipe.ok && respostaPipe.length >= ENTREGAVEL_MIN_CHARS) {
            try {
              const novo = await db.salvarEntregavel({
                tipo: v_anterior.tipo, // mesma tipologia
                titulo: v_anterior.titulo, // mesmo titulo (eh a mesma "peca")
                conteudo_md: respostaPipe,
                conteudo_estruturado: { metricas: resultadoPipe.metricas, pedido_edicao: message },
                parent_id: v_anterior.id,
              });
              if (novo) {
                entregavel_url = `/entregavel/${novo.id}`;
                nova_versao = novo.versao;
                console.log(`  -> V${novo.versao} salva (id=${novo.id}, parent=${v_anterior.id})`);
              }
            } catch (e) {
              console.warn(`  [persistencia] erro salvando V${v_anterior.versao + 1}: ${e.message}`);
            }
            const headerEnd = respostaPipe.indexOf('---');
            const blocosTxt = headerEnd > -1 ? respostaPipe.slice(headerEnd + 3) : respostaPipe;
            entregavel_preview = blocosTxt.replace(/^#+\s.*$/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 200);
          }

          return res.json({
            thread_id,
            content: respostaPipe,
            duracao_s: parseFloat(dur),
            epp: { verifier_aprovou: null, verifier_pulado: true, reflection_round: 0, problemas_encontrados: [] },
            pipeline: resultadoPipe.metricas,
            entregavel_url,
            entregavel_preview,
            edicao: {
              eh_edicao: true,
              parent_id: v_anterior.id,
              parent_versao: v_anterior.versao,
              nova_versao,
            },
          });
        }
      } else {
        console.log(`  [V2.11] pedido parecia edicao mas nao ha entregavel anterior — segue como pedido novo`);
      }
    }

    // ============================================================
    // DESVIO — Pedido criativo grande pula CLI e vai pro orquestrador Node
    // V2.5 Commit 3: se vier plan_id valido no body, usa plano cacheado
    // (frontend ja chamou /api/pipeline-plan e mostrou animacao).
    // V2.7+V2.11: persiste entregavel em pinguim.entregaveis (V1, parent_id=null).
    // ============================================================
    if (ehPedidoCriativoGrande(message)) {
      const log = (msg) => console.log(`  [orquestrador] ${msg}`);
      let resultadoPipe;
      if (plan_id) {
        const plano = recuperarPlano(plan_id);
        if (plano) {
          console.log(`  [orquestrador] plano ${plan_id} recuperado do cache — pulando consulta de fontes`);
          resultadoPipe = await executarMestres({ plano, log });
        } else {
          console.log(`  [orquestrador] plano ${plan_id} expirou ou nao existe — refazendo do zero`);
          resultadoPipe = await pipelineCriativo({ message, log });
        }
      } else {
        console.log(`  [orquestrador] pedido criativo detectado — pulando CLI direto`);
        resultadoPipe = await pipelineCriativo({ message, log });
      }

      let respostaPipe = resultadoPipe.conteudo;

      // V2.6 — Reviewer pos-pipeline (portugues + clareza + tabela)
      // Roda DEPOIS dos mestres consolidarem, ANTES de salvar/responder.
      // Pula se conteudo curto (<1500 chars) ou se reviewer falha.
      const revisao = await revisarConsolidado(respostaPipe, {
        squad: resultadoPipe.metricas.squad,
        pedido: message,
      });
      if (revisao.aplicado) {
        console.log(`  [reviewer] aplicou ${revisao.problemas.length} correcoes em ${revisao.latencia_ms}ms — problemas: ${revisao.problemas.slice(0,2).join('; ')}`);
        respostaPipe = revisao.output_final;
      } else {
        console.log(`  [reviewer] ${revisao.motivo} (${revisao.latencia_ms}ms)`);
      }

      threads[thread_id].push({ role: 'assistant', content: respostaPipe });
      db.salvarMensagem({ papel: 'chief', conteudo: respostaPipe })
        .catch(e => console.warn(`  [persistencia] erro: ${e.message}`));

      const dur = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  -> pipeline criativo finalizou em ${dur}s | mestres: ${resultadoPipe.metricas.mestres_sucesso}/${resultadoPipe.metricas.mestres_sucesso + resultadoPipe.metricas.mestres_falha} | tempo paralelo: ${resultadoPipe.metricas.mestres_paralelo_s}s | reviewer: ${revisao.motivo}`);

      // ============================================================
      // V2.10 + V2.7 — Entregavel grande persiste em banco + URL estavel.
      // Antes (V2.10): cache RAM com plan_id efemero (TTL 60min).
      // Agora (V2.7): pinguim.entregaveis (UUID estavel, dura sempre).
      // ============================================================
      let entregavel_url = null;
      let entregavel_preview = null;
      let entregavel_id = null;
      if (resultadoPipe.ok && respostaPipe.length >= ENTREGAVEL_MIN_CHARS) {
        try {
          const tipoEntregavel = resultadoPipe.metricas.squad
            ? `${resultadoPipe.metricas.squad}-output`
            : 'criativo';
          const novo = await db.salvarEntregavel({
            tipo: tipoEntregavel,
            titulo: message.slice(0, 200),
            conteudo_md: respostaPipe,
            conteudo_estruturado: { metricas: resultadoPipe.metricas, pedido_original: message },
          });
          if (novo) {
            entregavel_id = novo.id;
            entregavel_url = `/entregavel/${novo.id}`;
            console.log(`  -> entregavel V1 salvo no banco (id=${novo.id})`);
          }
        } catch (e) {
          console.warn(`  [persistencia] erro salvando entregavel: ${e.message}`);
          // Fallback: cache RAM antigo (V2.10) se banco falhar
          const fallbackId = plan_id || gerarPlanId();
          guardarEntregavel(fallbackId, { markdown: respostaPipe, metricas: resultadoPipe.metricas, pedido: message, criadoEm: Date.now() });
          entregavel_url = `/entregavel/${fallbackId}`;
        }
        const headerEnd = respostaPipe.indexOf('---');
        const blocosTxt = headerEnd > -1 ? respostaPipe.slice(headerEnd + 3) : respostaPipe;
        entregavel_preview = blocosTxt.replace(/^#+\s.*$/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 200);
      }

      return res.json({
        thread_id,
        content: respostaPipe,
        duracao_s: parseFloat(dur),
        epp: {
          verifier_aprovou: null,
          verifier_pulado: true, // pipeline ja tem validacao propria
          reflection_round: 0,
          problemas_encontrados: revisao.problemas || [],
        },
        pipeline: resultadoPipe.metricas,
        reviewer: { // V2.6 — info do revisor pos-pipeline
          aplicado: revisao.aplicado,
          motivo: revisao.motivo,
          problemas: revisao.problemas || [],
          latencia_ms: revisao.latencia_ms,
        },
        entregavel_url,
        entregavel_preview,
        entregavel_id, // V2.7 — UUID estavel, vivel daqui 10/15 dias
      });
    }

    // ============================================================
    // EPP — Camadas 1 + 2 (Verifier + Reflection) — caminho normal
    // ============================================================
    const ctx = detectarPapelEContexto(message);
    let resposta = await runClaudeCLI(prompt);
    const t_resposta_1 = Date.now() - t0;
    console.log(`  primeira resposta em ${(t_resposta_1/1000).toFixed(1)}s, ${resposta.length} chars`);

    let verifier = null;
    let reflection_round = 0;
    const verifier_problemas = [];

    if (!ctx.pular_verifier) {
      // Camada 1 — Self-Verification
      verifier = await verificarOutput({
        briefing: message,
        output_md: resposta,
        agente_slug: 'pinguim',
        agente_role: ctx.papel,
        expectativa: ctx.expectativa,
      });

      console.log(`  verifier: ${verifier.aprovado ? 'APROVOU' : 'REPROVOU'} em ${(verifier.latencia_ms/1000).toFixed(1)}s${verifier.problemas.length ? ` — problemas: ${verifier.problemas.length}` : ''}`);

      if (!verifier.aprovado && verifier.recomendacao_refazer) {
        verifier_problemas.push(...verifier.problemas);
        // Camada 2 — Reflection (1 vez, com guardrails)
        const tDec = Date.now() - t0;
        if (tDec < EPP_LIMITS.MAX_LATENCIA_MS_TURNO) {
          reflection_round = 1;
          const promptRefazer = `${prompt}\n\n---\n\n[NOTA DO VERIFIER]\nVoce respondeu acima, mas o Verifier identificou problemas:\n${verifier.problemas.map(p => `- ${p}`).join('\n')}\n\nRecomendacao: ${verifier.recomendacao_refazer}\n\nRefaca a resposta corrigindo os problemas listados. Mantenha o que estava certo, ajuste so o que o Verifier apontou.`;

          console.log(`  iniciando reflection round 1...`);
          const respostaRefeita = await runClaudeCLI(promptRefazer);

          // Anti-loop: se output igual ao primeiro, mantem o primeiro
          const sim = similaridadeOutputs(resposta, respostaRefeita);
          if (sim > EPP_LIMITS.MAX_IDENTICAL_SIMILARITY) {
            console.log(`  reflection produziu output similar (${sim.toFixed(2)}) — mantendo primeira resposta`);
          } else {
            resposta = respostaRefeita;
            console.log(`  reflection ok: similarity ${sim.toFixed(2)}, novo output ${resposta.length} chars`);
          }
        } else {
          console.log(`  reflection pulada — proximo do timeout`);
        }
      }
    }

    threads[thread_id].push({ role: 'assistant', content: resposta });
    db.salvarMensagem({ papel: 'chief', conteudo: resposta })
      .catch(e => console.warn(`  [persistencia] erro: ${e.message}`));

    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  -> resposta final em ${dur}s, ${resposta.length} chars (reflection_round=${reflection_round})`);

    res.json({
      thread_id,
      content: resposta,
      duracao_s: parseFloat(dur),
      epp: {
        verifier_aprovou: verifier ? verifier.aprovado : null,
        verifier_pulado: ctx.pular_verifier,
        reflection_round,
        problemas_encontrados: verifier_problemas,
      },
    });
  } catch (err) {
    console.error('Erro:', err);
    res.status(500).json({
      error: err.message || String(err),
      hint: 'Verifique se rodou `claude login` e se a CLI esta no PATH (`which claude`)',
    });
  }
});

// ============================================================
// GET /api/health — verifica se claude CLI esta disponivel
// ============================================================
app.get('/api/health', async (req, res) => {
  try {
    const out = await runClaudeCLI('Responda apenas: OK', { timeout: 30000 });
    res.json({ status: 'ok', cli_responde: out.includes('OK'), output: out.slice(0, 100) });
  } catch (err) {
    res.status(500).json({ status: 'erro', detalhe: err.message });
  }
});

// ============================================================
// GET /entregavel/:id  —  V2.10 + V2.7
// Renderiza entregavel grande como HTML standalone.
// V2.7: aceita UUID e busca em pinguim.entregaveis (durável).
// V2.10 fallback: cache RAM (plan_id) se UUID nao bater no banco.
// V2.11: cadeia de versoes (parent_id) eh exibida no header pra navegacao V1<->V2.
// ============================================================
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.get('/entregavel/:id', async (req, res) => {
  const id = req.params.id;

  // 1) Tenta banco se for UUID valido
  if (UUID_RE.test(id)) {
    try {
      const ent = await db.carregarEntregavelPorId(id);
      if (ent) {
        // V2.11 — busca cadeia de versoes pra navegacao V1<->V2 no template
        const cadeia = await db.carregarCadeiaVersoes(id).catch(() => []);
        const metricas = (ent.conteudo_estruturado && ent.conteudo_estruturado.metricas) || {};
        const pedidoOriginal = (ent.conteudo_estruturado && ent.conteudo_estruturado.pedido_original) || ent.titulo || 'Entregável';
        const html = renderEntregavel({
          markdown: ent.conteudo_md,
          metricas,
          criadoEm: new Date(ent.criado_em).getTime(),
          pedido: pedidoOriginal,
          versionamento: {
            entregavel_id: ent.id,
            versao_atual: ent.versao,
            parent_id: ent.parent_id,
            cadeia: cadeia.map(c => ({ id: c.id, versao: c.versao, criado_em: c.criado_em })),
          },
        });
        res.type('html').send(html);
        return;
      }
    } catch (e) {
      console.warn(`[entregavel] erro ao buscar UUID ${id}:`, e.message);
    }
  }

  // 2) Fallback: cache RAM (plan_id efêmero do V2.10)
  const entry = recuperarEntregavel(id);
  if (entry) {
    const html = renderEntregavel({
      markdown: entry.markdown,
      metricas: entry.metricas,
      criadoEm: entry.criadoEm,
      pedido: entry.pedido,
    });
    res.type('html').send(html);
    return;
  }

  // 3) 404 estilizado
  res.status(404)
    .type('html')
    .send(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Entregável não encontrado</title>
<style>body{background:#0a0a0f;color:#f1f5f9;font-family:system-ui,sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:2rem}
h1{font-size:1.5rem;margin-bottom:.5rem}p{color:#94a3b8;max-width:500px}
a{color:#E85C00}</style></head>
<body><div>
<h1>🐧 Entregável não encontrado</h1>
<p>ID inválido ou entregável removido.<br>
Volta pro <a href="/">chat</a> e refaz o pedido.</p>
</div></body></html>`);
});

// ============================================================
// GET /api/entregaveis  —  V2.7
// Lista entregaveis recentes do cliente. Usado por painel + cartao chat.
// ============================================================
app.get('/api/entregaveis', async (req, res) => {
  try {
    const limite = parseInt(req.query.limite || '20', 10);
    const lista = await db.listarEntregaveisRecentes({ limite });
    res.json({ entregaveis: lista });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// V2.12 Fase 0 — OAuth Google (Drive + Calendar read-only)
// Tres rotas:
//   GET /conectar-google           — pagina HTML de status + botao
//   GET /oauth/google/start        — redirect pro Google authorize
//   GET /oauth/google/callback     — recebe code, troca por tokens, grava cofre
// ============================================================

const OAUTH_REDIRECT_URI = `http://localhost:${PORT}/oauth/google/callback`;

app.get('/conectar-google', async (req, res) => {
  // Verifica estado: refresh_token ja existe pra esse socio?
  let conectado = false;
  let escopo = null;
  let observacoes = null;
  try {
    const sql = `SELECT escopo, observacoes, ativo, ultima_rotacao FROM pinguim.cofre_chaves WHERE nome='GOOGLE_OAUTH_REFRESH' AND cliente_id='${db.CLIENTE_ID_PADRAO}'::uuid LIMIT 1;`;
    const r = await db.rodarSQL(sql);
    if (Array.isArray(r) && r[0] && r[0].ativo) {
      conectado = true;
      escopo = r[0].escopo;
      observacoes = r[0].observacoes;
    }
  } catch (e) {
    console.warn('  [oauth] erro consultando estado:', e.message);
  }

  // HTML simples — paleta dark Vercel + laranja Pinguim (nao usa template-html que e pra entregaveis)
  res.type('html').send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Conectar Google — Pinguim 🐧</title>
<style>
  body{background:#0a0a0f;color:#f1f5f9;font-family:'Inter',-apple-system,sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:2rem;line-height:1.6}
  .card{background:#111118;border:1px solid #2a2a3e;border-radius:12px;padding:2.5rem;max-width:560px;width:100%}
  h1{font-size:1.4rem;margin:0 0 .5rem;font-weight:700}
  h1 span{color:#E85C00}
  .status{display:inline-flex;align-items:center;gap:.5rem;padding:.4rem .85rem;border-radius:999px;font-size:.8rem;font-weight:600;margin-bottom:1.5rem}
  .status.on{background:rgba(16,185,129,.12);color:#10b981;border:1px solid rgba(16,185,129,.3)}
  .status.off{background:rgba(148,163,184,.1);color:#94a3b8;border:1px solid rgba(148,163,184,.25)}
  p{color:#94a3b8;font-size:.95rem;margin:.75rem 0}
  ul{color:#94a3b8;font-size:.9rem;margin:.5rem 0 1.5rem 1.5rem}
  ul li{margin:.35rem 0}
  code{background:#1a1a28;padding:.15rem .4rem;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:.85em;color:#f1f5f9}
  .btn{display:inline-block;background:#E85C00;color:white;padding:.85rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:600;font-size:.95rem;border:none;cursor:pointer;transition:opacity .15s}
  .btn:hover{opacity:.9}
  .btn-link{background:transparent;color:#94a3b8;border:1px solid #2a2a3e;margin-left:.5rem}
  .btn-link:hover{color:#E85C00;border-color:#E85C00;opacity:1}
  .info-box{background:#1a1a28;border:1px solid #2a2a3e;border-radius:8px;padding:1rem;margin:1rem 0;font-size:.85rem;color:#94a3b8}
  .info-box strong{color:#f1f5f9}
</style></head><body><div class="card">
  <h1>🐧 Pinguim <span>OS</span> — Conectar Google</h1>
  ${conectado
    ? `<div class="status on">● Conectado</div>
       <p>Sua conta Google está conectada ao Pinguim OS.</p>
       <div class="info-box">
         <strong>Escopo concedido:</strong> ${escopo || 'desconhecido'}<br>
         ${observacoes ? observacoes.replace(/</g,'&lt;') : ''}
       </div>
       <p>Pra revogar, vá em <a href="https://myaccount.google.com/permissions" style="color:#E85C00">myaccount.google.com/permissions</a> e remova "Pinguim OS".</p>
       <a class="btn" href="/oauth/google/start">Reconectar / trocar escopo</a>
       <a class="btn btn-link" href="/">Voltar pro chat</a>`
    : `<div class="status off">○ Não conectado</div>
       <p>Conecte sua conta Google pra que o Atendente Pinguim possa:</p>
       <ul>
         <li>🔍 Buscar arquivos no seu Google Drive (read-only)</li>
         <li>📅 Ler eventos da sua agenda Google Calendar (read-only)</li>
       </ul>
       <p style="font-size:.85em">Tudo read-only por enquanto. Edição e criação de eventos virão em fases futuras com confirmação explícita.</p>
       <div class="info-box">
         <strong>Pré-requisito:</strong> as chaves <code>GOOGLE_OAUTH_CLIENT_ID</code> e <code>GOOGLE_OAUTH_CLIENT_SECRET</code> precisam estar cadastradas no cofre.
         Ver instruções em <code>docs/setup-oauth-google.md</code>.
       </div>
       <a class="btn" href="/oauth/google/start">Conectar Google</a>
       <a class="btn btn-link" href="/">Voltar pro chat</a>`}
</div></body></html>`);
});

app.get('/oauth/google/start', async (req, res) => {
  try {
    const client_id = await db.lerChaveSistema('GOOGLE_OAUTH_CLIENT_ID', 'oauth-start');
    if (!client_id) {
      return res.status(500).type('html').send(`<h1>Erro</h1><p>GOOGLE_OAUTH_CLIENT_ID nao cadastrado no cofre. Ver <code>docs/setup-oauth-google.md</code>.</p><a href="/conectar-google">Voltar</a>`);
    }
    const url = oauthGoogle.montarUrlAutorizacao({
      client_id,
      redirect_uri: OAUTH_REDIRECT_URI,
      state: 'pinguim-' + Date.now(),
    });
    console.log('[oauth] redirecionando pra Google authorize');
    res.redirect(url);
  } catch (e) {
    res.status(500).type('html').send(`<h1>Erro OAuth</h1><pre>${e.message}</pre><a href="/conectar-google">Voltar</a>`);
  }
});

// ============================================================
// V2.12 Fase 1 — POST /api/drive/buscar
// Body: { query, cliente_id?, pageSize? }
// Resposta: { arquivos: [...], total_retornado, proxima_pagina }
// Atendente Pinguim chama via bash scripts/buscar-drive.sh "<query>".
// ============================================================
app.post('/api/drive/buscar', async (req, res) => {
  try {
    const { query, cliente_id, pageSize = 10 } = req.body || {};
    if (!query || !query.trim()) {
      return res.status(400).json({ ok: false, error: 'query obrigatoria' });
    }
    const t0 = Date.now();
    const r = await googleDrive.buscarArquivos({ query, cliente_id, pageSize });
    const dur_ms = Date.now() - t0;
    console.log(`[drive-buscar] ${dur_ms}ms | query="${query.slice(0, 60)}" | retornou=${r.total_retornado}`);
    res.json({ ok: true, ...r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[drive-buscar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.12 Fase 2 — POST /api/drive/ler
// Body: { fileId, cliente_id?, tipo?: 'auto'|'doc'|'planilha'|'pdf'|'texto', aba?, range?, limite_linhas? }
// Resposta varia por tipo:
//   doc/texto: { texto, tamanho_chars }
//   planilha:  { abas, aba_lida, valores [[...]], total_linhas, truncado }
//   pdf:       { base64, tamanho_bytes }
// ============================================================
app.post('/api/drive/ler', async (req, res) => {
  try {
    const { fileId, cliente_id, tipo = 'auto', aba, range, limite_linhas } = req.body || {};
    if (!fileId) {
      return res.status(400).json({ ok: false, error: 'fileId obrigatorio' });
    }
    const t0 = Date.now();
    let r;
    switch (tipo) {
      case 'auto':     r = await googleDriveContent.lerAuto({ fileId, cliente_id, aba, range, limite_linhas }); break;
      case 'doc':      r = await googleDriveContent.lerDoc({ fileId, cliente_id }); break;
      case 'planilha': r = await googleDriveContent.lerPlanilha({ fileId, cliente_id, aba, range, limite_linhas }); break;
      case 'pdf':      r = await googleDriveContent.lerPdf({ fileId, cliente_id }); break;
      case 'texto':    r = await googleDriveContent.lerTextoSimples({ fileId, cliente_id }); break;
      case 'abas':     r = { abas: await googleDriveContent.listarAbas({ fileId, cliente_id }) }; break;
      default:         return res.status(400).json({ ok: false, error: `tipo invalido: ${tipo}` });
    }
    const dur_ms = Date.now() - t0;
    console.log(`[drive-ler] ${dur_ms}ms | fileId=${fileId.slice(0, 12)} | tipo=${tipo} | nome="${(r.nome || '').slice(0, 40)}"`);
    res.json({ ok: true, ...r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[drive-ler] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.12 Fase 4 — POST /api/drive/editar
// Body: { fileId, cliente_id?, operacao: 'celula'|'range'|'append', aba?, ...args }
//   operacao=celula:  { celula: 'B7', valor: 'novo' }
//   operacao=range:   { range: 'A1:C3', valores: [[...]] }
//   operacao=append:  { valores: [[...]] }
//
// IMPORTANTE: confirmacao humana e responsabilidade de QUEM CHAMA (Atendente
// Pinguim mostra plano + pede 'sim/nao' antes de bater aqui). Esta camada
// nao tem trava — so executa.
// ============================================================
app.post('/api/drive/editar', async (req, res) => {
  try {
    const { fileId, cliente_id, operacao, aba, celula, range, valor, valores } = req.body || {};
    if (!fileId) {
      return res.status(400).json({ ok: false, error: 'fileId obrigatorio' });
    }
    if (!operacao) {
      return res.status(400).json({ ok: false, error: 'operacao obrigatoria (celula|range|append)' });
    }
    const t0 = Date.now();
    let r;
    switch (operacao) {
      case 'celula':
        if (!celula) return res.status(400).json({ ok: false, error: 'celula obrigatoria' });
        if (valor === undefined) return res.status(400).json({ ok: false, error: 'valor obrigatorio' });
        r = await googleDriveContent.editarCelula({ fileId, cliente_id, aba, celula, valor });
        break;
      case 'range':
        if (!range) return res.status(400).json({ ok: false, error: 'range obrigatorio' });
        if (!Array.isArray(valores)) return res.status(400).json({ ok: false, error: 'valores deve ser matriz [[]]' });
        r = await googleDriveContent.editarRange({ fileId, cliente_id, aba, range, valores });
        break;
      case 'append':
        if (!Array.isArray(valores)) return res.status(400).json({ ok: false, error: 'valores deve ser matriz [[]]' });
        r = await googleDriveContent.adicionarLinha({ fileId, cliente_id, aba, valores });
        break;
      default:
        return res.status(400).json({ ok: false, error: `operacao invalida: ${operacao}` });
    }
    const dur_ms = Date.now() - t0;
    console.log(`[drive-editar] ${dur_ms}ms | fileId=${fileId.slice(0, 12)} | op=${operacao} | nome="${(r.nome || '').slice(0, 40)}"`);
    res.json({ ok: true, ...r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[drive-editar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/oauth/google/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).type('html').send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>OAuth erro</title>
<style>body{background:#0a0a0f;color:#f1f5f9;font-family:sans-serif;padding:3rem;text-align:center}h1{color:#ef4444}a{color:#E85C00}</style></head>
<body><h1>OAuth erro</h1><p><strong>${error}</strong></p><p>${error_description || ''}</p><a href="/conectar-google">Voltar</a></body></html>`);
  }
  if (!code) {
    return res.status(400).type('html').send(`<h1>Faltou ?code na URL</h1><a href="/conectar-google">Voltar</a>`);
  }

  try {
    const [client_id, client_secret] = await Promise.all([
      db.lerChaveSistema('GOOGLE_OAUTH_CLIENT_ID', 'oauth-callback'),
      db.lerChaveSistema('GOOGLE_OAUTH_CLIENT_SECRET', 'oauth-callback'),
    ]);
    if (!client_id || !client_secret) {
      throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET nao cadastrados no cofre.');
    }

    const tokens = await oauthGoogle.trocarCodePorTokens({
      code: String(code),
      client_id,
      client_secret,
      redirect_uri: OAUTH_REDIRECT_URI,
    });

    await db.salvarRefreshTokenOAuth({
      refresh_token: tokens.refresh_token,
      escopo: tokens.scope,
      observacoes: `Concedido em ${new Date().toISOString()}. Access_token expirava em ${tokens.expires_in}s.`,
    });

    // Limpa cache de access_token (proxima chamada renova com refresh novo)
    oauthGoogle.invalidarCacheAccessToken();

    console.log(`[oauth] refresh_token gravado no cofre (escopo: ${tokens.scope})`);

    res.type('html').send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>OAuth ok</title>
<style>body{background:#0a0a0f;color:#f1f5f9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:2rem}
.card{background:#111118;border:1px solid #2a2a3e;border-radius:12px;padding:2.5rem;text-align:center;max-width:480px}
h1{color:#10b981;margin:0 0 .75rem}p{color:#94a3b8;margin:.75rem 0}
.btn{display:inline-block;background:#E85C00;color:white;padding:.85rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:600;margin-top:1rem}
code{background:#1a1a28;padding:.1rem .35rem;border-radius:3px;font-size:.85em}</style></head>
<body><div class="card"><h1>✓ Conectado</h1>
<p>Sua conta Google está conectada ao Pinguim OS.</p>
<p style="font-size:.85em">Escopo: <code>${(tokens.scope || '').replace(/</g,'&lt;')}</code></p>
<a class="btn" href="/conectar-google">Ver status</a>
<a href="/" style="color:#94a3b8;margin-left:1rem">Ir pro chat</a>
</div></body></html>`);
  } catch (e) {
    console.error('[oauth-callback] erro:', e.message);
    res.status(500).type('html').send(`<h1>Erro ao trocar code por tokens</h1><pre style="background:#1a1a28;padding:1rem;border-radius:8px">${e.message}</pre><a href="/conectar-google">Voltar</a>`);
  }
});

// ============================================================
// GET / — pagina HTML do chat
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// GET /api/info — info do agente (skills disponiveis, etc)
// ============================================================
app.get('/api/info', (req, res) => {
  const skillsDir = path.join(__dirname, '.claude', 'skills');
  let skills = [];
  try {
    skills = fs.readdirSync(skillsDir).filter(d =>
      fs.statSync(path.join(skillsDir, d)).isDirectory()
    );
  } catch (e) {}

  const scriptsDir = path.join(__dirname, 'scripts');
  let scripts = [];
  try {
    scripts = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.sh'));
  } catch (e) {}

  res.json({
    agente: 'Atendente Pinguim',
    runtime: 'claude CLI local (Max)',
    porta: PORT,
    cwd: PROJECT_DIR,
    skills_disponiveis: skills.length,
    skills: skills,
    scripts: scripts,
    threads_ativas: Object.keys(threads).length,
  });
});

app.listen(PORT, () => {
  console.log('============================================================');
  console.log('  Atendente Pinguim — runtime CLI local');
  console.log('============================================================');
  console.log(`  Porta:   ${PORT}`);
  console.log(`  Chat:    http://localhost:${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/api/health`);
  console.log(`  Info:    http://localhost:${PORT}/api/info`);
  console.log(`  cwd:     ${PROJECT_DIR}`);
  console.log('============================================================');
  console.log('Pre-requisito: rodar `claude login` 1 vez na maquina.');
  console.log('Ctrl+C pra parar.');
});
