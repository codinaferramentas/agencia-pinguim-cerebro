// ============================================================
// google-drive-content.js — V2.12 Fase 2 + Fase 4
// ============================================================
// Le e edita conteudo de arquivos do Drive: Doc, Sheet, PDF.
// Usa access_token renovado pelo oauth-google.js (cache RAM ~50min).
// Sem SDK Google pesado — so fetch.
//
// Fase 2 (ler):    lerDoc, lerPlanilha, listarAbas, lerPdf, lerAuto
// Fase 4 (editar): editarCelula, editarRange, adicionarLinha
//
// Toda operacao destrutiva (Fase 4) DEVE ser gateada por confirmacao
// humana NO CHAT antes de chamar — esta camada nao decide nada, so executa.
// ============================================================

const oauth = require('./oauth-google');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DOCS_API = 'https://docs.googleapis.com/v1/documents';

// ============================================================
// Helpers internos
// ============================================================

async function _fetchJson(url, opts, access_token) {
  const resp = await fetch(url, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Accept': 'application/json',
      ...(opts && opts.headers ? opts.headers : {}),
      ...(opts && opts.body && !((opts.headers || {})['Content-Type']) ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const txt = await resp.text();
  let json;
  try { json = txt ? JSON.parse(txt) : {}; } catch { json = { raw: txt }; }
  if (!resp.ok) {
    const msg = json.error?.message || json.error || `HTTP ${resp.status}`;
    throw new Error(`Google API ${resp.status}: ${msg}`);
  }
  return json;
}

async function _fetchTexto(url, access_token) {
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${access_token}` },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Google API ${resp.status}: ${txt.slice(0, 200)}`);
  }
  return await resp.text();
}

async function _fetchBytes(url, access_token) {
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${access_token}` },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Google API ${resp.status}: ${txt.slice(0, 200)}`);
  }
  return await resp.arrayBuffer();
}

// Pega metadata minima do arquivo (mimeType, name) — pra rotear lerAuto
async function _metadata({ fileId, access_token }) {
  return await _fetchJson(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink&supportsAllDrives=true`,
    {},
    access_token,
  );
}

// ============================================================
// FASE 2 — LER
// ============================================================

// Le um Google Doc como texto plano (export to text/plain via Drive API).
// Retorna { fileId, nome, texto, tamanho_chars, link }.
async function lerDoc({ fileId, cliente_id }) {
  if (!fileId) throw new Error('fileId obrigatorio');
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });
  const meta = await _metadata({ fileId, access_token });
  const texto = await _fetchTexto(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
    access_token,
  );
  return {
    fileId,
    nome: meta.name,
    tipo: 'doc',
    texto,
    tamanho_chars: texto.length,
    link: meta.webViewLink,
    modificado_em: meta.modifiedTime,
  };
}

// Lista abas de uma planilha. Retorna [{ titulo, sheetId, linhas, colunas }].
async function listarAbas({ fileId, cliente_id }) {
  if (!fileId) throw new Error('fileId obrigatorio');
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });
  const json = await _fetchJson(
    `${SHEETS_API}/${encodeURIComponent(fileId)}?fields=sheets(properties(title,sheetId,gridProperties(rowCount,columnCount)))`,
    {},
    access_token,
  );
  return (json.sheets || []).map(s => ({
    titulo: s.properties?.title || '',
    sheetId: s.properties?.sheetId ?? null,
    linhas: s.properties?.gridProperties?.rowCount ?? null,
    colunas: s.properties?.gridProperties?.columnCount ?? null,
  }));
}

// Le valores de uma planilha (uma aba especifica ou primeira por padrao).
// Retorna { fileId, nome, abas: [...], aba_lida, range_efetivo, valores: [[...]] }.
// Valores vem como matriz de strings/numeros (Google ja converte).
async function lerPlanilha({ fileId, cliente_id, aba, range = 'A1:Z1000', limite_linhas = 200 } = {}) {
  if (!fileId) throw new Error('fileId obrigatorio');
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });

  // Pega meta + abas em paralelo
  const [meta, abas] = await Promise.all([
    _metadata({ fileId, access_token }),
    listarAbas({ fileId, cliente_id }),
  ]);

  if (!abas.length) {
    return { fileId, nome: meta.name, abas: [], aba_lida: null, range_efetivo: null, valores: [], link: meta.webViewLink };
  }

  const abaEscolhida = aba || abas[0].titulo;
  const abaInfo = abas.find(a => a.titulo === abaEscolhida);
  if (!abaInfo) {
    throw new Error(`Aba "${abaEscolhida}" nao encontrada. Abas disponiveis: ${abas.map(a => a.titulo).join(', ')}`);
  }

  // Sheets API exige aba!range com aspas simples se titulo tem espaco
  const abaQuoted = abaEscolhida.includes(' ') || abaEscolhida.includes("'")
    ? `'${abaEscolhida.replace(/'/g, "''")}'`
    : abaEscolhida;
  const rangeCompleto = `${abaQuoted}!${range}`;

  const json = await _fetchJson(
    `${SHEETS_API}/${encodeURIComponent(fileId)}/values/${encodeURIComponent(rangeCompleto)}?valueRenderOption=FORMATTED_VALUE`,
    {},
    access_token,
  );

  let valores = json.values || [];
  const total_linhas = valores.length;
  const truncado = total_linhas > limite_linhas;
  if (truncado) valores = valores.slice(0, limite_linhas);

  return {
    fileId,
    nome: meta.name,
    tipo: 'planilha',
    link: meta.webViewLink,
    modificado_em: meta.modifiedTime,
    abas: abas.map(a => ({ titulo: a.titulo, linhas: a.linhas, colunas: a.colunas })),
    aba_lida: abaEscolhida,
    range_efetivo: json.range || rangeCompleto,
    valores,
    total_linhas,
    truncado,
    limite_aplicado: truncado ? limite_linhas : null,
  };
}

