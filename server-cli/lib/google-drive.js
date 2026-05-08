// ============================================================
// google-drive.js — V2.12 Fase 1 (Drive busca read-only)
// ============================================================
// Wrapper minimo da Drive API v3. Usa access_token renovado pelo
// oauth-google.js (cache RAM ~50min). Sem SDK Google pesado — só fetch.
// ============================================================

const oauth = require('./oauth-google');

// Drive API v3 — search files
// Docs: https://developers.google.com/drive/api/v3/reference/files/list
async function buscarArquivos({
  query,
  cliente_id,
  pageSize = 10,
  orderBy = 'modifiedTime desc',
  campos = 'files(id,name,mimeType,webViewLink,modifiedTime,size,owners(emailAddress)),nextPageToken',
} = {}) {
  if (!query || !query.trim()) {
    throw new Error('query obrigatoria');
  }

  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });

  // Drive query syntax: name contains 'X' OR fullText contains 'X' (busca em conteudo de Doc/Sheet/PDF)
  // trashed=false exclui lixeira
  const q = `(name contains '${query.replace(/'/g, "\\'")}' or fullText contains '${query.replace(/'/g, "\\'")}') and trashed=false`;

  const params = new URLSearchParams({
    q,
    pageSize: String(pageSize),
    orderBy,
    fields: campos,
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
    corpora: 'allDrives', // shared drives + my drive
  });

  const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Accept': 'application/json',
    },
  });

  const json = await resp.json();
  if (!resp.ok) {
    const msg = json.error?.message || json.error || 'erro desconhecido';
    throw new Error(`Drive API ${resp.status}: ${msg}`);
  }

  return {
    arquivos: (json.files || []).map(f => ({
      id: f.id,
      nome: f.name,
      tipo: f.mimeType,
      link: f.webViewLink,
      modificado_em: f.modifiedTime,
      tamanho: f.size ? parseInt(f.size, 10) : null,
      donos: (f.owners || []).map(o => o.emailAddress),
    })),
    proxima_pagina: json.nextPageToken || null,
    total_retornado: (json.files || []).length,
  };
}

// Mapa amigavel de mimeTypes mais comuns
const MIME_LABELS = {
  'application/vnd.google-apps.document':     'Doc',
  'application/vnd.google-apps.spreadsheet':  'Planilha',
  'application/vnd.google-apps.presentation': 'Apresentação',
  'application/vnd.google-apps.folder':       'Pasta',
  'application/pdf':                           'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       'Excel',
  'image/jpeg':  'JPG',
  'image/png':   'PNG',
  'video/mp4':   'MP4',
  'audio/mpeg':  'MP3',
};

function rotuloMime(mime) {
  return MIME_LABELS[mime] || (mime || '').split('/').pop() || 'arquivo';
}

module.exports = {
  buscarArquivos,
  rotuloMime,
  MIME_LABELS,
};
