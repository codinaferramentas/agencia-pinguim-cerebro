// ============================================================
// Edge Function: tool-triar-email-sidebar
// ============================================================
// Triagem de emails das últimas 24h do Gmail do sócio.
// Independente do cron diário 8h05 (que roda no server-cli local).
//
// Pipeline:
//   1. Pega conexão Google do sócio (pinguim.conexoes_google)
//   2. Renova access_token
//   3. Gmail API: lista emails das últimas 24h
//   4. Pra cada msg, busca metadata (subject, from, snippet, date)
//   5. GPT-4o classifica TODOS em 1 batch → 6 baldes
//   6. GPT-4o pega top 3 do balde "responder_hoje" → cards de ação
//   7. Render HTML standalone + retorna
//
// Custo: ~$0.05-0.10 por triagem (GPT-4o)
// Duração: 15-25s
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { getChave } from '../_shared/cofre.ts';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { obterAccessTokenSocio, listarConexoesSocio } from '../_shared/oauth-google.ts';
import { renderHtmlTriagem } from './renderHtml.ts';

// ============================================================
// Gmail API helpers
// ============================================================

interface EmailMeta {
  id: string;
  thread_id: string;
  de_nome: string;
  de_email: string;
  assunto: string;
  snippet: string;
  data_iso: string | null;
  is_unread: boolean;
  is_starred: boolean;
  labels: string[];
  link_gmail: string;
}

async function gmailListIds(accessToken: string, query: string): Promise<string[]> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Gmail list: HTTP ${r.status} - ${txt.slice(0, 200)}`);
  }
  const j = await r.json();
  return (j.messages || []).map((m: any) => m.id);
}

async function gmailGetMeta(accessToken: string, id: string): Promise<EmailMeta | null> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) return null;
  const j = await r.json();
  const headers = j.payload?.headers || [];
  const getH = (n: string) => (headers.find((h: any) => h.name === n)?.value || '').toString();

  const from = getH('From');
  const subject = getH('Subject');
  const date = getH('Date');

  // Parse "Nome <email@x.com>"
  let de_nome = '', de_email = '';
  const m = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) {
    de_nome = m[1].replace(/['"]/g, '').trim();
    de_email = m[2].trim().toLowerCase();
  } else {
    de_email = from.trim().toLowerCase();
    de_nome = de_email.split('@')[0];
  }

  const labels: string[] = j.labelIds || [];
  return {
    id: j.id,
    thread_id: j.threadId,
    de_nome,
    de_email,
    assunto: subject,
    snippet: (j.snippet || '').replace(/\s+/g, ' ').trim(),
    data_iso: date ? new Date(date).toISOString() : null,
    is_unread: labels.includes('UNREAD'),
    is_starred: labels.includes('STARRED'),
    labels,
    link_gmail: `https://mail.google.com/mail/u/0/#inbox/${j.id}`,
  };
}

// ============================================================
// GPT-4o classifier
// ============================================================

const BALDES = [
  { slug: 'responder_hoje', emoji: '🔴', nome: 'Responder hoje', desc: 'SÓ o sócio resolve. Urgente, reclamação, proposta com prazo, jurídico/fiscal (.gov.br, procon, intimação)' },
  { slug: 'decidir', emoji: '✋', nome: 'Decidir', desc: 'Pedem aprovação/OK. "Pode autorizar?", "Aprovar?", contrato pra revisar' },
  { slug: 'pagar', emoji: '💸', nome: 'Pagar', desc: 'Boleto, fatura, 2ª via, NF, reembolso a aprovar, cobrança financeira' },
  { slug: 'delegar', emoji: '🤝', nome: 'Delegar', desc: 'Pode ser feito por funcionário/suporte. Cadastro, dúvida operacional' },
  { slug: 'acompanhar', emoji: '⏳', nome: 'Acompanhar', desc: 'Sócio está esperando 3º. Follow-up que ele iniciou, "aguardando resposta"' },
  { slug: 'arquivar', emoji: '📦', nome: 'Arquivar', desc: 'Sem ação necessária. Newsletter, confirmação automática, notificação, CC informativo' },
];

