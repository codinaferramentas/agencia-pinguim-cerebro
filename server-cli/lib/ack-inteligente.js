// ============================================================
// ack-inteligente.js — V2.14 Frente D
// ============================================================
// Bot precisa AVISAR o que vai fazer ANTES de processar — UX 10x melhor que
// ficar mudo 30-90s. Andre pediu explicitamente em 2026-05-09:
// "deveria ter uma inteligência ali, ele bate e processa o que o cara tá
// falando e devolve uma mensagem, tipo, de acordo com o que ele falou"
//
// Estrategia em CASCATA (rapido -> lento):
// 1. Heuristica regex (0ms): pra padroes obvios ("oi", "agenda", "relatorio")
//    devolve frase pronta. Cobre ~70% dos casos sem latencia nenhuma.
// 2. Claude CLI (3-5s): pra mensagens nao-obvias, gera 1 linha contextual.
//    So roda se a heuristica nao matchear.
//
// Ack NAO substitui resposta — eh mensagem PREPARATORIA. Sempre seguida pela
// resposta real (mais demorada).
// ============================================================

const { spawn } = require('child_process');

// ============================================================
// Heuristica — regex pra padroes comuns
// ============================================================
const PADROES_ACK = [
  // Saudacao curta
  { re: /^(oi|ol[áa]|opa|e a[íi]|fala|bom dia|boa tarde|boa noite|tudo bem|tudo certo|tranquilo)[\s!?.,]*$/i,
    ack: null /* nao envia ack pra saudacao — resposta vem direto, eh rapida */ },

  // Agradecimento
  { re: /^(obrigad|valeu|vlw|tchau|at[ée] mais|falou)/i,
    ack: null },

  // Confirmacao curta (sim/nao/pode/manda/envia/confirma) — bypass do limite de 10 chars
  // Andre 2026-05-09: bot ficou mudo apos "sim" e ele perdeu confianca. Sempre ack.
  { re: /^(sim|s|isso|exato|correto|claro|com certeza|pode|pode mandar|pode enviar|envia|manda|confirma|confirmado|ok|certo|t[áa]|beleza|blz|aprovado|fechado)[\s!?.,]*$/i,
    ack: '✅ Beleza, executando agora...' },

  // Negacao curta
  { re: /^(n[ãa]o|nao|n|nada|cancela|deixa pra l[áa]|esquece|melhor n[ãa]o|n[ãa]o precisa)[\s!?.,]*$/i,
    ack: null /* nao precisa ack — resposta sera curta */ },

  // Pergunta de STATUS sobre acao anterior (enviou? mandou? deu certo?)
  // Esses NAO sao comandos novos — bot deve responder so confirmando o anterior
  { re: /^(enviou|mandou|deu certo|funcionou|foi|chegou|t[áa] pronto|esta pronto|tudo certo)\??[\s!?.,]*$/i,
    ack: '👀 Conferindo o status, um instante...' },

  // Agenda
  { re: /(agenda|reuni[ãa]o|reuniões|compromisso|calendar|evento|call de|meeting|tem reuni|essa semana|amanh[ãa]|hoje)/i,
    ack: '📅 Já vou olhar sua agenda, um instante...' },

  // Email/inbox
  { re: /(email|e-mail|inbox|gmail|caixa de entrada|triagem)/i,
    ack: '📧 Vou abrir sua inbox e voltar com o que importa, ~30s...' },

  // Drive
  { re: /(drive|planilha|documento|arquivo|doc no drive|spreadsheet|sheet)/i,
    ack: '📂 Olhando no Drive, um momento...' },

  // Discord
  { re: /(discord|time discutiu|reembolso no discord|cadastro pendente|bug|reclama[çc]ão)/i,
    ack: '💬 Vou conferir o que rolou no Discord do time, ~15s...' },

  // Relatorio executivo / overview
  { re: /(relat[óo]rio|executivo|overview|resumo do dia|briefing|dashboard|me d[áa] um geral)/i,
    ack: '📊 Beleza, vou montar seu executivo agora — leva ~60-90s pq cruza 5 fontes (financeiro, agenda, email, Discord, Board). Te aviso aqui assim que tiver pronto.' },

  // Vendas / financeiro
  { re: /(vendas|faturamento|receita|roas|lucro|fatur|cpa|ticket|reembols)/i,
    ack: '💰 Puxando os números agora, ~10s...' },

  // Pergunta sobre produto Pinguim
  { re: /(elo|proalt|lyra|taurus|orion|lo[\s-]?fi|mentoria express)/i,
    ack: '🧠 Vou consultar o Cérebro do produto, ~10s...' },

  // Comando criar / gerar copy
  { re: /(escreve|cria|monta|gera).*(copy|email|p[áa]gina|vsl|an[úu]ncio|headline|oferta)/i,
    ack: '✍️ Pedido de criativo recebido. Esse vai pro Squad Copy — pode levar 2-4min porque chama vários mestres. Te aviso aqui quando ficar pronto.' },
];

