// ============================================================
// relatorio-triagem-emails.js — V2 (Andre 2026-05-13 noite)
// ============================================================
// REFATORAÇÃO TOTAL — tom de CHIEF OF STAFF / SECRETÁRIA EXECUTIVA.
//
// V1 falhou porque importou estrutura do relatório Meta Ads (matriz
// categoria×mestre, drill-down de 6 mestres, gráficos vaidosos).
// Email NÃO é funil de marketing — é fluxo de DECISÕES PESSOAIS.
//
// Base teórica (conselheiros consultados 2026-05-13):
// - Merlin Mann (Inbox Zero) — 5 ações: Delete/Delegate/Respond/Defer/Do
// - David Allen (GTD) — regra dos 2min + 4D's
// - Tim Ferriss (4HWW) — batching + low-information diet
// - Cal Newport (A World Without Email) — attention capital
// - HBR Nov/2020 — How to Brief a Senior Executive ("3 priorities" rule)
//
// Nova arquitetura:
// 1) coletarTriagemEmails() — Gmail API janela dia BRT inteiro
// 2) classificarComLLM() — 1 chamada Claude que recebe TODOS emails em
//    lote e devolve JSON [{id, balde, motivo_curto}]. Substitui squad
//    inteira (7 chamadas → 1).
// 3) priorizarTop3() — Claude pega top 3 do balde "Responder hoje"
//    e devolve cards numerados com acao_curta + acao_completa.
// 4) sintetizarTriagemDiaria() — markdown final (nota de chief of staff)
//
// 6 BALDES CANÔNICOS (de AÇÃO, não de natureza):
//   responder_hoje   🔴 você é o único que resolve
//   decidir          ✋ esperando sua decisão / aprovação
//   pagar            💸 financeiro (boleto/fatura/reembolso)
//   delegar          🤝 outra pessoa do time resolve
//   acompanhar       ⏳ você está esperando 3º responder
//   arquivar         📦 ler depois OU arquivar sem ler
// ============================================================

const { spawn } = require('child_process');
const db = require('./db');
const googleGmail = require('./google-gmail');
const googleCalendar = require('./google-calendar');
const socio = require('./socio');

