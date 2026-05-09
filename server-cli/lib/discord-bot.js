// ============================================================
// discord-bot.js — V2.14 Frente B (modulo discord-24h)
// ============================================================
// Bot Discord que conecta no Gateway via WebSocket, escuta mensagens em
// TODOS os canais que tem permissao de leitura, salva em pinguim.discord_mensagens
// em tempo real. Sem cron — stream continuo.
//
// Implementacao bare-bones com WebSocket nativo do Node 18+ (sem discord.js,
// que adiciona ~50 deps e e overkill pro caso de uso).
//
// Decisoes:
// - READ-only (zero envio de mensagem) — princ menor privilegio
// - Filtra mensagens de bots por padrao (autor.bot=true so guarda como flag)
// - Reconecta automatico em desconexao (Discord Gateway recicla a cada ~24h)
// - Healthcheck via getStatus() pra server-cli expor em /api/health
// - Cofre: DISCORD_BOT_TOKEN + DISCORD_GUILD_ID (filtro opcional — se vazio, le todas guilds)
// ============================================================

const db = require('./db');

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const API_BASE = 'https://discord.com/api/v10';

// Opcodes do Discord Gateway (https://discord.com/developers/docs/topics/opcodes-and-status-codes)
const OP = {
  DISPATCH:           0,
  HEARTBEAT:          1,
  IDENTIFY:           2,
  PRESENCE_UPDATE:    3,
  RESUME:             6,
  RECONNECT:          7,
  INVALID_SESSION:    9,
  HELLO:              10,
  HEARTBEAT_ACK:      11,
};

// Intents bitfield (https://discord.com/developers/docs/topics/gateway#gateway-intents)
// Precisamos: GUILDS (1<<0), GUILD_MEMBERS (1<<1), GUILD_MESSAGES (1<<9),
// MESSAGE_CONTENT (1<<15), GUILD_MESSAGE_REACTIONS (1<<10)
const INTENTS = (1 << 0) | (1 << 1) | (1 << 9) | (1 << 10) | (1 << 15);

class DiscordBot {
  constructor({ token, guildIdFiltro = null, onLog = console.log, onError = console.error } = {}) {
    this.token = token;
    this.guildIdFiltro = guildIdFiltro;  // se setado, so processa mensagens dessa guild
    this.log = onLog;
    this.err = onError;

    // Estado de conexao
    this.ws = null;
    this.heartbeatInterval = null;
    this.heartbeatTimer = null;
    this.lastSeq = null;
    this.sessionId = null;
    this.resumeUrl = null;
    this.reconnectTimer = null;
    this.reconectando = false;
    this.fechando = false;       // sinal pra nao reconectar (shutdown intencional)

    // Caches denormalizados pra evitar fetch repetido na API REST
    this.guildNomes = new Map();    // guild_id -> nome
    this.canalNomes = new Map();    // canal_id -> {nome, tipo, parent_id}

    // Metricas pra healthcheck
    this.estatisticas = {
      conectado_desde: null,
      ultima_mensagem_em: null,
      total_ingerido: 0,
      total_filtrado_bot: 0,
      total_filtrado_guild: 0,
      reconexoes: 0,
      ultimo_erro: null,
    };
  }

  // --------------------- API publica ---------------------

  iniciar() {
    if (this.ws) {
      this.log('[discord-bot] ja iniciado');
      return;
    }
    this.fechando = false;
    this._conectar();
  }

  parar() {
    this.fechando = true;
    this._limparTimers();
    if (this.ws) {
      try { this.ws.close(1000); } catch (_) {}
      this.ws = null;
    }
  }

