/* Mission Control — Roteiros do Squad Cyber

   Diferente dos roteiros padrao (squad-roteiros.js) que sao SEQUENCIAIS
   (Luiz -> Aurora -> Dipsy), os roteiros Cyber sao PARALELOS — todos os
   6 agentes ativam ao mesmo tempo, cada um cuidando da sua especialidade.

   Razao: assim e como seguranca real funciona. Red Team simula ataque
   enquanto IDS monitora enquanto Code Auditor revisa. Tudo simultaneo.
*/

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function esperarApiComLoop(apiPromise, loopFn, intervaloMs) {
  let resolved = null;
  let rejected = null;
  apiPromise.then(r => { resolved = r; }).catch(e => { rejected = e; });
  while (resolved === null && rejected === null) {
    await loopFn();
    await delay(intervaloMs);
  }
  if (rejected) return { result: null, error: rejected };
  return { result: resolved, error: null };
}

// ============================================================
// AUDITORIA DE SEGURANCA — todos os 6 agentes em paralelo
// ============================================================
export async function roteiroAuditoriaSeguranca({ engine, log, setStatus, apiCall }) {
  const { walkTo, say, setHolding, setState, setProtagonists } = engine;

  // Todos os 6 sao protagonistas — cada um na sua sala
  setProtagonists(['ingrid', 'fernanda', 'bejairo', 'rafael', 'tati', 'dom']);

  setStatus('🛡 Squad Cyber acionada — auditoria completa do sistema');
  log('Sistema', 'Iniciando auditoria de seguranca em todas as 3 camadas', 'info');
  await delay(400);

  // FASE 1: cada agente vai pra sua "estacao de trabalho" dentro da sala
  // Posicoes ja definidas nos AGENTS_DEF (desk de cada um)
  setStatus('⚡ Squad em movimento — todos pegam suas estacoes');
  log('Squad', 'Cada agente assumindo sua estacao de trabalho', 'handoff');

  // Movimentos paralelos (sem await em sequencia — todos andam ao mesmo tempo)
  const irParaEstacao = [
    walkTo('ingrid',   110, 170, 'working'),
    walkTo('fernanda', 230, 170, 'working'),
    walkTo('bejairo',  430, 170, 'working'),
    walkTo('rafael',   550, 170, 'working'),
    walkTo('tati',     750, 170, 'working'),
    walkTo('dom',      870, 170, 'working'),
  ];
  await Promise.all(irParaEstacao);
  await delay(300);

  // FASE 2: cada um anuncia o que vai fazer (em paralelo, com pequenos delays)
  setStatus('🔍 6 agentes trabalhando em paralelo');

  setTimeout(() => { say('ingrid',   'Lendo logs Vercel/Supabase', 140); log('Ingrid',   'Coletando logs das ultimas 6h pra threat intel.', 'working'); }, 0);
  setTimeout(() => { say('fernanda', 'Comparando com baseline',    140); log('Fernanda', 'Comparando trafego com baseline de 7 dias.', 'working'); }, 200);
  setTimeout(() => { say('bejairo',  'Vou pensar como atacante',   140); log('Bejairo',  'Red team — simulando ataque IDOR + injection.', 'working'); }, 400);
  setTimeout(() => { say('rafael',   'Defesa em profundidade',     140); log('Rafael',   'Pentest OWASP Top 10 contra cada Edge Function.', 'working'); }, 600);
  setTimeout(() => { say('tati',     'Codigo limpo = seguro',      140); log('Tati',     'Auditando funcoes SECURITY DEFINER e search_path.', 'working'); }, 800);
  setTimeout(() => { say('dom',      'Sem selo, nao passa',        140); log('Dom',      'Validando JWT em todas Edge Functions e RLS por tabela.', 'working'); }, 1000);

  await delay(1300);

  // FASE 3: API real roda em paralelo. Cada agente "fala" enquanto trabalha.
  const bolhas = {
    ingrid:   ['🎯 Threat intel', 'Padrao novo', 'IP suspeito?', 'Anomalia leve'],
    fernanda: ['👁 Sem desvio', 'Trafego ok', 'Comparando...', 'Baseline ok'],
    bejairo:  ['🛡 Atacando', 'F12 testado', 'Vuln aqui?', 'Bypass tentado'],
    rafael:   ['🔓 Pentest', 'Camada 1 ok', 'Camada 2 ok', 'OWASP rodando'],
    tati:     ['🔐 Validando', 'Input ok', 'XSS coberto', 'Sanitiza ok'],
    dom:      ['⚔ Zero Trust', 'JWT valido', 'Allowlist ok', 'Cofre intacto'],
  };
  let i = 0;
  const loopParalelo = async () => {
    // Cada agente fala uma frase em paralelo
    Object.entries(bolhas).forEach(([id, frases]) => {
      const f = frases[i % frases.length];
      say(id, f, 100);
    });
    i++;
  };

  const { result, error } = await esperarApiComLoop(apiCall(), loopParalelo, 1400);
  if (error) {
    log('Sistema', `Auditoria falhou: ${error.message || error}`, 'final');
    throw error;
  }

  // FASE 4: cada agente reporta resultado dos checks
  setStatus('📋 Squad consolidando resultados');
  await delay(400);

  if (result && Array.isArray(result.checks)) {
    // Mapeia tipo de check pro agente responsavel
    const RESPONSAVEL = {
      rls: 'rafael',
      policies: 'rafael',
      security_definer: 'tati',
      incidentes_abertos: 'fernanda',
    };
    for (const chk of result.checks) {
      const agenteId = RESPONSAVEL[chk.tipo] || 'ingrid';
      const tipo = chk.status === 'ok' ? 'done' : (chk.status === 'critical' ? 'final' : 'working');
      const ic = chk.status === 'ok' ? '✅' : (chk.status === 'critical' ? '❌' : '⚠');
      say(agenteId, `${ic} ${chk.tipo}`, 130);
      log(`Squad / ${chk.tipo}`, chk.resumo, tipo);
      await delay(450);
    }
  }

  // FASE 5: status agregado final
  const status = result?.status_geral || 'ok';
  await delay(400);

  if (status === 'ok') {
    setStatus('<span style="color:#10b981">✅ Sistema OK — sem vulnerabilidades</span>');
    log('Squad Cyber', 'Auditoria concluida. Sistema esta seguro.', 'final');
    // Todos comemoram
    say('ingrid',   '✅', 100);
    say('fernanda', '✅', 100);
    say('bejairo',  '✅', 100);
    say('rafael',   '✅', 100);
    say('tati',     '✅', 100);
    say('dom',      '✅', 100);
  } else if (status === 'warning') {
    setStatus('<span style="color:#f59e0b">⚠ Auditoria com avisos</span>');
    log('Squad Cyber', 'Auditoria detectou avisos — ver historico.', 'final');
  } else {
    setStatus('<span style="color:#ef4444">❌ Vulnerabilidades criticas detectadas</span>');
    log('Squad Cyber', 'Auditoria detectou problemas criticos — ver incidentes.', 'final');
  }

  await delay(800);
  return result;
}

// Registry — espelha ROTEIROS do squad-roteiros.js
export const ROTEIROS_CYBER = {
  auditoriaSeguranca: roteiroAuditoriaSeguranca,
};