// ============================================================
// Heuristica — retorna texto do ack ou null
// Roda PADROES_ACK PRIMEIRO (alguns padroes sao curtos mas precisam de ack
// como "sim"/"enviou?"). So depois aplica filtro de tamanho.
// ============================================================
function ackHeuristico(texto) {
  if (!texto) return null;
  // Padroes tem prioridade — alguns sao curtos mas IMPORTANTES
  for (const { re, ack } of PADROES_ACK) {
    if (re.test(texto)) return ack;
  }
  // Se nao matchou padrao e msg eh curta (< 10 chars), nao envia ack
  if (texto.length < 10) return null;
  return undefined; // > 10 chars sem padrao — vai pro LLM
}

// ============================================================
// Claude CLI — 1 chamada curta gerando 1 linha contextual
// ============================================================
function rodarCLI(prompt, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const k of Object.keys(env)) {
      if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) delete env[k];
    }
    const proc = spawn('claude', ['--print'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env,
    });
    let out = '', err = '';
    const killer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} reject(new Error('ack-cli timeout')); }, timeoutMs);
    proc.stdin.write(prompt); proc.stdin.end();
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());
    proc.on('close', c => { clearTimeout(killer); c === 0 ? resolve(out.trim()) : reject(new Error(`ack-cli exit ${c}: ${err.slice(0,200)}`)); });
    proc.on('error', e => { clearTimeout(killer); reject(e); });
  });
}

async function ackLLM(textoUsuario) {
  const prompt = `Você é o Atendente Pinguim 🐧 respondendo no WhatsApp. O sócio acabou de mandar a mensagem abaixo. Você ainda VAI processar, mas isso vai levar uns segundos. Mande UMA frase curta (max 15 palavras) avisando o que você entendeu e que vai trabalhar. Tom direto, sem floreio. Pode usar 1 emoji.

Mensagem do sócio:
"${textoUsuario.replace(/"/g, "'").slice(0, 300)}"

Responda APENAS a frase de ack, nada mais. Sem aspas, sem prefixo.`;
  return await rodarCLI(prompt, 8000);
}

// ============================================================
// API publica — gera ack com fallback em cascata
// ============================================================
async function gerarAck(textoUsuario) {
  // 1) Heuristica
  const h = ackHeuristico(textoUsuario);
  if (h !== undefined) {
    return { ack: h, fonte: 'heuristica' };
  }

  // 2) LLM com timeout duro (8s)
  try {
    const ack = await ackLLM(textoUsuario);
    if (ack && ack.length > 0 && ack.length < 300) {
      return { ack, fonte: 'llm' };
    }
  } catch (e) {
    // fallback silencioso — ack generico
  }

  return { ack: '👍 Recebi, vou processar e te respondo aqui em alguns segundos...', fonte: 'fallback' };
}

module.exports = { gerarAck, ackHeuristico, paraTeste: { ackLLM } };
