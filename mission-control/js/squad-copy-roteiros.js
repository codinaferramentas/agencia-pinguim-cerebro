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

// Bolhas/falas por slug. Mestres novos (V2.5) ja tem entrada propria; mestres
// nao mapeados ganham fallback generico ("rascunhando...").
const FALAS_ENTRADA = {
  'gary-halbert':    'Vamos lá.',
  'eugene-schwartz': 'Mostra aí.',
  'gary-bencivenga': 'Pode crer.',
  'alex-hormozi':    'Bora.',
  'dan-kennedy':     'Direto ao ponto.',
  'john-carlton':    'Saca só.',
  'russell-brunson': 'Vamos pro palco.',
  'jon-benson':      'Roteiro saindo.',
};

const BOLHAS_POR_MESTRE = {
  'gary-halbert':    ['above-the-fold...', 'P.S. matador...', 'identificação de dor...', 'voz primeira pessoa...', 'especificidade brutal...'],
  'eugene-schwartz': ['nível de consciência...', 'mecanismo único...', 'apresentação produto...', 'Breakthrough...', 'por que outras falham...'],
  'gary-bencivenga': ['bullets de fascinação...', 'prova social...', 'depoimento real...', 'autoridade...', 'persuasão...'],
  'alex-hormozi':    ['stack de bônus...', 'Value Equation...', 'garantia tripla...', 'Grand Slam Offer...', 'oferta...'],
  'dan-kennedy':     ['Godfather Offer...', 'urgência genuína...', 'risk reversal...', 'oferta clara...', 'preço justificado...'],
  'john-carlton':    ['voz humana...', 'anti-corporativo...', 'underdog story...', 'ataque ao óbvio...', 'opening cru...'],
  'russell-brunson': ['Hook Story Offer...', 'tripwire...', 'escada de valor...', 'apresentação...', 'em camadas...'],
  'jon-benson':      ['call-out...', 'agitação...', 'mecanismo único...', 'demonstração...', 'fechamento VSL...'],
};

const FALA_ENTRADA_DEFAULT = 'Cheguei.';
const BOLHAS_DEFAULT = ['rascunhando...', 'método aplicado...', 'estruturando...', 'revisando...', 'finalizando...'];

// Nome curto pra exibir nos logs/falas (extrai do slug, ex: 'gary-halbert' -> 'Halbert').
function nomeCurto(slug) {
  const partes = slug.split('-');
  const ult = partes[partes.length - 1];
  return ult.charAt(0).toUpperCase() + ult.slice(1);
}

