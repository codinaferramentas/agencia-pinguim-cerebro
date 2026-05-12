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

// V2.14 D — Handlers globais pra evitar queda silenciosa do server.
// Sem isso, qualquer Promise rejeitada não tratada derruba o processo.
// Em agente 24/7 pra sócios, isso é inaceitável.
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL?] unhandledRejection:', reason && reason.stack || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL?] uncaughtException:', err && err.stack || err);
  // NÃO sai — apenas loga.
});
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
const googleGmail = require('./lib/google-gmail'); // V2.13 — listar/ler/responder/modificar Gmail
const googleCalendar = require('./lib/google-calendar'); // V2.14 Fase 1.7 — leitura Calendar (squad data)
const contextoTemporal = require('./lib/contexto-temporal'); // V2.14 Fase 1.7 hotfix — bloco de data BRT no prompt (evita LLM chutar dia da semana)
const contextoRico = require('./lib/contexto-rico'); // V2.14 D Refator V3 — bloco unificado (temporal + identidade + histórico + entregáveis + drive)
const discordBot = require('./lib/discord-bot'); // V2.14 Frente B — bot Discord (Gateway WebSocket, ingest tempo real)
const relatorioExecutivo = require('./lib/relatorio-executivo'); // V2.14 Frente C1 — orquestrador relatorio executivo diario
const templateRelatorioExec = require('./lib/template-relatorio-executivo'); // V2.14 Frente C1 — template HTML dedicado
const evolution = require('./lib/evolution'); // V2.14 Frente D — WhatsApp Evolution

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3737;
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

// V2.14 D Fix 2026-05-11 — Set global de canais Discord com turno em andamento.
// Usado pra bloquear auto-postagem do agente no MESMO canal de onde veio @mention,
// evitando duplicação (agente posta + bot posta resposta final = 2 mensagens).
const turnoDiscordEmAndamento = new Set();

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
    // V2.13 — se opts.onChunk veio, usa --output-format stream-json
    // + --include-partial-messages pra streaming real (CLI emite NDJSON
    // com mensagens incrementais). Sem onChunk, mantém output 'text'
    // (mais leve, sem parser).
    const wantStream = typeof opts.onChunk === 'function';
    // V2.14 D Refator — opts.allowedTools customizável.
    // Default: 'Bash,Read,Glob,Grep' (igual antes).
    // Reflection pós-ação destrutiva passa 'Read,Glob,Grep' (sem Bash) pra
    // evitar re-disparar gmail-enviar/drive-editar etc.
    const allowedTools = opts.allowedTools || 'Bash,Read,Glob,Grep';
    const args = [
      '-p',
      '--output-format', wantStream ? 'stream-json' : 'text',
      '--allowedTools', allowedTools,
    ];
    if (wantStream) {
      args.push('--include-partial-messages', '--verbose');
    }
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
    let textoFinal = ''; // V2.13: acumulado de chunks de texto (modo stream-json)
    let bufferLine = ''; // V2.13: buffer de linha NDJSON incompleta

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;

      if (!wantStream) return; // modo texto puro, nada mais a fazer

      // V2.13 — modo stream-json: parser NDJSON.
      // Cada linha é um JSON. Procura mensagens com text delta pra emitir.
      bufferLine += chunk;
      const linhas = bufferLine.split('\n');
      bufferLine = linhas.pop(); // última pode estar incompleta

      for (const linha of linhas) {
        const t = linha.trim();
        if (!t) continue;
        let ev;
        try { ev = JSON.parse(t); } catch { continue; }
        // Pra streaming partial (--include-partial-messages), o que importa
        // são eventos de DELTA — texto incremental. Ignoramos a mensagem
        // 'assistant' final (ev.type === 'assistant') porque ela traz o
        // texto INTEIRO de novo, e somar duplica.
        let textoChunk = null;
        if (ev.event && ev.event.delta && typeof ev.event.delta.text === 'string') {
          textoChunk = ev.event.delta.text;
        } else if (ev.delta && typeof ev.delta.text === 'string') {
          textoChunk = ev.delta.text;
        } else if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content) && textoFinal.length === 0) {
          // Fallback: NUNCA recebemos delta E veio 'assistant' final
          // (CLI sem partial-messages, ou primeira vez sem stream)
          for (const bloco of ev.message.content) {
            if (bloco.type === 'text' && bloco.text) {
              textoChunk = (textoChunk || '') + bloco.text;
            }
          }
        }
        if (textoChunk) {
          textoFinal += textoChunk;
          try { opts.onChunk(textoChunk); } catch (_) {}
        }
      }
    });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      clearTimeout(killTimer);
      if (killed) {
        reject(new Error(`claude CLI KILLED apos ${(timeoutMs/1000)}s (timeout SIGKILL)`));
        return;
      }
      if (code === 0) {
        // Em modo stream-json, retorna o acumulado de chunks de texto.
        // Em modo texto puro, retorna stdout direto.
        resolve(wantStream ? (textoFinal.trim() || stdout.trim()) : stdout.trim());
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
// V2.14 Frente D Fix 1 — Banco como fonte da verdade do histórico
// ============================================================
// Anatomia canônica (project_memoria_individual_dna_agente.md):
//   "Banco é fonte da verdade. Disco/RAM são espelhos."
//
// ANTES (V2.7): hidratava RAM do banco apenas na 1ª mensagem da thread.
// Depois disso, RAM era a fonte. Quando 2 webhooks WhatsApp chegavam
// quase simultâneos, cada Promise tinha sua visão da RAM e divergia
// (Task B não via resposta da Task A ainda em andamento).
//
// AGORA: a cada turno, recarrega o histórico do banco. RAM vira só
// fallback de leitura quando banco falha. Garante que turnos paralelos
// SEMPRE veem o estado mais recente persistido.
//
// Funciona local E no V3 (multi-server) sem mudança — banco é shared.
async function carregarThreadDoBanco(thread_id, limite = 20) {
  try {
    const historico = await db.carregarHistorico({ limite });
    const mensagens = historico.map(m => ({
      role: m.papel === 'humano' ? 'user' : 'assistant',
      content: m.conteudo,
    }));
    threads[thread_id] = mensagens; // atualiza cache RAM
    return mensagens;
  } catch (e) {
    console.warn(`  [historico] falha ao recarregar do banco — usando RAM (${threads[thread_id]?.length || 0} msgs): ${e.message}`);
    return threads[thread_id] || [];
  }
}

// ============================================================
// POST /api/chat
// body: { message, thread_id, plan_id? }
// V2.5 Commit 3: plan_id opcional. Se vier e for valido, executa direto
// os mestres (pula consulta de fontes — ja foi feita no /api/pipeline-plan).
// ============================================================
app.post('/api/chat', async (req, res) => {
  const t0 = Date.now();
  const { message, thread_id = 'default', plan_id, cliente_id, contexto_extra } = req.body || {};

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message obrigatorio' });
  }

  // V2.14 D Fix 3 — Fila por thread. 2 turnos paralelos do mesmo sócio
  // (ex: WhatsApp "sim" + "enviou?" com 3s de gap) são serializados aqui.
  // Lock em banco → funciona local E V3 multi-server. Anatomia canônica.
  return db.comLockThread(thread_id, async () => processarChat({ req, res, t0, message, thread_id, plan_id, cliente_id, contexto_extra }))
    .catch(err => {
      console.error('Erro /api/chat (lock wrapper):', err);
      if (!res.headersSent) res.status(500).json({ error: err.message || String(err) });
    });
});

