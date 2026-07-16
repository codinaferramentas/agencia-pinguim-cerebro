// ============================================================
// book-comercial-worker/drive.ts
// ============================================================
// Camada Google do worker: upload dos arquivos do Book na pasta
// do time comercial (Hub Comercial) e upsert da linha do lead na
// planilha de controle. Usa a conexão OAuth do sócio Codina
// (ferramenta@agenciapinguim.com) via _shared/oauth-google.ts.
// ============================================================

import { obterAccessTokenSocio } from '../_shared/oauth-google.ts';

const CLIENTE_ID_CODINA = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export async function accessTokenGoogle(): Promise<string> {
  const { access_token } = await obterAccessTokenSocio({ cliente_id: CLIENTE_ID_CODINA });
  return access_token;
}

/**
 * Sobe um arquivo (PDF ou HTML) na pasta do comercial.
 * Se já existir arquivo com o mesmo nome na pasta, atualiza o conteúdo
 * (mantém o mesmo link — bom pra reprocessamento).
 */
export async function uploadArquivo(opts: {
  token: string;
  folderId: string;
  nome: string;
  mime: string; // 'application/pdf' | 'text/html'
  conteudo: Uint8Array | string;
}): Promise<{ id: string; webViewLink: string }> {
  const { token, folderId, nome, mime } = opts;
  const H = { Authorization: `Bearer ${token}` };
  const body = typeof opts.conteudo === 'string' ? new TextEncoder().encode(opts.conteudo) : opts.conteudo;

  // já existe?
  const q = encodeURIComponent(`name='${nome.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`);
  const found = await (await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: H })).json();
  const existente = found.files?.[0]?.id;

  if (existente) {
    const r = await fetch(`${DRIVE_UPLOAD}/${existente}?uploadType=media&supportsAllDrives=true&fields=id,webViewLink`, {
      method: 'PATCH', headers: { ...H, 'Content-Type': mime }, body,
    });
    if (!r.ok) throw new Error(`Drive update ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return { id: j.id, webViewLink: j.webViewLink || `https://drive.google.com/file/d/${j.id}/view` };
  }

  const boundary = 'bkBoundary' + Date.now();
  const metadata = JSON.stringify({ name: nome, parents: [folderId], mimeType: mime });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const headB = new TextEncoder().encode(head);
  const tailB = new TextEncoder().encode(tail);
  const full = new Uint8Array(headB.length + body.length + tailB.length);
  full.set(headB, 0); full.set(body, headB.length); full.set(tailB, headB.length + body.length);

  const r = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`, {
    method: 'POST', headers: { ...H, 'Content-Type': `multipart/related; boundary=${boundary}` }, body: full,
  });
  if (!r.ok) throw new Error(`Drive upload ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();

  // qualquer um com o link pode acessar (pasta é compartilhada internamente) — best effort
  try {
    await fetch(`${DRIVE_API}/files/${j.id}/permissions?supportsAllDrives=true`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'anyone', role: 'writer' }),
    });
  } catch (_) { /* herda da pasta */ }

  return { id: j.id, webViewLink: j.webViewLink || `https://drive.google.com/file/d/${j.id}/view` };
}

// ============================================================
// Planilha de controle — upsert por booking_id (coluna O)
// ============================================================
export interface LinhaPlanilha {
  booking_id: string;
  recebido_em: string;      // data do formulário/agendamento formatada
  nome: string;
  email: string;
  whatsapp: string;
  instagram: string;
  nicho: string;
  faturamento: string;
  call_quando: string;
  produto_alvo: string;
  status: 'Pendente' | 'Processando' | 'Concluída' | 'Falhou';
  link_book: string;
  link_cliente: string;
  ja_aluno: string;         // 'Sim' | 'Não' | ''
}

export async function upsertLinhaPlanilha(token: string, sheetId: string, linha: LinhaPlanilha): Promise<void> {
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const valores = [
    linha.recebido_em, linha.nome, linha.email, linha.whatsapp, linha.instagram,
    linha.nicho, linha.faturamento, linha.call_quando, linha.produto_alvo, linha.status,
    linha.link_book, linha.link_cliente, linha.ja_aluno,
    '', // Observações do comercial — nunca sobrescrever
    linha.booking_id,
  ];

  // procura booking_id na coluna O
  const got = await (await fetch(`${SHEETS_API}/${sheetId}/values/Leads!O1:O2000`, { headers: H })).json();
  const rows: string[][] = got.values || [];
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]?.[0] === linha.booking_id) { rowIndex = i + 1; break; }
  }

  if (rowIndex > 0) {
    // atualiza A..M e O — pula N (observações do comercial)
    const r1 = await fetch(`${SHEETS_API}/${sheetId}/values/Leads!A${rowIndex}:M${rowIndex}?valueInputOption=RAW`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ values: [valores.slice(0, 13)] }),
    });
    if (!r1.ok) throw new Error(`Sheets update ${r1.status}: ${(await r1.text()).slice(0, 200)}`);
  } else {
    const r = await fetch(`${SHEETS_API}/${sheetId}/values/Leads!A1:O1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ values: [valores] }),
    });
    if (!r.ok) throw new Error(`Sheets append ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}
