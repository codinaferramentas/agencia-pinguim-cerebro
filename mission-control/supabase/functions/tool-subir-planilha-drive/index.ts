// Edge: tool-subir-planilha-drive
// POST /functions/v1/tool-subir-planilha-drive
//
// Tool GENERICA pra qualquer agente Pinguim subir planilha multi-aba no Drive
// do socio. Cria pasta automaticamente se nao existir.
//
// Body:
// {
//   cliente_id: "<uuid do socio>",          // obrigatorio
//   conexao_label?: "Pinguim" | "Pessoal",  // opcional (default = padrao)
//   nome_planilha: "Meta - Gasto por Produto x Mes - 14-06-2026",
//   pasta_caminho: "Relatorios Pinguim/Meta Ads",  // criada se nao existir
//   abas: [
//     { titulo: "Pivot", linhas: [["produto","jan","fev"], ["365","100","200"]] },
//     { titulo: "Long",  linhas: [["produto","mes","gasto"], ...] }
//   ],
//   sobrescrever_se_existir?: boolean  // se true e ja existe planilha com mesmo nome
//                                       // na pasta, sobrescreve abas
// }
//
// Retorno:
// {
//   ok: true,
//   spreadsheet_id: "1QM...",
//   url: "https://docs.google.com/spreadsheets/d/.../edit",
//   nome: "Meta - Gasto por Produto x Mes - 14-06-2026",
//   pasta_id: "0AB...",
//   pasta_caminho: "Relatorios Pinguim/Meta Ads",
//   email_conta: "ferramenta@agenciapinguim.com",
//   sobrescreveu: false
// }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { obterAccessTokenSocio } from '../_shared/oauth-google.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// V2 (Onda 1): le artefato e monta abas padrao a partir das matrizes ja prontas
async function montarAbasDeArtefato(artifact_id: string): Promise<{
  abas: Array<{ titulo: string; linhas: string[][] }>;
  titulo_sugerido: string;
}> {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
  const { data, error } = await sb.rpc('ler_artefato', {
    p_artifact_id: artifact_id,
    p_consumidor: 'tool-subir-planilha-drive',
  });
  if (error) throw new Error('ler_artefato: ' + error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Artefato nao encontrado ou expirado: ' + artifact_id);
  const conteudo = row.conteudo || {};
  const titulo_sugerido = row.titulo || 'Relatorio';

  const abas: Array<{ titulo: string; linhas: string[][] }> = [];
  // ordem padrao: pivot (mais visual) -> long (analise) -> detalhe (auditoria)
  if (conteudo.matriz_pivot && Array.isArray(conteudo.matriz_pivot.linhas)) {
    abas.push({
      titulo: 'Pivot',
      linhas: [conteudo.matriz_pivot.cabecalho, ...conteudo.matriz_pivot.linhas],
    });
  }
  if (conteudo.matriz_long && Array.isArray(conteudo.matriz_long.linhas)) {
    abas.push({
      titulo: 'Long',
      linhas: [conteudo.matriz_long.cabecalho, ...conteudo.matriz_long.linhas],
    });
  }
  if (conteudo.matriz_detalhe && Array.isArray(conteudo.matriz_detalhe.linhas)) {
    abas.push({
      titulo: 'Detalhe',
      linhas: [conteudo.matriz_detalhe.cabecalho, ...conteudo.matriz_detalhe.linhas],
    });
  }
  if (abas.length === 0) throw new Error('Artefato nao tem matrizes pra subir (nem pivot/long/detalhe)');
  return { abas, titulo_sugerido };
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// ============================================================
// Helpers
// ============================================================

async function gFetch(token: string, url: string, opts: RequestInit = {}): Promise<any> {
  const resp = await fetch(url, {
    method: (opts.method as string) || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    body: opts.body as any,
  });
  const txt = await resp.text();
  let json: any;
  try { json = txt ? JSON.parse(txt) : {}; } catch { json = { raw: txt }; }
  if (!resp.ok) {
    const msg = json?.error?.message || txt.slice(0, 300);
    throw new Error(`Google ${resp.status}: ${msg}`);
  }
  return json;
}

// Acha pasta por nome dentro de parent (ou no root se parent=null).
// Retorna fileId ou null. Filtra trashed=false.
async function acharPasta(token: string, nome: string, parentId: string | null): Promise<string | null> {
  const q = parentId
    ? `name = '${nome.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`
    : `name = '${nome.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10`;
  const json = await gFetch(token, url);
  const files = json.files || [];
  return files[0]?.id || null;
}

// Cria pasta dentro de parent (ou root). Retorna fileId.
async function criarPasta(token: string, nome: string, parentId: string | null): Promise<string> {
  const body: any = {
    name: nome,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) body.parents = [parentId];
  const json = await gFetch(token, `${DRIVE_API}/files?fields=id,name`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return json.id;
}

// Resolve caminho "A/B/C" — cria niveis intermediarios se faltarem.
// Retorna fileId da pasta final.
async function resolverPastaCaminho(token: string, caminho: string): Promise<string> {
  const partes = caminho.split('/').map(p => p.trim()).filter(Boolean);
  let parent: string | null = null; // null = root
  for (const parte of partes) {
    let pid = await acharPasta(token, parte, parent);
    if (!pid) pid = await criarPasta(token, parte, parent);
    parent = pid;
  }
  if (!parent) throw new Error('pasta_caminho vazio');
  return parent;
}

// Busca planilha por nome dentro de pasta. Retorna fileId ou null.
async function acharPlanilha(token: string, nome: string, pastaId: string): Promise<string | null> {
  const q = `name = '${nome.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false and '${pastaId}' in parents`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=5`;
  const json = await gFetch(token, url);
  return (json.files || [])[0]?.id || null;
}

// V2 (Onda 1 hotfix): quando agente pede sobrescrever mas nome mudou
// (caso comum: usuario diz "adiciona coluna X" -> nome ganha "X" -> deixa de bater),
// procuramos a planilha MAIS RECENTE da mesma pasta, criada nos ultimos N minutos.
// Mesma URL preservada, conteudo atualizado. Soluciona ambiguidade de naming.
async function acharPlanilhaRecente(token: string, pastaId: string, minutosMax = 60): Promise<{ id: string; name: string } | null> {
  const limite = new Date(Date.now() - minutosMax * 60 * 1000).toISOString();
  const q = `mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false and '${pastaId}' in parents and modifiedTime > '${limite}'`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=1`;
  const json = await gFetch(token, url);
  const f = (json.files || [])[0];
  return f ? { id: f.id, name: f.name } : null;
}

// Classifica tipo da coluna pelo nome do cabecalho — define como formatar visualmente.
// Returns: 'moeda' | 'percentual' | 'inteiro' | 'decimal' | 'data' | 'texto'
function classificarColuna(colNome: string): string {
  const n = String(colNome || '').toLowerCase();
  // moeda BRL
  if (/^(gasto|spend|receita|receita_perdida|receita_total|ticket_medio|valor|revenue|cpc|cpm|cpa|cpp|cost_per_thruplay)$/i.test(n)) return 'moeda';
  // mes YYYY-MM ou data YYYY-MM-DD usado como cabecalho de coluna de receita -> moeda
  if (/^\d{4}-\d{2}$/.test(n) || /^\d{4}-\d{2}-\d{2}$/.test(n)) return 'moeda';
  if (/^total$/i.test(n)) return 'moeda';
  // percentual
  if (/^(pct|pct_receita|pct_total|ctr|inline_link_click_ctr|taxa)$/i.test(n)) return 'percentual';
  // inteiro (contagem)
  if (/^(n_vendas|n_reembolsos|n_compras|n_campanhas|n_transacoes|impressoes|impressions|clicks|cliques|alcance|reach|purchases|conversoes|leads|n_ads|dias_ativos|qty|quantidade)$/i.test(n)) return 'inteiro';
  // decimal (ROAS, frequencia, etc — numero mas sem moeda nem %)
  if (/^(roas|purchase_roas|frequencia|frequency)$/i.test(n)) return 'decimal';
  // data
  if (/^(data|date|dia|mes|month|day)$/i.test(n)) return 'data';
  return 'texto';
}

// Converte uma celula em userEnteredValue + (opcional) userEnteredFormat com numberFormat.
function toCellPayload(valor: string, colIndex: number, cabecalho: string[]): any {
  if (valor === '' || valor == null) return { userEnteredValue: { stringValue: '' } };
  const colNome = String(cabecalho[colIndex] || '');
  const tipo = classificarColuna(colNome);
  const ehNumericoStr = /^-?\d+(\.\d+)?$/.test(String(valor));

  // Linhas tipo "TOTAL" que tem texto na 1a coluna mas numeros nas demais — funciona porque
  // classificarColuna olha o cabecalho da coluna, nao o valor.

  if (tipo === 'moeda' && ehNumericoStr) {
    return {
      userEnteredValue: { numberValue: Number(valor) },
      userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: 'R$ #,##0.00' } },
    };
  }
  if (tipo === 'percentual' && ehNumericoStr) {
    // valor ja vem como "25.50" representando 25.5%, nao 0.255.
    // Sheets percentual multiplica por 100 entao usamos NUMBER format pra mostrar "25,50%" sem multiplicar.
    return {
      userEnteredValue: { numberValue: Number(valor) },
      userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0.00"%"' } },
    };
  }
  if (tipo === 'inteiro' && ehNumericoStr) {
    return {
      userEnteredValue: { numberValue: Number(valor) },
      userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0' } },
    };
  }
  if (tipo === 'decimal' && ehNumericoStr) {
    return {
      userEnteredValue: { numberValue: Number(valor) },
      userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0.00' } },
    };
  }
  // Default: texto
  return { userEnteredValue: { stringValue: String(valor) } };
}

function linhasToRowData(linhas: string[][]): any[] {
  if (linhas.length === 0) return [];
  const cabecalho = linhas[0];
  return linhas.map((linha, idx) => ({
    values: linha.map((v, ci) => {
      if (idx === 0) {
        return {
          userEnteredValue: { stringValue: String(v) },
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
          },
        };
      }
      return toCellPayload(v, ci, cabecalho);
    }),
  }));
}

