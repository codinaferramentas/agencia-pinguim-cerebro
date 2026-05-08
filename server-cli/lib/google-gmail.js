// ============================================================
// google-gmail.js — V2.13 Fase Gmail
// ============================================================
// Wrapper minimo da Gmail API v1. Usa access_token renovado pelo
// oauth-google.js (cache RAM ~50min). Sem SDK Google pesado — só fetch.
//
// Escopo: gmail.modify (ler + responder + marcar + arquivar, sem deletar
// permanentemente). Confirmação humana NO CHAT pra operações destrutivas
// (responder, arquivar) — Atendente mostra plano antes de executar.
// ============================================================

const oauth = require('./oauth-google');

// ============================================================
// Helper: chama Gmail API com Bearer token, parseia JSON, trata erros
// ============================================================
async function gmailFetch({ method = 'GET', endpoint, body, cliente_id }) {
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });

  const url = endpoint.startsWith('http') ? endpoint : `https://gmail.googleapis.com${endpoint}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Accept': 'application/json',
    },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const resp = await fetch(url, opts);
  const json = resp.status === 204 ? {} : await resp.json();
  if (!resp.ok) {
    const msg = json.error?.message || json.error || `HTTP ${resp.status}`;
    throw new Error(`Gmail API ${resp.status}: ${msg}`);
  }
  return json;
}

// ============================================================
// LISTAR — primeira página de emails (default: caixa de entrada não-lidos)
// ============================================================
// query: usa sintaxe Gmail (https://support.google.com/mail/answer/7190)
//   - 'is:unread'           — só não-lidos
//   - 'from:fulano@x.com'   — de remetente específico
//   - 'subject:"X"'         — assunto contém X
//   - 'newer_than:3d'       — mais novos que 3 dias
//   - 'has:attachment'      — com anexo
//   - 'label:INBOX'         — caixa de entrada
async function listarEmails({
  cliente_id,
  query = 'in:inbox',
  pageSize = 10,
  includeSpamTrash = false,
} = {}) {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(pageSize),
    includeSpamTrash: String(includeSpamTrash),
  });
  const lista = await gmailFetch({
    endpoint: `/gmail/v1/users/me/messages?${params.toString()}`,
    cliente_id,
  });

  if (!lista.messages || lista.messages.length === 0) {
    return { emails: [], total_retornado: 0, total_estimado: 0 };
  }

  // Pra cada mensagem, busca metadata (de, assunto, data, snippet)
  // — em paralelo, max 10 simultâneos
  const detalhes = await Promise.all(
    lista.messages.map(m => gmailFetch({
      endpoint: `/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To`,
      cliente_id,
    }))
  );

  const emails = detalhes.map(d => {
    const headers = (d.payload && d.payload.headers) || [];
    const getHeader = (n) => headers.find(h => h.name.toLowerCase() === n.toLowerCase())?.value || '';
    return {
      id: d.id,
      thread_id: d.threadId,
      de: getHeader('From'),
      para: getHeader('To'),
      assunto: getHeader('Subject') || '(sem assunto)',
      data: getHeader('Date'),
      snippet: d.snippet || '',
      labels: d.labelIds || [],
      lido: !((d.labelIds || []).includes('UNREAD')),
      starred: (d.labelIds || []).includes('STARRED'),
    };
  });

  return {
    emails,
    total_retornado: emails.length,
    total_estimado: lista.resultSizeEstimate || emails.length,
    proxima_pagina: lista.nextPageToken || null,
  };
}

// ============================================================
// LER — corpo completo de email específico (texto + html quando houver)
// ============================================================
async function lerEmail({ cliente_id, messageId } = {}) {
  if (!messageId) throw new Error('messageId obrigatório');

  const msg = await gmailFetch({
    endpoint: `/gmail/v1/users/me/messages/${messageId}?format=full`,
    cliente_id,
  });

  const headers = (msg.payload && msg.payload.headers) || [];
  const getHeader = (n) => headers.find(h => h.name.toLowerCase() === n.toLowerCase())?.value || '';

  // Extrai corpo: tenta text/plain primeiro, fallback text/html convertido
  function extrairCorpo(part) {
    if (!part) return { texto: '', html: '' };
    if (part.body && part.body.data) {
      const decoded = Buffer.from(part.body.data, 'base64url').toString('utf-8');
      return part.mimeType === 'text/html' ? { texto: '', html: decoded } : { texto: decoded, html: '' };
    }
    if (part.parts && part.parts.length) {
      let texto = '', html = '';
      for (const sub of part.parts) {
        const r = extrairCorpo(sub);
        if (!texto && r.texto) texto = r.texto;
        if (!html && r.html) html = r.html;
      }
      return { texto, html };
    }
    return { texto: '', html: '' };
  }

  const corpo = extrairCorpo(msg.payload);
  // Se só tem html, faz "stripping" leve pra ter texto legível
  let texto = corpo.texto;
  if (!texto && corpo.html) {
    texto = corpo.html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<\/(p|div|br|h[1-6]|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return {
    id: msg.id,
    thread_id: msg.threadId,
    de: getHeader('From'),
    para: getHeader('To'),
    cc: getHeader('Cc'),
    assunto: getHeader('Subject') || '(sem assunto)',
    data: getHeader('Date'),
    message_id: getHeader('Message-Id'),
    references: getHeader('References'),
    snippet: msg.snippet || '',
    texto: texto.slice(0, 8000), // limita pra não estourar contexto
    texto_truncado: texto.length > 8000,
    labels: msg.labelIds || [],
    lido: !((msg.labelIds || []).includes('UNREAD')),
    tamanho_chars: texto.length,
  };
}

// ============================================================
// RESPONDER — envia email (na thread, ou novo)
// ============================================================
// args:
//   para: 'fulano@x.com'           (obrigatório)
//   assunto: 'Re: ...'              (obrigatório)
//   corpo: 'texto do email'         (obrigatório, plain text)
//   reply_to_message_id?: string    (id da mensagem que está respondendo — usa pra threading)
//   thread_id?: string              (Gmail thread_id, alternativa ao reply_to)
//   cc?: string
//   bcc?: string
async function enviarEmail({
  cliente_id,
  para,
  assunto,
  corpo,
  reply_to_message_id = null,
  thread_id = null,
  cc = null,
  bcc = null,
} = {}) {
  if (!para || !assunto || !corpo) {
    throw new Error('para, assunto e corpo são obrigatórios');
  }

  // Se eh resposta, busca message original pra pegar In-Reply-To + References
  let inReplyTo = null;
  let references = null;
  let usarThreadId = thread_id;

  if (reply_to_message_id) {
    const orig = await lerEmail({ cliente_id, messageId: reply_to_message_id });
    inReplyTo = orig.message_id || null;
    references = orig.references ? `${orig.references} ${orig.message_id || ''}`.trim() : (orig.message_id || null);
    usarThreadId = usarThreadId || orig.thread_id;
  }

  // Monta MIME (RFC 2822) em base64url
  const linhas = [
    `To: ${para}`,
    cc ? `Cc: ${cc}` : null,
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${assunto}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}` : null,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    corpo,
  ].filter(Boolean).join('\r\n');

  const raw = Buffer.from(linhas, 'utf-8').toString('base64url');

  const body = { raw };
  if (usarThreadId) body.threadId = usarThreadId;

  const resp = await gmailFetch({
    method: 'POST',
    endpoint: '/gmail/v1/users/me/messages/send',
    body,
    cliente_id,
  });

  return {
    id: resp.id,
    thread_id: resp.threadId,
    label_ids: resp.labelIds,
    enviado_em: new Date().toISOString(),
  };
}

