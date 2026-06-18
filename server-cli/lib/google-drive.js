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

// ============================================================
// listarPastas — V3 (2026-06-18) browser hierarquico de pastas Drive
// Lista APENAS pastas dentro de parent_id. Se parent_id ausente, mostra
// raiz do MyDrive. Usado pelo modal "Escolher pasta" no Mission Control.
// ============================================================
async function listarPastas({ parent_id, cliente_id, pageSize = 100 } = {}) {
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });

  // Drive query: mimeType=folder + parent específico OU raiz
  let q;
  if (parent_id) {
    q = `mimeType='application/vnd.google-apps.folder' and '${parent_id}' in parents and trashed=false`;
  } else {
    q = `mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  }

  const params = new URLSearchParams({
    q,
    pageSize: String(pageSize),
    orderBy: 'name',
    fields: 'files(id,name,parents,modifiedTime,webViewLink),nextPageToken',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
    corpora: 'allDrives',
  });

  const resp = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' },
  });
  const json = await resp.json();
  if (!resp.ok) {
    const msg = json.error?.message || 'erro desconhecido';
    throw new Error(`Drive API ${resp.status}: ${msg}`);
  }

  // Se parent_id veio, busca tambem o nome do parent (breadcrumb)
  let parentInfo = null;
  if (parent_id) {
    try {
      const r2 = await fetch(`https://www.googleapis.com/drive/v3/files/${parent_id}?fields=id,name,parents&supportsAllDrives=true`, {
        headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' },
      });
      const j2 = await r2.json();
      if (r2.ok) parentInfo = { id: j2.id, nome: j2.name, parents: j2.parents || [] };
    } catch { /* ignora */ }
  }

  return {
    parent: parentInfo,
    pastas: (json.files || []).map(f => ({
      id: f.id,
      nome: f.name,
      link: f.webViewLink,
      modificado_em: f.modifiedTime,
    })),
    proxima_pagina: json.nextPageToken || null,
  };
}

// ============================================================
// criarPasta — V3 (2026-06-18) cria pasta nova no Drive
// Se parent_id ausente, cria na raiz do MyDrive.
// Retorna {id, nome, link, parent_id}
// ============================================================
async function criarPasta({ nome, parent_id, cliente_id } = {}) {
  if (!nome || !nome.trim()) throw new Error('nome obrigatorio');
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });

  const metadata = {
    name: nome.trim(),
    mimeType: 'application/vnd.google-apps.folder',
    parents: parent_id ? [parent_id] : undefined,
  };

  const resp = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink,parents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(metadata),
  });
  const json = await resp.json();
  if (!resp.ok) {
    const msg = json.error?.message || 'erro desconhecido';
    throw new Error(`Drive API ${resp.status}: ${msg}`);
  }
  return {
    id: json.id,
    nome: json.name,
    link: json.webViewLink,
    parent_id: (json.parents || [])[0] || null,
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
  listarPastas,
  criarPasta,
  rotuloMime,
  MIME_LABELS,
};
