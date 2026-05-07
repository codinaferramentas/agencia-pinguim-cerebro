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
// POST /api/chat
// body: { message, thread_id }
// ============================================================
app.post('/api/chat', async (req, res) => {
  const t0 = Date.now();
  try {
    const { message, thread_id = 'default' } = req.body || {};

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

    console.log(`[${new Date().toISOString()}] thread=${thread_id} pergunta: ${message.slice(0, 80)}`);

    // ============================================================
    // DESVIO — Pedido criativo grande pula CLI e vai pro orquestrador Node
    // (delegacao real em paralelo, sem bash aninhado).
    // ============================================================
    if (ehPedidoCriativoGrande(message)) {
      console.log(`  [orquestrador] pedido criativo detectado — pulando CLI direto`);
      const log = (msg) => console.log(`  [orquestrador] ${msg}`);
      const resultadoPipe = await pipelineCriativo({ message, log });

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
