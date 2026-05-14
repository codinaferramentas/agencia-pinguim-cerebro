// ============================================================
// executor.js — V2.15 Fase 2 Plan-and-Execute
// ============================================================
// Recebe um JOB APROVADO (com plano_json) e executa.
//
// Implementacao: spawna Claude CLI no cwd=server-cli/ com Bash+Read+Glob+Grep
// liberados — o CLI segue as etapas do plano usando os MESMOS scripts que o
// Pinguim usa em runtime (Hotmart, projeto-externo, Drive, Meta, etc).
//
// Diferenca chave em relacao ao Pinguim turno normal: aqui o CLI roda
// ASSINCRONO em background (worker) sem interagir com socio. Quando termina,
// volta markdown final pro worker salvar em pinguim.entregaveis.
// ============================================================

const { spawn } = require('child_process');
const path = require('path');

const EXECUTOR_SYSTEM_PROMPT = `Voce e o Executor do Plan-and-Execute do Pinguim OS.

Voce vai receber:
1. O pedido original do socio (literal)
2. Um plano JSON ja aprovado pelo socio (com etapas, fontes, criterios)
3. Acesso a Bash, Read, Glob, Grep

Sua tarefa: executar o plano e devolver MARKDOWN final pronto pra entregar ao socio.

REGRAS DURAS:

1. EXECUTE NA ORDEM as etapas do plano. Use os scripts ja existentes em server-cli/scripts/ (hotmart-*.sh, projeto-listar-tabelas.sh, projeto-consultar-* via endpoints HTTP, meta-*.sh, etc) ou os endpoints HTTP em http://localhost:3737/api/* (curl ou node fetch).
2. NUNCA invente dado. Se uma fonte falhar ou retornar vazio, ANOTA no markdown final (secao "Limitacoes / Falhas") e segue. Output completo > output bonito.
3. NUNCA escreva criatividade (copy, narrativa, opiniao). Voce e operacional. Devolve dado estruturado + analise factual.
4. FORMATO de saida: markdown limpo. Comece com titulo H1. Use bullets, tabelas pequenas, blocos de codigo pra logs/resultados. Sem cercas \`\`\`markdown ao redor de tudo — eh o conteudo direto.
5. Se o plano AINDA tem "perguntas_pendentes" nao vazio, isso e bug de fluxo (socio aprovou antes de responder). Documenta no markdown na secao "Limitacoes / Falhas" as perguntas que ficaram sem resposta + escolha CONSERVADORA que voce assumiu (ex: menor escopo, periodo mais curto, criterio mais restrito). NAO assume default ambicioso.
6. NO FINAL do markdown, adicione secao "## Como foi feito" listando as etapas executadas, fontes consultadas, e qualquer falha encontrada. Isso vai pro entregavel pro socio auditar.
7. NAO interaja com socio. Voce roda em background. Nao pergunta nada. Decide e executa.

PROIBIDO:
- Pedir confirmacao do socio
- Modificar estado externo (NAO cria evento Calendar, NAO envia email, NAO posta Discord, NAO edita Drive, NAO cria refund). So LEITURA + AGREGACAO.
- Demorar mais de 10 minutos. Se sentir que vai estourar, corta escopo e entrega o que tem com nota explicita de "Truncado por tempo".
- Devolver JSON. So markdown.

Devolva APENAS o markdown final. Sem preambulo "Executando...", sem rodape "Foi util?".`;

// ============================================================
// Executa um job aprovado. Retorna { ok, markdown, duracao_ms, stderr_tail }
// Worker e quem decide se salva entregavel + atualiza status do job.
// ============================================================
function executarJob({ pedido_original, plano_json, timeout_ms = 600_000 }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    // cwd = server-cli/ pra que scripts/*.sh resolvam relativos
    const serverCliDir = path.resolve(__dirname, '..');

    const args = [
      '-p',
      '--output-format', 'text',
      '--allowedTools', 'Bash,Read,Glob,Grep',
    ];
    const proc = spawn('claude', args, {
      cwd: serverCliDir,
      env,
      shell: true,
    });

    let killed = false;
    const killTimer = setTimeout(() => {
      killed = true;
      try { proc.kill('SIGKILL'); } catch (_) { /* ignore */ }
    }, timeout_ms);

    const planoStr = JSON.stringify(plano_json, null, 2);
    const prompt = `${EXECUTOR_SYSTEM_PROMPT}

---

## PEDIDO ORIGINAL DO SOCIO

${pedido_original}

---

## PLANO APROVADO

\`\`\`json
${planoStr}
\`\`\`

---

Execute o plano agora. Devolva apenas o markdown final.`;

    const t0 = Date.now();
    let stdout = '';
    let stderr = '';
    proc.stdin.write(prompt);
    proc.stdin.end();
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      clearTimeout(killTimer);
      const dur = Date.now() - t0;
      if (killed) {
        reject(new Error(`executor KILLED apos ${(timeout_ms/1000)}s (timeout SIGKILL) | dur=${dur}ms | stderr_tail=${stderr.slice(-200)}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`executor exit ${code} | dur=${dur}ms | stderr_tail=${stderr.slice(-300)}`));
        return;
      }
      const md = stdout.trim();
      if (!md || md.length < 50) {
        reject(new Error(`executor output curto demais (${md.length} chars) | stderr_tail=${stderr.slice(-200)}`));
        return;
      }
      resolve({
        ok: true,
        markdown: md,
        duracao_ms: dur,
        stderr_tail: stderr.slice(-500),
      });
    });
    proc.on('error', (err) => {
      clearTimeout(killTimer);
      reject(err);
    });
  });
}

module.exports = {
  executarJob,
};