  // ============================================================
  // BACKFILL — busca historico recente via API REST (Gateway so ouve a partir
  // do conectado_desde). Util pra popular ultimas N horas no boot, evitando
  // que o resumo das 8h tenha buraco quando bot reinicia.
  // ============================================================
  async backfillHorasRecentes({ horas = 24, maxPorCanal = 100 } = {}) {
    if (!this.guildIdFiltro) {
      this.log('[discord-bot] backfill abortado: DISCORD_GUILD_ID nao setado');
      return { canais_processados: 0, mensagens_ingeridas: 0 };
    }
    const cutoff = Date.now() - horas * 60 * 60 * 1000;
    let processados = 0;
    let ingeridas = 0;

    // Lista canais TEXT da guild filtrada (ignorando voice/category)
    const canaisTexto = Array.from(this.canalNomes.entries())
      .filter(([id, c]) => c.tipo === 'text' || c.tipo === 'announcement');

    this.log(`[discord-bot] backfill: ${canaisTexto.length} canais texto, janela ${horas}h`);

    for (const [canalId, canalInfo] of canaisTexto) {
      try {
        const resp = await fetch(`${API_BASE}/channels/${canalId}/messages?limit=${maxPorCanal}`, {
          headers: { 'Authorization': `Bot ${this.token}` },
        });
        if (!resp.ok) {
          // 403 = sem permissao no canal (esperado, ignora silencioso)
          if (resp.status !== 403) this.err(`[discord-bot] backfill canal ${canalId} HTTP ${resp.status}`);
          continue;
        }
        const msgs = await resp.json();
        processados++;
        for (const m of msgs) {
          const tsMs = new Date(m.timestamp).getTime();
          if (tsMs < cutoff) continue;
          // Reusa o handler do MESSAGE_CREATE, mas com guild_id manual (REST nao traz)
          await this._handleMessageCreate({ ...m, guild_id: this.guildIdFiltro });
          ingeridas++;
        }
      } catch (e) {
        this.err(`[discord-bot] backfill canal ${canalId} erro: ${e.message}`);
      }
      // Rate limit Discord — pausa 250ms entre canais
      await new Promise(r => setTimeout(r, 250));
    }
    this.log(`[discord-bot] backfill OK: ${processados} canais lidos, ${ingeridas} mensagens ingeridas`);
    return { canais_processados: processados, mensagens_ingeridas: ingeridas };
  }

  getStatus() {
    return {
      conectado: !!this.ws && this.ws.readyState === 1,
      conectado_desde: this.estatisticas.conectado_desde,
      ultima_mensagem_em: this.estatisticas.ultima_mensagem_em,
      total_ingerido: this.estatisticas.total_ingerido,
      total_filtrado_bot: this.estatisticas.total_filtrado_bot,
      total_filtrado_guild: this.estatisticas.total_filtrado_guild,
      reconexoes: this.estatisticas.reconexoes,
      guilds_cacheadas: this.guildNomes.size,
      canais_cacheados: this.canalNomes.size,
      ultimo_erro: this.estatisticas.ultimo_erro,
      guild_filtrada: this.guildIdFiltro,
    };
  }

  // --------------------- Conexao ---------------------

  _conectar() {
    this.log(`[discord-bot] conectando ao Gateway ${GATEWAY_URL}...`);

    try {
      this.ws = new WebSocket(GATEWAY_URL);
    } catch (e) {
      this.err('[discord-bot] erro abrindo WebSocket:', e.message);
      this.estatisticas.ultimo_erro = `WebSocket open: ${e.message}`;
      this._agendarReconexao(5000);
      return;
    }

    this.ws.addEventListener('open', () => {
      this.log('[discord-bot] WebSocket aberto, aguardando HELLO...');
    });

    this.ws.addEventListener('message', (ev) => {
      let payload;
      try { payload = JSON.parse(ev.data); }
      catch (e) { this.err('[discord-bot] payload nao-JSON:', e.message); return; }
      this._processarPayload(payload).catch(e => this.err('[discord-bot] erro processando:', e.message));
    });

    this.ws.addEventListener('error', (ev) => {
      const msg = ev.message || 'erro WebSocket';
      this.err('[discord-bot] WebSocket error:', msg);
      this.estatisticas.ultimo_erro = `WebSocket error: ${msg}`;
    });

    this.ws.addEventListener('close', (ev) => {
      this.log(`[discord-bot] WebSocket fechado (code=${ev.code}, reason="${ev.reason || ''}")`);
      this._limparTimers();
      this.ws = null;

      if (this.fechando) {
        this.log('[discord-bot] shutdown intencional, nao reconecta');
        return;
      }

      // Codigos 4004 (auth fail), 4013 (intents inválidas), 4014 (intent disallowed) — nao reconecta
      const codigosFatais = [4004, 4013, 4014];
      if (codigosFatais.includes(ev.code)) {
        this.err(`[discord-bot] codigo fatal ${ev.code} — nao reconecta. Verifique token+intents no Developer Portal.`);
        this.estatisticas.ultimo_erro = `Fatal close ${ev.code}: ${ev.reason || ''}`;
        return;
      }

      // Reconecta com backoff
      this.estatisticas.reconexoes++;
      this._agendarReconexao(3000);
    });
  }

