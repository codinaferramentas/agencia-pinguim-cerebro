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
  pipelineCriativo,
  planejarPipeline,
  executarMestres,
  detectarSquad,
  detectarProduto,
} = require('./lib/orquestrador');

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
      timeout: opts.timeout || 480_000, // 8 min — entregavel longo (Chief + 4 mestres) leva tempo
    });

    let stdout = '';
    let stderr = '';

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`claude CLI exit ${code}: ${stderr.slice(-2000)}`));
      }
    });

    proc.on('error', (err) => {
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
// V2.5 Commit 4 prep: hoje so 'copy' tem mestres populados. Lista exposta aqui
// pra o detector saber se a squad detectada esta disponivel sem precisar
// consultar banco a cada turno. Quando popular nova squad, adicionar slug aqui
// (e Commit 4 vai virar tabela em pinguim.squads).
const SQUADS_POPULADAS = new Set(['copy']);

app.post('/api/detectar-tipo', (req, res) => {
  const { message } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message obrigatorio' });
  }

  const ehCriativo = ehPedidoCriativoGrande(message);
  const ctx = detectarPapelEContexto(message);
  const squad_destino = detectarSquad(message);
  const produto_slug = detectarProduto(message);
  const squad_disponivel = SQUADS_POPULADAS.has(squad_destino);

  let subcategoria;
  if (ctx.pular_verifier) subcategoria = 'saudacao';
  else if (ehCriativo) subcategoria = 'criativo-grande';
  else if (/^(quem (e |voce )|o que (e |voce )|qual seu|como funciona|me explica)/i.test(message)) subcategoria = 'factual';
  else if (/^(lista|atualiza|verifica)/i.test(message)) subcategoria = 'comando-admin';
  else subcategoria = 'factual'; // default conservador

  // So anima se for criativo E squad detectada esta populada — frontend evita
  // abrir Salao vazio pra "estrategia de tráfego" (squad ainda nao populada).
  const anima = ehCriativo && squad_disponivel;

  res.json({
    tipo: ehCriativo ? 'criativo' : 'normal',
    subcategoria,
    squad_destino,
    squad_disponivel,
    produto_slug,
    anima,
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

    // Inicializa thread
    if (!threads[thread_id]) threads[thread_id] = [];
    threads[thread_id].push({ role: 'user', content: message });

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
    // DESVIO — Pedido criativo grande pula CLI e vai pro orquestrador Node
    // V2.5 Commit 3: se vier plan_id valido no body, usa plano cacheado
    // (frontend ja chamou /api/pipeline-plan e mostrou animacao).
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

      const respostaPipe = resultadoPipe.conteudo;
      threads[thread_id].push({ role: 'assistant', content: respostaPipe });

      const dur = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  -> pipeline criativo finalizou em ${dur}s | mestres: ${resultadoPipe.metricas.mestres_sucesso}/${resultadoPipe.metricas.mestres_sucesso + resultadoPipe.metricas.mestres_falha} | tempo paralelo: ${resultadoPipe.metricas.mestres_paralelo_s}s`);

      return res.json({
        thread_id,
        content: respostaPipe,
        duracao_s: parseFloat(dur),
        epp: {
          verifier_aprovou: null,
          verifier_pulado: true, // pipeline ja tem validacao propria
          reflection_round: 0,
          problemas_encontrados: [],
        },
        pipeline: resultadoPipe.metricas,
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
