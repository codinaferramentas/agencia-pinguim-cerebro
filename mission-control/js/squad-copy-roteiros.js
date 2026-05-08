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

// V2.10.1 — Falas de entrada + pools maiores com progressão semântica.
// Pool em 4 fases: rascunho (0-25%), desenvolvimento (25-65%), revisão (65-90%),
// finalização (90-100%). Antes: 5 frases ciclando 3-4x em 100s — "finalizando..."
// aparecia com 60s sobrando (sensação de loop fake). Agora cada fase só ativa
// quando o elapsed/totalEsperado atinge o threshold.
const FALAS_ENTRADA = {
  // Squad copy
  'gary-halbert':    'Vamos lá.',
  'eugene-schwartz': 'Mostra aí.',
  'gary-bencivenga': 'Pode crer.',
  'alex-hormozi':    'Bora.',
  'dan-kennedy':     'Direto ao ponto.',
  'john-carlton':    'Saca só.',
  'russell-brunson': 'Vamos pro palco.',
  'jon-benson':      'Roteiro saindo.',
  // Squad advisory-board (V2.10.1)
  'charlie-munger':  'Antes de tudo, inverter.',
  'ray-dalio':       'Vamos aos cenários.',
  'naval-ravikant':  'Onde está a alavanca?',
  'peter-thiel':     'Monopólio ou competição?',
  'board-chair':     'Síntese vindo.',
};

