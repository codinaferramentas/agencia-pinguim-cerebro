// ============================================================
// consolidar-chat-grupo-semanal.js — V1 (2026-06-18)
// ============================================================
// Roda 1x/semana (domingo 4h BRT). Pra cada grupo ativo em
// whatsapp_grupos_monitorados, agrupa as msgs dos ultimos N dias
// (janela_dias), gera markdown organizado por dia, salva como
// cerebro_fonte tipo 'chat_export' no cerebro destino, vetoriza.
//
// Idempotencia: se rodar 2x na mesma janela, atualiza fonte existente
// (UPSERT por url unica).
//
// Filtro: ignora msgs sem texto util (sticker, location puro).
//   audio/imagem/video sem caption viram '[audio - sem transcricao]' etc.
// ============================================================

const db = require('./db');
const { vetorizarFonte } = require('./vetorizar-fonte');

function _esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function _autorPraExibir(msg) {
  if (msg.autor_push_name && msg.autor_push_name.trim()) return msg.autor_push_name.trim();
  if (msg.autor_telefone) {
    // mascara: 5511999991234 -> +55 11 ****1234
    const tel = msg.autor_telefone.split('@')[0];
    if (tel.length >= 8) return `+${tel.slice(0,2)} ${tel.slice(2,4)} ****${tel.slice(-4)}`;
    return tel;
  }
  return 'desconhecido';
}

function _formataLinha(msg) {
  const hora = new Date(msg.enviada_em).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  });
  const autor = _autorPraExibir(msg);
  const reply = msg.reply_to_preview
    ? ` _(em resposta a: "${msg.reply_to_preview.slice(0, 80)}")_`
    : '';

  let conteudo;
  if (msg.tipo_msg === 'text' && msg.texto) {
    conteudo = msg.texto;
  } else if (msg.caption) {
    conteudo = `[${msg.tipo_msg}] ${msg.caption}`;
  } else if (msg.tipo_msg === 'audio') {
    conteudo = '[áudio — sem transcrição]';
  } else if (msg.tipo_msg === 'image') {
    conteudo = '[imagem sem caption]';
  } else if (msg.tipo_msg === 'video') {
    conteudo = '[vídeo sem caption]';
  } else if (msg.tipo_msg === 'document') {
    conteudo = '[documento]';
  } else if (msg.tipo_msg === 'sticker') {
    return null; // ignora sticker no markdown
  } else {
    conteudo = `[${msg.tipo_msg}]`;
  }
  return `**${hora}** · ${autor}${reply}: ${conteudo}`;
}

/**
 * Consolida 1 grupo. Retorna { ok, fonte_id?, qtd_msgs, qtd_autores, motivo? }
 */
