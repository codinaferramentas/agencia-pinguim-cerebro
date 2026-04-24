/* Mission Control — Roteiros de animacao Squad por acao
   Cada roteiro e uma async function que recebe a engine e utilidades.
   A chamada real da API roda em paralelo. Agentes entram em loop de
   trabalho se a API demorar; aceleram se a API terminar antes.
*/

// Delay utilitario que respeita cancelamento
function delay(ms, sig) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (sig) sig.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

// Espera ate apiPromise resolver OU atingir loopMax, fazendo loopFn a cada intervalo.
// Retorna { result, error } quando apiPromise termina.
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
   Roteiro:
   Finn recebe briefing -> caminha ate Byte
   Byte vai pra bookshelf (Cerebro) -> ler
   Byte entrega papel pra Aurora
   Aurora senta, trabalha (API rodando em paralelo)
   Se API demora: loop de "trabalhando"
   Quando API termina: Aurora levanta, entrega pra Finn
   Finn "entrega" ao cliente (sai pra frente do modal)
*/
export async function roteiroGerarPersona({ engine, log, setStatus, apiCall, cerebroNome }) {
  const { walkTo, say, throwPaper, setHolding, setState } = engine;

  setStatus('🎯 Finn recebeu o pedido de atualizacao de persona');
  log('Sistema', `Atualizar persona do Cerebro ${cerebroNome}`, 'info');
  await delay(400);

  // --- FINN vai ate BYTE ---
  setStatus('🎯 Finn busca o pesquisador (Byte)');
  setHolding('gerente', true);
  say('gerente', 'Byte, preciso de voce!', 100);
  await walkTo('gerente', 100, 220, 'idle');
  log('Finn', 'Vamos atualizar a persona. Busca as fontes do Cerebro.', 'handoff');
  await delay(400);
  setHolding('gerente', false);
  throwPaper('gerente', 'gancho');
  await delay(500);
  setHolding('gancho', true);
  walkTo('gerente', 160, 470, 'idle');

  // --- BYTE vai ate a ESTANTE (bookshelf da COPY) -> "le" fontes ---
  setStatus('🔎 Byte caminha ate a estante do Cerebro');
  await walkTo('gancho', 360, 150, 'thinking');
  setHolding('gancho', false);
  say('gancho', 'Peguei as fontes!', 90);
  log('Byte', 'Lendo fontes do Cerebro...', 'working');
  await delay(1400);
  log('Byte', 'Extrai padroes, objecoes, vocabulario, dores e desejos.', 'done');

  // --- BYTE entrega pra AURORA ---
  setStatus('🔎 Byte leva o material pra Aurora (analise)');
  setHolding('gancho', true);
  await walkTo('gancho', 440, 220, 'idle');
  say('gancho', 'Aurora, sua vez!', 90);
  log('Byte → Aurora', 'Dossie bruto pronto. Monta a persona.', 'handoff');
  await delay(400);
  setHolding('gancho', false);
  throwPaper('gancho', 'desenvolv');
  await delay(500);
  setHolding('desenvolv', true);
  walkTo('gancho', 100, 230, 'idle');

  // --- AURORA senta e trabalha (API paralela) ---
  setStatus('✍ Aurora sintetizando dossie (IA processando)');
  await walkTo('desenvolv', 440, 200, 'working');
  setHolding('desenvolv', false);
  log('Aurora', 'Analisando 11 blocos do dossie com IA...', 'working');

  // Loop de trabalho enquanto API nao termina
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
    say('desenvolv', bolhas[bolhaIdx % bolhas.length], 80);
    bolhaIdx++;
  };

  const { result, error } = await esperarApiComLoop(apiCall(), loopTrabalho, 2200);
  if (error) throw error;

  log('Aurora', `Dossie pronto: ${result?.fontes_usadas || '?'} fontes analisadas.`, 'done');
  await delay(500);

  // --- AURORA leva pro FINN ---
  setStatus('✍ Aurora entrega o dossie pra Finn');
  setHolding('desenvolv', true);
  setState('desenvolv', 'idle');
  await walkTo('desenvolv', 160, 440, 'idle');
  say('desenvolv', 'Persona pronta!', 100);
  log('Aurora → Finn', 'Dossie de persona finalizado.', 'handoff');
  await delay(400);
  setHolding('desenvolv', false);
  throwPaper('desenvolv', 'gerente');
  await delay(500);
  setHolding('gerente', true);
  walkTo('desenvolv', 440, 230, 'idle');

  // --- FINN "entrega" ao cliente ---
  setStatus('🎯 Finn faz a entrega final');
  await walkTo('gerente', 160, 440, 'working');
  setHolding('gerente', false);
  say('gerente', 'Entregue!', 120);
  log('Finn', 'Persona entregue com sucesso.', 'final');
  await delay(900);

  return result;
}

export const ROTEIROS = {
  gerarPersona: roteiroGerarPersona,
};
