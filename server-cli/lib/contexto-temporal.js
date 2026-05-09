// ============================================================
// contexto-temporal.js — V2.14 Fase 1.7 hotfix
// ============================================================
// Bloco que vai NO TOPO de TODO prompt do Atendente Pinguim.
// Corrige bug crítico: LLM (Claude CLI) chuta dia da semana baseado em
// treinamento (cutoff jan/2026), errando "hoje" quando sócio pergunta agenda.
//
// Sem este bloco, agente respondeu "Sexta 09/05" pra um sábado real, com
// risco real de errar "vamos marcar quarta?" quando hoje é quinta.
//
// Padrão usado por todo agente sério (Claude desktop, ChatGPT) — injetar
// data factual no prompt em vez de confiar na memória do modelo.
// ============================================================

const FMT_LONGO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const FMT_DATA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit', month: '2-digit', year: 'numeric',
});

const FMT_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

const FMT_WEEKDAY = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'long',
});

// Mapa numerico do dia da semana em BRT (0=domingo)
function diaSemanaIdx(date) {
  // Get IANA-aware weekday via formatToParts pra evitar usar getDay() que usa fuso da maquina
  const parts = FMT_WEEKDAY.formatToParts(date);
  const wd = parts.find(p => p.type === 'weekday')?.value || '';
  const map = { 'domingo': 0, 'segunda-feira': 1, 'terça-feira': 2, 'quarta-feira': 3, 'quinta-feira': 4, 'sexta-feira': 5, 'sábado': 6 };
  return map[wd.toLowerCase()] ?? -1;
}

function blocoDataAtual() {
  const agora = new Date();
  const dataLonga = FMT_LONGO.format(agora);  // "sábado, 09 de maio de 2026"
  const dataCurta = FMT_DATA.format(agora);   // "09/05/2026"
  const hora = FMT_HORA.format(agora);        // "13:06"
  const idx = diaSemanaIdx(agora);

  // Calcula próximos dias da semana pra ajudar o agente a interpretar "quarta", "quinta", etc
  const proximos = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(agora.getTime() + i * 24 * 60 * 60 * 1000);
    proximos.push(`${FMT_WEEKDAY.format(d)} ${FMT_DATA.format(d)}`);
  }

  return `[CONTEXTO TEMPORAL — fonte da verdade, NUNCA ignore]
Agora: ${dataLonga}, ${hora} (horário de Brasília, BRT/UTC-3)
Hoje: ${dataCurta} (${FMT_WEEKDAY.format(agora)})
Próximos 7 dias:
${proximos.map((p, i) => `  +${i+1}d: ${p}`).join('\n')}

REGRA DURA: ao calcular "amanhã", "essa quarta", "próxima sexta", "semana que vem", USE este bloco como fonte. NUNCA chute baseado em conhecimento prévio — seu treinamento tem cutoff e pode estar defasado em meses. Se um payload de tool trouxer campos como dia_semana_br/data_curta_br, esses prevalecem (vêm do servidor real).`;
}

module.exports = { blocoDataAtual, diaSemanaIdx };
