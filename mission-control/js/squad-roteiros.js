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
   Protagonistas: Luiz (Diretoria) + Aurora (Marketing).
   Fluxo:
     1. Luiz recebe o pedido na Diretoria
     2. Luiz caminha ate a Diretoria-Marketing (corredor), chama Aurora
     3. Aurora vai ate a estante (Cerebro) e consulta
     4. Aurora senta e sintetiza (API OpenAI rodando em paralelo)
     5. Aurora leva o dossie pra Luiz
     6. Luiz "entrega" ao cliente (passo final)
*/
export async function roteiroGerarPersona({ engine, log, setStatus, apiCall, cerebroNome }) {
  const { walkTo, say, throwPaper, setHolding, setState, setProtagonists } = engine;

  // Marca protagonistas — halo + para idle decorativo
  setProtagonists(['luiz', 'aurora']);

  setStatus('🎯 Luiz (Diretoria) recebeu o pedido');
  log('Sistema', `Atualizar persona do Cerebro ${cerebroNome}`, 'info');
  await delay(500);

  // --- FINN vai ate AURORA (Marketing) ---
  setStatus('🎯 Luiz desce pra Marketing chamar Aurora');
  setHolding('luiz', true);
  say('luiz', 'Aurora, preciso de voce!', 110);
  await walkTo('luiz', 100, 220, 'idle');
  log('Luiz', 'Atualiza a persona deste Cerebro, por favor.', 'handoff');
  await delay(500);
  setHolding('luiz', false);
  throwPaper('luiz', 'aurora');
  await delay(500);
  setHolding('aurora', true);
  // Luiz volta pra Diretoria
  walkTo('luiz', 440, 230, 'idle');

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
  setStatus('✍ Aurora leva o dossie pra Luiz');
  setHolding('aurora', true);
  setState('aurora', 'idle');
  await walkTo('aurora', 440, 220, 'idle');
  say('aurora', 'Persona pronta!', 110);
  log('Aurora → Luiz', 'Dossie de persona finalizado.', 'handoff');
  await delay(500);
  setHolding('aurora', false);
  throwPaper('aurora', 'luiz');
  await delay(500);
  setHolding('luiz', true);
  walkTo('aurora', 100, 230, 'idle');

  // --- FINN entrega ao cliente ---
  setStatus('🎯 Luiz faz a entrega final');
  await walkTo('luiz', 440, 200, 'working');
  setHolding('luiz', false);
  say('luiz', 'Entregue!', 120);
  log('Luiz', 'Persona entregue com sucesso.', 'final');
  await delay(900);

  return result;
}

/* ============================== ALIMENTAR CEREBRO — AVULSO ===========================
   Protagonistas: Luiz (Diretoria) + Aurora (Marketing).
   1 arquivo unico chega -> Luiz passa pra Aurora -> Aurora le na estante,
   processa, devolve confirmando.
   Tempo tipico: 10-40s
*/
export async function roteiroAlimentarAvulso({ engine, log, setStatus, apiCall, cerebroNome, arquivoNome }) {
  const { walkTo, say, throwPaper, setHolding, setState, setProtagonists } = engine;
  setProtagonists(['luiz', 'aurora']);

  setStatus('🎯 Luiz recebeu um arquivo novo pro Cerebro');
  log('Sistema', `Alimentar Cerebro ${cerebroNome} com 1 arquivo`, 'info');
  if (arquivoNome) log('Cliente', `Arquivo: ${arquivoNome}`, 'info');
  await delay(400);

  // Luiz vai ate Aurora
  setStatus('🎯 Luiz leva o arquivo pra Aurora');
  setHolding('luiz', true);
  say('luiz', 'Aurora, novo material!', 110);
  await walkTo('luiz', 100, 220, 'idle');
  log('Luiz', 'Mais conteudo pro Cerebro. Indexa pra mim.', 'handoff');
  await delay(400);
  setHolding('luiz', false);
  throwPaper('luiz', 'aurora');
  await delay(500);
  setHolding('aurora', true);
  walkTo('luiz', 440, 230, 'idle');

  // Aurora vai ate a estante
  setStatus('✍ Aurora leva o material pra estante (Cerebro)');
  await walkTo('aurora', 280, 150, 'thinking');
  setHolding('aurora', false);
  say('aurora', 'Indexando...', 90);
  log('Aurora', 'Extraindo texto, classificando, gerando embeddings.', 'working');

  // Aurora trabalha enquanto API processa
  await walkTo('aurora', 100, 200, 'working');

  const bolhas = [
    'Extraindo texto...',
    'Classificando tipo...',
    'Gerando embeddings...',
    'Conectando ao Cerebro...',
    'Quase la...',
  ];
  let i = 0;
  const loop = async () => { say('aurora', bolhas[i % bolhas.length], 80); i++; };
  const { result, error } = await esperarApiComLoop(apiCall(), loop, 2200);
  if (error) throw error;

  log('Aurora', 'Arquivo indexado com sucesso.', 'done');
  await delay(400);

  // Aurora volta com confirmacao pra Luiz
  setStatus('✍ Aurora confirma a indexacao pra Luiz');
  setHolding('aurora', true);
  setState('aurora', 'idle');
  await walkTo('aurora', 440, 220, 'idle');
  say('aurora', 'Adicionado ao Cerebro!', 110);
  log('Aurora → Luiz', 'Fonte indexada e disponivel.', 'handoff');
  await delay(400);
  setHolding('aurora', false);
  throwPaper('aurora', 'luiz');
  await delay(500);
  setHolding('luiz', true);
  walkTo('aurora', 100, 230, 'idle');

  setStatus('🎯 Cerebro atualizado');
  await walkTo('luiz', 440, 200, 'working');
  setHolding('luiz', false);
  say('luiz', 'Cerebro mais forte!', 120);
  log('Luiz', 'Cerebro alimentado.', 'final');
  await delay(700);
  return result;
}