// Le PDF (download bruto do Drive). Retorna bytes em base64.
// Parser de texto do PDF NAO e responsabilidade desta camada — quem chamou
// decide se passa pro Claude (que entende PDF nativo) ou usa lib externa.
async function lerPdf({ fileId, cliente_id }) {
  if (!fileId) throw new Error('fileId obrigatorio');
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });
  const meta = await _metadata({ fileId, access_token });
  const bytes = await _fetchBytes(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    access_token,
  );
  const base64 = Buffer.from(bytes).toString('base64');
  return {
    fileId,
    nome: meta.name,
    tipo: 'pdf',
    link: meta.webViewLink,
    modificado_em: meta.modifiedTime,
    tamanho_bytes: bytes.byteLength,
    base64,
  };
}

// Le texto/markdown simples (download direto)
async function lerTextoSimples({ fileId, cliente_id }) {
  if (!fileId) throw new Error('fileId obrigatorio');
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });
  const meta = await _metadata({ fileId, access_token });
  const texto = await _fetchTexto(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    access_token,
  );
  return {
    fileId,
    nome: meta.name,
    tipo: 'texto',
    link: meta.webViewLink,
    modificado_em: meta.modifiedTime,
    texto,
    tamanho_chars: texto.length,
  };
}

// Roteador automatico — descobre tipo via mimeType e chama leitor certo.
// Retorna sempre o objeto retornado pelo leitor especifico.
async function lerAuto({ fileId, cliente_id, aba, range, limite_linhas }) {
  if (!fileId) throw new Error('fileId obrigatorio');
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });
  const meta = await _metadata({ fileId, access_token });
  const mime = meta.mimeType || '';

  if (mime === 'application/vnd.google-apps.document') {
    return await lerDoc({ fileId, cliente_id });
  }
  if (mime === 'application/vnd.google-apps.spreadsheet') {
    return await lerPlanilha({ fileId, cliente_id, aba, range, limite_linhas });
  }
  if (mime === 'application/pdf') {
    return await lerPdf({ fileId, cliente_id });
  }
  if (mime === 'text/plain' || mime === 'text/markdown' || mime === 'text/csv') {
    return await lerTextoSimples({ fileId, cliente_id });
  }
  // Office bruto (Word/Excel) ou outro — devolve metadata + indicacao
  return {
    fileId,
    nome: meta.name,
    tipo: 'desconhecido',
    mimeType: mime,
    link: meta.webViewLink,
    modificado_em: meta.modifiedTime,
    texto: null,
    aviso: `Tipo "${mime}" nao tem leitor estruturado. Use o link pra abrir no Google.`,
  };
}

// ============================================================
// FASE 4 — EDITAR (planilha apenas no V1; Doc fica pra depois)
// ============================================================
// Confirmacao humana e responsabilidade de QUEM CHAMA.
// Esta camada so executa — sem trava, sem perguntar.
// Toda operacao DEVE ler antes (pra ter "valor antes" pro log).

// Helper interno — quote nome de aba
function _quotarAba(nome) {
  if (!nome) return '';
  if (nome.includes(' ') || nome.includes("'")) {
    return `'${nome.replace(/'/g, "''")}'`;
  }
  return nome;
}