// ============================================================
// Claude CLI runner (mesmo padrão dos outros relatórios)
// ============================================================
function runClaudeCLI(prompt, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const envFiltrado = { ...process.env };
    for (const k of Object.keys(envFiltrado)) {
      if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) delete envFiltrado[k];
    }
    const proc = spawn('claude', ['--print'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: envFiltrado,
    });
    let stdout = '', stderr = '';
    const killer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (_) {}
      reject(new Error(`Claude CLI timeout ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdin.write(prompt);
    proc.stdin.end();
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      clearTimeout(killer);
      if (code !== 0) reject(new Error(`Claude CLI exit ${code}: ${stderr.slice(0, 300)}`));
      else resolve(stdout.trim());
    });
    proc.on('error', e => { clearTimeout(killer); reject(e); });
  });
}

// Tolerante a wrappers ```json e ruído
function extrairJson(bloco) {
  if (!bloco) return null;
  const m = bloco.match(/```json\s*([\s\S]*?)\s*```/);
  if (m) return m[1];
  const inicioObj = bloco.indexOf('{');
  const inicioArr = bloco.indexOf('[');
  if (inicioObj === -1 && inicioArr === -1) return null;
  const inicio = (inicioObj !== -1 && (inicioArr === -1 || inicioObj < inicioArr)) ? inicioObj : inicioArr;
  const fimObj = bloco.lastIndexOf('}');
  const fimArr = bloco.lastIndexOf(']');
  const fim = Math.max(fimObj, fimArr);
  return bloco.slice(inicio, fim + 1);
}

// ============================================================
// HEURÍSTICA RÁPIDA — pré-classifica antes do LLM
// Reduz custo: itens claramente "arquivar" (newsletter, notificação)
// pulam o LLM. LLM só vê os ambíguos / de ação.
// ============================================================
const REGEX_HEURISTICA = {
  // Spam puro — nem entra no relatório
  spam: /\bunsubscribe\b|black friday|cyber monday|imperd[íi]vel|s[óo] hoje|[íi]ltima chance/i,

  // Arquivar / informativo claro
  arquivar: /newsletter|substack|medium\.com|digest|weekly|aviso de pol[íi]tica|terms of service|atualizamos? nossos termos|notifica[çc][ãa]o do (slack|discord|github|drive|asana|notion)|backup conclu[íi]do|login (detectado|realizado)|nova sess[ãa]o|seu (resumo|relat[óo]rio) semanal/i,

  // Pagar / financeiro
  pagar: /\bboleto\b|fatura|2ª via|segunda via|pagamento (pendente|atrasad|vencid)|vencimento|nota fiscal|nfe|nfse|reembolso|estorno|chargeback|cobran[çc]a/i,

  // Decidir / aprovar
  decidir: /\baprovar?\??\b|ok pra seguir|pode autorizar|preciso da sua (assinatura|aprova[çc]ão)|valida[çc][ãa]o|pode revisar|d[áa] uma olhada\??/i,

  // Acompanhar (você está esperando 3º)
  acompanhar: /aguardando (sua )?resposta|estou esperando|qualquer atualiza[çc][ãa]o|me retorna quando|fico no aguardo/i,

  // Responder hoje (urgência real)
  responder_hoje: /\burgente\b|preciso de retorno hoje|n[ãa]o consegui acessar|reclama[çc][ãa]o|n[ãa]o funciona|cancelar contrato|vou cancelar|chargeback|intima[çc][ãa]o|notifica[çc][ãa]o (judicial|extrajudicial)|auto de infra[çc][ãa]o|procon|jur[íi]dico/i,

  // Domínios jurídico/fiscal — sempre alta prioridade
  juridico_fiscal: /@.*\.(gov\.br|jus\.br)$|@.*procon|@.*oab\.org\.br|@.*receita\.fazenda/i,

  // Delegar (cliente pedindo coisa operacional)
  delegar: /\bcadastr|preciso de acesso|n[ãa]o recebi (o )?(login|acesso|email)|como fa[çc]o para|pode me ajudar|d[úu]vida sobre o produto|suporte/i,
};

function classificarHeuristico(email) {
  const assunto = email.assunto || '';
  const snippet = email.snippet || '';
  const de = email.de || '';
  const txt = `${assunto} ${snippet}`;
  const remetente = de.toLowerCase();

  // Ordem importa — checa mais específico primeiro
  if (REGEX_HEURISTICA.spam.test(txt)) return { balde: 'spam', confianca: 'alta' };
  if (REGEX_HEURISTICA.juridico_fiscal.test(remetente)) return { balde: 'responder_hoje', confianca: 'alta' };
  if (REGEX_HEURISTICA.responder_hoje.test(txt)) return { balde: 'responder_hoje', confianca: 'media' };
  if (REGEX_HEURISTICA.pagar.test(txt)) return { balde: 'pagar', confianca: 'alta' };
  if (REGEX_HEURISTICA.decidir.test(txt)) return { balde: 'decidir', confianca: 'media' };
  if (REGEX_HEURISTICA.acompanhar.test(txt)) return { balde: 'acompanhar', confianca: 'media' };
  if (REGEX_HEURISTICA.delegar.test(txt)) return { balde: 'delegar', confianca: 'media' };
  if (REGEX_HEURISTICA.arquivar.test(txt)) return { balde: 'arquivar', confianca: 'alta' };

  return { balde: null, confianca: 'baixa' }; // ambíguo — LLM decide
}

// Extrai email do header "Nome <fulano@x.com>"
function extrairEmailDe(de) {
  if (!de) return '';
  const m = de.match(/<([^>]+)>/);
  return (m ? m[1] : de).trim().toLowerCase();
}

function extrairNomeDe(de) {
  if (!de) return '';
  const m = de.match(/^([^<]+?)\s*<[^>]+>$/);
  return (m ? m[1] : de.split('@')[0]).replace(/['"]/g, '').trim();
}

// ============================================================
// 1) COLETOR DE DADOS — Gmail API + classificação heurística
// ============================================================
async function coletarTriagemEmails({ cliente_id, dia_alvo_brt }) {
  const j = googleCalendar.janelaDiaBRT(dia_alvo_brt);
  const [yA, mA, dA] = dia_alvo_brt.split('-');
  const dAi = parseInt(dA, 10);
  const queryGmail = `after:${yA}/${mA}/${dAi - 1 || dA} before:${yA}/${mA}/${dAi + 1}`;

  const r24h = await googleGmail.listarEmails({
    cliente_id,
    query: queryGmail,
    pageSize: 100,
  });

  const t0Ms = new Date(j.inicio_iso).getTime();
  const t1Ms = new Date(j.fim_iso).getTime();
  let emails24h = (r24h.emails || []).filter(e => {
    if (!e.data_raw) return true;
    const t = new Date(e.data_raw).getTime();
    if (isNaN(t)) return true;
    return t >= t0Ms && t <= t1Ms;
  });

  // Enriquecer + classificação heurística inicial
  emails24h = emails24h.map(e => {
    const h = classificarHeuristico(e);
    return {
      ...e,
      email_de: extrairEmailDe(e.de),
      nome_de: extrairNomeDe(e.de),
      link_gmail: `https://mail.google.com/mail/u/0/#inbox/${e.id}`,
      _heur_balde: h.balde,
      _heur_confianca: h.confianca,
    };
  });

  return {
    dia_alvo_brt,
    janela: j,
    total: emails24h.length,
    emails: emails24h,
  };
}

// ============================================================
// 2) CLASSIFICADOR LLM — 1 chamada em lote pros ambíguos
// ============================================================
const BALDES_NATIVOS = ['responder_hoje', 'decidir', 'pagar', 'delegar', 'acompanhar', 'arquivar', 'spam'];

// V5 — Carrega baldes custom pessoais do sócio
async function carregarBaldesCustom(cliente_id) {
  if (!cliente_id) return [];
  try {
    const cidEsc = db.esc ? db.esc(cliente_id) : `'${cliente_id}'`;
    const sql = `SELECT slug, nome, icone, descricao, cor FROM pinguim.triagem_baldes_custom WHERE cliente_id = ${cidEsc} AND desativado = false ORDER BY criado_em ASC;`;
    const r = await db.rodarSQL(sql);
    return Array.isArray(r) ? r : [];
  } catch (e) {
    console.error('[triagem V5] carregarBaldesCustom erro:', e.message);
    return [];
  }
}

// V5 — Carrega últimos N aprendizados de reclassificação do sócio
async function carregarAprendizados(cliente_id, limite = 30) {
  if (!cliente_id) return [];
  try {
    const cidEsc = db.esc ? db.esc(cliente_id) : `'${cliente_id}'`;
    const sql = `SELECT assunto, remetente_email, remetente_nome, snippet, balde_antigo, balde_novo, motivo_humano FROM pinguim.triagem_aprendizados WHERE cliente_id = ${cidEsc} ORDER BY criado_em DESC LIMIT ${parseInt(limite, 10)};`;
    const r = await db.rodarSQL(sql);
    return Array.isArray(r) ? r : [];
  } catch (e) {
    console.error('[triagem V5] carregarAprendizados erro:', e.message);
    return [];
  }
}

async function classificarComLLM({ emails, dataLongaBR, baldesCustom = [], aprendizados = [] }) {
  const BALDES_VALIDOS = [...BALDES_NATIVOS, ...baldesCustom.map(b => b.slug)];
  // Só manda pro LLM os ambíguos OU os de média confiança (pra confirmar)
  const ambiguos = emails.filter(e => !e._heur_balde || e._heur_confianca === 'baixa' || e._heur_confianca === 'media');

  if (ambiguos.length === 0) {
    return emails.map(e => ({
      id: e.id,
      balde: e._heur_balde || 'arquivar',
      motivo_curto: 'heurística (alta confiança)',
    }));
  }

  // Lista compacta pro LLM
  const listaCompacta = ambiguos.map((e, i) => ({
    n: i + 1,
    id: e.id,
    de: `${e.nome_de} <${e.email_de}>`.slice(0, 80),
    assunto: (e.assunto || '').slice(0, 120),
    snippet: (e.snippet || '').slice(0, 200).replace(/\s+/g, ' '),
    palpite_heuristico: e._heur_balde || null,
  }));

  // V5 — Bloco de baldes custom do sócio (se houver)
  const blocoCustom = baldesCustom.length === 0 ? '' : `

## BALDES CUSTOM DO SÓCIO (criados por ele — TEM PRIORIDADE quando casar com o sentido)

${baldesCustom.map(b => `| \`${b.slug}\` | ${b.icone || '🏷'} ${b.nome}${b.descricao ? ' — ' + b.descricao : ''} |`).join('\n')}
`;

  // V5 — Bloco de aprendizados (correções manuais anteriores)
  const blocoAprendizados = aprendizados.length === 0 ? '' : `

## REGRAS APRENDIDAS DESTE SÓCIO (correções manuais anteriores — RESPEITAR padrão)

${aprendizados.slice(0, 20).map(a => {
  const fonte = a.remetente_nome || a.remetente_email || '?';
  const assuntoCurto = (a.assunto || '').slice(0, 80);
  const motivo = a.motivo_humano ? ` (motivo: ${a.motivo_humano})` : '';
  return `- "${assuntoCurto}" de ${fonte} → balde \`${a.balde_novo}\` (sócio corrigiu de \`${a.balde_antigo}\`)${motivo}`;
}).join('\n')}

QUANDO VIR EMAIL PARECIDO (mesmo remetente OU padrão de assunto similar), CLASSIFICA NO BALDE QUE O SÓCIO ESCOLHEU.
`;

  const prompt = `Você é o classificador de TRIAGEM EXECUTIVA de email. Sua tarefa é colocar cada email em UM dos baldes de AÇÃO abaixo, como uma SECRETÁRIA EXECUTIVA classificaria pro CEO ler.

## BALDES NATIVOS (6 + spam)

| slug | quando usar |
|---|---|
| \`responder_hoje\` | 🔴 SÓ o sócio resolve. Cliente urgente, reclamação séria, proposta com prazo, jurídico/fiscal (\`.gov.br\`, \`.jus.br\`, procon, intimação) |
| \`decidir\` | ✋ Pedem aprovação/OK do sócio. "Pode autorizar?", "Aprovar?", contrato pra revisar, sócio/funcionário pedindo validação |
| \`pagar\` | 💸 Boleto, fatura, 2ª via, NF, reembolso a aprovar, cobrança financeira |
| \`delegar\` | 🤝 Pode ser feito por funcionário (Rafa/Djairo/suporte). Cadastro Princípia Pay, dúvida operacional, agendamento de reunião |
| \`acompanhar\` | ⏳ O sócio está ESPERANDO a outra parte. "Aguardando sua resposta" do sócio pra terceiro, follow-up que ele iniciou |
| \`arquivar\` | 📦 Sem ação necessária. Newsletter, confirmação automática, notificação Slack/GitHub/Drive, CC informativo, recibo já pago |
| \`spam\` | 🗑 Promoção genérica, phishing, "imperdível só hoje". NÃO entra no relatório. |${blocoCustom}${blocoAprendizados}

## REGRAS DURAS

- Email é coisa de DECISÃO PESSOAL. Pergunta-chave: "o que essa pessoa precisa que o CEO FAÇA hoje?"
- Se o remetente é um SISTEMA (noreply, notification, no-reply) e não pede ação → \`arquivar\`
- Se domínio do remetente é \`.gov.br\`, \`.jus.br\`, procon, OAB, Receita Federal → SEMPRE \`responder_hoje\`
- Recibo/confirmação de pagamento JÁ FEITO → \`arquivar\` (NÃO é pagar; já foi pago)
- Cobrança ATIVA (boleto vencendo, fatura aberta) → \`pagar\`
- Sócio do time pedindo OK → \`decidir\` (não responder_hoje)
- Lead comercial / proposta nova → \`responder_hoje\`
- Reclamação de cliente → \`responder_hoje\`
- Em dúvida entre \`responder_hoje\` e \`decidir\`: se a contraparte está externa, é \`responder_hoje\`. Se é interna, é \`decidir\`.

## EMAILS A CLASSIFICAR (${ambiguos.length} itens)

\`\`\`json
${JSON.stringify(listaCompacta, null, 2)}
\`\`\`

## RESPOSTA

Devolva APENAS o JSON abaixo (sem texto antes/depois, sem markdown wrapper):

\`\`\`json
{
  "classificacoes": [
    {"id": "<id_do_email>", "balde": "<um dos slugs acima>", "motivo_curto": "<até 80 chars explicando o sinal que te fez escolher esse balde>"}
  ]
}
\`\`\`

Regras finais: cada email do input vira UMA entrada na resposta. Não pule nenhum. Não invente id. Use só os 7 slugs válidos.`;

  let respostaRaw = '';
  try {
    respostaRaw = await runClaudeCLI(prompt, 90000);
  } catch (e) {
    // LLM falhou → usa heurística pura como fallback
    return emails.map(e => ({
      id: e.id,
      balde: e._heur_balde || 'arquivar',
      motivo_curto: `fallback (LLM falhou: ${e.message || 'timeout'})`,
    }));
  }

  let parsed = null;
  try {
    const j = extrairJson(respostaRaw);
    if (j) parsed = JSON.parse(j);
  } catch (e) {
    parsed = null;
  }

  const mapaLLM = new Map();
  if (parsed && Array.isArray(parsed.classificacoes)) {
    for (const c of parsed.classificacoes) {
      if (c && c.id && BALDES_VALIDOS.includes(c.balde)) {
        mapaLLM.set(c.id, { balde: c.balde, motivo_curto: c.motivo_curto || '' });
      }
    }
  }

  // Merge: emails de alta confiança usam heurística; ambíguos usam LLM (com fallback heurístico)
  return emails.map(e => {
    if (e._heur_confianca === 'alta' && e._heur_balde) {
      return { id: e.id, balde: e._heur_balde, motivo_curto: 'heurística' };
    }
    const r = mapaLLM.get(e.id);
    if (r) return { id: e.id, ...r };
    return {
      id: e.id,
      balde: e._heur_balde || 'arquivar',
      motivo_curto: 'fallback heurístico',
    };
  });
}

// ============================================================
// 3) PRIORIZAR TOP 3 — Claude monta os cards das 3 prioridades
// ============================================================
async function priorizarTop3({ emailsBalde1, emailsBalde2, emailsBalde3 }) {
  // Junta candidatos a "prioridade hoje":
  // - todos do responder_hoje
  // - todos do decidir (decisão pendente também é prioridade)
  // - pagar SÓ se for cobrança com prazo iminente (palavra-chave de vencimento)
  const candidatos = [];
  for (const e of emailsBalde1) candidatos.push({ ...e, balde_origem: 'responder_hoje' });
  for (const e of emailsBalde2) candidatos.push({ ...e, balde_origem: 'decidir' });
  for (const e of emailsBalde3) {
    const txt = `${e.assunto || ''} ${e.snippet || ''}`;
    if (/vence|venceu|atraso|atrasad|hoje|amanh[ãa]/i.test(txt)) {
      candidatos.push({ ...e, balde_origem: 'pagar' });
    }
  }

  if (candidatos.length === 0) {
    return { top3: [], motivo: 'nenhum candidato a prioridade hoje' };
  }

  // Se ≤3 candidatos, devolve todos sem chamar LLM
  if (candidatos.length <= 3) {
    return {
      top3: candidatos.map(e => ({
        id: e.id,
        balde_origem: e.balde_origem,
        acao_curta: gerarAcaoCurtaFallback(e),
        acao_completa: gerarAcaoCompletaFallback(e),
        link_gmail: e.link_gmail,
      })),
      motivo: '≤3 candidatos, sem LLM',
    };
  }

  // >3 candidatos: LLM escolhe e formata
  const listaCompacta = candidatos.map((e, i) => ({
    n: i + 1,
    id: e.id,
    balde_origem: e.balde_origem,
    de: `${e.nome_de} <${e.email_de}>`.slice(0, 80),
    assunto: (e.assunto || '').slice(0, 120),
    snippet: (e.snippet || '').slice(0, 250).replace(/\s+/g, ' '),
  }));

  const prompt = `Você é o chief of staff do sócio. Tem ${candidatos.length} emails candidatos a "prioridade hoje". Sua tarefa: escolher os **TOP 3 MAIS URGENTES** e formatar como secretária executiva apresentaria.

## EMAILS CANDIDATOS

\`\`\`json
${JSON.stringify(listaCompacta, null, 2)}
\`\`\`

## CRITÉRIO DE PRIORIZAÇÃO (ordem)

1. Jurídico/fiscal (\`.gov.br\`, \`.jus.br\`, procon, intimação) — SEMPRE topo
2. Cobrança ATIVA com prazo hoje/amanhã (boleto vencendo)
3. Cliente reclamando / chargeback / cancelamento iminente
4. Lead comercial quente (proposta com prazo curto)
5. Decisão interna que bloqueia o time (sócio/funcionário esperando OK)

## FORMATO DA RESPOSTA

Devolva APENAS o JSON abaixo (sem texto antes/depois, sem markdown wrapper):

\`\`\`json
{
  "top3": [
    {
      "id": "<id do email>",
      "acao_curta": "<VERBO IMPERATIVO + alvo, máximo 6 palavras, com PRAZO se houver. Ex: 'Responder Acme até 16h', 'Pagar boleto Vivo vence amanhã', 'Aprovar reembolso João R$ 497'>",
      "acao_completa": "<1 frase de 15-25 palavras explicando o que tem que ser feito e por quê. Tom de secretária: 'Pediram contrato fechado hoje, prazo 16h. Cliente é da campanha do mês passado.'>"
    }
  ]
}
\`\`\`

REGRAS:
- Máximo 3 itens. Se tem menos de 3 candidatos urgentes, devolve menos.
- \`acao_curta\` SEMPRE começa com VERBO IMPERATIVO ("Responder", "Aprovar", "Pagar", "Decidir", "Confirmar"). NÃO use "considerar", "talvez", "vale a pena".
- \`acao_completa\` é narrativa CURTA, tom humano. Sem "considerar fazer X".
- Use NÚMEROS REAIS dos emails (valor, prazo, data). NÃO invente.
- Use os IDs EXATOS dos emails escolhidos.`;

  let respostaRaw = '';
  try {
    respostaRaw = await runClaudeCLI(prompt, 90000);
  } catch (e) {
    return {
      top3: candidatos.slice(0, 3).map(e => ({
        id: e.id,
        balde_origem: e.balde_origem,
        acao_curta: gerarAcaoCurtaFallback(e),
        acao_completa: gerarAcaoCompletaFallback(e),
        link_gmail: e.link_gmail,
      })),
      motivo: `LLM falhou: ${e.message}`,
    };
  }

  let parsed = null;
  try {
    const j = extrairJson(respostaRaw);
    if (j) parsed = JSON.parse(j);
  } catch (e) {
    parsed = null;
  }

  if (!parsed || !Array.isArray(parsed.top3) || parsed.top3.length === 0) {
    return {
      top3: candidatos.slice(0, 3).map(e => ({
        id: e.id,
        balde_origem: e.balde_origem,
        acao_curta: gerarAcaoCurtaFallback(e),
        acao_completa: gerarAcaoCompletaFallback(e),
        link_gmail: e.link_gmail,
      })),
      motivo: 'LLM devolveu JSON inválido',
    };
  }

  const mapaCandidatos = new Map(candidatos.map(c => [c.id, c]));
  const top3 = parsed.top3.slice(0, 3).map(item => {
    const e = mapaCandidatos.get(item.id);
    return {
      id: item.id,
      balde_origem: e ? e.balde_origem : 'responder_hoje',
      acao_curta: item.acao_curta || (e ? gerarAcaoCurtaFallback(e) : '(sem ação)'),
      acao_completa: item.acao_completa || (e ? gerarAcaoCompletaFallback(e) : ''),
      link_gmail: e ? e.link_gmail : '#',
    };
  });

  return { top3, motivo: 'LLM ok' };
}

function gerarAcaoCurtaFallback(e) {
  const verbo = {
    responder_hoje: 'Responder',
    decidir: 'Decidir sobre',
    pagar: 'Pagar',
    delegar: 'Delegar',
    acompanhar: 'Cobrar',
    arquivar: 'Ler',
  }[e.balde_origem] || 'Tratar';
  const assunto = (e.assunto || '(sem assunto)').slice(0, 50);
  return `${verbo} "${assunto}"`;
}

function gerarAcaoCompletaFallback(e) {
  const nome = e.nome_de || '(remetente desconhecido)';
  const assunto = (e.assunto || '(sem assunto)').slice(0, 80);
  return `${nome} — ${assunto}`;
}

// ============================================================
// 4) SINTETIZADOR — markdown final no formato chief of staff
// ============================================================
async function sintetizarTriagemDiaria({
  socioInfo, dadosEnriquecidos, top3, baldesAgregados,
  dataBrt, diaSemana, dataHojeBrt, diaSemanaHoje, saudacao,
}) {
  // Em vez de chamar Claude pra montar markdown (latência alta + variabilidade),
  // V2 gera o markdown DETERMINÍSTICO direto em JS. Já temos tudo classificado
  // e os top3 já vieram formatados pelo Claude na etapa anterior.
  const linhas = [];

  // Linha 1 — Saudação (tom de secretária)
  const nome = (socioInfo.nome || 'Sócio').split(' ')[0];
  const total = dadosEnriquecidos.total;
  const qtdTop3 = top3.length;
  const qtdPagar = baldesAgregados.pagar?.length || 0;
  const qtdDecidir = baldesAgregados.decidir?.length || 0;
  const qtdDelegar = baldesAgregados.delegar?.length || 0;
  const qtdAcompanhar = baldesAgregados.acompanhar?.length || 0;
  const qtdArquivar = baldesAgregados.arquivar?.length || 0;
  const qtdSpam = baldesAgregados.spam?.length || 0;

  linhas.push(`📧 ${saudacao}, ${nome} · Triagem · ${diaSemanaHoje} ${dataHojeBrt} · *dados de ${dataBrt}*`);
  linhas.push('');

  // Abertura conversacional
  if (total === 0) {
    linhas.push(`Inbox limpa ontem — 0 emails na janela. Aproveita.`);
    linhas.push('');
    linhas.push('---');
    linhas.push(`*Fonte: Gmail API · janela ${dataBrt} BRT.*`);
    return linhas.join('\n');
  }

  if (qtdTop3 === 0) {
    linhas.push(`Chegaram ${total} email${total > 1 ? 's' : ''} desde ontem. Nada urgente que SÓ você resolve — tudo arquivável, delegável ou pode esperar.`);
  } else {
    linhas.push(`Chegaram ${total} email${total > 1 ? 's' : ''} desde ontem. ${qtdTop3} ${qtdTop3 > 1 ? 'precisam' : 'precisa'} de você hoje.`);
  }
  linhas.push('');

  // Bloco 1 — TOP 3 PRIORIDADES HOJE
  if (qtdTop3 > 0) {
    linhas.push(`## 🎯 Hoje (${qtdTop3})`);
    linhas.push('');
    top3.forEach((item, i) => {
      linhas.push(`${i + 1}. **${item.acao_curta}** — ${item.acao_completa} [abrir](${item.link_gmail})`);
    });
    linhas.push('');
  }

  // Bloco 2 — Decidir/Aprovar (se houver, fora dos top 3)
  const decidirFora = (baldesAgregados.decidir || []).filter(e => !top3.find(t => t.id === e.id));
  if (decidirFora.length > 0) {
    linhas.push(`## ✋ Esperando sua decisão (${decidirFora.length})`);
    linhas.push('');
    decidirFora.slice(0, 8).forEach(e => {
      linhas.push(`- **${(e.nome_de || '?').slice(0, 30)}** — ${(e.assunto || '(sem assunto)').slice(0, 80)} [abrir](${e.link_gmail})`);
    });
    if (decidirFora.length > 8) linhas.push(`- *(+${decidirFora.length - 8} similares)*`);
    linhas.push('');
  }

  // Bloco 3 — Financeiro (se houver, fora dos top 3)
  const pagarFora = (baldesAgregados.pagar || []).filter(e => !top3.find(t => t.id === e.id));
  if (pagarFora.length > 0) {
    linhas.push(`## 💸 Financeiro (${pagarFora.length})`);
    linhas.push('');
    pagarFora.slice(0, 8).forEach(e => {
      linhas.push(`- **${(e.assunto || '(sem assunto)').slice(0, 70)}** · ${(e.nome_de || '?').slice(0, 30)} [abrir](${e.link_gmail})`);
    });
    if (pagarFora.length > 8) linhas.push(`- *(+${pagarFora.length - 8} similares)*`);
    linhas.push('');
  }

  // Bloco 4 — Delegar
  if (qtdDelegar > 0) {
    linhas.push(`## 🤝 Pode delegar (${qtdDelegar})`);
    linhas.push('');
    (baldesAgregados.delegar || []).slice(0, 8).forEach(e => {
      linhas.push(`- **${(e.assunto || '(sem assunto)').slice(0, 70)}** · ${(e.nome_de || '?').slice(0, 30)} [abrir](${e.link_gmail})`);
    });
    if (qtdDelegar > 8) linhas.push(`- *(+${qtdDelegar - 8} similares)*`);
    linhas.push('');
  }

  // Bloco 5 — Acompanhar (esperando 3º)
  if (qtdAcompanhar > 0) {
    linhas.push(`## ⏳ Aguardando resposta (${qtdAcompanhar})`);
    linhas.push('');
    (baldesAgregados.acompanhar || []).slice(0, 6).forEach(e => {
      linhas.push(`- **${(e.assunto || '(sem assunto)').slice(0, 70)}** · ${(e.nome_de || '?').slice(0, 30)} [abrir](${e.link_gmail})`);
    });
    if (qtdAcompanhar > 6) linhas.push(`- *(+${qtdAcompanhar - 6} similares)*`);
    linhas.push('');
  }

  // Bloco 6 — Arquivar (agregado, sem listar)
  const arquivarTotal = qtdArquivar + qtdSpam;
  if (arquivarTotal > 0) {
    const detalhe = qtdSpam > 0
      ? `${qtdArquivar} informativos + ${qtdSpam} spam`
      : `${qtdArquivar} informativos/notificações`;
    linhas.push(`## 📦 Pode arquivar sem ler (${arquivarTotal})`);
    linhas.push('');
    linhas.push(`${detalhe}. Newsletter, confirmação automática, CC sem ação. Já reconhecido como ruído.`);
    linhas.push('');
  }

  linhas.push('---');
  linhas.push(`*Fonte: Gmail API · janela ${dataBrt} BRT · classificação heurística + LLM-classifier · referências: Inbox Zero (Mann), GTD (Allen), 4HWW (Ferriss), A World Without Email (Newport), HBR — How to Brief a Senior Executive.*`);

  return linhas.join('\n');
}

// ============================================================
// 5) ORQUESTRADOR PRINCIPAL — gera relatório end-to-end
// ============================================================
async function gerarRelatorioTriagemEmails({
  cliente_id = null,
  dia_alvo_brt = null,
  salvar = true,
  parent_id = null,
} = {}) {
  const t0 = Date.now();

  // 1) Sócio
  const cid = await db.resolverClienteId(cliente_id);
  let socioInfo;
  try { socioInfo = await socio.getSocioAtual(); }
  catch (e) { socioInfo = { cliente_id: cid, slug: 'desconhecido', nome: 'Sócio', empresa: '?' }; }

  // 2) Dia alvo (default: ontem BRT)
  const agora = new Date();
  if (!dia_alvo_brt) {
    const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = fmt.formatToParts(ontem);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    dia_alvo_brt = `${y}-${m}-${d}`;
  }

  // 3) Strings temporais
  const dataLongaBR = googleCalendar.dataLongaBRdoDiaAlvo(dia_alvo_brt);
  const diaSemana = googleCalendar.diaSemanaBRdoDiaAlvo(dia_alvo_brt);

  const fmtHoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const partsHoje = fmtHoje.formatToParts(agora);
  const hoje_brt = `${partsHoje.find(p => p.type === 'year').value}-${partsHoje.find(p => p.type === 'month').value}-${partsHoje.find(p => p.type === 'day').value}`;
  const dataHojeBrt = googleCalendar.dataLongaBRdoDiaAlvo(hoje_brt);
  const diaSemanaHoje = googleCalendar.diaSemanaBRdoDiaAlvo(hoje_brt);

  const horaBRT = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(agora), 10);
  let saudacao = 'Bom dia';
  if (horaBRT >= 12 && horaBRT < 18) saudacao = 'Boa tarde';
  else if (horaBRT >= 18 || horaBRT < 5) saudacao = 'Boa noite';

  // 4) Coleta Gmail
  const t_coleta = Date.now();
  let dados;
  try {
    dados = await coletarTriagemEmails({ cliente_id: cid, dia_alvo_brt });
  } catch (e) {
    const motivoGmail = (e.message || '').match(/(refresh|nao conectado|n[ãa]o conectado|GAP)/i)
      ? `Gmail não conectado pra esse sócio (rodar /conectar-google).`
      : e.message;
    return {
      ok: false,
      entregavel_id: null,
      entregavel_url: null,
      md_final: `# Triagem de Emails — INDISPONÍVEL\n\n> ⚠ ${motivoGmail}\n\nPara conectar: \`http://localhost:3737/conectar-google\``,
      motivo: motivoGmail,
      duracoes_ms: { total: Date.now() - t0 },
    };
  }
  const dur_coleta = Date.now() - t_coleta;

  // 5a) V5 — carrega baldes custom + aprendizados do sócio (pessoal)
  const [baldesCustom, aprendizados] = await Promise.all([
    carregarBaldesCustom(cid),
    carregarAprendizados(cid, 30),
  ]);

  // 5b) Classificação LLM em lote (com baldes custom + aprendizados no prompt)
  const t_class = Date.now();
  const classificacoes = await classificarComLLM({
    emails: dados.emails,
    dataLongaBR,
    baldesCustom,
    aprendizados,
  });
  const mapaClass = new Map(classificacoes.map(c => [c.id, c]));
  const emailsEnriquecidos = dados.emails.map(e => {
    const c = mapaClass.get(e.id) || { balde: 'arquivar', motivo_curto: 'sem classificação' };
    return { ...e, balde: c.balde, motivo_curto: c.motivo_curto };
  });
  const dur_class = Date.now() - t_class;

  // 6) Agrupa por balde (nativos + custom)
  const baldesAgregados = {
    responder_hoje: [],
    decidir: [],
    pagar: [],
    delegar: [],
    acompanhar: [],
    arquivar: [],
    spam: [],
  };
  // Adiciona baldes custom ao agrupamento
  for (const bc of baldesCustom) {
    if (!baldesAgregados[bc.slug]) baldesAgregados[bc.slug] = [];
  }
  for (const e of emailsEnriquecidos) {
    const b = baldesAgregados[e.balde] ? e.balde : 'arquivar';
    baldesAgregados[b].push(e);
  }

  // 7) Top 3 prioridades hoje
  const t_top3 = Date.now();
  const { top3, motivo: top3Motivo } = await priorizarTop3({
    emailsBalde1: baldesAgregados.responder_hoje,
    emailsBalde2: baldesAgregados.decidir,
    emailsBalde3: baldesAgregados.pagar,
  });
  const dur_top3 = Date.now() - t_top3;

  // 8) Sintetiza markdown
  const t_sint = Date.now();
  const md_final = await sintetizarTriagemDiaria({
    socioInfo,
    dadosEnriquecidos: { ...dados, emails: emailsEnriquecidos },
    top3,
    baldesAgregados,
    dataBrt: dataLongaBR,
    diaSemana,
    dataHojeBrt,
    diaSemanaHoje,
    saudacao,
  });
  const dur_sint = Date.now() - t_sint;

  // 9) Salva entregável
  let entregavel = null;
  if (salvar) {
    try {
      const titulo = `Triagem · ${diaSemanaHoje} ${dataHojeBrt} · dados de ${dataLongaBR}`;
      entregavel = await db.salvarEntregavel({
        cliente_id: cid,
        tipo: 'relatorio-triagem-emails-diario',
        titulo,
        parent_id,
        conteudo_md: md_final,
        conteudo_estruturado: {
          versao_relatorio: 'v5-aprende-e-customiza',
          dia_alvo_brt,
          gerado_em: agora.toISOString(),
          total_emails: dados.total,
          top3,
          top3_motivo: top3Motivo,
          baldes: Object.fromEntries(Object.entries(baldesAgregados)),
          baldes_custom: baldesCustom,
          contagens: Object.fromEntries(Object.entries(baldesAgregados).map(([k, v]) => [k, v.length])),
          aprendizados_aplicados: aprendizados.length,
          socio: socioInfo,
          duracoes_ms: {
            coleta: dur_coleta,
            classificacao_llm: dur_class,
            top3: dur_top3,
            sintetizador: dur_sint,
            total: Date.now() - t0,
          },
        },
      });
    } catch (e) {
      console.error(`[relatorio-triagem-emails V2] erro salvando entregavel: ${e.message}`);
    }
  }

  return {
    ok: true,
    versao_relatorio: 'v5-aprende-e-customiza',
    entregavel_id: entregavel?.id || null,
    entregavel_url: entregavel?.id ? `/entregavel/${entregavel.id}` : null,
    entregavel_versao: entregavel?.versao || null,
    titulo: entregavel ? `Triagem · ${diaSemanaHoje} ${dataHojeBrt} · dados de ${dataLongaBR}` : null,
    dia_alvo_brt,
    md_final,
    total_emails: dados.total,
    top3,
    baldes_custom: baldesCustom,
    aprendizados_aplicados: aprendizados.length,
    contagens: Object.fromEntries(Object.entries(baldesAgregados).map(([k, v]) => [k, v.length])),
    duracoes_ms: {
      coleta: dur_coleta,
      classificacao_llm: dur_class,
      top3: dur_top3,
      sintetizador: dur_sint,
      total: Date.now() - t0,
    },
  };
}

module.exports = {
  gerarRelatorioTriagemEmails,
  coletarTriagemEmails,
  classificarComLLM,
  priorizarTop3,
  carregarBaldesCustom,
  carregarAprendizados,
};