// ============================================================
// HEURÍSTICA RÁPIDA (portada do cron) — pré-classifica antes do LLM
// Itens claramente "arquivar" pulam o LLM. LLM só vê os ambíguos.
// ============================================================
const REGEX_HEURISTICA: Record<string, RegExp> = {
  spam: /\bunsubscribe\b|black friday|cyber monday|imperd[íi]vel|s[óo] hoje|[íi]ltima chance/i,
  arquivar: /newsletter|substack|medium\.com|digest|weekly|aviso de pol[íi]tica|terms of service|atualizamos? nossos termos|notifica[çc][ãa]o do (slack|discord|github|drive|asana|notion)|backup conclu[íi]do|login (detectado|realizado)|nova sess[ãa]o|seu (resumo|relat[óo]rio) semanal/i,
  pagar: /\bboleto\b|fatura|2ª via|segunda via|pagamento (pendente|atrasad|vencid)|vencimento|nota fiscal|nfe|nfse|reembolso|estorno|chargeback|cobran[çc]a/i,
  decidir: /\baprovar?\??\b|ok pra seguir|pode autorizar|preciso da sua (assinatura|aprova[çc][ãa]o)|valida[çc][ãa]o|pode revisar|d[áa] uma olhada\??/i,
  acompanhar: /aguardando (sua )?resposta|estou esperando|qualquer atualiza[çc][ãa]o|me retorna quando|fico no aguardo/i,
  responder_hoje: /\burgente\b|preciso de retorno hoje|n[ãa]o consegui acessar|reclama[çc][ãa]o|n[ãa]o funciona|cancelar contrato|vou cancelar|chargeback|intima[çc][ãa]o|notifica[çc][ãa]o (judicial|extrajudicial)|auto de infra[çc][ãa]o|procon|jur[íi]dico/i,
  juridico_fiscal: /@.*\.(gov\.br|jus\.br)$|@.*procon|@.*oab\.org\.br|@.*receita\.fazenda/i,
  delegar: /\bcadastr|preciso de acesso|n[ãa]o recebi (o )?(login|acesso|email)|como fa[çc]o para|pode me ajudar|d[úu]vida sobre o produto|suporte/i,
};