async function processarChat({ req, res, t0, message, thread_id, plan_id, cliente_id, contexto_extra }) {
  // V2.14 D Fix 2026-05-11 — marca canal Discord como "em andamento" pra bloquear
  // auto-postagem do agente no mesmo canal (evita duplicação com discord-bot).
  const discordCanalIdAtivo = contexto_extra?.canal === 'discord' ? contexto_extra?.discord_canal_id : null;
  if (discordCanalIdAtivo) {
    turnoDiscordEmAndamento.add(discordCanalIdAtivo);
    console.log(`  [discord-lock] canal ${discordCanalIdAtivo} marcado como ATIVO (bloqueia auto-postagem do agente)`);
  }

  try {
    // V2.14 D Fix 1 — SEMPRE recarrega histórico do banco (fonte da verdade).
    const historicoBanco = await carregarThreadDoBanco(thread_id, 20);
    console.log(`  [historico] carregadas ${historicoBanco.length} mensagens do banco pra thread ${thread_id}`);

    threads[thread_id].push({ role: 'user', content: message });

    // V2.14 D Fix 2 — Persistência SÍNCRONA antes de processar.
    try {
      await db.salvarMensagem({ papel: 'humano', conteudo: message });
    } catch (e) {
      console.warn(`  [persistencia] erro salvando mensagem humano: ${e.message}`);
    }

    // ============================================================
    // V2.14 D REFATOR V3 — Caminho único pelo LLM.
    // Removidos detectores regex pré-LLM (ehPedidoEdicao,
    // ehPedidoCriativoGrande, detectarSquad atalho honesto,
    // detectarPapelEContexto). O LLM decide a categoria sozinho com
    // contexto rico (data + identidade + histórico + entregáveis recentes
    // + drive). Quando duvida, ele PERGUNTA via texto — não há regex
    // empurrando caminho errado em silêncio.
    // ============================================================
    const canal = thread_id.startsWith('whatsapp-') ? 'whatsapp'
                : thread_id.startsWith('discord-')  ? 'discord'
                : thread_id.startsWith('telegram-') ? 'telegram'
                : 'chat-web';

    // V2.14.5 — cliente_id dinâmico (do webhook WhatsApp) entra no contexto pra
    // [IDENTIDADE DO SÓCIO] resolver multi-sócio em vez do estático .env.local.
    // V2.14 D Discord — contexto_extra traz papel (sócio/funcionário) + nome Discord
    const contextoBloco = await contextoRico.montarContexto({ thread_id, canal, cliente_id, contexto_extra });
    const recent = threads[thread_id].slice(-20);
    const prompt = `${contextoBloco}\n\n[MENSAGEM ATUAL DO SÓCIO]\n${message}`;

    console.log(`[${new Date().toISOString()}] thread=${thread_id} canal=${canal} cliente=${cliente_id?.slice(0,8) || 'env'} pergunta: ${message.slice(0, 80)}${plan_id ? ` (plan_id=${plan_id})` : ''}`);

    // ============================================================
    // V2.11 — Pedido de EDICAO/V2 do entregavel anterior (DEPRECATED)
    // Mantido como FALLBACK quando frontend manda plan_id explícito.
    // O LLM agora decide via contexto rico se é pedido de edição —
    // não tem mais regex empurrando isso silenciosamente.
    // ============================================================
    if (false) { // DESATIVADO V2.14 D — LLM decide via contexto rico
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
          // V2.14 D Fix 2 — persistência SÍNCRONA antes de retornar
          try { await db.salvarMensagem({ papel: 'chief', conteudo: respostaPipe }); }
          catch (e) { console.warn(`  [persistencia] erro: ${e.message}`); }

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
    // DESVIO — Pedido criativo grande (V2.5)
    // V2.14 D REFATOR: REGEX `ehPedidoCriativoGrande` REMOVIDA do caminho.
    // O LLM agora decide chamar `bash scripts/delegar-chief.sh <squad>` quando
    // for pedido criativo. Mantido como fallback APENAS quando frontend manda
    // plan_id explícito (caso vindo do botão "Animação Salão" no chat web).
    // ============================================================
    if (plan_id) {
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
      // V2.14 D Fix 2 — persistência SÍNCRONA antes de retornar
      try { await db.salvarMensagem({ papel: 'chief', conteudo: respostaPipe }); }
      catch (e) { console.warn(`  [persistencia] erro: ${e.message}`); }

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
    // EPP — Camadas 1 + 2 (Verifier + Reflection)
    // V2.14 D REFATOR: removido `detectarPapelEContexto` regex que
    // desligava Verifier seletivamente. Verifier agora roda SEMPRE
    // exceto quando turno é trivialmente curto (ex: "oi" / agradecimento).
    // O LLM decide expectativa via SYSTEM-PROMPT — sem regex externo.
    // ============================================================
    let resposta = await runClaudeCLI(prompt);
    const t_resposta_1 = Date.now() - t0;
    console.log(`  primeira resposta em ${(t_resposta_1/1000).toFixed(1)}s, ${resposta.length} chars`);

    let verifier = null;
    let reflection_round = 0;
    const verifier_problemas = [];

    // Heurística mínima pra pular Verifier: resposta curta a saudação curta.
    // NÃO desliga Verifier por palavra-chave (regex era furo da V2.14 D).
    const turnoTrivial = message.trim().length < 30 && resposta.length < 200;

    if (!turnoTrivial) {
      // Camada 1 — Self-Verification (sempre roda)
      verifier = await verificarOutput({
        briefing: message,
        output_md: resposta,
        agente_slug: 'pinguim',
        agente_role: 'atendente',
        expectativa: 'Resposta adequada ao pedido, sem inventar dado, sem fingir ação não executada, em formato compatível com canal.',
      });

      console.log(`  verifier: ${verifier.aprovado ? 'APROVOU' : 'REPROVOU'} em ${(verifier.latencia_ms/1000).toFixed(1)}s${verifier.problemas.length ? ` — problemas: ${verifier.problemas.length}` : ''}`);

      if (!verifier.aprovado && verifier.recomendacao_refazer) {
        verifier_problemas.push(...verifier.problemas);
        const tDec = Date.now() - t0;
        if (tDec < EPP_LIMITS.MAX_LATENCIA_MS_TURNO) {
          reflection_round = 1;

          // V2.14 D — Reflection NUNCA re-dispara side-effects.
          // Se turno teve ação destrutiva (gmail-enviar, drive-editar, etc
          // registradas em pinguim.acoes_executadas), Reflection refaz só
          // o texto SEM Bash. Bash é a tool por onde scripts destrutivos
          // rodam — bloqueá-lo evita 2x mesmo email.
          const teveAcao = await db.turnoTeveAcaoDestrutiva(t0).catch(() => false);

          let promptRefazer, allowedTools;
          if (teveAcao) {
            console.log(`  [epp] turno teve acao destrutiva — Reflection sem Bash (texto-only)`);
            promptRefazer = `Voce ja executou a acao do usuario com sucesso. Aqui foi sua resposta:\n\n---\n${resposta}\n---\n\nO Verifier identificou problemas APENAS na forma da resposta:\n${verifier.problemas.map(p => `- ${p}`).join('\n')}\n\nRecomendacao: ${verifier.recomendacao_refazer}\n\nReescreva APENAS o texto da resposta, mantendo o fato de que a acao ja aconteceu. NAO execute nenhuma ferramenta. NAO re-envie email/arquivo/evento. Apenas reformule pra ficar mais claro/correto.`;
            allowedTools = 'Read,Glob,Grep'; // sem Bash
          } else {
            promptRefazer = `${prompt}\n\n---\n\n[NOTA DO VERIFIER]\nVoce respondeu acima, mas o Verifier identificou problemas:\n${verifier.problemas.map(p => `- ${p}`).join('\n')}\n\nRecomendacao: ${verifier.recomendacao_refazer}\n\nRefaca a resposta corrigindo os problemas listados. Mantenha o que estava certo, ajuste so o que o Verifier apontou.`;
            allowedTools = undefined; // default
          }

          console.log(`  iniciando reflection round 1...`);
          const respostaRefeita = await runClaudeCLI(promptRefazer, allowedTools !== undefined ? { allowedTools } : {});

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
    } else {
      console.log(`  verifier pulado (turno trivial: msg ${message.length}c / resp ${resposta.length}c)`);
    }

    threads[thread_id].push({ role: 'assistant', content: resposta });
    // V2.14 D Fix 2 — persistência SÍNCRONA antes de retornar
    try { await db.salvarMensagem({ papel: 'chief', conteudo: resposta }); }
    catch (e) { console.warn(`  [persistencia] erro: ${e.message}`); }

    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    const lat_ms = Date.now() - t0;
    console.log(`  -> resposta final em ${dur}s, ${resposta.length} chars (reflection_round=${reflection_round})`);

    // V2.14 D Fix 4 — log EPP em pinguim.agente_execucoes
    db.logarExecucaoAtendente({
      input: { mensagem: message, thread_id, canal },
      output: { resposta, plan_id: plan_id || null },
      contexto_usado: {
        historico_n: recent.length,
        verifier_aprovou: verifier ? verifier.aprovado : null,
        verifier_pulado: turnoTrivial,
        reflection_round,
      },
      latencia_ms: lat_ms,
    }).catch(() => {});

    res.json({
      thread_id,
      content: resposta,
      duracao_s: parseFloat(dur),
      epp: {
        verifier_aprovou: verifier ? verifier.aprovado : null,
        verifier_pulado: turnoTrivial,
        reflection_round,
        problemas_encontrados: verifier_problemas,
      },
    });
  } catch (err) {
    console.error('Erro:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err.message || String(err),
        hint: 'Verifique se rodou `claude login` e se a CLI esta no PATH (`which claude`)',
      });
    }
  } finally {
    // V2.14 D Fix 2026-05-11 — libera o lock de turno Discord
    if (discordCanalIdAtivo) {
      turnoDiscordEmAndamento.delete(discordCanalIdAtivo);
      console.log(`  [discord-lock] canal ${discordCanalIdAtivo} LIBERADO`);
    }
  }
}

// ============================================================
// V2.13 — POST /api/chat-stream (SSE)
// ============================================================
// Variante de /api/chat que faz STREAMING via Server-Sent Events.
// Usuario vê resposta aparecer palavra-por-palavra em vez de aguardar
// 30-40s o turno inteiro. Tempo total NÃO muda — mas a sensação UX é
// 3-5x mais rápida (vê o agente "trabalhando ao vivo").
//
// Cobertura: APENAS caminho normal (Categoria A/B/D/E do Atendente).
// - Pedido criativo grande (Categoria C) → retorna 409 com instrução
//   pra frontend cair pro /api/chat antigo (já tem animação Salão)
// - Pedido de edição V2.11 → idem (re-roda pipeline, não streamavel)
// - Squad não populada → idem
//
// Eventos SSE emitidos:
//   data: {"type":"start","thread_id":"..."}
//   data: {"type":"chunk","text":"..."}      (N chunks conforme CLI emite)
//   data: {"type":"done","content":"...","duracao_s":N,"epp":{...}}
//   data: {"type":"error","error":"..."}
//
// EPP (Verifier+Reflection): roda DEPOIS do stream terminar. Se Reflection
// rodar, emite NOVOS chunks (frontend substitui texto anterior). Pra V1
// simplificamos: só roda Verifier no caminho stream se ctx.pular_verifier
// for false, e marca no done. Reflection fica off-stream nesta versao
// (evita confusao de UI).
//
// Funciona idêntico no servidor V3 — SSE é HTTP padrão.
// ============================================================
app.post('/api/chat-stream', async (req, res) => {
  const t0 = Date.now();
  const { message, thread_id = 'default', cliente_id } = req.body || {};

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message obrigatorio' });
  }

  // V2.14 D Refator V3 — Removida triagem regex pré-stream (ehPedidoEdicao,
  // ehPedidoCriativoGrande, detectarSquad atalho). O LLM decide caminho via
  // contexto rico. Pipeline criativo grande continua disponível via /api/chat
  // com plan_id (caminho não-streamável usado pelo botão de animação Salão).

  // V2.14 D Fix 3 — Adquire lock ANTES de abrir SSE.
  let lock;
  try {
    lock = await db.adquirirLockThread(thread_id, 180000); // 180s p/ turno pesado
    if (lock.esperaMs > 100) {
      console.log(`  [stream-lock] thread ${thread_id} esperou ${lock.esperaMs}ms pelo lock`);
    }
  } catch (e) {
    return res.status(503).json({ error: 'Estou ainda processando sua mensagem anterior, tente em instantes.', detail: e.message });
  }

  // Abre SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no'); // desliga buffer em proxies
  res.flushHeaders();

  const sse = (type, payload) => {
    try {
      res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
    } catch (_) { /* cliente desconectou */ }
  };

  // Detecta desconexão do cliente — usa res.on('close'), não req.on('close')
  // (req.close dispara quando o request body acaba de ser lido, NÃO quando
  // a conn TCP fecha — bug confundiu V1 do /api/chat-stream).
  let abortado = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      abortado = true;
      console.log(`  [stream] cliente desconectou`);
    }
  });

  try {
    // V2.14 D Fix 1 — SEMPRE recarrega do banco (fonte da verdade).
    const historicoBanco = await carregarThreadDoBanco(thread_id, 20);
    console.log(`  [historico-stream] carregadas ${historicoBanco.length} mensagens do banco pra thread ${thread_id}`);

    threads[thread_id].push({ role: 'user', content: message });

    // V2.14 D Fix 2 — Persistência SÍNCRONA antes de processar.
    try {
      await db.salvarMensagem({ papel: 'humano', conteudo: message });
    } catch (e) {
      console.warn(`  [persistencia-stream] erro: ${e.message}`);
    }

    // V2.14 D Refator V3 — contexto rico unificado (temporal + identidade +
    // histórico + entregáveis recentes + drive + canal).
    const canal = thread_id.startsWith('whatsapp-') ? 'whatsapp'
                : thread_id.startsWith('discord-')  ? 'discord'
                : thread_id.startsWith('telegram-') ? 'telegram'
                : 'chat-web';
    // V2.14.5 — cliente_id dinâmico entra no contexto
    const contextoBloco = await contextoRico.montarContexto({ thread_id, canal, cliente_id });
    const recent = threads[thread_id].slice(-20);
    const prompt = `${contextoBloco}\n\n[MENSAGEM ATUAL DO SÓCIO]\n${message}`;

    console.log(`[${new Date().toISOString()}] thread=${thread_id} STREAM canal=${canal} cliente=${cliente_id?.slice(0,8) || 'env'} pergunta: ${message.slice(0, 80)}`);
    sse('start', { thread_id });

    // Spawna CLI com onChunk emitindo SSE
    let resposta = '';
    resposta = await runClaudeCLI(prompt, {
      onChunk: (chunk) => {
        if (abortado) return;
        sse('chunk', { text: chunk });
      },
    });
    const t_resposta = Date.now() - t0;
    console.log(`  [stream] primeira resposta em ${(t_resposta/1000).toFixed(1)}s, ${resposta.length} chars`);

    if (abortado) return; // cliente desistiu

    // Verifier (Camada 1 EPP) — roda DEPOIS do stream
    // V2.14 D Refator: Verifier sempre roda exceto turno trivial
    let verifier = null;
    let verifier_problemas = [];
    const turnoTrivial = message.trim().length < 30 && resposta.length < 200;
    if (!turnoTrivial) {
      try {
        verifier = await verificarOutput({
          briefing: message,
          output_md: resposta,
          agente_slug: 'pinguim',
          agente_role: 'atendente',
          expectativa: 'Resposta adequada ao pedido, sem inventar dado, sem fingir ação não executada, em formato compatível com canal.',
        });
        if (!verifier.aprovado) verifier_problemas.push(...verifier.problemas);
        console.log(`  [stream] verifier: ${verifier.aprovado ? 'APROVOU' : 'REPROVOU'} em ${(verifier.latencia_ms/1000).toFixed(1)}s`);
      } catch (e) {
        console.warn(`  [stream] verifier falhou (nao bloqueante): ${e.message}`);
      }
    }
    // Reflection NÃO roda no /api/chat-stream V1 (evita re-streaming caótico).

    threads[thread_id].push({ role: 'assistant', content: resposta });
    // V2.14 D Fix 2 — persistência SÍNCRONA antes de emitir 'done'
    try { await db.salvarMensagem({ papel: 'chief', conteudo: resposta }); }
    catch (e) { console.warn(`  [persistencia-stream] erro: ${e.message}`); }

    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    const lat_ms = Date.now() - t0;
    console.log(`  -> [stream] resposta final em ${dur}s, ${resposta.length} chars`);

    // V2.14 D Fix 4 — log EPP em pinguim.agente_execucoes
    db.logarExecucaoAtendente({
      input: { mensagem: message, thread_id, canal },
      output: { resposta },
      contexto_usado: {
        historico_n: recent.length,
        stream: true,
        verifier_aprovou: verifier ? verifier.aprovado : null,
        verifier_pulado: turnoTrivial,
      },
      latencia_ms: lat_ms,
    }).catch(() => {});

    sse('done', {
      content: resposta,
      duracao_s: parseFloat(dur),
      epp: {
        verifier_aprovou: verifier ? verifier.aprovado : null,
        verifier_pulado: turnoTrivial,
        reflection_round: 0,
        reflection_pulado_no_stream: !turnoTrivial && verifier && !verifier.aprovado,
        problemas_encontrados: verifier_problemas,
      },
    });
    res.end();
  } catch (err) {
    console.error('[stream] erro:', err);
    sse('error', { error: err.message || String(err) });
    res.end();
  } finally {
    // V2.14 D Fix 3 — sempre libera o lock, mesmo em erro
    if (lock) await db.liberarLockThread(thread_id, lock.lockId);
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
        const versionamento = {
          entregavel_id: ent.id,
          versao_atual: ent.versao,
          parent_id: ent.parent_id,
          cadeia: cadeia.map(c => ({ id: c.id, versao: c.versao, criado_em: c.criado_em })),
        };

        // V2.14 Frente C1 — relatorio executivo usa template proprio
        if (ent.tipo === 'relatorio-executivo-diario') {
          const html = templateRelatorioExec.renderRelatorioExecutivo({
            markdown: ent.conteudo_md,
            titulo: ent.titulo,
            tipo: ent.tipo,
            conteudo_estruturado: ent.conteudo_estruturado || {},
            criadoEm: new Date(ent.criado_em).getTime(),
            versionamento,
          });
          res.type('html').send(html);
          return;
        }

        // Default — entregavel criativo (copy/parecer/etc)
        const metricas = (ent.conteudo_estruturado && ent.conteudo_estruturado.metricas) || {};
        const pedidoOriginal = (ent.conteudo_estruturado && ent.conteudo_estruturado.pedido_original) || ent.titulo || 'Entregável';
        const html = renderEntregavel({
          markdown: ent.conteudo_md,
          metricas,
          criadoEm: new Date(ent.criado_em).getTime(),
          pedido: pedidoOriginal,
          versionamento,
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
    // V2.12 Fix 2 — registra TOP-1 do resultado como contexto Drive
    // (busca sem hit não cria contexto). Não bloqueia a resposta.
    if (r.arquivos && r.arquivos[0]) {
      const top = r.arquivos[0];
      db.registrarOpDrive({ cliente_id, fileId: top.id, nome: top.nome, link: top.link, op: 'buscar' }).catch(()=>{});
    }
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
      case 'abas': {
        // Pega metadata + abas em paralelo pra registrarOpDrive ter nome/link
        const [meta, abas] = await Promise.all([
          googleDriveContent.lerAuto({ fileId, cliente_id }).catch(() => ({})),
          googleDriveContent.listarAbas({ fileId, cliente_id }),
        ]);
        r = { nome: meta.nome, link: meta.link, abas };
        break;
      }
      default:         return res.status(400).json({ ok: false, error: `tipo invalido: ${tipo}` });
    }
    const dur_ms = Date.now() - t0;
    console.log(`[drive-ler] ${dur_ms}ms | fileId=${fileId.slice(0, 12)} | tipo=${tipo} | nome="${(r.nome || '').slice(0, 40)}"`);
    // V2.12 Fix 2 — registra leitura como contexto Drive (não bloqueia resposta).
    db.registrarOpDrive({ cliente_id, fileId, nome: r.nome, link: r.link, aba: r.aba_lida || aba, op: 'ler' }).catch(()=>{});
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
    // V2.12 Fix 2 — registra edição como contexto Drive (não bloqueia resposta)
    db.registrarOpDrive({ cliente_id, fileId, nome: r.nome, link: r.link, aba: r.aba || aba, op: 'editar' }).catch(()=>{});
    res.json({ ok: true, ...r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[drive-editar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.13 — GMAIL — listar/ler/responder/modificar/perfil
// ============================================================
// 5 endpoints. Categoria E expandida no Atendente:
//   E4: listar (gmail-listar.sh)
//   E5: ler email específico (gmail-ler.sh)
//   E6: responder/modificar — EXIGE confirmação no chat (gmail-responder.sh)
// ============================================================

app.post('/api/gmail/listar', async (req, res) => {
  try {
    const { query = 'in:inbox', pageSize = 10, cliente_id } = req.body || {};
    const t0 = Date.now();
    const r = await googleGmail.listarEmails({ query, pageSize, cliente_id });
    const dur_ms = Date.now() - t0;
    console.log(`[gmail-listar] ${dur_ms}ms | query="${query}" | retornou=${r.total_retornado}/${r.total_estimado}`);
    res.json({ ok: true, ...r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[gmail-listar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/gmail/ler', async (req, res) => {
  try {
    const { messageId, cliente_id } = req.body || {};
    if (!messageId) {
      return res.status(400).json({ ok: false, error: 'messageId obrigatorio' });
    }
    const t0 = Date.now();
    const r = await googleGmail.lerEmail({ messageId, cliente_id });
    const dur_ms = Date.now() - t0;
    console.log(`[gmail-ler] ${dur_ms}ms | id=${messageId.slice(0, 12)} | de="${(r.de || '').slice(0, 40)}" | assunto="${(r.assunto || '').slice(0, 40)}"`);
    res.json({ ok: true, ...r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[gmail-ler] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// V2.13 — RESPONDER/ENVIAR EMAIL
// V2.14 D — agora com Camada B anti-duplicacao (5min janela)
// Atendente Pinguim DEVE mostrar plano e pedir confirmação no chat antes
// de bater aqui. Esta camada apenas executa.
const antiDup = require('./lib/anti-duplicacao');

app.post('/api/gmail/responder', async (req, res) => {
  try {
    const { para, assunto, corpo, reply_to_message_id, thread_id, cc, bcc, cliente_id, origem_canal = 'chat-web', origem_message_id, forcar = false } = req.body || {};
    if (!para) return res.status(400).json({ ok: false, error: 'para obrigatorio' });
    if (!assunto) return res.status(400).json({ ok: false, error: 'assunto obrigatorio' });
    if (!corpo) return res.status(400).json({ ok: false, error: 'corpo obrigatorio' });

    const t0 = Date.now();

    // Anti-duplicacao: hash = tipo + para + assunto + corpo (normalizado)
    // Se mesma combinacao foi enviada nos ultimos 5min, BLOQUEIA (a menos que forcar=true)
    if (!forcar) {
      const hash = antiDup.hashAcao({
        tipo_acao: 'gmail-enviar',
        destino: para,
        corpo: `${assunto}|${corpo}`,
      });
      const dup = await antiDup.checarDuplicata({ cliente_id, hash, janela_min: 5 });
      if (dup.duplicata) {
        console.warn(`[gmail-enviar] BLOQUEADO duplicata pra ${para} (${dup.minutos_atras}min atras)`);
        await antiDup.registrar({
          cliente_id, tipo_acao: 'gmail-enviar', hash_acao: hash,
          destino: para, resumo: assunto.slice(0, 100),
          origem_canal, origem_message_id,
          status: 'bloqueado_duplicata',
          motivo: `Email identico enviado ${dup.minutos_atras}min atras (id=${dup.acao_anterior_id})`,
        }).catch(_ => {});
        return res.status(409).json({
          ok: false,
          bloqueado_duplicata: true,
          error: `Email identico foi enviado ha ${dup.minutos_atras} minutos. Pra reenviar mesmo assim, chame com forcar=true.`,
          acao_anterior_id: dup.acao_anterior_id,
          minutos_atras: dup.minutos_atras,
        });
      }
    }

    const r = await googleGmail.enviarEmail({ para, assunto, corpo, reply_to_message_id, thread_id, cc, bcc, cliente_id });
    const dur_ms = Date.now() - t0;

    // Registra sucesso
    const hashOk = antiDup.hashAcao({ tipo_acao: 'gmail-enviar', destino: para, corpo: `${assunto}|${corpo}` });
    await antiDup.registrar({
      cliente_id, tipo_acao: 'gmail-enviar', hash_acao: hashOk,
      destino: para, resumo: assunto.slice(0, 100),
      origem_canal, origem_message_id,
      status: 'sucesso',
      metadata: { gmail_id: r.id, latencia_ms: dur_ms, forcado: !!forcar },
    }).catch(e => console.warn(`[gmail-enviar] registro falhou: ${e.message}`));

    console.log(`[gmail-enviar] ${dur_ms}ms | para="${para.slice(0, 40)}" | assunto="${assunto.slice(0, 40)}" | reply_to=${reply_to_message_id ? reply_to_message_id.slice(0, 12) : 'novo'}${forcar ? ' | FORCADO' : ''}`);
    res.json({ ok: true, ...r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[gmail-enviar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// V2.13 — MARCAR como lido/starred/arquivar/spam/lixo
app.post('/api/gmail/modificar', async (req, res) => {
  try {
    const { messageId, op, cliente_id } = req.body || {};
    if (!messageId) return res.status(400).json({ ok: false, error: 'messageId obrigatorio' });
    if (!op) return res.status(400).json({ ok: false, error: 'op obrigatoria (lido|nao-lido|starred|unstarred|arquivar|spam|lixo)' });

    const t0 = Date.now();
    const r = await googleGmail.modificarEmail({ messageId, op, cliente_id });
    const dur_ms = Date.now() - t0;
    console.log(`[gmail-modificar] ${dur_ms}ms | id=${messageId.slice(0, 12)} | op=${op}`);
    res.json({ ok: true, ...r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[gmail-modificar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// V2.13 — PERFIL (qual email do socio)
app.post('/api/gmail/perfil', async (req, res) => {
  try {
    const { cliente_id } = req.body || {};
    const t0 = Date.now();
    const r = await googleGmail.perfilEmail({ cliente_id });
    const dur_ms = Date.now() - t0;
    console.log(`[gmail-perfil] ${dur_ms}ms | email=${r.email}`);
    res.json({ ok: true, ...r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[gmail-perfil] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.14 Fase 1.7 — endpoints CALENDAR (LEITURA apenas, squad data)
// ============================================================
// 3 endpoints. Cada sócio vê APENAS a agenda dele (refresh_token isolado
// por cliente_id no cofre). Criar/editar evento NÃO está aqui — vai pra
// squad hybrid-ops-squad em frente futura V2.15.
// ============================================================

app.post('/api/calendar/listar-calendarios', async (req, res) => {
  try {
    const { cliente_id } = req.body || {};
    const t0 = Date.now();
    const r = await googleCalendar.listarCalendarios({ cliente_id });
    const dur_ms = Date.now() - t0;
    console.log(`[calendar-listar-cals] ${dur_ms}ms | total=${r.length}`);
    res.json({ ok: true, calendarios: r, total: r.length, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[calendar-listar-cals] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/calendar/listar-eventos', async (req, res) => {
  try {
    const { calendarId = 'primary', timeMin, timeMax, maxResults = 50, cliente_id } = req.body || {};
    const t0 = Date.now();
    const r = await googleCalendar.listarEventos({ calendarId, timeMin, timeMax, maxResults, cliente_id });
    const dur_ms = Date.now() - t0;
    console.log(`[calendar-listar-evts] ${dur_ms}ms | cal=${calendarId} | janela=[${(timeMin||'now').slice(0,10)}..${(timeMax||'+24h').slice(0,10)}] | retornou=${r.total}`);
    res.json({ ok: true, ...r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[calendar-listar-evts] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/calendar/ler-evento', async (req, res) => {
  try {
    const { calendarId = 'primary', eventId, cliente_id } = req.body || {};
    if (!eventId) return res.status(400).json({ ok: false, error: 'eventId obrigatorio' });
    const t0 = Date.now();
    const r = await googleCalendar.lerEvento({ calendarId, eventId, cliente_id });
    const dur_ms = Date.now() - t0;
    console.log(`[calendar-ler-evt] ${dur_ms}ms | id=${eventId.slice(0, 12)} | titulo="${(r.titulo || '').slice(0, 40)}"`);
    res.json({ ok: true, ...r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[calendar-ler-evt] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.14 Frente B — endpoints DISCORD (LEITURA, squad data)
// ============================================================
// Bot Discord conecta no Gateway via WebSocket no boot do server-cli e
// salva mensagens em pinguim.discord_mensagens em tempo real. Endpoints
// abaixo expoem leitura (status do bot + mensagens 24h + busca por canal).
// ESCRITA no Discord NAO esta aqui — sera squad hybrid-ops-squad em V2.15.
// ============================================================

app.post('/api/discord/backfill', async (req, res) => {
  try {
    const { horas = 24, maxPorCanal = 100 } = req.body || {};
    const bot = discordBot.getBot();
    if (!bot) return res.status(503).json({ ok: false, error: 'bot nao iniciado' });
    const t0 = Date.now();
    const r = await bot.backfillHorasRecentes({ horas, maxPorCanal });
    const dur_ms = Date.now() - t0;
    console.log(`[discord-backfill] ${dur_ms}ms | canais=${r.canais_processados} | ingeridas=${r.mensagens_ingeridas}`);
    res.json({ ok: true, ...r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[discord-backfill] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/discord/status', async (req, res) => {
  try {
    const bot = discordBot.getBot();
    if (!bot) {
      return res.json({
        ok: true, ativo: false,
        motivo: 'Bot nao inicializado (DISCORD_BOT_TOKEN nao no cofre ou erro no boot).',
      });
    }
    res.json({ ok: true, ativo: true, ...bot.getStatus() });
  } catch (e) {
    console.error('[discord-status] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/discord/listar-24h', async (req, res) => {
  try {
    const { horas = 24, incluir_bots = false, canal_id = null, limite = 500 } = req.body || {};
    const t0 = Date.now();

    // Janela: ultimas N horas em UTC
    const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
    const wheres = [`postado_em >= '${desde}'`];
    if (!incluir_bots) wheres.push('autor_bot = false');
    if (canal_id) wheres.push(`canal_id = '${canal_id.replace(/'/g, "''")}'`);

    const sql = `
      SELECT message_id, guild_id, guild_nome, canal_id, canal_nome, canal_tipo,
             autor_id, autor_nome, autor_bot,
             conteudo, postado_em, editado_em,
             mencoes_users, mencoes_roles, menciona_everyone,
             reacoes_qtd, anexos_qtd, embed_qtd, parent_canal_id, thread_id
      FROM pinguim.discord_mensagens
      WHERE ${wheres.join(' AND ')}
      ORDER BY postado_em ASC
      LIMIT ${Math.min(parseInt(limite) || 500, 2000)};
    `;
    const r = await db.rodarSQL(sql);
    const dur_ms = Date.now() - t0;
    console.log(`[discord-listar-24h] ${dur_ms}ms | janela=${horas}h | retornou=${r.length}${canal_id ? ` | canal=${canal_id.slice(0,8)}` : ''}`);

    // Agrupa por canal pra resumo
    const porCanal = new Map();
    for (const m of r) {
      const k = m.canal_id;
      if (!porCanal.has(k)) {
        porCanal.set(k, { canal_id: k, canal_nome: m.canal_nome || '?', canal_tipo: m.canal_tipo, qtd: 0, autores: new Set() });
      }
      const c = porCanal.get(k);
      c.qtd++;
      if (m.autor_id) c.autores.add(m.autor_id);
    }
    const resumo_canais = Array.from(porCanal.values())
      .map(c => ({ canal_id: c.canal_id, canal_nome: c.canal_nome, canal_tipo: c.canal_tipo, mensagens: c.qtd, autores_distintos: c.autores.size }))
      .sort((a, b) => b.mensagens - a.mensagens);

    res.json({
      ok: true,
      janela_horas: horas,
      desde,
      total: r.length,
      mensagens: r,
      resumo_canais,
      latencia_ms: dur_ms,
    });
  } catch (e) {
    console.error('[discord-listar-24h] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/discord/buscar', async (req, res) => {
  try {
    const { query, horas = 168, limite = 50 } = req.body || {};
    if (!query || query.length < 2) return res.status(400).json({ ok: false, error: 'query >= 2 chars' });
    const t0 = Date.now();
    const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
    const escQ = query.replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
    const sql = `
      SELECT message_id, guild_nome, canal_nome, autor_nome, autor_bot,
             conteudo, postado_em, reacoes_qtd
      FROM pinguim.discord_mensagens
      WHERE postado_em >= '${desde}'
        AND autor_bot = false
        AND conteudo ILIKE '%${escQ}%'
      ORDER BY postado_em DESC
      LIMIT ${Math.min(parseInt(limite) || 50, 200)};
    `;
    const r = await db.rodarSQL(sql);
    const dur_ms = Date.now() - t0;
    console.log(`[discord-buscar] ${dur_ms}ms | query="${query.slice(0,40)}" | retornou=${r.length}`);
    res.json({ ok: true, query, janela_horas: horas, total: r.length, mensagens: r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[discord-buscar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.14 D Categoria L — DISCORD POSTAR (cross-canal)
// ============================================================
// Atendente posta mensagem em canal Discord. Usado quando sócio pede via
// WhatsApp/chat: "marca o X no #suporte e pede tal coisa".
// Camada B anti-duplicação (60s, mesma proteção do Gmail/WhatsApp).
// ============================================================
app.post('/api/discord/postar', async (req, res) => {
  try {
    const { canal_id, canal_nome, texto, reply_to_message_id, origem_canal = 'chat', forcar = false, thread_id_corrente = null } = req.body || {};
    if (!texto) return res.status(400).json({ ok: false, error: 'texto obrigatorio' });
    if (!canal_id && !canal_nome) return res.status(400).json({ ok: false, error: 'canal_id OU canal_nome obrigatorio' });

    // V2.14 D Fix 2026-05-11 — bloqueio TOTAL de auto-postagem durante turno Discord ativo.
    // Quando agente está dentro de um turno @mention Discord, ele NÃO precisa postar nada
    // em NENHUM canal Discord — basta colocar <@user_id> no texto da resposta final.
    // O discord-bot já vai postar essa resposta automaticamente no canal de origem.
    // Postar em outros canais também é dispensável (origem já notifica todos).
    if (typeof turnoDiscordEmAndamento !== 'undefined' && turnoDiscordEmAndamento.size > 0 && !forcar) {
      console.log(`[discord-postar] BLOQUEADO auto-postagem (canal ${canal_id || canal_nome}) — ${turnoDiscordEmAndamento.size} turno(s) Discord em andamento. Texto descartado: "${texto.slice(0,80)}"`);
      return res.json({
        ok: true,
        bloqueado_auto_postagem: true,
        motivo: 'Voce esta dentro de uma conversa Discord agora. NAO chame /api/discord/postar nem use bash discord-postar — basta colocar <@user_id> no TEXTO da sua resposta principal que vai ser postada automaticamente no canal de origem. IDs: Rafa <@1083728715726463068>, Djairo <@1083731934238228590>, Luiz Guilherme <@1084804999151878206>. NAO mencione "nao consegui postar" nem "403" na resposta — a postagem nao falhou, eu apenas bloqueei pra evitar duplicacao. Coloca as mentions <@id> no texto final e a resposta sai certinha.',
        canal_id,
        texto_descartado: texto.slice(0, 200),
      });
    }

    const discordPostar = require('./lib/discord-postar');

    // Resolve canal_id se veio só nome
    let canal_id_final = canal_id;
    let canal_nome_final = canal_nome;
    if (!canal_id_final && canal_nome) {
      const ch = discordPostar.resolverCanalPorNome(canal_nome);
      if (!ch) return res.status(404).json({ ok: false, error: `canal "${canal_nome}" não encontrado no cache do bot. Bot precisa estar conectado ao server Discord.` });
      canal_id_final = ch.id;
      canal_nome_final = ch.nome;
    }

    // Camada B anti-duplicação
    if (forcar !== true) {
      const { executarComCheck } = require('./lib/anti-duplicacao');
      const result = await executarComCheck({
        tipo_acao: 'discord-postar',
        destino: canal_id_final,
        corpo: texto,
        resumo: texto.slice(0, 80),
        origem_canal,
        janela_min: 1, // 60s
        fn: async () => discordPostar.postarEmCanal({ canal_id: canal_id_final, texto, reply_to_message_id }),
      });
      if (result.bloqueada) return res.status(409).json({ ok: false, bloqueado_duplicata: true, ...result });
      return res.json({ ok: true, canal_id: canal_id_final, canal_nome: canal_nome_final, resultado: result.resultado });
    }

    // Bypass com forcar=true
    const r = await discordPostar.postarEmCanal({ canal_id: canal_id_final, texto, reply_to_message_id });
    res.json({ ok: true, canal_id: canal_id_final, canal_nome: canal_nome_final, resultado: r, forcado: true });
  } catch (e) {
    console.error('[discord-postar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.14.6 — PROJETOS EXTERNOS (Supabase ProAlt + Elo + Sirius)
// ============================================================
// Read-only — qualquer escrita é bloqueada antes de chegar no banco.
// ============================================================
const dbExterno = require('./lib/db-externo');

app.post('/api/projeto-externo/listar-tabelas', async (req, res) => {
  try {
    const { projeto } = req.body || {};
    if (!projeto) return res.status(400).json({ ok: false, error: 'projeto obrigatorio (proalt|elo|sirius)' });
    const tabelas = await dbExterno.listarTabelas(projeto);
    res.json({ ok: true, projeto, total: tabelas.length, tabelas });
  } catch (e) {
    console.error('[projeto-externo-listar-tabelas] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/projeto-externo/descrever-tabela', async (req, res) => {
  try {
    const { projeto, tabela } = req.body || {};
    if (!projeto || !tabela) return res.status(400).json({ ok: false, error: 'projeto e tabela obrigatorios' });
    const info = await dbExterno.descreverTabela(projeto, tabela);
    res.json({ ok: true, projeto, ...info });
  } catch (e) {
    console.error('[projeto-externo-descrever] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/projeto-externo/consultar', async (req, res) => {
  try {
    const { projeto, tabela, select, filtros, ordem, limite } = req.body || {};
    if (!projeto || !tabela) return res.status(400).json({ ok: false, error: 'projeto e tabela obrigatorios' });
    const dados = await dbExterno.consultarTabela(projeto, tabela, { select, filtros, ordem, limite });
    res.json({ ok: true, projeto, tabela, total: Array.isArray(dados) ? dados.length : 0, dados });
  } catch (e) {
    console.error('[projeto-externo-consultar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/projeto-externo/contar', async (req, res) => {
  try {
    const { projeto, tabela, filtros = {} } = req.body || {};
    if (!projeto || !tabela) return res.status(400).json({ ok: false, error: 'projeto e tabela obrigatorios' });
    const total = await dbExterno.contarLinhas(projeto, tabela, filtros);
    res.json({ ok: true, projeto, tabela, total });
  } catch (e) {
    console.error('[projeto-externo-contar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// V2.15 — Top N engajados em ProAlt/Elo/Sirius (1 chamada, agregação no Node, ~5-10s)
// Substitui caminho onde o LLM faria 5-10 Bash sequenciais (>5min total).
// Critérios canônicos definidos por Andre 2026-05-11.
app.post('/api/relatorio/top-engajados', async (req, res) => {
  try {
    const { produtos = ['proalt', 'elo', 'sirius'], top_n = 15, formato = 'markdown' } = req.body || {};
    const topEngajados = require('./lib/top-engajados');
    const r = await topEngajados.gerarRelatorio({ produtos, topN: parseInt(top_n, 10), formato });
    res.json(r);
  } catch (e) {
    console.error('[top-engajados] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// V2.14 D — Apagar mensagem do bot no Discord (só apaga próprias mensagens)
app.post('/api/discord/apagar', async (req, res) => {
  try {
    const { canal_id, message_id } = req.body || {};
    if (!canal_id || !message_id) return res.status(400).json({ ok: false, error: 'canal_id e message_id obrigatorios' });
    const discordPostar = require('./lib/discord-postar');
    const r = await discordPostar.apagarMensagem({ canal_id, message_id });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[discord-apagar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// V2.14 D — Editar mensagem do bot
app.post('/api/discord/editar', async (req, res) => {
  try {
    const { canal_id, message_id, texto } = req.body || {};
    if (!canal_id || !message_id || !texto) return res.status(400).json({ ok: false, error: 'canal_id, message_id e texto obrigatorios' });
    const discordPostar = require('./lib/discord-postar');
    const r = await discordPostar.editarMensagem({ canal_id, message_id, texto });
    res.json({ ok: true, resultado: r });
  } catch (e) {
    console.error('[discord-editar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// V2.14 D — Lista últimas mensagens do bot (pra atendente identificar qual apagar/editar)
app.post('/api/discord/ultimas-do-bot', async (req, res) => {
  try {
    const { canal_id = null, limite = 5 } = req.body || {};
    const discordPostar = require('./lib/discord-postar');
    if (canal_id) {
      const r = await discordPostar.ultimaMensagemDoBot({ canal_id });
      return res.json({ ok: true, ultima: r });
    }
    const lista = await discordPostar.ultimasMensagensDoBot({ limite });
    res.json({ ok: true, total: lista.length, mensagens: lista });
  } catch (e) {
    console.error('[discord-ultimas-bot] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Resolver: nome de usuário → discord_user_id (pra @ mencionar funcionário/sócio)
app.post('/api/discord/resolver-usuario', async (req, res) => {
  try {
    const { nome } = req.body || {};
    if (!nome) return res.status(400).json({ ok: false, error: 'nome obrigatorio' });
    const discordPostar = require('./lib/discord-postar');
    const r = await discordPostar.resolverUsuarioPorNome(nome);
    res.json({ ok: true, total: r.length, usuarios: r });
  } catch (e) {
    console.error('[discord-resolver-usuario] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.14 Frente D — endpoints WHATSAPP EVOLUTION
// ============================================================
// 3 endpoints:
//   POST /api/whatsapp/webhook  — Evolution chama AQUI quando socio manda msg
//   POST /api/whatsapp/enviar   — admin manda mensagem manual via API
//   GET  /api/whatsapp/status   — healthcheck (instancia conectada? msgs hoje?)
// ============================================================

// V2.14 D — imports adicionais
const ackInteligente = require('./lib/ack-inteligente');
const audioTranscricao = require('./lib/audio-transcricao');

// Cache em RAM da PUBLIC_BASE_URL pra nao consultar cofre todo turno
let _publicBaseUrl = null;
async function getPublicBaseUrl() {
  if (_publicBaseUrl) return _publicBaseUrl;
  try {
    _publicBaseUrl = (await db.lerChaveSistema('PUBLIC_BASE_URL', 'whatsapp')).trim().replace(/\/+$/, '');
  } catch (_) {
    _publicBaseUrl = `http://localhost:${PORT}`;
  }
  return _publicBaseUrl;
}

// Limpa response do Atendente pra envio em canal externo (WhatsApp/Telegram):
// - troca localhost no link por URL publica
// - corta footer tecnico ("Latencia: ... · sintetizador OK · modulos: ...")
// - remove blocos de metadados que vazaram (verifier, EPP, etc)
function polirRespostaPraCanal(texto, publicUrl) {
  if (!texto) return '';
  let t = texto;
  // localhost -> publica
  if (publicUrl && publicUrl !== `http://localhost:${PORT}`) {
    t = t.replace(/https?:\/\/localhost:\d+/g, publicUrl);
  }
  // Remove linhas de footer tecnico
  t = t.replace(/^Lat[êe]ncia:\s*\d+s\s*[·•|]\s*sintetizador.*$/gim, '');
  t = t.replace(/^M[óo]dulos\s+rodados:\s*\d+\/\d+.*$/gim, '');
  t = t.replace(/^Pinguim OS\s*[·•|]\s*Relat[óo]rio.*$/gim, '');
  t = t.replace(/^Discrep[âa]ncia\?\s*Avisa o Codina.*$/gim, '');
  t = t.replace(/^\s*Verifier:.*$/gim, '');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

// Helper: chama /api/chat internamente (mesmo cerebro do chat web)
async function processarMsgWhatsapp({ texto, remoteJid, pushName, instancia, message_id }) {
  const numero = String(remoteJid || '').replace(/@.*$/, '').replace(/\D/g, '');

  const sqlSocio = `SELECT cliente_id, socio_slug, apelido FROM pinguim.whatsapp_socios WHERE numero = '${numero.replace(/'/g, "''")}' AND ativo = true LIMIT 1`;
  const socioRows = await db.rodarSQL(sqlSocio).catch(() => []);
  const socioMap = Array.isArray(socioRows) && socioRows[0] ? socioRows[0] : null;

  if (!socioMap) {
    return {
      cliente_id: null,
      thread_id: null,
      resposta: `Olá! Sou o Atendente Pinguim 🐧.\n\nSeu número (${numero}) ainda não está autorizado a falar comigo. Pede pro Codina te cadastrar.`,
      processada: true,
    };
  }

  const thread_id = `whatsapp-${socioMap.socio_slug || numero}`;
  const publicUrl = await getPublicBaseUrl();

  try {
    const resp = await fetch(`http://localhost:${PORT}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, thread_id, cliente_id: socioMap.cliente_id }),
    });
    const j = await resp.json();
    if (!resp.ok || j.error) {
      return { cliente_id: socioMap.cliente_id, thread_id, resposta: `Erro processando: ${j.error || 'desconhecido'}.`, processada: false, erro: j.error };
    }
    const respostaCrua = j.content || j.response || '(resposta vazia)';
    const respostaPolida = polirRespostaPraCanal(respostaCrua, publicUrl);

    // Detecta se gerou entregavel: payload direto OU UUID achado no texto
    let entregavelUrl = j.entregavel_url ? `${publicUrl}${j.entregavel_url}` : null;
    let entregavelId  = j.entregavel_id || null;

    if (!entregavelId) {
      // Tenta extrair UUID v4 do tipo /entregavel/<UUID> que o Atendente colocou no texto
      const m = respostaCrua.match(/\/entregavel\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (m) {
        entregavelId = m[1];
        entregavelUrl = `${publicUrl}/entregavel/${entregavelId}`;
      }
    }

    return {
      cliente_id: socioMap.cliente_id,
      thread_id,
      resposta: respostaPolida,
      entregavel_url: entregavelUrl,
      entregavel_id: entregavelId,
      processada: true,
    };
  } catch (e) {
    return { cliente_id: socioMap.cliente_id, thread_id, resposta: `Erro técnico: ${e.message}. Tenta de novo.`, processada: false, erro: e.message };
  }
}

// Helper: dispara ack ASYNC (não bloqueia, fire-and-forget)
async function dispararAck(parsed, textoUsuario) {
  try {
    const { ack, fonte } = await ackInteligente.gerarAck(textoUsuario);
    if (!ack) {
      console.log(`[whatsapp-ack] heuristica decidiu NAO enviar ack (msg curta/saudacao)`);
      return;
    }
    await evolution.enviarTexto({
      instancia: parsed.instancia,
      numero: parsed.numero_remetente,
      texto: ack,
    });
    console.log(`[whatsapp-ack] enviado (fonte=${fonte}) "${ack.slice(0,60)}"`);
  } catch (e) {
    console.warn(`[whatsapp-ack] falhou (nao bloqueante): ${e.message}`);
  }
}

// Helper: salva msg recebida + envia resposta + salva msg enviada
async function ingerirMsgRecebida(parsed, payloadBruto) {
  const escTxt = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'";
  const escBool = (b) => b ? 'true' : 'false';

  // 1. Salva msg recebida
  const sqlIns = `
    INSERT INTO pinguim.whatsapp_mensagens
      (message_id, instancia, direcao, remote_jid, numero_remetente, push_name,
       is_group, is_status, tipo, texto, postada_em, metadata)
    VALUES
      (${escTxt(parsed.message_id)}, ${escTxt(parsed.instancia)}, 'recebida',
       ${escTxt(parsed.remote_jid)}, ${escTxt(parsed.numero_remetente)}, ${escTxt(parsed.push_name)},
       ${escBool(parsed.is_group)}, ${escBool(parsed.is_status)},
       ${escTxt(parsed.tipo)}, ${escTxt(parsed.texto)},
       ${escTxt(parsed.timestamp_evt)}, ${escTxt(JSON.stringify(payloadBruto))}::jsonb)
    ON CONFLICT (message_id, direcao) DO NOTHING
    RETURNING id;
  `;
  const insR = await db.rodarSQL(sqlIns);
  const msgRecebidaId = Array.isArray(insR) && insR[0] ? insR[0].id : null;

  if (!msgRecebidaId) {
    console.log(`[whatsapp] msg ${parsed.message_id.slice(0,12)} ja ingerida (dedup)`);
    return null;
  }

  // 2. Filtros
  if (parsed.from_me)    { console.log(`[whatsapp] from_me=true, ignorando ${parsed.message_id.slice(0,12)}`); return null; }
  if (parsed.is_status)  { console.log(`[whatsapp] is_status, ignorando`); return null; }
  if (parsed.is_group)   { console.log(`[whatsapp] is_group, ignorando (V2.14: bot so responde 1:1)`); return null; }

  // 2.1 Áudio recebido — transcreve via Whisper, depois trata como texto
  let textoUsuario = parsed.texto;
  let respostaPorAudio = false;
  if (parsed.tipo === 'audio') {
    respostaPorAudio = true; // resposta sairá em áudio (TTS) pra fechar o loop natural
    try {
      console.log(`[whatsapp-audio] recebido audio de ${parsed.numero_remetente}, baixando...`);
      const midia = await evolution.baixarMidia({
        instancia: parsed.instancia,
        message_id: parsed.message_id,
        payload_data: payloadBruto?.data,
      });
      if (!midia.base64) throw new Error('base64 do audio vazio');
      const audioBuf = Buffer.from(midia.base64, 'base64');
      console.log(`[whatsapp-audio] ${audioBuf.length} bytes, transcrevendo via Whisper...`);
      const t = await audioTranscricao.transcrever({
        audio_buffer: audioBuf,
        filename: 'audio.ogg',
        mimetype: 'audio/ogg',
        language: 'pt',
      });
      textoUsuario = t.texto;
      console.log(`[whatsapp-audio] transcrito em ${t.duracao_ms}ms: "${textoUsuario.slice(0,80)}"`);
      // Avisa o usuario que a gente entendeu
      try {
        await evolution.enviarTexto({
          instancia: parsed.instancia,
          numero: parsed.numero_remetente,
          texto: `🎙 Entendi: _"${textoUsuario.slice(0,200)}"_\n\nVou processar...`,
        });
      } catch (_) {}
    } catch (e) {
      console.error(`[whatsapp-audio] erro transcrevendo: ${e.message}`);
      try {
        await evolution.enviarTexto({
          instancia: parsed.instancia,
          numero: parsed.numero_remetente,
          texto: `⚠ Não consegui entender o áudio (${e.message}). Pode escrever ou tentar de novo?`,
        });
      } catch (_) {}
      return null;
    }
  }

  if (!textoUsuario || !textoUsuario.trim()) {
    console.log(`[whatsapp] texto vazio (tipo=${parsed.tipo}), ignorando`);
    return null;
  }

  // 3. Dispara ACK em paralelo (não bloqueia processamento)
  const ackPromise = dispararAck(parsed, textoUsuario);

  // 4. Processa via /api/chat
  const t0 = Date.now();
  const r = await processarMsgWhatsapp({
    texto: textoUsuario,
    remoteJid: parsed.remote_jid,
    pushName: parsed.push_name,
    instancia: parsed.instancia,
    message_id: parsed.message_id,
  });
  const lat = Date.now() - t0;

  // 5. Aguarda ack chegar antes da resposta (evita ordem invertida)
  await ackPromise.catch(() => {});

  // 6. Envia resposta via Evolution (texto + opcionalmente HTML anexo + áudio TTS)
  let respostaSalvaId = null;
  let envioOk = false;
  try {
    // V2.14 D fix C — dedup de resposta no servidor (defense in depth)
    // Andre pegou bug 2026-05-09 noite: bot mandou 2 mensagens iguais quando
    // pergunta de status disparou 2 tentativas de gmail-enviar (Camada B
    // bloqueou o email mas LLM gerou 2 respostas WhatsApp). Solucao: hash da
    // resposta + checa se MESMA resposta foi enviada nos ultimos 60s pro
    // mesmo numero. Se sim, suprime a 2a com warn no log.
    const respostaHash = require('crypto').createHash('sha1')
      .update(r.resposta.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 500))
      .digest('hex').slice(0, 16);
    const sqlDedup = `
      SELECT count(*) AS qtd FROM pinguim.whatsapp_mensagens
      WHERE direcao = 'enviada'
        AND remote_jid = ${escTxt(parsed.remote_jid)}
        AND md5(left(coalesce(texto, ''), 500)) = md5(${escTxt(r.resposta.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 500))})
        AND postada_em >= now() - interval '60 seconds';
    `;
    const dedupR = await db.rodarSQL(sqlDedup).catch(() => [{ qtd: 0 }]);
    const jaEnviada = parseInt(dedupR[0]?.qtd || 0, 10) > 0;
    if (jaEnviada) {
      console.warn(`[whatsapp] DEDUP SUPRIMIU resposta duplicada pra ${parsed.numero_remetente} (hash=${respostaHash}) — msg "${r.resposta.slice(0, 60)}"`);
      // Marca recebida como processada (LLM bug, mas servidor cobriu)
      const sqlUpdSup = `
        UPDATE pinguim.whatsapp_mensagens
        SET processada = true, processada_em = now(), latencia_ms = ${lat},
            erro = 'resposta_duplicada_suprimida_servidor'
        WHERE id = ${escTxt(msgRecebidaId)};
      `;
      await db.rodarSQL(sqlUpdSup).catch(_ => {});
      return { msg_recebida_id: msgRecebidaId, msg_enviada_id: null, latencia_ms: lat, envio_ok: false, suprimida_dedup: true };
    }

    // Envia texto principal
    const env = await evolution.enviarTexto({
      instancia: parsed.instancia,
      numero: parsed.numero_remetente,
      texto: r.resposta,
    });
    envioOk = true;

    // Se tem entregável, anexa HTML logo depois
    if (r.entregavel_id) {
      try {
        const ent = await db.carregarEntregavelPorId(r.entregavel_id);
        if (ent) {
          // Pega o HTML renderizado direto do endpoint
          const htmlResp = await fetch(`http://localhost:${PORT}/entregavel/${r.entregavel_id}`);
          const htmlConteudo = await htmlResp.text();
          const dataStr = new Date().toISOString().slice(0,10);
          const filename = `executivo-${dataStr}-${r.entregavel_id.slice(0,8)}.html`;
          await evolution.enviarArquivo({
            instancia: parsed.instancia,
            numero: parsed.numero_remetente,
            mediatype: 'document',
            mimetype: 'text/html',
            filename,
            conteudo: htmlConteudo,
          });
          console.log(`[whatsapp-anexo] HTML enviado: ${filename} (${htmlConteudo.length} chars)`);
        }
      } catch (e) {
        console.warn(`[whatsapp-anexo] falhou (nao bloqueante): ${e.message}`);
      }
    }

    // Se sócio mandou áudio, responde também por áudio (TTS) — mantém canal natural
    if (respostaPorAudio) {
      try {
        // Limita texto pra TTS (4000 chars max)
        const textoTts = r.resposta.length > 1500 ? r.resposta.slice(0, 1500) + '. Mandei o resto por escrito acima.' : r.resposta;
        const audio = await audioTranscricao.sintetizar({
          texto: textoTts,
          voice: 'nova',
          formato: 'opus',
        });
        await evolution.enviarAudio({
          instancia: parsed.instancia,
          numero: parsed.numero_remetente,
          audio_buffer: audio.buffer,
        });
        console.log(`[whatsapp-tts] audio enviado (${audio.bytes} bytes, ${audio.duracao_ms}ms)`);
      } catch (e) {
        console.warn(`[whatsapp-tts] falhou (nao bloqueante): ${e.message}`);
      }
    }

    const sqlEnv = `
      INSERT INTO pinguim.whatsapp_mensagens
        (message_id, instancia, direcao, remote_jid, numero_remetente,
         is_group, is_status, tipo, texto, cliente_id, thread_id,
         processada, processada_em, latencia_ms, postada_em)
      VALUES
        (${escTxt(env.id || ('local-' + Date.now()))}, ${escTxt(parsed.instancia)}, 'enviada',
         ${escTxt(parsed.remote_jid)}, ${escTxt(parsed.numero_remetente)},
         false, false, 'texto', ${escTxt(r.resposta)},
         ${r.cliente_id ? escTxt(r.cliente_id) : 'NULL'}, ${escTxt(r.thread_id)},
         true, now(), ${lat}, now())
      ON CONFLICT (message_id, direcao) DO NOTHING
      RETURNING id;
    `;
    const envR = await db.rodarSQL(sqlEnv);
    respostaSalvaId = Array.isArray(envR) && envR[0] ? envR[0].id : null;
  } catch (e) {
    console.error(`[whatsapp] erro enviando resposta: ${e.message}`);
  }

  // 7. Atualiza msg recebida
  if (respostaSalvaId || r.processada) {
    const sqlUpd = `
      UPDATE pinguim.whatsapp_mensagens
      SET cliente_id = ${r.cliente_id ? escTxt(r.cliente_id) : 'NULL'},
          thread_id = ${escTxt(r.thread_id)},
          processada = true,
          processada_em = now(),
          latencia_ms = ${lat},
          resposta_id = ${respostaSalvaId ? escTxt(respostaSalvaId) : 'NULL'},
          erro = ${escTxt(r.erro || null)}
      WHERE id = ${escTxt(msgRecebidaId)};
    `;
    await db.rodarSQL(sqlUpd).catch(e => console.error(`[whatsapp] update recebida: ${e.message}`));
  }

  return { msg_recebida_id: msgRecebidaId, msg_enviada_id: respostaSalvaId, latencia_ms: lat, envio_ok: envioOk };
}

app.post('/api/whatsapp/webhook', async (req, res) => {
  // Sempre 200 imediato pra Evolution nao re-tentar (processamento async)
  res.json({ ok: true });

  try {
    const payload = req.body || {};
    const evento = payload.event || 'unknown';
    if (evento !== 'messages.upsert') {
      console.log(`[whatsapp-webhook] ignorando evento ${evento}`);
      return;
    }
    const parsed = evolution.parseMensagemRecebida(payload);
    if (!parsed) { console.log('[whatsapp-webhook] payload invalido'); return; }

    // V2.14 D Categoria I — WHITELIST
    // Mensagens do próprio bot (from_me) sempre passam.
    // Mensagens IN (de outro número) passam só se número está em pinguim.whatsapp_autorizados ativo.
    if (!parsed.from_me) {
      const whitelist = require('./lib/whitelist');
      const check = await whitelist.checarNumero(parsed.numero_remetente);
      if (!check.autorizado) {
        console.warn(`[whatsapp-webhook] BLOQUEADO ${parsed.numero_remetente} | "${parsed.texto.slice(0,60)}"`);
        await whitelist.logarBloqueio({
          numero: parsed.numero_remetente,
          push_name: parsed.push_name || null,
          texto: parsed.texto,
          evento,
          raw_payload: { event: evento, key: payload?.data?.key, message_type: payload?.data?.messageType },
        });
        return;
      }
      console.log(`[whatsapp-webhook] msg IN | ${parsed.numero_remetente} (${check.rotulo}) | "${parsed.texto.slice(0,60)}"`);
    } else {
      console.log(`[whatsapp-webhook] msg OUT | ${parsed.numero_remetente} | "${parsed.texto.slice(0,60)}"`);
    }

    await ingerirMsgRecebida(parsed, payload);
  } catch (e) {
    console.error('[whatsapp-webhook] erro:', e.message);
  }
});

app.post('/api/whatsapp/enviar', async (req, res) => {
  try {
    const { numero, texto, instancia, origem_canal = 'chat-web', forcar = false } = req.body || {};
    if (!numero) return res.status(400).json({ ok: false, error: 'numero obrigatorio' });
    if (!texto)  return res.status(400).json({ ok: false, error: 'texto obrigatorio' });

    const numeroNormalizado = String(numero).replace(/\D/g, '');
    const t0 = Date.now();

    // V2.14 D — Camada B anti-duplicação (mesma proteção do Gmail)
    if (forcar === true) {
      // Bypass — sócio explicitamente pediu reenvio
      const r = await evolution.enviarTexto({ numero: numeroNormalizado, texto, instancia });
      const dur = Date.now() - t0;
      console.log(`[whatsapp-enviar] ${dur}ms | para=${numeroNormalizado} | inst=${r.instancia} | id=${(r.id||'').slice(0,12)} | FORÇADO`);
      // Registra sucesso forçado pra audit
      const { hashAcao, registrar } = require('./lib/anti-duplicacao');
      const hash = hashAcao({ tipo_acao: 'whatsapp-enviar', destino: numeroNormalizado, corpo: texto });
      await registrar({
        tipo_acao: 'whatsapp-enviar', hash_acao: hash, destino: numeroNormalizado,
        resumo: texto.slice(0, 80), origem_canal, status: 'sucesso',
        motivo: 'forcar=true (sócio autorizou reenvio explícito)',
        metadata: { resultado_id: r.id || null },
      }).catch(() => {});
      return res.json({ ok: true, ...r, latencia_ms: dur, forcado: true });
    }

    const { executarComCheck } = require('./lib/anti-duplicacao');
    const result = await executarComCheck({
      tipo_acao: 'whatsapp-enviar',
      destino: numeroNormalizado,
      corpo: texto,
      resumo: texto.slice(0, 80),
      origem_canal,
      janela_min: 5,
      fn: async () => evolution.enviarTexto({ numero: numeroNormalizado, texto, instancia }),
    });

    const dur = Date.now() - t0;
    if (result.bloqueada) {
      console.warn(`[whatsapp-enviar] BLOQUEADO duplicata pra ${numeroNormalizado} (${result.minutos_atras}min atras)`);
      return res.status(409).json({
        ok: false,
        bloqueado_duplicata: true,
        alerta: result.alerta,
        anterior_em: result.anterior_em,
        minutos_atras: result.minutos_atras,
      });
    }
    const r = result.resultado;
    console.log(`[whatsapp-enviar] ${dur}ms | para=${numeroNormalizado} | inst=${r.instancia} | id=${(r.id||'').slice(0,12)}`);
    res.json({ ok: true, ...r, latencia_ms: dur });
  } catch (e) {
    console.error('[whatsapp-enviar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/whatsapp/status', async (req, res) => {
  try {
    const cfg = await evolution.getConfig();
    const inst = req.query.instancia || cfg.instanceBot;
    if (!inst) {
      return res.json({ ok: true, configurado: false, motivo: 'EVOLUTION_INSTANCE_BOT nao no cofre — definir antes de usar' });
    }
    const i = await evolution.buscarInstancia(inst).catch(() => null);
    if (!i) return res.json({ ok: true, configurado: true, instancia: inst, encontrada: false });

    // Stats da tabela whatsapp_mensagens
    const sql = `
      SELECT
        count(*) FILTER (WHERE direcao='recebida' AND postada_em >= now() - interval '24 hours') AS recebidas_24h,
        count(*) FILTER (WHERE direcao='enviada'  AND postada_em >= now() - interval '24 hours') AS enviadas_24h,
        count(*) FILTER (WHERE processada = false) AS pendentes,
        count(*) FILTER (WHERE direcao='recebida' AND erro IS NOT NULL) AS com_erro
      FROM pinguim.whatsapp_mensagens;
    `;
    const [stats] = await db.rodarSQL(sql).catch(() => [{}]);

    res.json({
      ok: true,
      configurado: true,
      instancia: inst,
      conectada: i.connectionStatus === 'open',
      status: i.connectionStatus,
      numero: i.number,
      profile_name: i.profileName,
      msgs_total: i._count?.Message,
      stats_24h: {
        recebidas: parseInt(stats.recebidas_24h || 0, 10),
        enviadas: parseInt(stats.enviadas_24h || 0, 10),
        pendentes: parseInt(stats.pendentes || 0, 10),
        com_erro: parseInt(stats.com_erro || 0, 10),
      },
    });
  } catch (e) {
    console.error('[whatsapp-status] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.14 D — Categoria G: HOTMART (G1-G8)
// ============================================================
// Endpoints que cobrem o caso de uso completo do sócio:
// G1 consultar comprador  G2 listar vendas    G3 listar reembolsos
// G4 verificar assinatura G5 reembolsar       G6 gerenciar assinatura
// G7 cupom (criar/listar/deletar)             G8 notificar suporte (acesso pendente)
//
// Camada híbrida (lib/hotmart-hibrido.js) tenta 2º Supabase primeiro pra leitura
// e cai pra API direta se faltar dado. Escrita SEMPRE API direta + Camada B.
// ============================================================

const hotmart = require('./lib/hotmart');
const hotmartHibrido = require('./lib/hotmart-hibrido');

// ---------- G1 — Consultar comprador (histórico completo) ----------
app.post('/api/hotmart/consultar-comprador', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, error: 'email obrigatório' });
    const r = await hotmartHibrido.consultarCompradorPorEmail({ email });
    res.json(r);
  } catch (e) {
    console.error('[hotmart-consultar-comprador] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- G2 — Listar vendas por período ----------
app.post('/api/hotmart/listar-vendas', async (req, res) => {
  try {
    const { start_date_brt, end_date_brt, produto_id, status, moeda } = req.body || {};
    if (!start_date_brt || !end_date_brt) return res.status(400).json({ ok: false, error: 'start_date_brt e end_date_brt obrigatórios (YYYY-MM-DD)' });
    const r = await hotmartHibrido.listarVendasPorPeriodo({ start_date_brt, end_date_brt, produto_id, status, moeda });
    res.json(r);
  } catch (e) {
    console.error('[hotmart-listar-vendas] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- G3 — Listar reembolsos por período ----------
app.post('/api/hotmart/listar-reembolsos', async (req, res) => {
  try {
    const { start_date_brt, end_date_brt, moeda } = req.body || {};
    if (!start_date_brt || !end_date_brt) return res.status(400).json({ ok: false, error: 'start_date_brt e end_date_brt obrigatórios' });
    const r = await hotmartHibrido.listarReembolsosPorPeriodo({ start_date_brt, end_date_brt, moeda });
    res.json(r);
  } catch (e) {
    console.error('[hotmart-listar-reembolsos] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- G4 — Verificar assinatura ativa ----------
app.post('/api/hotmart/verificar-assinatura', async (req, res) => {
  try {
    const { email, produto_id } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, error: 'email obrigatório' });
    const r = await hotmartHibrido.verificarAssinaturaAtiva({ email, produto_id });
    res.json(r);
  } catch (e) {
    console.error('[hotmart-verificar-assinatura] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- G4b — Verificar acesso REAL à área de membros (Members Area API) ----------
// V2.14 D 2026-05-10: chamada real ao /club/api/v1/users (não mais gap honesto).
// Itera nos clubs cadastrados em pinguim.hotmart_clubs e devolve onde acha o aluno.
app.post('/api/hotmart/verificar-acesso-membros', async (req, res) => {
  try {
    const { email, produto_id } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, error: 'email obrigatório' });
    const r = await hotmartHibrido.verificarAcessoAreaMembros({ email, produto_id });
    res.json(r);
  } catch (e) {
    console.error('[hotmart-verificar-acesso-membros] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- G4c — Cadastrar/atualizar Club no banco (subdomain → produto) ----------
app.post('/api/hotmart/cadastrar-club', async (req, res) => {
  try {
    const club = require('./lib/hotmart-club');
    const { subdomain, produto_id, produto_nome, produto_ucode, descricao, observacoes } = req.body || {};
    if (!subdomain) return res.status(400).json({ ok: false, error: 'subdomain obrigatório' });
    // Valida primeiro
    const v = await club.validarSubdomain(subdomain);
    if (!v.valido) return res.status(400).json({ ok: false, error: 'subdomain inválido na Hotmart Members Area API', detalhe: v.motivo });
    const r = await club.cadastrarClub({ subdomain, produto_id, produto_nome, produto_ucode, descricao, total_modulos: v.total_modulos, observacoes });
    res.json({ ok: true, ...r, total_modulos: v.total_modulos });
  } catch (e) {
    console.error('[hotmart-cadastrar-club] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- G4d — Listar Clubs cadastrados ----------
app.get('/api/hotmart/clubs', async (req, res) => {
  try {
    const club = require('./lib/hotmart-club');
    const lista = await club.listarClubs();
    res.json({ ok: true, total: lista.length, clubs: lista });
  } catch (e) {
    console.error('[hotmart-clubs] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// V2.14 D Fix — Resolve nome de produto pra produto_id (fuzzy match em pinguim.hotmart_clubs)
// Usado pelo script G4b pra aceitar nome em vez de só ID. Resolve "ProAlt", "Elo", "365 Dias" etc.
app.post('/api/hotmart/resolver-produto', async (req, res) => {
  try {
    const { nome } = req.body || {};
    if (!nome) return res.status(400).json({ ok: false, error: 'nome obrigatório' });

    // Normaliza: lowercase + remove acentos + tira "club ", "de ", "do ", etc
    const norm = (s) => String(s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\b(club|clube|do|da|de|dos|das|the|o|a)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();

    const alvo = norm(nome);

    // Match na hotmart_clubs por produto_nome OU subdomain
    const sql = `
      SELECT subdomain, produto_id, produto_nome
      FROM pinguim.hotmart_clubs
      WHERE ativo = true
      ORDER BY produto_nome
    `;
    const r = await db.rodarSQL(sql);
    if (!Array.isArray(r) || r.length === 0) return res.json({ ok: false, error: 'nenhum Club cadastrado' });

    // Procura match exato, depois "contém", depois fuzzy
    let match = r.find(c => norm(c.produto_nome) === alvo || norm(c.subdomain) === alvo);
    if (!match) match = r.find(c => norm(c.produto_nome).includes(alvo) || alvo.includes(norm(c.produto_nome)));
    if (!match) match = r.find(c => {
      const palavrasAlvo = alvo.split(' ').filter(p => p.length > 2);
      const palavrasProd = norm(c.produto_nome).split(' ');
      return palavrasAlvo.some(p => palavrasProd.includes(p));
    });

    if (!match) return res.json({ ok: false, error: `Nao achei produto "${nome}" nos Clubs cadastrados`, total_clubs: r.length });
    res.json({ ok: true, nome_pesquisado: nome, produto_id: match.produto_id, produto_nome: match.produto_nome, subdomain: match.subdomain });
  } catch (e) {
    console.error('[hotmart-resolver-produto] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- G5 — Aprovar reembolso (escrita + Camada B) ----------
app.post('/api/hotmart/reembolsar', async (req, res) => {
  try {
    const { transaction, origem_canal = 'chat-web', forcar = false } = req.body || {};
    if (!transaction) return res.status(400).json({ ok: false, error: 'transaction obrigatório' });

    const t0 = Date.now();
    if (forcar === true) {
      const r = await hotmart.reembolsarVenda({ transaction });
      const { hashAcao, registrar } = require('./lib/anti-duplicacao');
      const hash = hashAcao({ tipo_acao: 'hotmart-refund', destino: transaction, corpo: 'refund' });
      await registrar({
        tipo_acao: 'hotmart-refund', hash_acao: hash, destino: transaction,
        resumo: `Refund ${transaction}`, origem_canal, status: 'sucesso',
        motivo: 'forcar=true', metadata: { resultado: r },
      }).catch(() => {});
      return res.json({ ok: true, ...r, latencia_ms: Date.now() - t0, forcado: true });
    }

    const { executarComCheck } = require('./lib/anti-duplicacao');
    const result = await executarComCheck({
      tipo_acao: 'hotmart-refund',
      destino: transaction,
      corpo: 'refund',
      resumo: `Refund ${transaction}`,
      origem_canal,
      janela_min: 60, // janela maior — refund acidental é catastrófico
      fn: async () => hotmart.reembolsarVenda({ transaction }),
    });

    if (result.bloqueada) {
      console.warn(`[hotmart-refund] BLOQUEADO duplicata pra ${transaction} (${result.minutos_atras}min atrás)`);
      return res.status(409).json({ ok: false, bloqueado_duplicata: true, alerta: result.alerta, anterior_em: result.anterior_em, minutos_atras: result.minutos_atras });
    }
    res.json({ ok: true, ...result.resultado, latencia_ms: Date.now() - t0 });
  } catch (e) {
    console.error('[hotmart-refund] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- G6 — Gerenciar assinatura (cancelar/reativar/mudar dia) ----------
app.post('/api/hotmart/cancelar-assinatura', async (req, res) => {
  try {
    const { subscriber_code, send_mail = true, origem_canal = 'chat-web', forcar = false } = req.body || {};
    if (!subscriber_code) return res.status(400).json({ ok: false, error: 'subscriber_code obrigatório' });

    if (forcar === true) {
      const r = await hotmart.cancelarAssinatura({ subscriber_code, send_mail });
      return res.json({ ok: true, ...r, forcado: true });
    }

    const { executarComCheck } = require('./lib/anti-duplicacao');
    const codes = Array.isArray(subscriber_code) ? subscriber_code.join(',') : subscriber_code;
    const result = await executarComCheck({
      tipo_acao: 'hotmart-cancel-sub',
      destino: codes,
      corpo: `cancel send_mail=${send_mail}`,
      resumo: `Cancelar ${codes}`,
      origem_canal,
      janela_min: 30,
      fn: async () => hotmart.cancelarAssinatura({ subscriber_code, send_mail }),
    });
    if (result.bloqueada) return res.status(409).json({ ok: false, bloqueado_duplicata: true, ...result });
    res.json({ ok: true, ...result.resultado });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/hotmart/reativar-assinatura', async (req, res) => {
  try {
    const { subscriber_code, charge = false } = req.body || {};
    if (!subscriber_code) return res.status(400).json({ ok: false, error: 'subscriber_code obrigatório' });
    const r = await hotmart.reativarAssinatura({ subscriber_code, charge });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/hotmart/mudar-dia-cobranca', async (req, res) => {
  try {
    const { subscriber_code, due_day } = req.body || {};
    if (!subscriber_code || !due_day) return res.status(400).json({ ok: false, error: 'subscriber_code e due_day obrigatórios' });
    const r = await hotmart.mudarDiaCobranca({ subscriber_code, due_day });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- G7 — Cupom (criar/listar/deletar) ----------
app.post('/api/hotmart/cupom-listar', async (req, res) => {
  try {
    const { product_id } = req.body || {};
    if (!product_id) return res.status(400).json({ ok: false, error: 'product_id obrigatório' });
    const r = await hotmart.listarCupons({ product_id });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/hotmart/cupom-criar', async (req, res) => {
  try {
    const { product_id, code, discount, start_date, end_date, max_uses, offer_ids, origem_canal = 'chat-web', forcar = false } = req.body || {};
    if (!product_id || !code || discount == null) return res.status(400).json({ ok: false, error: 'product_id, code, discount obrigatórios' });

    if (forcar === true) {
      const r = await hotmart.criarCupom({ product_id, code, discount, start_date, end_date, max_uses, offer_ids });
      return res.json({ ok: true, ...r, forcado: true });
    }

    const { executarComCheck } = require('./lib/anti-duplicacao');
    const result = await executarComCheck({
      tipo_acao: 'hotmart-cupom-criar',
      destino: `${product_id}:${code}`,
      corpo: `discount=${discount}`,
      resumo: `Cupom ${code} ${(discount * 100).toFixed(0)}%`,
      origem_canal,
      janela_min: 60,
      fn: async () => hotmart.criarCupom({ product_id, code, discount, start_date, end_date, max_uses, offer_ids }),
    });
    if (result.bloqueada) return res.status(409).json({ ok: false, bloqueado_duplicata: true, ...result });
    res.json({ ok: true, ...result.resultado });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/hotmart/cupom-deletar', async (req, res) => {
  try {
    const { coupon_id } = req.body || {};
    if (!coupon_id) return res.status(400).json({ ok: false, error: 'coupon_id obrigatório' });
    const r = await hotmart.deletarCupom({ coupon_id });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- G8 — Notificar suporte interno (acesso pendente Princípia Pay) ----------
// Caso de uso: aluno comprou via Princípia Pay (boleto financiado), Hotmart NÃO
// vai liberar acesso automático. Atendente abre ticket aqui pra suporte humano
// cadastrar manualmente. Notifica Discord + grava em pinguim.acessos_pendentes.
app.post('/api/hotmart/notificar-acesso-pendente', async (req, res) => {
  try {
    const {
      email_aluno,
      nome_aluno,
      produto_hotmart_id,
      produto_hotmart_nome,
      origem_pagamento = 'principia-pay',
      evidencia,
      cliente_id,
      origem_canal = 'chat-web',
    } = req.body || {};
    if (!email_aluno) return res.status(400).json({ ok: false, error: 'email_aluno obrigatório' });
    if (!produto_hotmart_id && !produto_hotmart_nome) return res.status(400).json({ ok: false, error: 'produto_hotmart_id ou produto_hotmart_nome obrigatório' });

    const { executarComCheck } = require('./lib/anti-duplicacao');
    const destino = `${email_aluno}:${produto_hotmart_id || produto_hotmart_nome}`;

    const result = await executarComCheck({
      cliente_id,
      tipo_acao: 'hotmart-acesso-pendente',
      destino,
      corpo: JSON.stringify({ origem_pagamento, evidencia }),
      resumo: `Acesso pendente: ${email_aluno} → ${produto_hotmart_nome || produto_hotmart_id}`,
      origem_canal,
      janela_min: 60 * 24, // 24h — não notificar 2x o mesmo aluno-produto no dia
      fn: async () => {
        // Grava registro
        const cid = await db.resolverClienteId(cliente_id);
        const sqlIns = `
          INSERT INTO pinguim.acessos_pendentes
            (cliente_id, email_aluno, nome_aluno, produto_hotmart_id, produto_hotmart_nome,
             origem_pagamento, evidencia, status, metadata)
          VALUES
            ('${cid}', '${email_aluno.replace(/'/g, "''")}', ${nome_aluno ? "'" + nome_aluno.replace(/'/g, "''") + "'" : 'NULL'},
             ${produto_hotmart_id ? "'" + produto_hotmart_id.replace(/'/g, "''") + "'" : 'NULL'},
             ${produto_hotmart_nome ? "'" + produto_hotmart_nome.replace(/'/g, "''") + "'" : 'NULL'},
             '${origem_pagamento.replace(/'/g, "''")}',
             ${evidencia ? "'" + JSON.stringify(evidencia).replace(/'/g, "''") + "'::jsonb" : "'{}'::jsonb"},
             'pendente',
             '{}'::jsonb)
          RETURNING id, criado_em;
        `;
        const insR = await db.rodarSQL(sqlIns);
        const registro = Array.isArray(insR) && insR[0] ? insR[0] : null;

        // TODO V2.15 hybrid-ops-squad: notificar Discord automaticamente (canal #acessos-pendentes)
        // Por enquanto retorna registro pra agente avisar o sócio.
        return {
          id: registro?.id,
          criado_em: registro?.criado_em,
          status: 'pendente',
          aviso: 'Registro criado em pinguim.acessos_pendentes. Notificação Discord será adicionada quando hybrid-ops-squad estiver populada (V2.15).',
        };
      },
    });

    if (result.bloqueada) return res.status(409).json({ ok: false, bloqueado_duplicata: true, ...result });
    res.json({ ok: true, ...result.resultado });
  } catch (e) {
    console.error('[hotmart-acesso-pendente] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.14 D Categoria H — META MARKETING API + PAGES (read-only)
// ============================================================
// Wrapper Meta Graph API. Token longo 60d no cofre Pinguim.
// 5 tools read-only iniciais:
//   H1 listar-ad-accounts | H2 listar-campanhas | H3 insights-campanha
//   H4 listar-pages       | H5 inspecionar-token
// Instagram (orgânico, posts, comments) é frente separada — token IG
// vai noutra entrada do cofre quando a configuração concluir.
// ============================================================
const meta = require('./lib/meta');

// ---------- H1 — Listar todas as ad accounts visíveis ao token ----------
app.post('/api/meta/listar-ad-accounts', async (req, res) => {
  try {
    const r = await meta.listarAdAccounts({ limit: 200 });
    const contas = (r.data || []).map((c) => ({
      id: c.id,
      account_id: c.account_id,
      name: c.name,
      account_status: c.account_status,
      currency: c.currency,
      timezone_name: c.timezone_name,
      business: c.business || null,
      amount_spent: c.amount_spent,
      balance: c.balance,
    }));
    res.json({ ok: true, total: contas.length, contas });
  } catch (e) {
    console.error('[meta-listar-ad-accounts] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- H2 — Listar campanhas de um ad account ----------
app.post('/api/meta/listar-campanhas', async (req, res) => {
  try {
    const { ad_account_id, status, limit = 100 } = req.body || {};
    if (!ad_account_id) return res.status(400).json({ ok: false, error: 'ad_account_id obrigatório (formato act_XXX)' });
    const r = await meta.listarCampanhas({ ad_account_id, status, limit });
    res.json({ ok: true, ad_account_id, total: (r.data || []).length, campanhas: r.data || [] });
  } catch (e) {
    console.error('[meta-listar-campanhas] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- H3 — Insights (métricas) de uma campanha ----------
app.post('/api/meta/insights-campanha', async (req, res) => {
  try {
    const { campaign_id, date_preset = 'last_7d', time_range, level, breakdowns } = req.body || {};
    if (!campaign_id) return res.status(400).json({ ok: false, error: 'campaign_id obrigatório' });
    const r = await meta.insightsCampanha({ campaign_id, date_preset, time_range, level, breakdowns });
    res.json({ ok: true, campaign_id, preset: date_preset, insights: r.data || [] });
  } catch (e) {
    console.error('[meta-insights-campanha] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- H4 — Listar páginas Facebook conectadas ----------
app.post('/api/meta/listar-pages', async (req, res) => {
  try {
    const r = await meta.listarPages({ limit: 200 });
    res.json({ ok: true, total: (r.data || []).length, pages: r.data || [] });
  } catch (e) {
    console.error('[meta-listar-pages] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- H5 — Inspecionar token (validade, scopes, app) ----------
app.post('/api/meta/inspecionar-token', async (req, res) => {
  try {
    const info = await meta.inspecionarToken();
    res.json({ ok: true, info });
  } catch (e) {
    console.error('[meta-inspecionar-token] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- H6 — Renovar token longo (chama Graph API fb_exchange_token) ----------
app.post('/api/meta/renovar-token', async (req, res) => {
  try {
    const r = await meta.renovarTokenLongo();
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[meta-renovar-token] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.14 D Categoria I — WHATSAPP WHITELIST (admin endpoints)
// ============================================================
// Atendente Pinguim só responde números autorizados.
// Webhook /api/whatsapp/webhook filtra usando lib/whitelist.js.
// ============================================================
const whitelistLib = require('./lib/whitelist');

app.post('/api/whatsapp/whitelist/listar', async (req, res) => {
  try {
    const { apenas_ativos = true } = req.body || {};
    const lista = await whitelistLib.listar({ apenas_ativos });
    res.json({ ok: true, total: lista.length, autorizados: lista });
  } catch (e) {
    console.error('[whatsapp-whitelist-listar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/whatsapp/whitelist/autorizar', async (req, res) => {
  try {
    const { numero, socio_slug, rotulo, observacao } = req.body || {};
    if (!numero) return res.status(400).json({ ok: false, error: 'numero obrigatorio' });
    if (!rotulo) return res.status(400).json({ ok: false, error: 'rotulo obrigatorio' });
    const r = await whitelistLib.autorizar({ numero, socio_slug, rotulo, observacao });
    res.json({ ok: true, autorizado: r });
  } catch (e) {
    console.error('[whatsapp-whitelist-autorizar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/whatsapp/whitelist/revogar', async (req, res) => {
  try {
    const { numero } = req.body || {};
    if (!numero) return res.status(400).json({ ok: false, error: 'numero obrigatorio' });
    const r = await whitelistLib.revogar({ numero });
    if (!r) return res.status(404).json({ ok: false, error: 'numero nao encontrado na whitelist' });
    res.json({ ok: true, revogado: r });
  } catch (e) {
    console.error('[whatsapp-whitelist-revogar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/whatsapp/whitelist/bloqueios', async (req, res) => {
  try {
    const { horas = 168, limite = 50 } = req.body || {};
    const r = await whitelistLib.listarBloqueios({ horas, limite });
    res.json({ ok: true, total: r.length, bloqueios: r });
  } catch (e) {
    console.error('[whatsapp-whitelist-bloqueios] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.14.5 — APRENDIZADOS DO AGENTE (Categoria J — feedback classificado)
// ============================================================
// Usa tabelas existentes (Princípio 11):
//   pinguim.aprendizados_agente (geral, agente_id=PINGUIM)
//   pinguim.aprendizados_cliente_agente (pessoal por sócio)
// ============================================================
const aprendizadosLib = require('./lib/aprendizados');

app.post('/api/aprendizados/adicionar-geral', async (req, res) => {
  try {
    const { texto, origem = 'feedback-chat' } = req.body || {};
    if (!texto) return res.status(400).json({ ok: false, error: 'texto obrigatorio' });
    const r = await aprendizadosLib.adicionarAprendizadoGeral({ texto, origem });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[aprendizados-geral] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/aprendizados/adicionar-pessoal', async (req, res) => {
  try {
    const { cliente_id, texto, origem = 'feedback-chat' } = req.body || {};
    if (!cliente_id) return res.status(400).json({ ok: false, error: 'cliente_id obrigatorio' });
    if (!texto) return res.status(400).json({ ok: false, error: 'texto obrigatorio' });
    const r = await aprendizadosLib.adicionarAprendizadoPessoal({ cliente_id, texto, origem });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[aprendizados-pessoal] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/aprendizados/ler-geral', async (req, res) => {
  try {
    const r = await aprendizadosLib.lerAprendizadosGerais();
    res.json({ ok: true, aprendizados: r });
  } catch (e) {
    console.error('[aprendizados-ler-geral] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/aprendizados/ler-pessoal', async (req, res) => {
  try {
    const { cliente_id } = req.body || {};
    if (!cliente_id) return res.status(400).json({ ok: false, error: 'cliente_id obrigatorio' });
    const r = await aprendizadosLib.lerAprendizadosDoSocio(cliente_id);
    res.json({ ok: true, aprendizados: r });
  } catch (e) {
    console.error('[aprendizados-ler-pessoal] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/aprendizados/listar-clientes', async (req, res) => {
  try {
    const r = await aprendizadosLib.listarTodosClientes();
    res.json({ ok: true, total: r.length, clientes: r });
  } catch (e) {
    console.error('[aprendizados-listar-clientes] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.15 Fase 1 Parte 2 — JOBS (Plan-and-Execute queue)
// ============================================================
// Pinguim cria job quando detecta pedido complexo. Planner gera plano JSON.
// Socio aprova "sim" no chat -> worker (Fase 2) executa assincrono.
// ============================================================
const jobsLib = require('./lib/jobs');
const planner = require('./lib/planner');

// Criar job em rascunho (Pinguim chama quando detecta pedido complexo)
app.post('/api/jobs/criar', async (req, res) => {
  try {
    const {
      cliente_id, agente_id, canal_origem, thread_id_origem,
      discord_canal_id, discord_user_id, whatsapp_numero,
      pedido_original, tipo_pedido, squad_executora,
    } = req.body || {};
    if (!cliente_id) return res.status(400).json({ ok: false, error: 'cliente_id obrigatorio' });
    if (!canal_origem) return res.status(400).json({ ok: false, error: 'canal_origem obrigatorio' });
    if (!pedido_original) return res.status(400).json({ ok: false, error: 'pedido_original obrigatorio' });
    const r = await jobsLib.criarJob({
      cliente_id, agente_id, canal_origem, thread_id_origem,
      discord_canal_id, discord_user_id, whatsapp_numero,
      pedido_original, tipo_pedido, squad_executora,
    });
    res.json({ ok: true, job: r });
  } catch (e) {
    console.error('[jobs-criar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Planejar: chama Claude CLI (Planner), grava plano + briefing_resumo,
// muda status pra aguardando_aprovacao. Pinguim mostra briefing pro socio.
app.post('/api/jobs/planejar', async (req, res) => {
  try {
    const { job_id, contexto } = req.body || {};
    if (!job_id) return res.status(400).json({ ok: false, error: 'job_id obrigatorio' });
    const job = await jobsLib.carregarJob({ job_id });
    if (!job) return res.status(404).json({ ok: false, error: 'job nao encontrado' });
    if (job.status !== 'rascunho') {
      return res.status(409).json({ ok: false, error: `job status=${job.status}, esperava rascunho` });
    }
    console.log(`[jobs-planejar] job=${job_id} | pedido="${job.pedido_original.slice(0, 80)}..."`);
    const t0 = Date.now();
    const plano = await planner.gerarPlano({
      pedido_original: job.pedido_original,
      contexto: contexto || '',
    });
    const planejou_ms = Date.now() - t0;
    const atualizado = await jobsLib.gravarPlano({
      job_id,
      plano_json: plano,
      briefing_resumo: plano.briefing_resumo,
      tipo_pedido: plano.tipo_pedido || null,
      squad_executora: plano.squad_executora || null,
    });
    console.log(`[jobs-planejar] OK ${planejou_ms}ms | tipo=${plano.tipo_pedido} | squad=${plano.squad_executora}`);
    res.json({ ok: true, job: atualizado, plano, planejou_ms });
  } catch (e) {
    console.error('[jobs-planejar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Aprovar: socio respondeu "sim" -> entra na fila do worker
app.post('/api/jobs/aprovar', async (req, res) => {
  try {
    const { job_id } = req.body || {};
    if (!job_id) return res.status(400).json({ ok: false, error: 'job_id obrigatorio' });
    const r = await jobsLib.aprovarJob({ job_id });
    if (!r) return res.status(409).json({ ok: false, error: 'job nao estava em aguardando_aprovacao' });
    res.json({ ok: true, job: r });
  } catch (e) {
    console.error('[jobs-aprovar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Cancelar: socio respondeu "nao" / mudou de ideia
app.post('/api/jobs/cancelar', async (req, res) => {
  try {
    const { job_id, motivo } = req.body || {};
    if (!job_id) return res.status(400).json({ ok: false, error: 'job_id obrigatorio' });
    const r = await jobsLib.cancelarJob({ job_id, motivo });
    if (!r) return res.status(409).json({ ok: false, error: 'job nao estava em rascunho/aguardando_aprovacao' });
    res.json({ ok: true, job: r });
  } catch (e) {
    console.error('[jobs-cancelar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Listar jobs do socio (Pinguim verifica antes de responder, mostra status)
app.post('/api/jobs/listar', async (req, res) => {
  try {
    const { cliente_id, status_filtro, limite } = req.body || {};
    if (!cliente_id) return res.status(400).json({ ok: false, error: 'cliente_id obrigatorio' });
    const r = await jobsLib.listarJobsDoSocio({ cliente_id, status_filtro, limite: limite || 5 });
    res.json({ ok: true, total: r.length, jobs: r });
  } catch (e) {
    console.error('[jobs-listar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Carregar um job especifico (debug + acompanhamento)
app.post('/api/jobs/carregar', async (req, res) => {
  try {
    const { job_id } = req.body || {};
    if (!job_id) return res.status(400).json({ ok: false, error: 'job_id obrigatorio' });
    const r = await jobsLib.carregarJob({ job_id });
    if (!r) return res.status(404).json({ ok: false, error: 'job nao encontrado' });
    res.json({ ok: true, job: r });
  } catch (e) {
    console.error('[jobs-carregar] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Jobs concluidos+nao-notificados do socio (Pinguim polla a cada turno)
app.post('/api/jobs/pendentes-notificar', async (req, res) => {
  try {
    const { cliente_id } = req.body || {};
    if (!cliente_id) return res.status(400).json({ ok: false, error: 'cliente_id obrigatorio' });
    const r = await jobsLib.buscarConcluidosNaoNotificados({ cliente_id });
    res.json({ ok: true, total: r.length, jobs: r });
  } catch (e) {
    console.error('[jobs-pendentes] erro:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// V2.14 Frente C1 — endpoint RELATORIO EXECUTIVO (sob demanda)
// ============================================================
// Mesma funcao chamada pelo cron das 8h (Frente C2 futura) e por on-demand
// no chat ("gera meu executivo agora"). Janela flexivel — default 24h, mas
// aceita 6h ("o que rolou desde o ultimo envio"), 72h, etc.
//
// Body:
//   { janela_horas?: 24, dia_alvo_brt?: '2026-05-09', moeda?: 'BRL',
//     modulos_incluir?: ['financeiro','agenda','triagem-email','discord'],
//     salvar?: true }
//
// Resposta:
//   { ok, entregavel_id, entregavel_url, titulo, modulos: [{slug, ok, latencia_ms}],
//     sintetizador: {ok, motivo?}, duracao_ms }
// ============================================================
app.post('/api/relatorio/gerar', async (req, res) => {
  try {
    const { janela_horas = 24, dia_alvo_brt, moeda, modulos_incluir, cliente_id, salvar = true } = req.body || {};
    console.log(`[relatorio-gerar] iniciando | janela=${janela_horas}h | dia_alvo=${dia_alvo_brt || 'auto'} | modulos=${modulos_incluir ? modulos_incluir.join(',') : 'default'}`);
    const t0 = Date.now();
    const r = await relatorioExecutivo.gerarRelatorioExecutivo({
      cliente_id, janela_horas, dia_alvo_brt, moeda, modulos_incluir, salvar,
    });
    const dur_ms = Date.now() - t0;
    console.log(`[relatorio-gerar] OK ${dur_ms}ms | entregavel=${r.entregavel_id || 'NAO_SALVO'} | sintetizador_ok=${r.sintetizador.ok}`);
    res.json({ ...r, latencia_ms: dur_ms });
  } catch (e) {
    console.error('[relatorio-gerar] erro:', e.message);
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

  // V2.14 Frente B — inicia bot Discord se DISCORD_BOT_TOKEN estiver no cofre.
  // Falha silenciosa (warn) se nao tem token — dev local sem Discord segue rodando normal.
  discordBot.iniciarBot()
    .then(bot => {
      if (bot) {
        console.log('  [discord-bot] iniciado, conectando ao Gateway...');
        // V2.14 D Categoria L — registra instância pra lib discord-postar (cross-canal)
        const discordPostar = require('./lib/discord-postar');
        discordPostar.setBotInstancia(bot);
      } else {
        console.log('  [discord-bot] DESLIGADO (sem DISCORD_BOT_TOKEN no cofre)');
      }
    })
    .catch(e => console.warn(`  [discord-bot] falha ao iniciar (nao bloqueia server): ${e.message}`));
});

// Shutdown gracioso — fecha bot Discord antes de sair (evita reconexao spam quando reiniciar)
function shutdownGracioso(sinal) {
  console.log(`\n[server] recebido ${sinal}, fechando bot Discord...`);
  try { discordBot.pararBot(); } catch (_) {}
  process.exit(0);
}
process.on('SIGINT', () => shutdownGracioso('SIGINT'));
process.on('SIGTERM', () => shutdownGracioso('SIGTERM'));