// ============================================================
// MARCAR como lido / não-lido / starred / arquivar
// ============================================================
// op: 'lido' | 'nao-lido' | 'starred' | 'unstarred' | 'arquivar' | 'spam' | 'lixo'
async function modificarEmail({ cliente_id, messageId, op } = {}) {
  if (!messageId || !op) throw new Error('messageId e op obrigatórios');

  const operacoes = {
    'lido':       { removeLabelIds: ['UNREAD'] },
    'nao-lido':   { addLabelIds: ['UNREAD'] },
    'starred':    { addLabelIds: ['STARRED'] },
    'unstarred':  { removeLabelIds: ['STARRED'] },
    'arquivar':   { removeLabelIds: ['INBOX'] },
    'spam':       { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] },
    'lixo':       { addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] },
  };

  const body = operacoes[op];
  if (!body) throw new Error(`op invalida: ${op}. Validas: ${Object.keys(operacoes).join(', ')}`);

  const resp = await gmailFetch({
    method: 'POST',
    endpoint: `/gmail/v1/users/me/messages/${messageId}/modify`,
    body,
    cliente_id,
  });

  return {
    id: resp.id,
    thread_id: resp.threadId,
    label_ids: resp.labelIds,
    op_aplicada: op,
  };
}

// ============================================================
// PERFIL — endereço de email do sócio (pra confirmar identidade Gmail)
// ============================================================
async function perfilEmail({ cliente_id } = {}) {
  const resp = await gmailFetch({
    endpoint: '/gmail/v1/users/me/profile',
    cliente_id,
  });
  return {
    email: resp.emailAddress,
    total_mensagens: resp.messagesTotal,
    total_threads: resp.threadsTotal,
    history_id: resp.historyId,
  };
}

module.exports = {
  listarEmails,
  lerEmail,
  enviarEmail,
  modificarEmail,
  perfilEmail,
};
