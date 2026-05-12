// ============================================================
// planner.js — V2.15 Fase 1 Parte 2 Plan-and-Execute
// ============================================================
// Recebe pedido bruto do socio + contexto. Chama Claude CLI com
// system prompt de "Planner". Retorna JSON estruturado:
//   { briefing_resumo, fontes, criterios, formato, etapas, estimativa_min }
//
// Worker (Fase 2) executa esse plano. Pinguim mostra briefing_resumo
// pro socio aprovar antes da execucao.
// ============================================================

const { spawn } = require('child_process');

const PLANNER_SYSTEM_PROMPT = `Voce e o Planner do Plan-and-Execute do Pinguim OS.

Sua unica tarefa: receber pedido complexo de socio + contexto disponivel e devolver UM JSON estruturado com o plano de execucao. Nao executa nada, so planeja.

Saida obrigatoria: APENAS o JSON puro, sem markdown, sem cercas \`\`\`, sem explicacao antes ou depois. Direto o objeto.

Schema:
{
  "briefing_resumo": "1 frase clara que o socio vai ler e aprovar (sem jargao tecnico, sem nome de tabela)",
  "tipo_pedido": "relatorio|analise|cruzamento|agregacao|outro",
  "squad_executora": "data|copy|hybrid-ops|null",
  "fontes": [
    { "nome": "Hotmart", "uso": "vendas e refunds do periodo X" },
    { "nome": "Supabase ProAlt", "uso": "engajamento aulas" }
  ],
  "criterios": [
    "Top 15 alunos por engajamento (login + aulas assistidas)",
    "Apenas alunos com compra ativa"
  ],
  "formato": "entregavel HTML / lista bullet no chat / planilha Drive / etc",
  "etapas": [
    { "n": 1, "acao": "puxar vendas Hotmart janela 30d", "fonte": "G2" },
    { "n": 2, "acao": "cruzar com engajamento ProAlt", "fonte": "M2" }
  ],
  "estimativa_min": 3,
  "perguntas_pendentes": []
}

Regras duras:
- Se faltar algum criterio chave (ex: "top X" sem definir X, "engajamento" sem definir metrica), coloca em "perguntas_pendentes" como string. NAO inventa criterio.
- "briefing_resumo" e o que socio le pra decidir "sim/nao". Tem que ser conciso e factual. Sem promessa do tipo "vamos fazer X impressionante". Sem emoji.
- "etapas" e lista ordenada do que o worker executa. Cada etapa cita a fonte/tool (G1/G4b/M2/F3/etc) quando aplicavel.
- "squad_executora" e quem executa: "data" pra relatorio/analise, "hybrid-ops" pra acao operacional, "copy" pra entregavel criativo, ou null se Pinguim executa direto sem squad.
- "estimativa_min" e palpite honesto em minutos (1, 3, 5, 10). Nao exagera.
- Use "tipo_pedido" pra classificar: relatorio (formato estruturado), analise (insight), cruzamento (combinar fontes), agregacao (contar/somar), outro.

NAO retorne nada alem do JSON. NAO use markdown. NAO comente.`;

// ============================================================
// Chama Claude CLI com pedido bruto + contexto.
// Retorna o JSON parseado do plano.
// ============================================================
function gerarPlano({ pedido_original, contexto = '', timeout_ms = 60_000 }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const args = ['-p', '--output-format', 'text'];
    const proc = spawn('claude', args, {
      cwd: process.cwd(),
      env,
      shell: true,
    });

    let killed = false;
    const killTimer = setTimeout(() => {
      killed = true;
      try { proc.kill('SIGKILL'); } catch (_) { /* ignore */ }
    }, timeout_ms);

    const prompt = `${PLANNER_SYSTEM_PROMPT}

---

## PEDIDO DO SOCIO

${pedido_original}

${contexto ? `\n---\n\n## CONTEXTO DISPONIVEL\n\n${contexto}\n` : ''}
---

Devolva APENAS o JSON do plano. Sem cercas, sem texto extra.`;

    let stdout = '';
    let stderr = '';
    proc.stdin.write(prompt);
    proc.stdin.end();
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      clearTimeout(killTimer);
      if (killed) {
        reject(new Error(`planner KILLED apos ${(timeout_ms/1000)}s (timeout SIGKILL)`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`planner exit ${code}: ${stderr.slice(-300)}`));
        return;
      }
      try {
        const plano = parsearPlano(stdout);
        resolve(plano);
      } catch (e) {
        reject(new Error(`planner parse falhou: ${e.message} | raw: ${stdout.slice(0, 400)}`));
      }
    });
    proc.on('error', (err) => {
      clearTimeout(killTimer);
      reject(err);
    });
  });
}

// Extrai JSON do output. Aceita JSON puro ou JSON dentro de cercas ```json.
function parsearPlano(raw) {
  if (!raw || !raw.trim()) throw new Error('output vazio');
  let txt = raw.trim();

  // Remove cercas markdown se Planner desobedeceu
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) txt = fence[1].trim();

  // Pega do primeiro { ate o ultimo } pra tolerar texto extra
  const i = txt.indexOf('{');
  const j = txt.lastIndexOf('}');
  if (i === -1 || j === -1 || j <= i) throw new Error('nao achou JSON no output');
  const json = txt.slice(i, j + 1);

  const plano = JSON.parse(json);

  // Validacao minima
  if (!plano.briefing_resumo || typeof plano.briefing_resumo !== 'string') {
    throw new Error('plano sem briefing_resumo');
  }
  return plano;
}

module.exports = {
  gerarPlano,
  parsearPlano, // exposto pra teste
};