// ============================================================
// Handler
// ============================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  const authOk = await requireAuthTool(req);
  if (!authOk) return jsonRespTool({ ok: false, erro: 'nao autorizado' }, 401);

  if (req.method !== 'POST') {
    return jsonRespTool({ ok: false, erro: 'use POST' }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonRespTool({ ok: false, erro: 'body invalido (esperado JSON)' }, 400);
  }

  const cliente_id = String(body.cliente_id || '').trim();
  const conexao_label = body.conexao_label ? String(body.conexao_label) : undefined;
  let nome_planilha = String(body.nome_planilha || '').trim();
  const pasta_caminho = String(body.pasta_caminho || '').trim();
  let abas: Array<{ titulo: string; linhas: string[][] }> = Array.isArray(body.abas) ? body.abas : [];
  const artifact_id: string | null = body.artifact_id || null;

  if (!cliente_id)    return jsonRespTool({ ok: false, erro: 'cliente_id obrigatorio' }, 400);
  if (!pasta_caminho) return jsonRespTool({ ok: false, erro: 'pasta_caminho obrigatorio' }, 400);

  // V2 (Onda 1): aceita artifact_id (monta abas direto do artefato) OU abas crua
  if (artifact_id && abas.length === 0) {
    try {
      const { abas: abasArt, titulo_sugerido } = await montarAbasDeArtefato(artifact_id);
      abas = abasArt;
      // Se nome_planilha nao foi passado, monta a partir do artefato + data/hora BRT atual
      if (!nome_planilha) {
        const dataHoraBr = new Date().toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        }); // "dd/mm HH:MM"
        nome_planilha = `${titulo_sugerido} · ${dataHoraBr}`;
      }
    } catch (e: any) {
      return jsonRespTool({ ok: false, erro: 'falha lendo artifact: ' + e?.message }, 500);
    }
  }

  if (!nome_planilha) return jsonRespTool({ ok: false, erro: 'nome_planilha obrigatorio (ou passe artifact_id que ele gera sozinho)' }, 400);
  if (abas.length === 0) return jsonRespTool({ ok: false, erro: 'abas vazias (passe abas direto ou artifact_id)' }, 400);

  // valida abas
  for (let i = 0; i < abas.length; i++) {
    const a = abas[i];
    if (!a || typeof a.titulo !== 'string' || !Array.isArray(a.linhas)) {
      return jsonRespTool({ ok: false, erro: `aba[${i}] invalida: precisa de { titulo, linhas: [[...]] }` }, 400);
    }
    // normaliza pra string
    a.linhas = a.linhas.map(l => Array.isArray(l) ? l.map(c => String(c ?? '')) : []);
  }

  try {
    // 1) OAuth
    const { access_token, conexao } = await obterAccessTokenSocio({
      cliente_id,
      label: conexao_label,
    });

    // 2) Resolve / cria pasta
    const pasta_id = await resolverPastaCaminho(access_token, pasta_caminho);

    // V2.1 (2026-06-15): SEMPRE cria planilha nova. Sobrescrever foi removido —
    // LLM tinha dificuldade de manter referencia ao spreadsheet_id entre turnos,
    // gerando bugs sutis ("aparentemente sobrescreveu mas mudou de arquivo").
    // Decisao com Andre: aceitar nova planilha por turno, nome com data/hora
    // resolve o problema de organizacao no Drive.
    const spreadsheet_id_inicial: string | null = null;
    const sobrescreveu = false;
    const nome_planilha_final = nome_planilha;
    let spreadsheet_id: string | null = spreadsheet_id_inicial;

    if (spreadsheet_id) {
      // SOBRESCREVE: limpa abas existentes e cria novas conforme body
      sobrescreveu = true;

      // pega lista de sheetIds atuais
      const meta = await gFetch(access_token,
        `${SHEETS_API}/${spreadsheet_id}?fields=sheets(properties(sheetId,title))`);
      const sheetsAtuais: Array<{ sheetId: number; title: string }> = (meta.sheets || []).map((s: any) => s.properties);

      // batchUpdate: adiciona N novas, deleta as antigas, popula
      const requests: any[] = [];

      // adiciona uma sheet "temp" se precisar (Sheets exige pelo menos 1 sheet sempre)
      const novasSheetIds: number[] = [];
      const baseId = Date.now() % 1000000;
      for (let i = 0; i < abas.length; i++) {
        const aba = abas[i];
        const sid = baseId + i + 1;
        novasSheetIds.push(sid);
        requests.push({
          addSheet: {
            properties: {
              sheetId: sid,
              title: aba.titulo,
              gridProperties: {
                rowCount: Math.max(aba.linhas.length + 5, 20),
                columnCount: Math.max((aba.linhas[0] || []).length + 2, 8),
                frozenRowCount: 1,
              },
            },
          },
        });
      }
      // deleta antigas DEPOIS de criar novas (Sheets nao deixa ficar 0 sheets)
      for (const s of sheetsAtuais) {
        requests.push({ deleteSheet: { sheetId: s.sheetId } });
      }

      // primeiro passo: cria e deleta
      await gFetch(access_token, `${SHEETS_API}/${spreadsheet_id}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests }),
      });

      // segundo passo: popula
      const reqsPopula: any[] = [];
      for (let i = 0; i < abas.length; i++) {
        const aba = abas[i];
        reqsPopula.push({
          updateCells: {
            range: { sheetId: novasSheetIds[i], startRowIndex: 0, startColumnIndex: 0 },
            rows: linhasToRowData(aba.linhas),
            fields: 'userEnteredValue,userEnteredFormat',
          },
        });
        reqsPopula.push({
          autoResizeDimensions: {
            dimensions: { sheetId: novasSheetIds[i], dimension: 'COLUMNS', startIndex: 0, endIndex: (aba.linhas[0] || []).length },
          },
        });
      }
      await gFetch(access_token, `${SHEETS_API}/${spreadsheet_id}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests: reqsPopula }),
      });
    } else {
      // CRIA NOVA
      const criar = await gFetch(access_token, SHEETS_API, {
        method: 'POST',
        body: JSON.stringify({
          properties: { title: nome_planilha, locale: 'pt_BR', timeZone: 'America/Sao_Paulo' },
          sheets: abas.map((a, idx) => ({
            properties: {
              sheetId: idx + 1,
              title: a.titulo,
              index: idx,
              gridProperties: {
                rowCount: Math.max(a.linhas.length + 5, 20),
                columnCount: Math.max((a.linhas[0] || []).length + 2, 8),
                frozenRowCount: 1,
              },
            },
          })),
        }),
      });
      spreadsheet_id = criar.spreadsheetId;

      // move pra pasta
      await gFetch(access_token,
        `${DRIVE_API}/files/${spreadsheet_id}?addParents=${pasta_id}&removeParents=root&fields=id,parents`,
        { method: 'PATCH' });

      // popula
      const requests: any[] = [];
      for (let i = 0; i < abas.length; i++) {
        const aba = abas[i];
        requests.push({
          updateCells: {
            range: { sheetId: i + 1, startRowIndex: 0, startColumnIndex: 0 },
            rows: linhasToRowData(aba.linhas),
            fields: 'userEnteredValue,userEnteredFormat',
          },
        });
        requests.push({
          autoResizeDimensions: {
            dimensions: { sheetId: i + 1, dimension: 'COLUMNS', startIndex: 0, endIndex: (aba.linhas[0] || []).length },
          },
        });
      }
      await gFetch(access_token, `${SHEETS_API}/${spreadsheet_id}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests }),
      });
    }

    return jsonRespTool({
      ok: true,
      spreadsheet_id,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheet_id}/edit`,
      nome: nome_planilha_final,
      pasta_id,
      pasta_caminho,
      email_conta: conexao.email_google,
      conexao_label: conexao.label,
      sobrescreveu,
      n_abas: abas.length,
    });
  } catch (e: any) {
    return jsonRespTool({ ok: false, erro: e?.message || String(e) }, 500);
  }
});