  _agendarReconexao(delayMs) {
    if (this.reconectando || this.fechando) return;
    this.reconectando = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconectando = false;
      this._conectar();
    }, delayMs);
  }

  _limparTimers() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  // --------------------- Protocolo Gateway ---------------------

  async _processarPayload(payload) {
    const { op, t, s, d } = payload;
    if (s !== null && s !== undefined) this.lastSeq = s;

    switch (op) {
      case OP.HELLO:
        this._iniciarHeartbeat(d.heartbeat_interval);
        if (this.sessionId && this.resumeUrl) {
          this._enviarResume();
        } else {
          this._enviarIdentify();
        }
        break;

      case OP.HEARTBEAT_ACK:
        // ok, heartbeat confirmado
        break;

      case OP.HEARTBEAT:
        // Discord pediu heartbeat antes do intervalo — manda imediato
        this._enviarHeartbeat();
        break;

      case OP.RECONNECT:
        this.log('[discord-bot] Discord pediu RECONNECT, fechando pra reabrir...');
        try { this.ws.close(4000); } catch (_) {}
        break;

      case OP.INVALID_SESSION:
        this.log('[discord-bot] sessao invalida, re-identificando...');
        this.sessionId = null;
        this.resumeUrl = null;
        // Aguarda 2-5s aleatorio (recomendacao Discord)
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
        this._enviarIdentify();
        break;

      case OP.DISPATCH:
        await this._processarDispatch(t, d);
        break;
    }
  }

  _enviar(op, d) {
    if (!this.ws || this.ws.readyState !== 1) return;
    try {
      this.ws.send(JSON.stringify({ op, d }));
    } catch (e) {
      this.err('[discord-bot] erro enviando payload:', e.message);
    }
  }

  _iniciarHeartbeat(intervalMs) {
    this.heartbeatInterval = intervalMs;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // Primeiro heartbeat com jitter
    const primeiroDelay = Math.floor(intervalMs * Math.random());
    setTimeout(() => {
      this._enviarHeartbeat();
      this.heartbeatTimer = setInterval(() => this._enviarHeartbeat(), intervalMs);
    }, primeiroDelay);
  }

  _enviarHeartbeat() {
    this._enviar(OP.HEARTBEAT, this.lastSeq);
  }

  _enviarIdentify() {
    this.log(`[discord-bot] enviando IDENTIFY (intents=${INTENTS})`);
    this._enviar(OP.IDENTIFY, {
      token: this.token,
      intents: INTENTS,
      properties: {
        os: process.platform,
        browser: 'pinguim-os',
        device: 'pinguim-os',
      },
      presence: {
        activities: [{ name: 'mensagens do time', type: 3 }], // type 3 = WATCHING
        status: 'online',
        afk: false,
      },
    });
  }

  _enviarResume() {
    this.log(`[discord-bot] enviando RESUME (session=${this.sessionId.slice(0,8)}, seq=${this.lastSeq})`);
    this._enviar(OP.RESUME, {
      token: this.token,
      session_id: this.sessionId,
      seq: this.lastSeq,
    });
  }

  // --------------------- Dispatch (eventos) ---------------------

  async _processarDispatch(eventName, d) {
    switch (eventName) {
      case 'READY':
        this.sessionId = d.session_id;
        this.resumeUrl = d.resume_gateway_url;
        this.estatisticas.conectado_desde = new Date().toISOString();
        this.log(`[discord-bot] READY — bot=${d.user.username}#${d.user.discriminator || '0'} | guilds=${d.guilds.length}`);
        break;

      case 'RESUMED':
        this.log('[discord-bot] RESUMED com sucesso');
        break;

      case 'GUILD_CREATE':
        this.guildNomes.set(d.id, d.name);
        // Cacheia canais da guild (text + threads ativas)
        for (const c of (d.channels || [])) {
          this.canalNomes.set(c.id, { nome: c.name, tipo: this._tipoCanal(c.type), parent_id: c.parent_id });
        }
        for (const t of (d.threads || [])) {
          this.canalNomes.set(t.id, { nome: t.name, tipo: 'thread', parent_id: t.parent_id });
        }
        this.log(`[discord-bot] GUILD_CREATE: ${d.name} (${d.id}) — ${d.channels?.length || 0} canais, ${d.threads?.length || 0} threads`);
        break;

      case 'CHANNEL_CREATE':
      case 'CHANNEL_UPDATE':
        this.canalNomes.set(d.id, { nome: d.name, tipo: this._tipoCanal(d.type), parent_id: d.parent_id });
        break;

      case 'THREAD_CREATE':
      case 'THREAD_UPDATE':
        this.canalNomes.set(d.id, { nome: d.name, tipo: 'thread', parent_id: d.parent_id });
        break;

      case 'MESSAGE_CREATE':
        await this._handleMessageCreate(d);
        break;

      case 'MESSAGE_UPDATE':
        // Discord manda payload parcial em UPDATE; so atualiza editado_em + conteudo se vier
        if (d.id && d.content !== undefined) {
          await this._atualizarMensagem(d);
        }
        break;

      case 'MESSAGE_REACTION_ADD':
        await this._incrementarReacao(d.message_id, +1);
        break;

      case 'MESSAGE_REACTION_REMOVE':
        await this._incrementarReacao(d.message_id, -1);
        break;
    }
  }

  _tipoCanal(typeCode) {
    // Discord channel types: https://discord.com/developers/docs/resources/channel#channel-object-channel-types
    const map = {
      0: 'text', 2: 'voice', 4: 'category', 5: 'announcement',
      10: 'announcement_thread', 11: 'public_thread', 12: 'private_thread',
      13: 'stage_voice', 15: 'forum', 16: 'media',
    };
    return map[typeCode] || `tipo_${typeCode}`;
  }

  async _handleMessageCreate(m) {
    // Filtros pre-banco
    if (this.guildIdFiltro && m.guild_id && m.guild_id !== this.guildIdFiltro) {
      this.estatisticas.total_filtrado_guild++;
      return;
    }
    if (!m.guild_id) return; // ignora DM

    const ehBot = !!(m.author?.bot);

    const canalCache = this.canalNomes.get(m.channel_id) || {};
    const guildNome = this.guildNomes.get(m.guild_id) || null;

    // Constroi linha pra INSERT
    const row = {
      message_id:        m.id,
      guild_id:          m.guild_id,
      guild_nome:        guildNome,
      canal_id:          m.channel_id,
      canal_nome:        canalCache.nome || null,
      canal_tipo:        canalCache.tipo || null,
      parent_canal_id:   canalCache.parent_id || null,
      autor_id:          m.author?.id || 'unknown',
      autor_nome:        m.author?.global_name || m.author?.username || 'unknown',
      autor_bot:         ehBot,
      conteudo:          m.content || '',
      postado_em:        m.timestamp || new Date().toISOString(),
      editado_em:        m.edited_timestamp || null,
      mencoes_users:     (m.mentions || []).map(u => u.id),
      mencoes_roles:     m.mention_roles || [],
      menciona_everyone: !!m.mention_everyone,
      reacoes_qtd:       (m.reactions || []).reduce((a, r) => a + (r.count || 0), 0),
      thread_id:         m.thread?.id || null,
      anexos_qtd:        (m.attachments || []).length,
      embed_qtd:         (m.embeds || []).length,
    };

    if (ehBot) {
      this.estatisticas.total_filtrado_bot++;
      // Ainda salva (com flag autor_bot=true) — Skill decide se inclui no resumo
    }

    try {
      await this._insertMensagem(row);
      this.estatisticas.total_ingerido++;
      this.estatisticas.ultima_mensagem_em = row.postado_em;
    } catch (e) {
      this.err(`[discord-bot] erro inserindo mensagem ${m.id}: ${e.message}`);
      this.estatisticas.ultimo_erro = `INSERT: ${e.message}`;
    }
  }

  async _insertMensagem(r) {
    const esc = (v) => {
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (typeof v === 'number') return String(v);
      if (Array.isArray(v)) {
        if (v.length === 0) return `'{}'::text[]`;
        return `ARRAY[${v.map(x => `'${String(x).replace(/'/g, "''")}'`).join(',')}]::text[]`;
      }
      return `'${String(v).replace(/'/g, "''")}'`;
    };

    const sql = `
      INSERT INTO pinguim.discord_mensagens (
        message_id, guild_id, guild_nome, canal_id, canal_nome, canal_tipo, parent_canal_id,
        autor_id, autor_nome, autor_bot, conteudo, postado_em, editado_em,
        mencoes_users, mencoes_roles, menciona_everyone, reacoes_qtd, thread_id, anexos_qtd, embed_qtd
      ) VALUES (
        ${esc(r.message_id)}, ${esc(r.guild_id)}, ${esc(r.guild_nome)},
        ${esc(r.canal_id)}, ${esc(r.canal_nome)}, ${esc(r.canal_tipo)}, ${esc(r.parent_canal_id)},
        ${esc(r.autor_id)}, ${esc(r.autor_nome)}, ${esc(r.autor_bot)}, ${esc(r.conteudo)},
        ${esc(r.postado_em)}, ${esc(r.editado_em)},
        ${esc(r.mencoes_users)}, ${esc(r.mencoes_roles)}, ${esc(r.menciona_everyone)},
        ${esc(r.reacoes_qtd)}, ${esc(r.thread_id)}, ${esc(r.anexos_qtd)}, ${esc(r.embed_qtd)}
      )
      ON CONFLICT (message_id) DO NOTHING;
    `;
    await db.rodarSQL(sql);
  }

  async _atualizarMensagem(m) {
    const escTxt = m.content ? `'${m.content.replace(/'/g, "''")}'` : 'NULL';
    const escEdit = m.edited_timestamp ? `'${m.edited_timestamp}'` : 'now()';
    const sql = `
      UPDATE pinguim.discord_mensagens
      SET conteudo = ${escTxt}, editado_em = ${escEdit}
      WHERE message_id = '${m.id.replace(/'/g, "''")}';
    `;
    try { await db.rodarSQL(sql); } catch (e) { this.err(`[discord-bot] update msg ${m.id}: ${e.message}`); }
  }

  async _incrementarReacao(messageId, delta) {
    const sql = `
      UPDATE pinguim.discord_mensagens
      SET reacoes_qtd = GREATEST(0, reacoes_qtd + (${delta}))
      WHERE message_id = '${messageId.replace(/'/g, "''")}';
    `;
    try { await db.rodarSQL(sql); } catch (_) { /* nao bloqueia */ }
  }
}