async function consolidarGrupo({ grupo_id, on_log = () => {} } = {}) {
  // 1) Le config do grupo
  const grupos = await db.rodarSQL(`
    SELECT g.id, g.chat_id, g.nome_grupo, g.cerebro_id, g.categoria_slug, g.janela_dias,
           p.nome AS produto_nome, p.slug AS produto_slug
    FROM pinguim.whatsapp_grupos_monitorados g
    JOIN pinguim.cerebros c ON c.id = g.cerebro_id
    JOIN pinguim.produtos p ON p.id = c.produto_id
    WHERE g.id = '${grupo_id}'::uuid AND g.ativo = true;
  `);
  if (!grupos || !grupos[0]) return { ok: false, motivo: 'grupo nao achado ou inativo' };
  const g = grupos[0];

  const agora = new Date();
  const janelaFim = agora;
  const janelaInicio = new Date(agora.getTime() - g.janela_dias * 24 * 60 * 60 * 1000);

  on_log({ etapa: 'inicio', grupo: g.nome_grupo, janela_dias: g.janela_dias });

  // 2) Busca msgs do periodo
  const msgs = await db.rodarSQL(`
    SELECT message_id, autor_telefone, autor_push_name, tipo_msg, texto, caption,
           reply_to_message_id, reply_to_autor, reply_to_preview, enviada_em
    FROM pinguim.whatsapp_msgs_brutas
    WHERE chat_id = ${_esc(g.chat_id)}
      AND enviada_em >= ${_esc(janelaInicio.toISOString())}
      AND enviada_em < ${_esc(janelaFim.toISOString())}
    ORDER BY enviada_em ASC;
  `);

  if (!msgs || msgs.length === 0) {
    on_log({ etapa: 'sem_msgs' });
    // Registra audit
    await db.rodarSQL(`
      INSERT INTO pinguim.whatsapp_consolidacoes
        (grupo_id, janela_inicio, janela_fim, qtd_msgs_periodo, qtd_autores, status)
      VALUES ('${g.id}'::uuid, ${_esc(janelaInicio.toISOString())},
              ${_esc(janelaFim.toISOString())}, 0, 0, 'sem_msgs');
    `);
    return { ok: true, qtd_msgs: 0, qtd_autores: 0, motivo: 'sem mensagens no periodo' };
  }

  // 3) Agrupa por dia e monta markdown
  const porDia = new Map();
  const autoresSet = new Set();
  for (const m of msgs) {
    if (m.autor_telefone) autoresSet.add(m.autor_telefone);
    const dia = new Date(m.enviada_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    if (!porDia.has(dia)) porDia.set(dia, []);
    const linha = _formataLinha(m);
    if (linha) porDia.get(dia).push(linha);
  }

  const fmtData = (d) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const inicioBR = fmtData(janelaInicio);
  const fimBR = fmtData(new Date(janelaFim.getTime() - 1000)); // ontem (exclusive)
  const titulo = `WhatsApp ${g.nome_grupo} — Semana ${inicioBR} a ${fimBR}`;
  const urlCanonica = `whatsapp://group/${g.chat_id}?janela=${janelaInicio.toISOString().slice(0,10)}_${janelaFim.toISOString().slice(0,10)}`;

  const linhas = [
    `# ${titulo}`,
    '',
    `**Grupo:** ${g.nome_grupo}`,
    `**chat_id:** ${g.chat_id}`,
    `**Janela:** ${inicioBR} 00:00 → ${fmtData(janelaFim)} ${janelaFim.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}`,
    `**Total de mensagens:** ${msgs.length}`,
    `**Autores distintos:** ${autoresSet.size}`,
    '',
    '---',
    '',
  ];

  // Ordena dias cronologico
  const diasOrd = [...porDia.keys()].sort((a, b) => {
    const [da, ma, ya] = a.split('/').map(Number);
    const [db_, mb, yb] = b.split('/').map(Number);
    return new Date(ya, ma-1, da) - new Date(yb, mb-1, db_);
  });
  for (const dia of diasOrd) {
    linhas.push(`## ${dia}`);
    linhas.push('');
    for (const linha of porDia.get(dia)) linhas.push(linha);
    linhas.push('');
  }

  const conteudoMd = linhas.join('\n');

  // 4) UPSERT cerebro_fonte (idempotencia por url)
  // Primeiro procura fonte existente
  const existe = await db.rodarSQL(`
    SELECT id FROM pinguim.cerebro_fontes
    WHERE cerebro_id = '${g.cerebro_id}'::uuid
      AND url = ${_esc(urlCanonica)}
    LIMIT 1;
  `);

  let fonte_id;
  if (existe && existe[0]) {
    // Update via REST (payload grande)
    fonte_id = existe[0].id;
    await db.rodarSQL(`
      UPDATE pinguim.cerebro_fontes
         SET titulo = ${_esc(titulo)},
             ingest_status = 'pendente',
             atualizado_em = now()
       WHERE id = '${fonte_id}'::uuid;
    `);
    // Apaga chunks antigos pra revetorizar limpo
    await db.rodarSQL(`DELETE FROM pinguim.cerebro_fontes_chunks WHERE fonte_id = '${fonte_id}'::uuid;`);
    // Atualiza conteudo via REST (PATCH)
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const rp = await fetch(`${supabaseUrl}/rest/v1/cerebro_fontes?id=eq.${fonte_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'pinguim',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ conteudo_md: conteudoMd }),
    });
    if (!rp.ok) throw new Error(`REST patch conteudo_md: ${rp.status} ${(await rp.text()).slice(0,200)}`);
    on_log({ etapa: 'fonte_atualizada', fonte_id });
  } else {
    const novo = await db.inserirFonteRest({
      cerebro_id: g.cerebro_id,
      tipo: 'chat_export',
      titulo,
      origem: 'whatsapp',
      url: urlCanonica,
      conteudo_md: conteudoMd,
    });
    fonte_id = novo.id;
    on_log({ etapa: 'fonte_criada', fonte_id });
  }

  // 5) Marca msgs como consolidadas
  await db.rodarSQL(`
    UPDATE pinguim.whatsapp_msgs_brutas
       SET consolidada = true
     WHERE chat_id = ${_esc(g.chat_id)}
       AND enviada_em >= ${_esc(janelaInicio.toISOString())}
       AND enviada_em < ${_esc(janelaFim.toISOString())};
  `);

  // 6) Vetoriza
  on_log({ etapa: 'vetorizando' });
  const vet = await vetorizarFonte(fonte_id);

  // 7) Registra audit
  await db.rodarSQL(`
    INSERT INTO pinguim.whatsapp_consolidacoes
      (grupo_id, cerebro_fonte_id, janela_inicio, janela_fim,
       qtd_msgs_periodo, qtd_autores, status)
    VALUES (
      '${g.id}'::uuid,
      '${fonte_id}'::uuid,
      ${_esc(janelaInicio.toISOString())},
      ${_esc(janelaFim.toISOString())},
      ${msgs.length},
      ${autoresSet.size},
      'ok'
    );
  `);

  // 8) Atualiza card do plano
  try {
    await db.rodarSQL(`
      UPDATE pinguim.cerebro_plano_categoria
         SET ultima_execucao = now(),
             ultimo_status_run = 'ok',
             status_automacao = CASE
               WHEN status_automacao IN ('sem_coleta','planejada','em_construcao') THEN 'ativo'
               ELSE status_automacao
             END,
             trigger_tipo = 'cron',
             schedule_cron = '0 7 * * 0',
             schedule_descricao = 'todo domingo 4h BRT (consolida 7 dias do grupo WhatsApp via bot Evolution)',
             ferramenta = 'whatsapp-grupo-handler (webhook) + consolidar-chat-grupo-semanal (cron)',
             atualizado_em = now()
       WHERE cerebro_id = '${g.cerebro_id}'::uuid
         AND categoria_slug = ${_esc(g.categoria_slug)};
    `);
  } catch (e) {
    on_log({ etapa: 'plano_update_falhou', erro: e.message });
  }

  on_log({ etapa: 'fim', fonte_id, qtd_msgs: msgs.length, qtd_autores: autoresSet.size, chunks: vet.chunks });
  return {
    ok: true,
    fonte_id,
    qtd_msgs: msgs.length,
    qtd_autores: autoresSet.size,
    vetorizado: vet.ok,
    chunks: vet.chunks || 0,
  };
}

/**
 * Roda consolidacao em TODOS os grupos ativos. Chamado pelo cron.
 */
async function consolidarTodosGruposAtivos({ on_log = () => {} } = {}) {
  const grupos = await db.rodarSQL(`
    SELECT id, nome_grupo FROM pinguim.whatsapp_grupos_monitorados WHERE ativo = true ORDER BY nome_grupo;
  `);
  const resultados = [];
  for (const g of grupos) {
    on_log({ etapa: 'grupo_inicio', nome: g.nome_grupo });
    const r = await consolidarGrupo({ grupo_id: g.id, on_log: (ev) => on_log({ grupo: g.nome_grupo, ...ev }) }).catch(e => ({ ok: false, motivo: e.message }));
    resultados.push({ grupo: g.nome_grupo, ...r });
  }
  return resultados;
}

module.exports = { consolidarGrupo, consolidarTodosGruposAtivos };