/* ============================== ROTEIRO gerarCopy ==============================
   Fluxo (V2.5 — N mestres dinamicos, vindos do backend):
   1. Atendente recebe pedido na mesa central
   2. Atendente caminha até cada uma das 4 fontes (Cérebro, Persona, Skill, Funil)
      — em sequência rápida, cada uma "ativada" em pulse amarelo
   3. Atendente volta pra mesa central
   4. Atendente "convoca" os N mestres (bolha grande, nomes dinamicos)
   5. Os N mestres entram em paralelo pela direita
   6. Cada mestre vai até sua mesa e senta no computador
   7. Os N trabalham EM PARALELO com bolhas alternadas
      — loop independente até a API resolver
   8. Quando API resolve, mestres jogam papel um a um pro Atendente
   9. Atendente consolida e entrega
*/
export async function roteiroGerarCopy({ engine, log, setStatus, apiCall, pedido, sig }) {
  const {
    walkTo, say, throwPaper, setHolding, setState,
    setVisivel, setFonteAtiva, setFonteGap, setPedidoAtivo,
    posMesa, posFonte, layout,
  } = engine;

  // V2.5 — lista de slugs de mestres a animar (vinda do backend ou default)
  const mestres = engine.mestres();
  const totalMestres = mestres.length;

  // Se o backend mandou mais mestres que o limite visual, declara honesto.
  if (layout?.mestresCortados?.length > 0) {
    log('Sistema',
      `Animação mostra ${totalMestres} de ${totalMestres + layout.mestresCortados.length} mestres convocados — limite visual do canvas. Backend processa todos.`,
      'info');
  }
  if (layout?.slugsDesconhecidos?.length > 0) {
    log('Sistema',
      `Mestres sem identidade visual definida: [${layout.slugsDesconhecidos.join(', ')}] — não animados, mas backend executa.`,
      'info');
  }

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
  setStatus(`🐧 Convocando ${totalMestres} mestre(s) (5ª fonte viva — Clones)`);
  log('Atendente', `Falta a 5ª fonte: Clones. Vou chamar ${totalMestres} mestre(s) em pessoa.`, 'handoff');
  // Grita os nomes em maiusculo
  const nomesGritados = mestres.map(s => nomeCurto(s).toUpperCase()).join('! ') + '!';
  say('atendente', nomesGritados, Math.max(150, 50 * totalMestres));
  await delay(2200, sig);

  // ============================== FASE 4: MESTRES ENTRAM ==============================
  setStatus(`✍ Os ${totalMestres} mestre(s) entram em paralelo`);
  log('Sistema', 'Mestres convocados — entrando em paralelo.', 'info');

  // Torna mestres visíveis (eles começam fora da tela, à direita)
  mestres.forEach(id => setVisivel(id, true));

  // Cada mestre caminha até sua mesa em paralelo
  await Promise.all(mestres.map(async (id, i) => {
    const pos = posMesa(id);
    if (!pos) return;
    // Pequeno escalonamento na entrada (80ms por mestre) pra não chegarem no mesmo frame
    await delay(i * 80, sig);
    say(id, FALAS_ENTRADA[id] || FALA_ENTRADA_DEFAULT, 100);
    await walkTo(id, pos.x, pos.y, 'sitting');
    setState(id, 'working');
    log(nomeCurto(id), 'sentou no computador.', 'working');
  }));

  // ============================== FASE 5: N MESTRES TRABALHANDO EM PARALELO ==============================
  setStatus(`✍ ${totalMestres} mestre(s) escrevendo em paralelo`);

  // Cada mestre gira sua propria bolha em ritmo independente
  const idxBolha = {};
  const ritmoMs = {};
  const proximoTick = {};
  // Ritmos levemente diferentes pra parecer natural (2200-2800ms)
  mestres.forEach((id, i) => {
    idxBolha[id] = 0;
    ritmoMs[id] = 2200 + (i * 137) % 700; // distribui ritmos
    proximoTick[id] = ritmoMs[id];
  });

  const loopBolhas = async () => {
    const t = Date.now();
    if (!loopBolhas._t0) loopBolhas._t0 = t;
    const elapsed = t - loopBolhas._t0;
    mestres.forEach(id => {
      if (elapsed >= proximoTick[id]) {
        const pool = BOLHAS_POR_MESTRE[id] || BOLHAS_DEFAULT;
        say(id, pool[idxBolha[id] % pool.length], Math.floor(ritmoMs[id] / 18));
        idxBolha[id]++;
        proximoTick[id] = elapsed + ritmoMs[id];
      }
    });
  };

  log('Sistema', `${mestres.map(nomeCurto).join(', ')} escrevendo simultaneamente.`, 'working');

  const { result, error } = await esperarApiComLoop(apiCall(), loopBolhas, 400, sig);
  if (error) throw error;

  // ============================== FASE 6: ENTREGA DOS MESTRES ==============================
  setStatus('✍ Mestres terminaram — entregando ao Atendente');

  // Cada mestre levanta, anuncia, joga papel, fica de pé esperando
  // Ordem aleatória pra parecer natural (na vida real eles não terminam na mesma ordem)
  const ordemEntrega = [...mestres].sort(() => Math.random() - 0.5);
  for (const id of ordemEntrega) {
    setState(id, 'done');
    say(id, `${nomeCurto(id)} pronto!`, 90);
    log(nomeCurto(id), 'entregou seus blocos.', 'done');
    throwPaper(id, 'atendente');
    await delay(380, sig);
  }

  // Atendente recolhe (papéis voando, ele segura no fim)
  await delay(600, sig);
  setHolding('atendente', true);
  setStatus(`🐧 Atendente consolidando ${totalMestres} entregável(eis)`);
  say('atendente', 'Montando final...', 110);
  log('Atendente', `Consolidando os ${totalMestres} mestres num só entregável.`, 'working');
  await delay(1500, sig);

  // ============================== FASE 7: ENTREGA FINAL ==============================
  setHolding('atendente', false);
  setStatus('🐧 Copy entregue!');
  say('atendente', 'Copy entregue!', 150);
  const sucessos = result?.pipeline?.mestres_sucesso ?? totalMestres;
  const total = result?.pipeline?.mestres_total ?? totalMestres;
  log('Atendente', `Pipeline completo: ${sucessos}/${total} mestres OK.`, 'final');
  await delay(900, sig);

  return result;
}

export const ROTEIROS_COPY = {
  gerarCopy: roteiroGerarCopy,
};