function classificarHeuristico(email: EmailMeta): { balde: string | null; confianca: 'alta' | 'media' | 'baixa' } {
  const assunto = email.assunto || '';
  const snippet = email.snippet || '';
  const de = email.de_email || '';
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

// ============================================================
// Baldes custom + aprendizados do sócio (portado do cron)
// ============================================================
async function carregarBaldesCustom(cliente_id: string): Promise<Array<{ slug: string; nome: string; icone: string; descricao: string }>> {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false }, db: { schema: 'pinguim' } });
    const { data } = await sbAdmin.from('triagem_baldes_custom')
      .select('slug, nome, icone, descricao')
      .eq('cliente_id', cliente_id)
      .eq('desativado', false)
      .order('criado_em', { ascending: true });
    return data || [];
  } catch (e) {
    console.error('[triar-email] carregarBaldesCustom:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

async function carregarAprendizados(cliente_id: string, limite = 30): Promise<Array<{ assunto: string; remetente_email: string; remetente_nome: string; balde_antigo: string; balde_novo: string; motivo_humano: string | null }>> {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false }, db: { schema: 'pinguim' } });
    const { data } = await sbAdmin.from('triagem_aprendizados')
      .select('assunto, remetente_email, remetente_nome, balde_antigo, balde_novo, motivo_humano')
      .eq('cliente_id', cliente_id)
      .order('criado_em', { ascending: false })
      .limit(limite);
    return data || [];
  } catch (e) {
    console.error('[triar-email] carregarAprendizados:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

const PROMPT_CLASSIFICADOR = `Você é o classificador de TRIAGEM EXECUTIVA de email. Sua tarefa é colocar cada email em UM dos baldes de AÇÃO abaixo, como uma SECRETÁRIA EXECUTIVA classificaria pro CEO ler.

## BALDES NATIVOS (6)

| slug | quando usar |
|---|---|
| \`responder_hoje\` | 🔴 SÓ o sócio resolve. Cliente urgente, reclamação séria, proposta/orçamento com prazo, lead comercial NOVO, jurídico/fiscal (.gov.br, .jus.br, procon, intimação), email pessoal de pessoa real esperando resposta |
| \`decidir\` | ✋ Pedem aprovação/OK do sócio. "Pode autorizar?", "Aprovar?", contrato pra revisar, sócio/funcionário interno pedindo validação |
| \`pagar\` | 💸 Boleto, fatura, 2ª via, NF, reembolso a aprovar, cobrança financeira ATIVA |
| \`delegar\` | 🤝 Pode ser feito por funcionário (Rafa/Djairo/suporte). Cadastro Princípia Pay, dúvida operacional de cliente, agendamento de reunião |
| \`acompanhar\` | ⏳ O sócio está ESPERANDO a outra parte responder. Follow-up que ele iniciou, "Aguardando sua resposta" |
| \`arquivar\` | 📦 Sem ação necessária NENHUMA. Newsletter genérica, confirmação automática, notificação Slack/GitHub/Drive, CC informativo, recibo de pagamento JÁ FEITO |

## REGRAS DURAS

- Email é DECISÃO PESSOAL do CEO. **Pergunta-chave: "o que essa pessoa precisa que o CEO FAÇA hoje?"**. Se a resposta for "nada, é informativo" → \`arquivar\`. Se for qualquer outra coisa → um dos 5 baldes de ação.
- Remetente SISTEMA (noreply@, notification@, no-reply@) e não pede ação → \`arquivar\`
- Domínio do remetente é \`.gov.br\`, \`.jus.br\`, procon, OAB, Receita Federal → SEMPRE \`responder_hoje\`
- Recibo/confirmação de pagamento JÁ FEITO → \`arquivar\` (NÃO é pagar; já foi pago)
- Cobrança ATIVA (boleto vencendo, fatura aberta) → \`pagar\`
- Sócio/funcionário interno do time pedindo OK → \`decidir\` (não responder_hoje)
- Lead comercial / proposta nova / orçamento → \`responder_hoje\`
- Reclamação de cliente → \`responder_hoje\`
- Pessoa real (não sistema) escrevendo email pessoal pedindo resposta → \`responder_hoje\`
- **Em dúvida entre \`responder_hoje\` e \`decidir\`**: se a contraparte é EXTERNA (cliente, fornecedor, lead), é \`responder_hoje\`. Se é INTERNA (sócio, funcionário), é \`decidir\`.
- **Em dúvida entre AÇÃO e \`arquivar\`**: SE EM DÚVIDA, escolhe ação. Não joga tudo em arquivar por falta de contexto. Arquivar é SÓ quando tem CERTEZA que não precisa fazer nada.

## ANTI-PADRÕES (NÃO faça)

- ❌ Classificar TUDO como \`arquivar\` porque "não tem certeza". Se o email é de pessoa real falando algo concreto, é AÇÃO.
- ❌ Confundir cobrança ativa (\`pagar\`) com recibo (\`arquivar\`). Cobrança = "pague até X". Recibo = "pagamento recebido".
- ❌ Jogar lead comercial no \`arquivar\` só porque é primeira vez que escreve.

## FORMATO DE RESPOSTA

Devolva JSON. Cada email do input vira UMA entrada na resposta. NÃO PULE NENHUM. Não invente id. Use SÓ os 6 slugs válidos.

\`\`\`json
{"classificacoes":[{"id":"<id_email>","balde":"<slug>","motivo_curto":"<sinal concreto, max 80 chars>"}]}
\`\`\``;

async function classificarEmails(
  emails: Array<EmailMeta & { _heur_balde?: string | null; _heur_confianca?: 'alta' | 'media' | 'baixa' }>,
  openaiKey: string,
  baldesCustom: Array<{ slug: string; nome: string; icone: string; descricao: string }>,
  aprendizados: Array<{ assunto: string; remetente_email: string; remetente_nome: string; balde_antigo: string; balde_novo: string; motivo_humano: string | null }>,
): Promise<Array<{ id: string; balde: string; motivo_curto: string }>> {
  if (emails.length === 0) return [];

  // Só manda pro LLM os ambíguos OU os de média confiança
  const ambiguos = emails.filter((e) => !e._heur_balde || e._heur_confianca === 'baixa' || e._heur_confianca === 'media');

  if (ambiguos.length === 0) {
    // Todos foram resolvidos pela heurística (alta confiança)
    return emails.map((e) => ({
      id: e.id,
      balde: e._heur_balde || 'arquivar',
      motivo_curto: 'heurística (alta confiança)',
    }));
  }

  // Lista compacta pro LLM
  const listaPraIA = ambiguos.map((e) => ({
    id: e.id,
    de: `${e.de_nome} <${e.de_email}>`.slice(0, 80),
    assunto: (e.assunto || '').slice(0, 120),
    snippet: (e.snippet || '').slice(0, 200),
    palpite_heuristico: e._heur_balde || null,
  }));

  // Bloco de baldes custom (igual cron)
  const SLUGS_NATIVOS = ['responder_hoje', 'decidir', 'pagar', 'delegar', 'acompanhar', 'arquivar', 'spam'];
  const SLUGS_VALIDOS = [...SLUGS_NATIVOS, ...baldesCustom.map((b) => b.slug)];
  const blocoCustom = baldesCustom.length === 0 ? '' : `

## BALDES CUSTOM DO SÓCIO (criados por ele — TEM PRIORIDADE quando casar com o sentido)

${baldesCustom.map((b) => `| \`${b.slug}\` | ${b.icone || '🏷'} ${b.nome}${b.descricao ? ' — ' + b.descricao : ''} |`).join('\n')}
`;

  // Bloco de aprendizados (igual cron)
  const blocoAprendizados = aprendizados.length === 0 ? '' : `

## REGRAS APRENDIDAS DESTE SÓCIO (correções manuais anteriores — RESPEITAR padrão)

${aprendizados.slice(0, 20).map((a) => {
  const fonte = a.remetente_nome || a.remetente_email || '?';
  const assuntoCurto = (a.assunto || '').slice(0, 80);
  const motivo = a.motivo_humano ? ` (motivo: ${a.motivo_humano})` : '';
  return `- "${assuntoCurto}" de ${fonte} → balde \`${a.balde_novo}\` (sócio corrigiu de \`${a.balde_antigo}\`)${motivo}`;
}).join('\n')}

QUANDO VIR EMAIL PARECIDO (mesmo remetente OU padrão de assunto similar), CLASSIFICA NO BALDE QUE O SÓCIO ESCOLHEU.
`;

  // Prompt completo (igual cron)
  const promptCompleto = `${PROMPT_CLASSIFICADOR}${blocoCustom}${blocoAprendizados}

## SLUGS VÁLIDOS

${SLUGS_VALIDOS.map((s) => `- \`${s}\``).join('\n')}

Regras finais: cada email do input vira UMA entrada na resposta. Não pule nenhum. Não invente id. Use SÓ os slugs válidos acima.`;

  const userMsg = `Classifica esses ${ambiguos.length} emails em baldes:\n\n${JSON.stringify(listaPraIA, null, 2)}`;

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: promptCompleto },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`OpenAI classificar: ${r.status} - ${txt.slice(0, 200)}`);
  }
  const j = await r.json();
  const conteudo = j.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(conteudo);
  const classifsLLM: Array<{ id: string; balde: string; motivo_curto: string }> = parsed.classificacoes || [];

  // Filtra slugs válidos
  const mapaLLM = new Map<string, { balde: string; motivo_curto: string }>();
  for (const c of classifsLLM) {
    if (c && c.id && SLUGS_VALIDOS.includes(c.balde)) {
      mapaLLM.set(c.id, { balde: c.balde, motivo_curto: c.motivo_curto || '' });
    }
  }

  // MERGE: alta confiança usa heurística; ambíguos usam LLM
  return emails.map((e) => {
    if (e._heur_confianca === 'alta' && e._heur_balde) {
      return { id: e.id, balde: e._heur_balde, motivo_curto: 'heurística' };
    }
    const r2 = mapaLLM.get(e.id);
    if (r2) return { id: e.id, ...r2 };
    return {
      id: e.id,
      balde: e._heur_balde || 'arquivar',
      motivo_curto: 'fallback heurístico',
    };
  });
}

const PROMPT_TOP3 = `Você é o chief of staff do CEO. Recebe os emails mais urgentes (balde "responder_hoje") e devolve um plano de ação curto pra cada um.

Pra cada email, devolva:
- \`acao_curta\`: 1 frase imperativa do que fazer (máximo 12 palavras). Ex: "Responder cliente confirmando reunião amanhã 14h"
- \`acao_completa\`: 2-3 frases dando contexto + sugestão de resposta. Tom direto, sem rodeio, sem frase motivacional.
- \`prioridade\`: 1 (mais urgente) a 3 (menos urgente entre os top 3)
- \`tempo_estimado_min\`: minutos pra resolver (5/10/15/30)

Devolva JSON: {"top3":[{"id":"...","acao_curta":"...","acao_completa":"...","prioridade":1,"tempo_estimado_min":10}]}`;

async function gerarTop3(emails: Array<EmailMeta & { motivo_curto?: string }>, openaiKey: string): Promise<Array<{ id: string; acao_curta: string; acao_completa: string; prioridade: number; tempo_estimado_min: number }>> {
  if (emails.length === 0) return [];

  const lista = emails.slice(0, 3).map((e) => ({
    id: e.id,
    de: `${e.de_nome} <${e.de_email}>`,
    assunto: e.assunto,
    snippet: e.snippet,
    motivo: e.motivo_curto,
  }));

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROMPT_TOP3 },
        { role: 'user', content: `Top emails responder_hoje:\n${JSON.stringify(lista, null, 2)}` },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`OpenAI top3: ${r.status} - ${txt.slice(0, 200)}`);
  }
  const j = await r.json();
  return JSON.parse(j.choices?.[0]?.message?.content || '{}').top3 || [];
}

