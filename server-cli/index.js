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

const app = express();
const PORT = 3737;
const PROJECT_DIR = __dirname;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Threads em memoria — V1. V2 vai pra banco.
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

    const proc = spawn('claude', args, {
      cwd: PROJECT_DIR,
      env: {
        ...process.env,
        // CRITICO: evita erro "cannot launch inside another Claude Code session"
        CLAUDECODE: '',
        CLAUDE_CODE_ENTRYPOINT: '',
      },
      shell: true, // Windows precisa shell:true pra encontrar o claude no PATH
      timeout: opts.timeout || 240_000,
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

    const resposta = await runClaudeCLI(prompt);

    threads[thread_id].push({ role: 'assistant', content: resposta });

    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  -> resposta em ${dur}s, ${resposta.length} chars`);

    res.json({
      thread_id,
      content: resposta,
      duracao_s: parseFloat(dur),
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
