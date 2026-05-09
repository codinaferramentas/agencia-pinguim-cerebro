// ============================================================
// anti-duplicacao.js — V2.14 Frente D Camada B
// ============================================================
// Antes de executar acao destrutiva (gmail-enviar, drive-editar, calendar-criar),
// agente checa se MESMA acao ja foi disparada nas ultimas N minutos.
//
// Hash da acao = sha256(tipo + destino + corpo_normalizado)
// - Email: tipo='gmail-enviar', destino=email_destinatario, corpo=assunto+body
// - Drive: tipo='drive-editar', destino=fileId, corpo=op+celula+valor
// - Calendar: tipo='calendar-criar', destino=titulo, corpo=inicio+fim+attendees
//
// Janela default: 5 minutos. Cobre cenarios:
// - Evolution retentou webhook 2x (mesma msg)
// - Sócio mandou "sim" 2x sem perceber
// - Bot processou "sim" + reprocessou "enviou?" como acao nova
//
// Decisao em caso de duplicata:
// - 'bloquear': nao executa, registra status='bloqueado_duplicata', retorna alerta
// - 'avisar': executa mas sinaliza nos logs (pra acao em janela MAIOR — mais permissivo)
// ============================================================

const crypto = require('crypto');
const db = require('./db');

function hashAcao({ tipo_acao, destino, corpo }) {
  const normalizado = `${tipo_acao}|${(destino || '').toLowerCase().trim()}|${(corpo || '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
  return crypto.createHash('sha256').update(normalizado).digest('hex').slice(0, 32);
}

// Checa se acao foi executada recentemente
async function checarDuplicata({ cliente_id, hash, janela_min = 5 }) {
  const cid = await db.resolverClienteId(cliente_id);
  const sql = `SELECT * FROM pinguim.checar_acao_duplicada('${cid}'::uuid, '${hash.replace(/'/g, "''")}', ${parseInt(janela_min, 10)})`;
  const r = await db.rodarSQL(sql);
  if (!Array.isArray(r) || !r[0]) return { duplicata: false };
  const row = r[0];
  return {
    duplicata: !!row.duplicata,
    acao_anterior_id: row.acao_anterior_id,
    acao_anterior_em: row.acao_anterior_em,
    minutos_atras: row.minutos_atras ? parseFloat(row.minutos_atras).toFixed(1) : null,
  };
}

// Registra acao executada no banco (chamar APOS executar com sucesso)
async function registrar({
  cliente_id,
  tipo_acao,
  hash_acao,
  destino,
  resumo,
  origem_canal = 'chat-web',
  origem_message_id = null,
  status = 'sucesso',
  motivo = null,
  metadata = {},
}) {
  const cid = await db.resolverClienteId(cliente_id);
  const esc = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'";

  const sql = `
    INSERT INTO pinguim.acoes_executadas
      (cliente_id, tipo_acao, hash_acao, destino, resumo, origem_canal, origem_message_id, status, motivo, metadata)
    VALUES
      ('${cid}', ${esc(tipo_acao)}, ${esc(hash_acao)}, ${esc(destino)}, ${esc(resumo)},
       ${esc(origem_canal)}, ${esc(origem_message_id)}, ${esc(status)}, ${esc(motivo)},
       '${JSON.stringify(metadata).replace(/'/g, "''")}'::jsonb)
    RETURNING id, executada_em;
  `;
  const r = await db.rodarSQL(sql);
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// Helper combinado: checa + executa fn + registra
// Se duplicata: retorna {bloqueada: true, alerta, anterior_em}
// Se ok: retorna {bloqueada: false, resultado: <resultado da fn>}
async function executarComCheck({
  cliente_id,
  tipo_acao,
  destino,
  corpo,
  resumo,
  origem_canal,
  origem_message_id,
  janela_min = 5,
  fn,
}) {
  const hash = hashAcao({ tipo_acao, destino, corpo });
  const dup = await checarDuplicata({ cliente_id, hash, janela_min });

  if (dup.duplicata) {
    // Registra como bloqueada
    await registrar({
      cliente_id, tipo_acao, hash_acao: hash, destino, resumo,
      origem_canal, origem_message_id,
      status: 'bloqueado_duplicata',
      motivo: `Acao identica executada ${dup.minutos_atras}min atras (id=${dup.acao_anterior_id})`,
    }).catch(e => console.warn(`[anti-duplicacao] registro bloqueio falhou: ${e.message}`));

    return {
      bloqueada: true,
      alerta: `⚠ Detectei que essa MESMA ação foi executada há ${dup.minutos_atras} min. Pra evitar duplicata, NÃO vou repetir agora. Se for intencional reenviar, me fala explicitamente "força o envio" ou "manda mesmo assim".`,
      anterior_em: dup.acao_anterior_em,
      minutos_atras: dup.minutos_atras,
    };
  }

  // Executa fn e registra
  let resultado, sucesso = true, erro = null;
  try {
    resultado = await fn();
  } catch (e) {
    sucesso = false;
    erro = e.message;
    // Registra falha
    await registrar({
      cliente_id, tipo_acao, hash_acao: hash, destino, resumo,
      origem_canal, origem_message_id,
      status: 'falhou', motivo: erro,
    }).catch(_ => {});
    throw e;
  }

  // Registra sucesso
  await registrar({
    cliente_id, tipo_acao, hash_acao: hash, destino, resumo,
    origem_canal, origem_message_id,
    status: 'sucesso',
    metadata: { resultado_id: resultado?.id || null },
  }).catch(e => console.warn(`[anti-duplicacao] registro sucesso falhou: ${e.message}`));

  return { bloqueada: false, resultado };
}

module.exports = { hashAcao, checarDuplicata, registrar, executarComCheck };
