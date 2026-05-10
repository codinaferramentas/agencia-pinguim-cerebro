// ============================================================
// ack-inteligente.js — V2.14 D Refator V3
// ============================================================
// Bot precisa AVISAR o que vai fazer ANTES de processar (UX).
// Mas Andre 2026-05-09 pegou furo: 13 frases hardcoded com regex
// soavam scriptadas ("Vou abrir sua inbox..." sempre igual).
//
// ARQUITETURA NOVA:
// - Filtro mínimo: só pula ack pra mensagens TRIVIAIS curtas (saudação,
//   agradecimento, confirmação curta) onde resposta vem rápida (<10s).
// - Tudo o resto: LLM Haiku via Claude CLI (~3-5s, em paralelo ao
//   processamento principal). Frase orgânica, varia turno a turno.
// - Sem 13 padrões hardcoded.
//
// Princípio (Andre 2026-05-09): "isso parece script, não IA".
// Anatomia (project_atendente_inteligencia_real_meta.md): agente fala
// como humano que entendeu, não como atalho de regex.
// ============================================================

const { spawn } = require('child_process');

// ============================================================
// Filtro mínimo — só pula ack pra mensagens onde resposta vem em <10s.
// Pula = NÃO envia ack porque resposta vem rápida e ack ficaria sobrando.
// ============================================================
const PULAR_ACK = /^(oi|ol[áa]|opa|e a[íi]|fala|bom dia|boa tarde|boa noite|tudo bem|tudo certo|tranquilo|obrigad|valeu|vlw|tchau|at[ée] mais|falou|n[ãa]o|nao|n|nada|cancela|deixa pra l[áa]|esquece|melhor n[ãa]o)[\s!?.,]*$/i;

// ============================================================
// Claude CLI (Haiku) — gera ack contextual em ~3-5s
// ============================================================
function rodarCLI(prompt, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const k of Object.keys(env)) {
      if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) delete env[k];
    }
    const proc = spawn('claude', ['--print', '--model', 'haiku', '--allowedTools', 'Read'], {
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
  const prompt = `Você é o Atendente Pinguim 🐧 respondendo no WhatsApp/Discord/chat. O sócio acabou de mandar a mensagem abaixo. Você ainda VAI processar (vai levar uns segundos), mas antes mande UMA frase curta avisando o que entendeu e que vai trabalhar.

Regras:
- Máximo 15 palavras
- Tom direto, conversacional, sem formalidade
- Pode usar 1 emoji se ajudar a deixar mais leve
- NÃO inventa dado nem adianta resposta — só sinaliza que entendeu
- Varia o jeito de falar (não soa enlatado)

Mensagem do sócio:
"${textoUsuario.replace(/"/g, "'").slice(0, 300)}"

Responda APENAS a frase de ack, sem aspas, sem prefixo, sem comentário.`;
  return await rodarCLI(prompt, 15000);
}

// ============================================================
// API publica — gera ack inteligente (sem 13 regex hardcoded)
// ============================================================
async function gerarAck(textoUsuario) {
  if (!textoUsuario) return { ack: null, fonte: 'vazio' };

  // Filtro mínimo: pula ack pra saudação/agradecimento/confirmação curta
  // (resposta vem em <10s, ack ficaria estranho)
  if (PULAR_ACK.test(textoUsuario)) {
    return { ack: null, fonte: 'trivial' };
  }

  // Mensagem muito curta sem padrão claro → pula
  if (textoUsuario.length < 8) {
    return { ack: null, fonte: 'curta' };
  }

  // LLM Haiku gera ack contextual
  try {
    const ack = await ackLLM(textoUsuario);
    if (ack && ack.length > 0 && ack.length < 300) {
      return { ack, fonte: 'llm' };
    }
  } catch (e) {
    console.warn(`[ack] LLM falhou: ${e.message}`);
  }

  // V2.14 D — Sem fallback fixo. Se Haiku falhou/timeout, NÃO manda ack.
  // Andre 2026-05-09: "Recebi, vou processar..." repetido em mensagens
  // diferentes parece script. Melhor ficar mudo (sócio vê "digitando..."
  // do WhatsApp e a resposta principal cobre quando vier) do que mandar
  // template fake.
  return { ack: null, fonte: 'sem-ack' };
}

module.exports = { gerarAck, paraTeste: { ackLLM, PULAR_ACK } };