// Pools por mestre, agora estruturados em 4 fases semânticas.
// Cada fase tem ~4-5 frases. Total 16-20 frases por mestre.
// Função proximoTickComProgressao() escolhe da fase certa baseado no progresso.
const BOLHAS_POR_MESTRE = {
  'gary-halbert': {
    rascunho:      ['lendo briefing...', 'pegando dor central...', 'voz primeira pessoa...', 'achei o ângulo...'],
    desenvolvimento: ['above-the-fold...', 'opening story...', 'identificação de dor...', 'storytelling longo...', 'Halbert touch...'],
    revisao:       ['relendo opening...', 'cortando engenhosidade...', 'ajustando voz...', 'P.S. matador...'],
    finalizacao:   ['último ajuste...', 'assinatura Halbert...', 'pronto pra entregar...'],
  },
  'eugene-schwartz': {
    rascunho:      ['nível de consciência...', 'identificando estágio...', 'definindo mercado...', 'desejo dominante...'],
    desenvolvimento: ['mecanismo único...', 'Breakthrough...', 'por que outras falham...', 'apresentação produto...', 'concorrentes inferiores...'],
    revisao:       ['testando promessa...', 'reforçando UM...', 'amarração lógica...', 'aderência ao stage...'],
    finalizacao:   ['Schwartz check...', 'pronto.'],
  },
  'gary-bencivenga': {
    rascunho:      ['lendo briefing...', 'mapeando objeções...', 'caçando especificidade...', 'autoridade onde?...'],
    desenvolvimento: ['bullets de fascinação...', 'prova social...', 'depoimento real...', 'persuasão...', 'belief x desire...'],
    revisao:       ['cortando vago...', 'medindo bullets...', 'reforçando prova...', 'cada palavra paga...'],
    finalizacao:   ['Bencivenga aprovou...', 'entregando...'],
  },
  'alex-hormozi': {
    rascunho:      ['mapeando dream outcome...', 'Value Equation...', 'precificando esforço...', 'pegando promessa...'],
    desenvolvimento: ['stack de bônus...', 'garantia tripla...', 'Grand Slam Offer...', 'oferta...', 'desidentificando preço...'],
    revisao:       ['testando irrecusabilidade...', 'reforçando garantia...', 'limpando friction...', 'reduzindo time/effort...'],
    finalizacao:   ['Grand Slam pronto...', 'entregando.'],
  },
  'dan-kennedy': {
    rascunho:      ['mapeando WIIFM...', 'definindo público...', 'urgência onde?...', 'Godfather angle...'],
    desenvolvimento: ['Godfather Offer...', 'urgência genuína...', 'risk reversal...', 'preço justificado...', 'oferta clara...'],
    revisao:       ['testando clareza...', 'cortando hesitação...', 'reforçando urgência...', 'fechando saídas...'],
    finalizacao:   ['Kennedy approved...', 'pronto.'],
  },
  'john-carlton': {
    rascunho:      ['lendo briefing...', 'voz humana...', 'underdog angle...', 'opening cru...'],
    desenvolvimento: ['anti-corporativo...', 'underdog story...', 'ataque ao óbvio...', 'big domino...', 'pegando emoção...'],
    revisao:       ['cortando corporate...', 'reforçando voz...', 'humanizando mais...', 'cru e direto...'],
    finalizacao:   ['Carlton out...', 'entregando.'],
  },
  'russell-brunson': {
    rascunho:      ['Hook Story Offer...', 'mapeando funil...', 'identificando tripwire...', 'pegando big idea...'],
    desenvolvimento: ['escada de valor...', 'apresentação...', 'em camadas...', 'storytelling vendedor...', 'soap opera sequence...'],
    revisao:       ['testando hook...', 'reforçando story...', 'amarrando offer...', 'transição entre fases...'],
    finalizacao:   ['Brunson check...', 'pronto.'],
  },
  'jon-benson': {
    rascunho:      ['call-out...', 'mapeando audiência...', 'definindo problema...', 'pegando tom VSL...'],
    desenvolvimento: ['agitação...', 'mecanismo único...', 'demonstração...', 'fechamento VSL...', 'pattern interrupt...'],
    revisao:       ['testando pacing...', 'cortando filler...', 'reforçando close...', 'ajustando tempo...'],
    finalizacao:   ['Benson cut...', 'entregando.'],
  },

  // Squad advisory-board (V2.10.1 — pools novos)
  'charlie-munger': {
    rascunho:      ['lendo dilema...', 'invertendo a pergunta...', 'mapeando worldly wisdom...', 'caçando estupidez...'],
    desenvolvimento: ['inversion ativa...', 'mental models...', 'evitando o óbvio errado...', 'circle of competence...', 'incentivos primeiro...'],
    revisao:       ['testando "como falha"...', 'cortando otimismo...', 'reforçando margem de segurança...', 'lollapalooza check...'],
    finalizacao:   ['veredito Munger...', 'entregando.'],
  },
  'ray-dalio': {
    rascunho:      ['mapeando cenários...', 'separando facts/desejos...', 'matriz de probabilidade...', 'caçando blind spots...'],
    desenvolvimento: ['cenário otimista...', 'cenário pessimista...', 'cenário base...', 'All Weather aplicado...', 'pesando trade-offs...'],
    revisao:       ['estresse-test...', 'radical truth...', 'algoritmo de decisão...', 'pessoas certas pra job...'],
    finalizacao:   ['Dalio fechou...', 'pronto.'],
  },
  'naval-ravikant': {
    rascunho:      ['mapeando alavancas...', 'specific knowledge?...', 'capital vs labor vs code...', 'long-term thinking...'],
    desenvolvimento: ['leverage assimétrico...', 'permissionless leverage...', 'jogos infinitos...', 'compound interest...', 'wealth não dinheiro...'],
    revisao:       ['testando escalabilidade...', 'tem alavanca real?...', 'cortando ruído...', 'simplifying...'],
    finalizacao:   ['Naval out...', 'entregando.'],
  },
  'peter-thiel': {
    rascunho:      ['monopólio ou competição?...', 'mapeando 0-1...', 'caçando segredo...', 'última jogada...'],
    desenvolvimento: ['definite optimism...', 'small market first...', 'mafia effect...', 'last mover advantage...', 'bold thesis...'],
    revisao:       ['testando contrarian...', 'monopólio defensável?...', 'reforçando segredo...', 'definite plan?...'],
    finalizacao:   ['Thiel approved...', 'pronto.'],
  },
  'board-chair': {
    rascunho:      ['lendo conselheiros...', 'mapeando convergências...', 'mapeando divergências...', 'sintetizando...'],
    desenvolvimento: ['amarrando Munger+Dalio...', 'pesando Naval+Thiel...', 'extraindo recomendação...', 'estruturando entregável...', 'achando padrão...'],
    revisao:       ['veredito final...', 'reforçando ações...', 'declarando incertezas...', 'review estrutural...'],
    finalizacao:   ['parecer pronto...', 'entregando.'],
  },
};