// ============================================================
// Pipeline
// ============================================================
async function executarTriagem(opts: { cliente_id: string; conexao_id?: string; label?: string }): Promise<any> {
  const tInicio = Date.now();

  // 1) Access token
  const { access_token, conexao } = await obterAccessTokenSocio(opts);

  // 2) Lista emails das últimas 24h
  // Gmail query: newer_than:1d -in:spam -in:trash (não filtra in:inbox pra pegar tb Promoções/Atualizações/Social)
  const ids = await gmailListIds(access_token, 'newer_than:1d -in:spam -in:trash -in:chats');

  // Limita a 80 (custo + tempo)
  const idsLimited = ids.slice(0, 80);

  // 3) Busca meta de cada email em paralelo (lotes de 10)
  const emails: EmailMeta[] = [];
  for (let i = 0; i < idsLimited.length; i += 10) {
    const batch = idsLimited.slice(i, i + 10);
    const metas = await Promise.all(batch.map((id) => gmailGetMeta(access_token, id).catch(() => null)));
    for (const m of metas) if (m) emails.push(m);
  }

  if (emails.length === 0) {
    return {
      meta: {
        cliente_id: opts.cliente_id,
        email_conta: conexao.email_google,
        gerado_em: new Date().toISOString(),
        duracao_s: Math.round((Date.now() - tInicio) / 1000),
        total_emails: 0,
      },
      baldes: BALDES.map((b) => ({ ...b, emails: [] })),
      top3: [],
    };
  }

  // 4) Resolve cliente_id do sócio (auth → socios) — pra carregar baldes/aprendizados certos
  const { resolverClienteIdSocio } = await import('../_shared/oauth-google.ts');
  const clienteIdSocio = await resolverClienteIdSocio(opts.cliente_id);

  // 5) Aplica heurística rápida em todos
  const emailsComHeur = emails.map((e) => {
    const h = classificarHeuristico(e);
    return { ...e, _heur_balde: h.balde, _heur_confianca: h.confianca };
  });

  // 6) Carrega baldes custom + aprendizados do sócio
  const [baldesCustom, aprendizados] = await Promise.all([
    carregarBaldesCustom(clienteIdSocio),
    carregarAprendizados(clienteIdSocio, 30),
  ]);

  // 7) Classifica via GPT-4o (só os ambíguos, com baldes custom + aprendizados no prompt)
  const openaiKey = await getChave('OPENAI_API_KEY', 'tool-triar-email-sidebar');
  const classificacoes = await classificarEmails(emailsComHeur, openaiKey, baldesCustom, aprendizados);

  // 8) Mapeia classificação → email
  const motivoPorId = new Map<string, string>();
  const baldePorId = new Map<string, string>();
  for (const c of classificacoes) {
    motivoPorId.set(c.id, c.motivo_curto);
    baldePorId.set(c.id, c.balde);
  }

  // 9) Lista FINAL de baldes (nativos + custom)
  const baldesCompletos = [
    ...BALDES,
    ...baldesCustom.map((b) => ({ slug: b.slug, emoji: b.icone || '🏷', nome: b.nome, desc: b.descricao || '' })),
  ];

  // 10) Agrupa em baldes
  const baldesMap: Record<string, EmailMeta[]> = {};
  for (const b of baldesCompletos) baldesMap[b.slug] = [];
  baldesMap['spam'] = []; // spam é nativo mas não está em BALDES (não mostra no relatório)
  for (const e of emailsComHeur) {
    const balde = baldePorId.get(e.id) || 'arquivar';
    if (!baldesMap[balde]) baldesMap[balde] = [];
    (e as any).motivo_curto = motivoPorId.get(e.id) || '';
    baldesMap[balde].push(e);
  }

  // 11) Top 3 do responder_hoje
  const responderHoje = baldesMap['responder_hoje'] || [];
  const top3 = await gerarTop3(responderHoje, openaiKey);

  // 12) Estrutura final
  return {
    meta: {
      cliente_id: opts.cliente_id,
      email_conta: conexao.email_google,
      gerado_em: new Date().toISOString(),
      duracao_s: Math.round((Date.now() - tInicio) / 1000),
      total_emails: emails.length,
      baldes_custom_aplicados: baldesCustom.length,
      aprendizados_aplicados: aprendizados.length,
    },
    baldes: baldesCompletos.map((b) => ({
      ...b,
      emails: baldesMap[b.slug] || [],
    })),
    top3,
  };
}

// ============================================================
// SERVE
// ============================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);
  if (req.method !== 'POST') return jsonRespTool({ ok: false, erro: 'Use POST' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonRespTool({ ok: false, erro: 'JSON invalido' }, 400); }

  const cliente_id = String(body.cliente_id || '').trim();
  if (!cliente_id) return jsonRespTool({ ok: false, erro: 'cliente_id obrigatorio' }, 400);

  // Listar conexões disponíveis (pra UI mostrar qual usou ou pedir pra escolher)
  if (body.action === 'listar_contas') {
    try {
      const contas = await listarConexoesSocio(cliente_id);
      return jsonRespTool({ ok: true, contas });
    } catch (e) {
      return jsonRespTool({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  try {
    const resultado = await executarTriagem({
      cliente_id,
      conexao_id: body.conexao_id || undefined,
      label: body.label || undefined,
    });
    const html = renderHtmlTriagem(resultado);
    return jsonRespTool({
      ok: true,
      meta: resultado.meta,
      total_emails: resultado.meta.total_emails,
      duracao_s: resultado.meta.duracao_s,
      html,
      json: resultado,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[triar-email-sidebar] erro:', msg);
    return jsonRespTool({ ok: false, erro: msg }, 500);
  }
});