// ============================================================
// Singleton — instancia global usada pelo server-cli
// ============================================================
let _instancia = null;

async function iniciarBot() {
  if (_instancia) {
    return _instancia;
  }

  let token, guildIdFiltro;
  try {
    token = await db.lerChaveSistema('DISCORD_BOT_TOKEN', 'discord-bot');
  } catch (e) {
    console.warn('[discord-bot] DISCORD_BOT_TOKEN nao encontrado no cofre — bot NAO sera iniciado.');
    return null;
  }

  if (!token) {
    console.warn('[discord-bot] DISCORD_BOT_TOKEN vazio — bot NAO sera iniciado.');
    return null;
  }

  try {
    guildIdFiltro = await db.lerChaveSistema('DISCORD_GUILD_ID', 'discord-bot');
  } catch (_) {
    guildIdFiltro = null;
  }

  _instancia = new DiscordBot({
    token,
    guildIdFiltro: guildIdFiltro || null,
    onLog: (m) => console.log(m),
    onError: (m, ...args) => console.error(m, ...args),
  });
  _instancia.iniciar();
  return _instancia;
}

function getBot() { return _instancia; }

function pararBot() {
  if (_instancia) {
    _instancia.parar();
    _instancia = null;
  }
}

module.exports = { DiscordBot, iniciarBot, getBot, pararBot };