// Le valor atual de uma celula (pra logar antes/depois). Devolve string ou null.
async function lerCelula({ fileId, cliente_id, aba, celula }) {
  if (!fileId || !celula) throw new Error('fileId e celula obrigatorios');
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });

  let abaUsada = aba;
  if (!abaUsada) {
    const abas = await listarAbas({ fileId, cliente_id });
    if (!abas.length) throw new Error('Planilha sem abas');
    abaUsada = abas[0].titulo;
  }

  const range = `${_quotarAba(abaUsada)}!${celula}`;
  const json = await _fetchJson(
    `${SHEETS_API}/${encodeURIComponent(fileId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
    {},
    access_token,
  );
  const valor = json.values?.[0]?.[0] ?? null;
  return { aba: abaUsada, celula, valor };
}

// Edita 1 celula. Retorna { antes, depois, ok, link, range_efetivo }.
async function editarCelula({ fileId, cliente_id, aba, celula, valor }) {
  if (!fileId || !celula) throw new Error('fileId e celula obrigatorios');
  if (valor === undefined || valor === null) throw new Error('valor obrigatorio (use string vazia pra limpar)');
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });

  // 1. Descobre aba se nao veio
  let abaUsada = aba;
  if (!abaUsada) {
    const abas = await listarAbas({ fileId, cliente_id });
    if (!abas.length) throw new Error('Planilha sem abas');
    abaUsada = abas[0].titulo;
  }

  // 2. Le valor atual (pra log + retorno)
  const antes = await lerCelula({ fileId, cliente_id, aba: abaUsada, celula });

  // 3. PUT na celula
  const range = `${_quotarAba(abaUsada)}!${celula}`;
  const url = `${SHEETS_API}/${encodeURIComponent(fileId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const json = await _fetchJson(
    url,
    {
      method: 'PUT',
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values: [[String(valor)]],
      }),
    },
    access_token,
  );

  // 4. Pega meta pro link
  const meta = await _metadata({ fileId, access_token });

  return {
    ok: true,
    fileId,
    nome: meta.name,
    aba: abaUsada,
    celula,
    range_efetivo: json.updatedRange || range,
    antes: antes.valor,
    depois: String(valor),
    celulas_alteradas: json.updatedCells ?? 1,
    link: meta.webViewLink,
  };
}

// Edita um range (matriz de valores). Retorna resumo.
async function editarRange({ fileId, cliente_id, aba, range, valores }) {
  if (!fileId || !range) throw new Error('fileId e range obrigatorios');
  if (!Array.isArray(valores) || !valores.length) throw new Error('valores deve ser matriz [[]] nao-vazia');
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });

  let abaUsada = aba;
  if (!abaUsada) {
    const abas = await listarAbas({ fileId, cliente_id });
    if (!abas.length) throw new Error('Planilha sem abas');
    abaUsada = abas[0].titulo;
  }

  const rangeCompleto = `${_quotarAba(abaUsada)}!${range}`;
  const url = `${SHEETS_API}/${encodeURIComponent(fileId)}/values/${encodeURIComponent(rangeCompleto)}?valueInputOption=USER_ENTERED`;
  const json = await _fetchJson(
    url,
    {
      method: 'PUT',
      body: JSON.stringify({
        range: rangeCompleto,
        majorDimension: 'ROWS',
        values: valores.map(linha => linha.map(c => c === null || c === undefined ? '' : String(c))),
      }),
    },
    access_token,
  );

  const meta = await _metadata({ fileId, access_token });

  return {
    ok: true,
    fileId,
    nome: meta.name,
    aba: abaUsada,
    range_efetivo: json.updatedRange || rangeCompleto,
    celulas_alteradas: json.updatedCells ?? 0,
    linhas_alteradas: json.updatedRows ?? valores.length,
    colunas_alteradas: json.updatedColumns ?? (valores[0]?.length || 0),
    link: meta.webViewLink,
  };
}

// Adiciona linha(s) ao final da aba. Retorna resumo.
async function adicionarLinha({ fileId, cliente_id, aba, valores }) {
  if (!fileId) throw new Error('fileId obrigatorio');
  if (!Array.isArray(valores) || !valores.length) throw new Error('valores deve ser matriz [[]] nao-vazia');
  const access_token = await oauth.obterAccessTokenAtivo({ cliente_id });

  let abaUsada = aba;
  if (!abaUsada) {
    const abas = await listarAbas({ fileId, cliente_id });
    if (!abas.length) throw new Error('Planilha sem abas');
    abaUsada = abas[0].titulo;
  }

  const rangeAppend = `${_quotarAba(abaUsada)}!A:Z`;
  const url = `${SHEETS_API}/${encodeURIComponent(fileId)}/values/${encodeURIComponent(rangeAppend)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const json = await _fetchJson(
    url,
    {
      method: 'POST',
      body: JSON.stringify({
        range: rangeAppend,
        majorDimension: 'ROWS',
        values: valores.map(linha => linha.map(c => c === null || c === undefined ? '' : String(c))),
      }),
    },
    access_token,
  );

  const meta = await _metadata({ fileId, access_token });

  return {
    ok: true,
    fileId,
    nome: meta.name,
    aba: abaUsada,
    range_efetivo: json.updates?.updatedRange || rangeAppend,
    celulas_alteradas: json.updates?.updatedCells ?? 0,
    linhas_adicionadas: json.updates?.updatedRows ?? valores.length,
    link: meta.webViewLink,
  };
}

module.exports = {
  // Fase 2 — leitura
  lerAuto,
  lerDoc,
  lerPlanilha,
  listarAbas,
  lerPdf,
  lerTextoSimples,
  lerCelula,
  // Fase 4 — edicao
  editarCelula,
  editarRange,
  adicionarLinha,
};