const FALA_ENTRADA_DEFAULT = 'Cheguei.';
// Fallback estruturado em 4 fases — pra mestre desconhecido cair em algo que ainda parece progressão.
const BOLHAS_DEFAULT = {
  rascunho:        ['lendo briefing...', 'organizando ideias...', 'pegando ângulo...'],
  desenvolvimento: ['rascunhando...', 'método aplicado...', 'estruturando...', 'desenvolvendo argumento...'],
  revisao:         ['revisando...', 'ajustando...', 'limando arestas...'],
  finalizacao:     ['finalizando...', 'pronto.'],
};

// Tempo total esperado de pipeline (ms). Se passar disso, congela em "finalização" sem voltar.
// Calibrado pra advisory (~110s) — copy é mais rápido (~70s) mas mantém pool ativo.
const TEMPO_TOTAL_ESPERADO_MS = 110_000;

// Thresholds de progressão (% do tempo esperado). Frases de fase X só ativam após
// elapsed >= threshold X. Distribui assim:
//   rascunho        0-25%
//   desenvolvimento 25-65%
//   revisao         65-90%
//   finalizacao     90-100%+
const FASE_THRESHOLDS = [
  { fase: 'rascunho',        ate: 0.25 },
  { fase: 'desenvolvimento', ate: 0.65 },
  { fase: 'revisao',         ate: 0.90 },
  { fase: 'finalizacao',     ate: 1.10 }, // > 1 = pode passar do esperado, fica em finalizacao
];

// Decide qual fase está ativa pelo elapsed.
function faseAtual(elapsed, totalEsperado = TEMPO_TOTAL_ESPERADO_MS) {
  const ratio = elapsed / totalEsperado;
  for (const t of FASE_THRESHOLDS) if (ratio < t.ate) return t.fase;
  return 'finalizacao';
}

// Devolve próxima frase pro mestre considerando fase atual + índice rotativo.
// Se a fase ativa não tem frases, cai pra fase anterior.
function proximoTickComProgressao(slugMestre, idxFase, elapsed) {
  const pool = BOLHAS_POR_MESTRE[slugMestre] || BOLHAS_DEFAULT;
  const fase = faseAtual(elapsed);
  let frases = pool[fase] || [];
  if (frases.length === 0) {
    // Fallback em cascata: tenta fase anterior
    const ordem = ['rascunho', 'desenvolvimento', 'revisao', 'finalizacao'];
    for (let i = ordem.indexOf(fase) - 1; i >= 0; i--) {
      if (pool[ordem[i]] && pool[ordem[i]].length > 0) { frases = pool[ordem[i]]; break; }
    }
  }
  if (frases.length === 0) return { fase, frase: '...' };
  return { fase, frase: frases[idxFase % frases.length] };
}

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

  // V2.10.1 — bolhas com progressão semântica.
  // Cada mestre gira em ritmo proprio E em fase semantica (rascunho/desenvolvimento/
  // revisao/finalizacao) baseada no elapsed. Sem mais "finalizando..." prematuro.
  const idxFase = {};      // indice rotativo dentro da fase atual (reseta ao trocar de fase)
  const ultimaFase = {};   // qual fase estava por ultimo (pra detectar troca)
  const ritmoMs = {};
  const proximoTick = {};
  // Ritmos levemente diferentes pra parecer natural (2200-2800ms)
  mestres.forEach((id, i) => {
    idxFase[id] = 0;
    ultimaFase[id] = null;
    ritmoMs[id] = 2200 + (i * 137) % 700;
    proximoTick[id] = ritmoMs[id];
  });

  const loopBolhas = async () => {
    const t = Date.now();
    if (!loopBolhas._t0) loopBolhas._t0 = t;
    const elapsed = t - loopBolhas._t0;
    mestres.forEach(id => {
      if (elapsed >= proximoTick[id]) {
        const { fase, frase } = proximoTickComProgressao(id, idxFase[id], elapsed);
        // Reseta indice ao mudar de fase, pra começar do início da fase nova
        if (ultimaFase[id] !== fase) {
          idxFase[id] = 0;
          ultimaFase[id] = fase;
        }
        say(id, frase, Math.floor(ritmoMs[id] / 18));
        idxFase[id]++;
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
