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

/* ============================== ALIMENTAR CEREBRO — AVULSO ===========================
   Protagonistas: Finn (Diretoria) + Aurora (Marketing).
   1 arquivo unico chega -> Finn passa pra Aurora -> Aurora le na estante,
   processa, devolve confirmando.
   Tempo tipico: 10-40s
*/
export async function roteiroAlimentarAvulso({ engine, log, setStatus, apiCall, cerebroNome, arquivoNome }) {
  const { walkTo, say, throwPaper, setHolding, setState, setProtagonists } = engine;
  setProtagonists(['finn', 'aurora']);

  setStatus('🎯 Finn recebeu um arquivo novo pro Cerebro');
  log('Sistema', `Alimentar Cerebro ${cerebroNome} com 1 arquivo`, 'info');
  if (arquivoNome) log('Cliente', `Arquivo: ${arquivoNome}`, 'info');
  await delay(400);

  // Finn vai ate Aurora
  setStatus('🎯 Finn leva o arquivo pra Aurora');
  setHolding('finn', true);
  say('finn', 'Aurora, novo material!', 110);
  await walkTo('finn', 100, 220, 'idle');
  log('Finn', 'Mais conteudo pro Cerebro. Indexa pra mim.', 'handoff');
  await delay(400);
  setHolding('finn', false);
  throwPaper('finn', 'aurora');
  await delay(500);
  setHolding('aurora', true);
  walkTo('finn', 440, 230, 'idle');

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

  // Aurora volta com confirmacao pra Finn
  setStatus('✍ Aurora confirma a indexacao pra Finn');
  setHolding('aurora', true);
  setState('aurora', 'idle');
  await walkTo('aurora', 440, 220, 'idle');
  say('aurora', 'Adicionado ao Cerebro!', 110);
  log('Aurora → Finn', 'Fonte indexada e disponivel.', 'handoff');
  await delay(400);
  setHolding('aurora', false);
  throwPaper('aurora', 'finn');
  await delay(500);
  setHolding('finn', true);
  walkTo('aurora', 100, 230, 'idle');

  setStatus('🎯 Cerebro atualizado');
  await walkTo('finn', 440, 200, 'working');
  setHolding('finn', false);
  say('finn', 'Cerebro mais forte!', 120);
  log('Finn', 'Cerebro alimentado.', 'final');
  await delay(700);
  return result;
}

/* ============================== ALIMENTAR CEREBRO — PACOTE (ZIP) ===========================
   Protagonistas: Finn (Diretoria) + Aurora (Marketing) + Dipsy (RH como revisora).
   Pacote com varios arquivos -> Finn entrega pra Aurora -> Aurora processa em
   ondas (vai a estante repetidamente) -> Dipsy revisa qualidade -> entrega.
   Tempo tipico: 30s a 5min
*/
export async function roteiroAlimentarPacote({ engine, log, setStatus, apiCall, cerebroNome, totalArquivos }) {
  const { walkTo, say, throwPaper, setHolding, setState, setProtagonists } = engine;
  setProtagonists(['finn', 'aurora', 'dipsy']);

  setStatus('🎯 Finn recebeu um pacote inteiro pro Cerebro');
  log('Sistema', `Alimentar Cerebro ${cerebroNome} com pacote ZIP`, 'info');
  if (totalArquivos) log('Cliente', `Pacote contem ${totalArquivos} arquivos`, 'info');
  await delay(500);

  // Finn entrega o pacote pra Aurora
  setStatus('🎯 Finn entrega o pacote pra Aurora');
  setHolding('finn', true);
  say('finn', 'Pacote grande chegou!', 110);
  await walkTo('finn', 100, 220, 'idle');
  log('Finn', `Pacote inteiro pro Cerebro ${cerebroNome}. Processa em lotes.`, 'handoff');
  await delay(400);
  setHolding('finn', false);
  throwPaper('finn', 'aurora');
  await delay(500);
  setHolding('aurora', true);
  walkTo('finn', 440, 230, 'idle');

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

  // Dipsy entrega pra Finn
  setStatus('👥 Dipsy entrega o relatorio pra Finn');
  setHolding('dipsy', true);
  setState('dipsy', 'idle');
  await walkTo('dipsy', 440, 220, 'idle');
  say('dipsy', 'Pacote aprovado!', 110);
  log('Dipsy → Finn', 'Pacote validado e disponivel no Cerebro.', 'handoff');
  await delay(400);
  setHolding('dipsy', false);
  throwPaper('dipsy', 'finn');
  await delay(500);
  setHolding('finn', true);
  walkTo('dipsy', 160, 470, 'idle');

  setStatus('🎯 Pacote integrado ao Cerebro');
  await walkTo('finn', 440, 200, 'working');
  setHolding('finn', false);
  say('finn', 'Cerebro reforcado!', 120);
  log('Finn', 'Pacote inteiro integrado ao Cerebro.', 'final');
  await delay(800);
  return result;
}

export const ROTEIROS = {
  gerarPersona: roteiroGerarPersona,
  alimentarAvulso: roteiroAlimentarAvulso,
  alimentarPacote: roteiroAlimentarPacote,
};