/* ============================== ALIMENTAR CEREBRO — PACOTE (ZIP) ===========================
   Protagonistas: Luiz (Diretoria) + Aurora (Marketing) + Dipsy (RH como revisora).
   Pacote com varios arquivos -> Luiz entrega pra Aurora -> Aurora processa em
   ondas (vai a estante repetidamente) -> Dipsy revisa qualidade -> entrega.
   Tempo tipico: 30s a 5min
*/
export async function roteiroAlimentarPacote({ engine, log, setStatus, apiCall, cerebroNome, totalArquivos }) {
  const { walkTo, say, throwPaper, setHolding, setState, setProtagonists } = engine;
  setProtagonists(['luiz', 'aurora', 'dipsy']);

  setStatus('🎯 Luiz recebeu um pacote inteiro pro Cerebro');
  log('Sistema', `Alimentar Cerebro ${cerebroNome} com pacote ZIP`, 'info');
  if (totalArquivos) log('Cliente', `Pacote contem ${totalArquivos} arquivos`, 'info');
  await delay(500);

  // Luiz entrega o pacote pra Aurora
  setStatus('🎯 Luiz entrega o pacote pra Aurora');
  setHolding('luiz', true);
  say('luiz', 'Pacote grande chegou!', 110);
  await walkTo('luiz', 100, 220, 'idle');
  log('Luiz', `Pacote inteiro pro Cerebro ${cerebroNome}. Processa em lotes.`, 'handoff');
  await delay(400);
  setHolding('luiz', false);
  throwPaper('luiz', 'aurora');
  await delay(500);
  setHolding('aurora', true);
  walkTo('luiz', 440, 230, 'idle');

  // Aurora abre o pacote na estante
  setStatus('✍ Aurora abre o pacote e organiza na estante');
  await walkTo('aurora', 280, 150, 'thinking');
  setHolding('aurora', false);
  say('aurora', 'Abrindo pacote...', 100);
  log('Aurora', 'Extraindo arquivos, deduplicando, classificando tipos.', 'working');
  await delay(1500);

  // Aurora processa em ondas — loop enquanto API nao termina
  setStatus('✍ Aurora processando em ondas (lotes)');
  await walkTo('aurora', 100, 200, 'working');
  log('Aurora', 'Processando lote por lote: extracao, embeddings, indexacao...', 'working');

  const bolhas = [
    'Lote 1...',
    'Extraindo PDFs...',
    'Indexando...',
    'Lote 2...',
    'Embeddings...',
    'Mais um lote...',
    'Lote 3...',
    'Conectando ao Cerebro...',
    'Quase la...',
  ];
  let i = 0;
  const loop = async () => { say('aurora', bolhas[i % bolhas.length], 80); i++; };
  const { result, error } = await esperarApiComLoop(apiCall(), loop, 2500);
  if (error) throw error;

  log('Aurora', 'Todos os lotes processados.', 'done');
  await delay(400);

  // Aurora leva pra Dipsy revisar qualidade
  setStatus('✍ Aurora pede revisao de qualidade pra Dipsy');
  setHolding('aurora', true);
  setState('aurora', 'idle');
  await walkTo('aurora', 160, 440, 'idle');
  say('aurora', 'Dipsy, valida?', 100);
  log('Aurora → Dipsy', 'Revisao de qualidade do indexamento.', 'handoff');
  await delay(400);
  setHolding('aurora', false);
  throwPaper('aurora', 'dipsy');
  await delay(500);
  setHolding('dipsy', true);
  walkTo('aurora', 100, 230, 'idle');

  // Dipsy revisa
  setStatus('👥 Dipsy revisa qualidade do indexamento');
  setState('dipsy', 'working');
  log('Dipsy', 'Verificando duplicatas, qualidade dos chunks, quarentena...', 'working');
  await delay(1800);
  log('Dipsy', 'Tudo OK. Pacote validado.', 'done');

  // Dipsy entrega pra Luiz
  setStatus('👥 Dipsy entrega o relatorio pra Luiz');
  setHolding('dipsy', true);
  setState('dipsy', 'idle');
  await walkTo('dipsy', 440, 220, 'idle');
  say('dipsy', 'Pacote aprovado!', 110);
  log('Dipsy → Luiz', 'Pacote validado e disponivel no Cerebro.', 'handoff');
  await delay(400);
  setHolding('dipsy', false);
  throwPaper('dipsy', 'luiz');
  await delay(500);
  setHolding('luiz', true);
  walkTo('dipsy', 160, 470, 'idle');

  setStatus('🎯 Pacote integrado ao Cerebro');
  await walkTo('luiz', 440, 200, 'working');
  setHolding('luiz', false);
  say('luiz', 'Cerebro reforcado!', 120);
  log('Luiz', 'Pacote inteiro integrado ao Cerebro.', 'final');
  await delay(800);
  return result;
}

export const ROTEIROS = {
  gerarPersona: roteiroGerarPersona,
  alimentarAvulso: roteiroAlimentarAvulso,
  alimentarPacote: roteiroAlimentarPacote,
};
