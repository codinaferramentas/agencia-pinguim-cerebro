/* Mission Control — Roteiros de animacao Squad por acao
   Cenario fixo: 6 departamentos Pinguim (Diretoria, Marketing, Comercial,
   RH, Financeiro, Atendimento). Cada roteiro escolhe os protagonistas —
   os demais ficam em idle decorativo dando vida ao escritorio.
*/

function delay(ms, sig) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (sig) sig.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

async function esperarApiComLoop(apiPromise, loopFn, intervaloMs, sig) {
  let done = false;
  let result = null, error = null;
  apiPromise.then(r => { done = true; result = r; }).catch(e => { done = true; error = e; });
  while (!done) {
    await loopFn();
    await delay(intervaloMs, sig);
  }
  return { result, error };
}

/* ============================== GERAR PERSONA ==============================
   Protagonistas: Finn (Diretoria) + Aurora (Marketing).
   Fluxo:
     1. Finn recebe o pedido na Diretoria
     2. Finn caminha ate a Diretoria-Marketing (corredor), chama Aurora
     3. Aurora vai ate a estante (Cerebro) e consulta
     4. Aurora senta e sintetiza (API OpenAI rodando em paralelo)
     5. Aurora leva o dossie pra Finn
     6. Finn "entrega" ao cliente (passo final)
*/
export async function roteiroGerarPersona({ engine, log, setStatus, apiCall, cerebroNome }) {
  const { walkTo, say, throwPaper, setHolding, setState, setProtagonists } = engine;

  // Marca protagonistas — halo + para idle decorativo
  setProtagonists(['finn', 'aurora']);

  setStatus('🎯 Finn (Diretoria) recebeu o pedido');
  log('Sistema', `Atualizar persona do Cerebro ${cerebroNome}`, 'info');
  await delay(500);

  // --- FINN vai ate AURORA (Marketing) ---
  setStatus('🎯 Finn desce pra Marketing chamar Aurora');
  setHolding('finn', true);
  say('finn', 'Aurora, preciso de voce!', 110);
  await walkTo('finn', 100, 220, 'idle');
  log('Finn', 'Atualiza a persona deste Cerebro, por favor.', 'handoff');
  await delay(500);
  setHolding('finn', false);
  throwPaper('finn', 'aurora');
  await delay(500);
  setHolding('aurora', true);
  // Finn volta pra Diretoria
  walkTo('finn', 440, 230, 'idle');

  // --- AURORA vai ate a estante (Cerebro) ---
  setStatus('✍ Aurora consulta o Cerebro (estante de fontes)');
  await walkTo('aurora', 280, 150, 'thinking');
  setHolding('aurora', false);
  say('aurora', 'Fontes captadas!', 100);
  log('Aurora', 'Lendo fontes do Cerebro para analisar a persona...', 'working');
  await delay(1600);
  log('Aurora', 'Identifiquei padroes, dores, desejos, vocabulario.', 'done');

  // --- AURORA volta a mesa e trabalha (API em paralelo) ---
  setStatus('✍ Aurora na mesa sintetizando o dossie (IA processando)');
  await walkTo('aurora', 100, 200, 'working');
  log('Aurora', 'Montando dossie de 11 blocos com IA...', 'working');

  const bolhas = [
    'Analisando vozes...',
    'Extraindo dores...',
    'Desejos reais...',
    'Crencas limitantes...',
    'Montando vocabulario...',
    'Jobs to be Done...',
    'Quase la...',
  ];
  let bolhaIdx = 0;
  const loopTrabalho = async () => {
    say('aurora', bolhas[bolhaIdx % bolhas.length], 80);
    bolhaIdx++;
  };

  const { result, error } = await esperarApiComLoop(apiCall(), loopTrabalho, 2200);
  if (error) throw error;

  log('Aurora', `Dossie pronto: ${result?.fontes_usadas || '?'} fontes analisadas.`, 'done');
  await delay(500);

  // --- AURORA leva pro FINN ---
  setStatus('✍ Aurora leva o dossie pra Finn');
  setHolding('aurora', true);
  setState('aurora', 'idle');
  await walkTo('aurora', 440, 220, 'idle');
  say('aurora', 'Persona pronta!', 110);
  log('Aurora → Finn', 'Dossie de persona finalizado.', 'handoff');
  await delay(500);
  setHolding('aurora', false);
  throwPaper('aurora', 'finn');
  await delay(500);
  setHolding('finn', true);
  walkTo('aurora', 100, 230, 'idle');

  // --- FINN entrega ao cliente ---
  setStatus('🎯 Finn faz a entrega final');
  await walkTo('finn', 440, 200, 'working');
  setHolding('finn', false);
  say('finn', 'Entregue!', 120);
  log('Finn', 'Persona entregue com sucesso.', 'final');
  await delay(900);

  return result;
}

export const ROTEIROS = {
  gerarPersona: roteiroGerarPersona,
};
