/* Mission Control — Roteiros Squad Copy
   Roteiro principal: gerarCopy
   Atendente Pinguim consulta 5 fontes vivas, convoca os 4 mestres em paralelo,
   espera os 4 entregarem, consolida e entrega.

   IMPORTANTE: A api real do server-cli já roda com 4 mestres em paralelo.
   Esta animação reflete isso visualmente — os 4 trabalham ao mesmo tempo.
*/

function delay(ms, sig) {
  return new Promise(resolve => {
    const t = setTimeout(resolve, ms);
    if (sig) sig.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

// Espera apiPromise resolver enquanto roda loopFn em intervalos.
// Retorna { result, error } quando terminar.
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

/* ============================== ROTEIRO gerarCopy ==============================
   Fluxo:
   1. Atendente recebe pedido na mesa central
   2. Atendente caminha até cada uma das 4 fontes (Cérebro, Persona, Skill, Funil)
      — em sequência rápida, cada uma "ativada" em pulse amarelo
   3. Atendente volta pra mesa central
   4. Atendente "convoca" os 4 mestres (bolha grande)
   5. Os 4 mestres entram em paralelo pela direita
   6. Cada mestre vai até sua mesa e senta no computador
   7. Os 4 trabalham EM PARALELO com bolhas alternadas
      — loop independente até a API resolver
   8. Quando API resolve, mestres jogam papel um a um pro Atendente
   9. Atendente consolida e entrega
*/
export async function roteiroGerarCopy({ engine, log, setStatus, apiCall, pedido, sig }) {
  const {
    walkTo, say, throwPaper, setHolding, setState,
    setVisivel, setFonteAtiva, setFonteGap, setPedidoAtivo,
    posMesa, posFonte,
  } = engine;

  setPedidoAtivo(pedido || 'Pedido criativo');

  // ============================== FASE 1: PEDIDO RECEBIDO ==============================
  setStatus('🐧 Atendente recebeu o pedido');
  log('Sistema', `Pedido: ${pedido}`, 'info');
  say('atendente', 'Pedido novo!', 100);
  await delay(1200, sig);

  // ============================== FASE 2: CONSULTA 4 FONTES ==============================
  setStatus('🐧 Consultando as 5 fontes vivas');
  log('Atendente', 'Vou buscar as 5 fontes vivas no Cérebro do produto.', 'working');
  setHolding('atendente', true);

  const fontesParaConsultar = ['cerebro', 'persona', 'skill', 'funil'];
  const falaFonte = {
    cerebro: 'Cérebro!',
    persona: 'Persona!',
    skill: 'Skill!',
    funil: 'Funil!',
  };
  const labelFonte = {
    cerebro: 'Cérebro',
    persona: 'Persona',
    skill: 'Skill',
    funil: 'Funil',
  };

  // Atendente caminha até cada fonte, ativa pulse, fala nome
  for (const fonteId of fontesParaConsultar) {
    const pos = posFonte(fonteId);
    if (!pos) continue;
    setFonteAtiva(fonteId, true);
    say('atendente', falaFonte[fonteId], 80);
    await walkTo('atendente', pos.x, pos.y, 'idle');
    await delay(700, sig);
    log('Atendente', `${labelFonte[fonteId]} consultada.`, 'done');
    setFonteAtiva(fonteId, false);
  }

  // Volta pra mesa central
  setStatus('🐧 Atendente volta com as 4 fontes consultadas');
  await walkTo('atendente', 480, 540, 'idle');
  setHolding('atendente', false);
  say('atendente', '4 fontes ✓', 100);
  await delay(800, sig);

  // ============================== FASE 3: CONVOCAÇÃO DOS MESTRES ==============================
  setStatus('🐧 Convocando os 4 mestres (5ª fonte viva — Clones)');
  log('Atendente', 'Falta a 5ª fonte: Clones. Vou chamar os mestres em pessoa.', 'handoff');
  say('atendente', 'HALBERT! SCHWARTZ! BENCIVENGA! HORMOZI!', 200);
  await delay(2200, sig);

  // ============================== FASE 4: MESTRES ENTRAM ==============================
  setStatus('✍ Os 4 mestres entram em paralelo');
  log('Sistema', 'Mestres convocados — entrando em paralelo.', 'info');
  const mestres = ['halbert', 'schwartz', 'bencivenga', 'hormozi'];
  const falasEntrada = {
    halbert: 'Vamos lá.',
    schwartz: 'Mostra aí.',
    bencivenga: 'Pode crer.',
    hormozi: 'Bora.',
  };

  // Torna mestres visíveis (eles começam fora da tela, à direita)
  mestres.forEach(id => setVisivel(id, true));

  // Cada mestre caminha até sua mesa em paralelo
  await Promise.all(mestres.map(async (id, i) => {
    const pos = posMesa(id);
    if (!pos) return;
    // Pequeno escalonamento na entrada (50ms por mestre) pra não chegarem no mesmo frame
    await delay(i * 80, sig);
    say(id, falasEntrada[id] || 'Olá', 100);
    await walkTo(id, pos.x, pos.y, 'sitting');
    setState(id, 'working');
    log(id.charAt(0).toUpperCase() + id.slice(1), 'sentou no computador.', 'working');
  }));

  // ============================== FASE 5: 4 MESTRES TRABALHANDO EM PARALELO ==============================
  setStatus('✍ 4 mestres escrevendo em paralelo');

  // Bolhas independentes por mestre — cada um tem seu pool de falas
  const bolhasPorMestre = {
    halbert: [
      'above-the-fold...',
      'P.S. matador...',
      'identificação de dor...',
      'voz primeira pessoa...',
      'especificidade brutal...',
    ],
    schwartz: [
      'nível de consciência...',
      'mecanismo único...',
      'apresentação produto...',
      'Breakthrough...',
      'por que outras falham...',
    ],
    bencivenga: [
      'bullets de fascinação...',
      'prova social...',
      'depoimento real...',
      'autoridade...',
      'persuasão...',
    ],
    hormozi: [
      'stack de bônus...',
      'Value Equation...',
      'garantia tripla...',
      'Grand Slam Offer...',
      'oferta R$ 1.997...',
    ],
  };

  // Cada mestre gira sua própria bolha em ritmo independente.
  // Loop roda até a API resolver — esperarApiComLoop existente.
  const idxBolha = { halbert: 0, schwartz: 0, bencivenga: 0, hormozi: 0 };
  const ritmoMs = { halbert: 2400, schwartz: 2800, bencivenga: 2200, hormozi: 2600 };
  const proximoTick = { ...ritmoMs };

  const loopBolhas = async () => {
    const t = Date.now();
    if (!loopBolhas._t0) loopBolhas._t0 = t;
    const elapsed = t - loopBolhas._t0;
    mestres.forEach(id => {
      if (elapsed >= proximoTick[id]) {
        const pool = bolhasPorMestre[id];
        say(id, pool[idxBolha[id] % pool.length], Math.floor(ritmoMs[id] / 18));
        idxBolha[id]++;
        proximoTick[id] = elapsed + ritmoMs[id];
      }
    });
  };

  log('Sistema', 'Halbert, Schwartz, Bencivenga e Hormozi escrevendo simultaneamente.', 'working');

  const { result, error } = await esperarApiComLoop(apiCall(), loopBolhas, 400, sig);
  if (error) throw error;

  // ============================== FASE 6: ENTREGA DOS MESTRES ==============================
  setStatus('✍ Mestres terminaram — entregando ao Atendente');

  // Cada mestre levanta, anuncia, joga papel, fica de pé esperando
  // Ordem aleatória pra parecer natural (na vida real eles não terminam na mesma ordem)
  const ordemEntrega = [...mestres].sort(() => Math.random() - 0.5);
  for (const id of ordemEntrega) {
    setState(id, 'done');
    say(id, `${id.charAt(0).toUpperCase() + id.slice(1)} pronto!`, 90);
    log(id.charAt(0).toUpperCase() + id.slice(1), 'entregou seus blocos.', 'done');
    throwPaper(id, 'atendente');
    await delay(380, sig);
  }

  // Atendente recolhe (papéis voando, ele segura no fim)
  await delay(600, sig);
  setHolding('atendente', true);
  setStatus('🐧 Atendente consolidando os 4 entregáveis');
  say('atendente', 'Montando final...', 110);
  log('Atendente', 'Consolidando os 4 mestres num só entregável.', 'working');
  await delay(1500, sig);

  // ============================== FASE 7: ENTREGA FINAL ==============================
  setHolding('atendente', false);
  setStatus('🐧 Copy entregue!');
  say('atendente', 'Copy entregue!', 150);
  log('Atendente', `Pipeline completo: ${result?.pipeline?.mestres_sucesso || 4}/4 mestres OK.`, 'final');
  await delay(900, sig);

  return result;
}

export const ROTEIROS_COPY = {
  gerarCopy: roteiroGerarCopy,
};
