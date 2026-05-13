// ============================================================
// relatorio-executivo.js — V2.14 Frente C1
// ============================================================
// Orquestrador do Relatório Executivo Diário.
//
// Junta os 5 módulos (financeiro / triagem-emails / diagnostico-inbox /
// agenda / discord) com janela flexível e aciona Claude CLI com a Skill
// `compor-executivo-diario` pra produzir o markdown final.
//
// Decisões:
// - JANELA FLEXÍVEL (parametrizada) — 24h default, mas aceita 6h, 72h, custom.
//   Permite "manda pra mim agora" no chat OU "atualiza o de hoje" às 14h.
// - PARALELO (Promise.all) — 5 módulos rodam ao mesmo tempo. Falha de 1
//   não derruba os outros (Munger — falhas isoladas).
// - SINTETIZADOR via Claude CLI — recebe outputs estruturados + Skill
//   compor-executivo-diario como contexto. Devolve markdown final.
// - SALVA em pinguim.entregaveis (tipo='relatorio-executivo-diario') com
//   conteudo_estruturado.modulos = {financeiro: {ok, latencia_ms, ...}, ...}
//   pra debug/observabilidade.
// - Mesmo motor pra cron (D) e on-demand (chat agora) — só muda quem chama.
// ============================================================

const db = require('./db');
const socio = require('./socio');
const dashboard = require('./db-dashboard');
const googleCalendar = require('./google-calendar');
const googleGmail = require('./google-gmail');
const { spawn } = require('child_process');
const path = require('path');

// ============================================================
// MÓDULO: financeiro
// Lê 2º Supabase (dashboard) via dash.resumo_dia()
// ============================================================
async function modulo_financeiro({ janela_horas, dia_alvo_brt, moeda = 'BRL' }) {
  const t0 = Date.now();
  try {
    // resumo_dia recebe data BRT YYYY-MM-DD; pra janelas != 24h vamos seguir
    // com "dia_alvo" mesmo (financeiro é orientado a fechamento de dia).
    // Janelas curtas (6h) viram "parcial do dia atual".
    const r = await dashboard.resumo_dia(dia_alvo_brt, moeda);

    const linhas = [];
    linhas.push(`## 💰 Financeiro — ${dia_alvo_brt} (${moeda})`);
    linhas.push('');
    linhas.push(`**Receita Total: R$ ${r.receita_total.toFixed(2).replace('.', ',')}** · ${r.vendas} vendas · ROAS **${r.roas.toFixed(2)}x** · Lucro R$ ${r.lucro.toFixed(2).replace('.', ',')}`);
    linhas.push('');
    if (r.receita_produto > 0 || r.receita_bump > 0 || r.receita_upsell > 0 || r.receita_downsell > 0) {
      linhas.push('**Composição:**');
      const total = r.receita_total || 1;
      const pct = (v) => ((v / total) * 100).toFixed(0);
      if (r.receita_produto > 0)  linhas.push(`- Produto: R$ ${r.receita_produto.toFixed(2).replace('.', ',')} (${pct(r.receita_produto)}%)`);
      if (r.receita_bump > 0)     linhas.push(`- Bump: R$ ${r.receita_bump.toFixed(2).replace('.', ',')} (${pct(r.receita_bump)}%)`);
      if (r.receita_upsell > 0)   linhas.push(`- Upsell: R$ ${r.receita_upsell.toFixed(2).replace('.', ',')} (${pct(r.receita_upsell)}%)`);
      if (r.receita_downsell > 0) linhas.push(`- Downsell: R$ ${r.receita_downsell.toFixed(2).replace('.', ',')} (${pct(r.receita_downsell)}%)`);
      linhas.push('');
    }
    if (r.top_produtos && r.top_produtos.length > 0) {
      linhas.push('**Top produtos:**');
      r.top_produtos.slice(0, 5).forEach((p, i) => {
        linhas.push(`${i + 1}. ${p.produto} — ${p.qtd} vendas · R$ ${p.receita.toFixed(2).replace('.', ',')}`);
      });
      linhas.push('');
    }

    // Meta Ads — paridade com dashboard (V2.14 C1.1 — Andre pediu alcance + cliques unicos + contas)
    const ads = r.ads || {};
    linhas.push('### Meta Ads');
    if (ads.contas_ativas) linhas.push(`*${ads.contas_ativas} ${ads.contas_ativas === 1 ? 'conta ativa' : 'contas ativas'} no dia*`);
    linhas.push('');
    linhas.push('**Investimento e conversão:**');
    linhas.push(`- **Gasto Total:** R$ ${(ads.gasto_total || r.investimento).toFixed(2).replace('.', ',')}`);
    linhas.push(`- **CPA:** R$ ${r.cpa.toFixed(2).replace('.', ',')} · **Ticket Médio:** R$ ${r.ticket_medio.toFixed(2).replace('.', ',')}`);
    if (ads.cpa_unico) linhas.push(`- **Custo por clique único:** R$ ${ads.cpa_unico.toFixed(2).replace('.', ',')}`);
    linhas.push('');
    linhas.push('**Alcance e impressões:**');
    if (ads.alcance) linhas.push(`- **Alcance Total:** ${ads.alcance.toLocaleString('pt-BR')} pessoas`);
    if (ads.impressoes) linhas.push(`- **Impressões:** ${ads.impressoes.toLocaleString('pt-BR')} · **CPM:** R$ ${(ads.cpm || 0).toFixed(2).replace('.', ',')}`);
    if (ads.frequencia) linhas.push(`- **Frequência:** ${ads.frequencia.toFixed(2)}x (vezes que o anúncio apareceu por pessoa)`);
    linhas.push('');
    linhas.push('**Engajamento:**');
    if (ads.cliques) linhas.push(`- **Cliques Totais:** ${ads.cliques.toLocaleString('pt-BR')} · **CTR:** ${(ads.ctr_pct || 0).toFixed(2)}%`);
    if (ads.cliques_unicos) linhas.push(`- **Cliques Únicos:** ${ads.cliques_unicos.toLocaleString('pt-BR')} (pessoas distintas que clicaram)`);
    if (ads.cliques_link) linhas.push(`- **Cliques no Link:** ${ads.cliques_link.toLocaleString('pt-BR')}`);

    // Funil Pixel (atribuição Meta — só conversões reais)
    if (r.funil && (r.funil.lpv > 0 || r.funil.checkouts > 0 || r.funil.purchases_pixel > 0)) {
      linhas.push('');
      linhas.push('**Funil Pixel (conversões atribuídas ao Meta):**');
      linhas.push(`- **LPV:** ${r.funil.lpv.toLocaleString('pt-BR')} → **Checkouts:** ${r.funil.checkouts} → **Compras Pixel:** ${r.funil.purchases_pixel}`);
      linhas.push('');
      linhas.push('*Compras Pixel ≠ Vendas Hotmart — Pixel atribui apenas campanhas Meta, restante vem de orgânico/outras origens.*');
    }

    // Configs Ads ativos (auditoria — sócio sabe quais campanhas estão rodando)
    if (r.audit && r.audit.configs_nomes && r.audit.configs_nomes.length > 0) {
      linhas.push('');
      linhas.push(`**Campanhas ativas (${r.audit.configs_ativos}):** ${r.audit.configs_nomes.join(' · ')}`);
    }

    if (r.reembolsos_qtd > 0) {
      linhas.push('');
      linhas.push(`### ⚠ Reembolsos`);
      linhas.push(`**${r.reembolsos_qtd}** reembolsos · **R$ ${r.reembolsos_brl.toFixed(2).replace('.', ',')}** perdidos · Taxa **${r.taxa_reembolso_pct.toFixed(1)}%**`);
    }

    return {
      slug: 'financeiro-24h',
      ok: true,
      conteudo_md: linhas.join('\n'),
      conteudo_estruturado: {
        receita_total: r.receita_total,
        receita_produto: r.receita_produto,
        receita_bump: r.receita_bump,
        receita_upsell: r.receita_upsell,
        receita_downsell: r.receita_downsell,
        vendas: r.vendas,
        roas: r.roas,
        cpa: r.cpa,
        ticket_medio: r.ticket_medio,
        investimento: r.investimento,
        reembolsos_qtd: r.reembolsos_qtd,
        reembolsos_brl: r.reembolsos_brl,
        top_produtos: r.top_produtos,
      },
      latencia_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      slug: 'financeiro-24h', ok: false, motivo: e.message,
      conteudo_md: `## 💰 Financeiro — INDISPONÍVEL\n\n⚠ Módulo financeiro falhou: ${e.message}`,
      latencia_ms: Date.now() - t0,
    };
  }
}

// ============================================================
// MÓDULO: agenda (hoje detalhada + amanhã resumida)
// ============================================================
async function modulo_agenda({ cliente_id, dia_alvo_brt }) {
  const t0 = Date.now();
  try {
    // Andre 2026-05-12: agenda do relatório SEMPRE mostra HOJE+amanhã,
    // ignorando dia_alvo_brt (que é ontem pra relatório das 8h).
    // Sócio lê o relatório agora — quer ver compromissos do dia que está
    // começando, não do dia que terminou. Linha de amanhã = resumida.
    const alvo = googleCalendar.janelaHojeBRT();
    const dataAlvoMs = new Date(alvo.inicio_iso).getTime();
    const proximoUTC = new Date(dataAlvoMs + 24 * 60 * 60 * 1000);
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
    const partsProx = fmt.formatToParts(proximoUTC);
    const yP = partsProx.find(p => p.type === 'year').value;
    const mP = partsProx.find(p => p.type === 'month').value;
    const dP = partsProx.find(p => p.type === 'day').value;
    const proximoStr = `${yP}-${mP}-${dP}`;
    const proximo = googleCalendar.janelaDiaBRT(proximoStr);

    const [rAlvo, rProximo] = await Promise.all([
      googleCalendar.listarEventos({ cliente_id, calendarId: 'primary', timeMin: alvo.inicio_iso, timeMax: alvo.fim_iso }),
      googleCalendar.listarEventos({ cliente_id, calendarId: 'primary', timeMin: proximo.inicio_iso, timeMax: proximo.fim_iso }),
    ]);

    const labelAlvo = 'Hoje';
    const labelProximo = 'Amanhã';

    const linhas = ['## 📅 Agenda', ''];

    // DIA ALVO
    const diaAlvoNome = (rAlvo.eventos[0]?.dia_semana_br) || googleCalendar.diaSemanaBR(alvo.inicio_iso) || '';
    linhas.push(`### ${labelAlvo} — ${diaAlvoNome} ${alvo.data_br}`);
    if (rAlvo.total === 0) {
      linhas.push('Livre.');
    } else {
      rAlvo.eventos.forEach(e => {
        if (e.dia_inteiro) {
          linhas.push(`- **[dia inteiro]** · **${e.titulo}**`);
        } else {
          const dur = e.duracao_min ? ` (${e.duracao_min}min)` : '';
          const part = e.qtd_participantes ? ` · ${e.qtd_participantes} pessoas` : '';
          const meet = e.link_meet ? ' · Meet' : '';
          linhas.push(`- **${e.hora_inicio_br} → ${e.hora_fim_br}**${dur} · **${e.titulo}**${part}${meet}`);
        }
      });
    }
    linhas.push('');

    // DIA SEGUINTE — resumo de uma linha
    const diaProxNome = (rProximo.eventos[0]?.dia_semana_br) || googleCalendar.diaSemanaBR(proximo.inicio_iso) || '';
    linhas.push(`### ${labelProximo} — ${diaProxNome} ${proximo.data_br}`);
    if (rProximo.total === 0) {
      linhas.push('Livre.');
    } else if (rProximo.total === 1) {
      const e = rProximo.eventos[0];
      const horaTxt = e.dia_inteiro ? '[dia inteiro]' : e.hora_inicio_br;
      linhas.push(`1 reunião · **${horaTxt}** — ${e.titulo}`);
    } else {
      const e = rProximo.eventos[0];
      const horaTxt = e.dia_inteiro ? '[dia inteiro]' : e.hora_inicio_br;
      linhas.push(`${rProximo.total} reuniões · primeira **${horaTxt}** — ${e.titulo}`);
    }

    return {
      slug: 'agenda-hoje',
      ok: true,
      conteudo_md: linhas.join('\n'),
      conteudo_estruturado: {
        dia_alvo_brt,
        alvo_total: rAlvo.total,
        alvo_eventos: rAlvo.eventos.map(e => ({ titulo: e.titulo, hora_inicio: e.hora_inicio_br, duracao_min: e.duracao_min, qtd_participantes: e.qtd_participantes, link_meet: e.link_meet })),
        proximo_total: rProximo.total,
      },
      latencia_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      slug: 'agenda-hoje', ok: false, motivo: e.message,
      conteudo_md: `## 📅 Agenda — INDISPONÍVEL\n\n⚠ ${e.message.includes('nao conectado') || e.message.includes('Refresh') ? 'Calendar não conectado pra esse sócio (rodar /conectar-google).' : e.message}`,
      latencia_ms: Date.now() - t0,
    };
  }
}

// ============================================================
// MÓDULO: triagem de emails (24h)
// Versão "núcleo" — lista emails categorizados sem rodar LLM por email
// (LLM-classifier vai entrar quando houver tempo). Por enquanto, classificação
// por palavra-chave + status lido/não-lido.
// ============================================================
async function modulo_triagem_email({ cliente_id, dia_alvo_brt }) {
  const t0 = Date.now();
  try {
    // V2.14 D Fix — query Gmail com janela de dia BRT específico.
    // Gmail aceita 'after:YYYY/MM/DD before:YYYY/MM/DD' (UTC).
    // BRT = UTC-3. Janela "dia X BRT inteiro" = [X 03:00 UTC → X+1 02:59 UTC].
    // Pra Gmail (que filtra por DATA, não timestamp), basta `after:X-1 before:X+1`
    // que o dia BRT cabe dentro. Fica um pouco frouxo (~3h overlap nas pontas)
    // mas pega tudo do dia. Filtragem fina seria por internalDate.
    const j = googleCalendar.janelaDiaBRT(dia_alvo_brt); // valida formato
    const [yA, mA, dA] = dia_alvo_brt.split('-');
    const inicioGmail = `${yA}/${mA}/${parseInt(dA, 10) - 1 || dA}`; // dia anterior pra cobrir BRT 00:00
    const fimGmail    = `${yA}/${mA}/${parseInt(dA, 10) + 1}`;        // dia seguinte pra cobrir BRT 23:59
    const queryGmail  = `after:${yA}/${mA}/${parseInt(dA, 10) - 1 || dA} before:${yA}/${mA}/${parseInt(dA, 10) + 1}`;

    const r = await googleGmail.listarEmails({
      cliente_id,
      query: queryGmail,
      pageSize: 50,
    });

    // Filtra final em JS pra confinar exatamente na janela BRT (data_raw RFC 2822)
    if (r.emails && r.emails.length > 0) {
      const t0Ms = new Date(j.inicio_iso).getTime();
      const t1Ms = new Date(j.fim_iso).getTime();
      r.emails = r.emails.filter(e => {
        if (!e.data_raw) return true; // sem data, mantém (pouco provável)
        const t = new Date(e.data_raw).getTime();
        if (isNaN(t)) return true;
        return t >= t0Ms && t <= t1Ms;
      });
      r.total_retornado = r.emails.length;
    }

    if (!r.emails || r.emails.length === 0) {
      return {
        slug: 'triagem-emails-24h', ok: true,
        conteudo_md: `## 📧 Triagem de emails — ${j.data_br}\n\nInbox vazia neste dia.`,
        conteudo_estruturado: { total: 0, por_categoria: {}, dia_alvo_brt },
        latencia_ms: Date.now() - t0,
      };
    }

    // Classificação heurística por palavra-chave (será refinada quando LLM-classifier entrar)
    const PADROES = {
      critico:     /reembols|urgente|cancelar|reclama|chargeback|n[ãa]o funciona|pendente|atrasad/i,
      oportunidade:/lead|interess|propost|or[çc]amento|parceria|cota[çc]ão|fechar|comprar/i,
      ruido:       /newsletter|unsubscribe|promo[çc]ão|desconto|black friday|cyber|imperd[íi]vel/i,
    };

    const buckets = { critico: [], oportunidade: [], informativo: [], ruido: [] };
    for (const e of r.emails) {
      const txt = `${e.assunto || ''} ${e.snippet || ''}`;
      let cat = 'informativo';
      if (PADROES.critico.test(txt)) cat = 'critico';
      else if (PADROES.oportunidade.test(txt)) cat = 'oportunidade';
      else if (PADROES.ruido.test(txt)) cat = 'ruido';
      buckets[cat].push(e);
    }

    const linhas = [`## 📧 Triagem de emails — ${r.total_retornado} emails em ${j.data_br}`, ''];
    const ordem = [
      ['critico',     '🔴 **Crítico/Urgente**'],
      ['oportunidade','🟡 **Oportunidade**'],
      ['informativo', '🟢 **Informativo**'],
      ['ruido',       '⚫ **Ruído**'],
    ];
    for (const [k, label] of ordem) {
      const list = buckets[k];
      if (list.length === 0) continue;
      linhas.push(`${label} (${list.length})`);
      const mostrar = list.slice(0, k === 'ruido' ? 3 : 5);
      mostrar.forEach(e => {
        const de = (e.de || '').split('<')[0].trim().slice(0, 30);
        linhas.push(`- **${(e.assunto || '(sem assunto)').slice(0, 70)}** · ${de} · ${e.data || ''}`);
      });
      if (list.length > mostrar.length) linhas.push(`  *(+${list.length - mostrar.length} similares)*`);
      linhas.push('');
    }

    return {
      slug: 'triagem-emails-24h', ok: true,
      conteudo_md: linhas.join('\n').trim(),
      conteudo_estruturado: {
        total: r.total_retornado,
        dia_alvo_brt,
        por_categoria: { critico: buckets.critico.length, oportunidade: buckets.oportunidade.length, informativo: buckets.informativo.length, ruido: buckets.ruido.length },
      },
      latencia_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      slug: 'triagem-emails-24h', ok: false, motivo: e.message,
      conteudo_md: `## 📧 Triagem de emails — INDISPONÍVEL\n\n⚠ ${e.message.includes('nao conectado') || e.message.includes('Refresh') ? 'Gmail não conectado pra esse sócio.' : e.message}`,
      latencia_ms: Date.now() - t0,
    };
  }
}

// ============================================================
// MÓDULO: diagnóstico inbox (3 dias) — só roda se janela_horas >= 48
// (relatório diário não inclui — só quando seg/qua/sex)
// ============================================================
async function modulo_diagnostico_inbox({ cliente_id, dia_alvo_brt }) {
  // Diagnóstico cobre 3 dias terminando em dia_alvo_brt.
  // V2.14 D Fix — sempre roda quando incluído (sem mais if `janela_horas < 48`),
  // já que dia_alvo_brt define a janela. Quem decide se inclui é
  // `modulos_incluir` em gerarRelatorioExecutivo.
  const t0 = Date.now();
  try {
    // Janela = [dia_alvo - 2d → dia_alvo] (3 dias)
    const [yA, mA, dA] = dia_alvo_brt.split('-');
    const dataAlvo = new Date(`${yA}-${mA}-${dA}T23:59:59-03:00`);
    const dataInicio = new Date(dataAlvo.getTime() - 3 * 24 * 60 * 60 * 1000);
    const fmtData = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
    const partsIni = fmtData.formatToParts(dataInicio);
    const yI = partsIni.find(p => p.type === 'year').value;
    const mI = partsIni.find(p => p.type === 'month').value;
    const dI = partsIni.find(p => p.type === 'day').value;
    const queryGmail = `after:${yI}/${mI}/${dI} before:${yA}/${mA}/${parseInt(dA, 10) + 1}`;

    const r = await googleGmail.listarEmails({ cliente_id, query: queryGmail, pageSize: 100 });

    // Filtra final em JS pra confinar [inicio, dia_alvo 23:59 BRT]
    if (r.emails && r.emails.length > 0) {
      const t0Ms = dataInicio.getTime();
      const t1Ms = dataAlvo.getTime();
      r.emails = r.emails.filter(e => {
        if (!e.data_raw) return true;
        const t = new Date(e.data_raw).getTime();
        if (isNaN(t)) return true;
        return t >= t0Ms && t <= t1Ms;
      });
      r.total_retornado = r.emails.length;
    }

    const total = r.total_retornado || 0;

    // Métricas simples (sem LLM ainda)
    const naoLidos = r.emails.filter(e => !e.lido).length;
    const taxaLidos = total > 0 ? Math.round(((total - naoLidos) / total) * 100) : 100;

    const linhas = [
      `## 🔍 Diagnóstico da inbox (3 dias até ${dia_alvo_brt})`,
      '',
      `**Volume:** ${total} emails`,
      `**Saúde:** ${taxaLidos}% lidos (${naoLidos} não-lidos)`,
    ];

    return { slug: 'diagnostico-inbox-3dias', ok: true, conteudo_md: linhas.join('\n'), conteudo_estruturado: { total, naoLidos, taxaLidos, dia_alvo_brt }, latencia_ms: Date.now() - t0 };
  } catch (e) {
    return { slug: 'diagnostico-inbox-3dias', ok: false, motivo: e.message, conteudo_md: `## 🔍 Diagnóstico inbox — INDISPONÍVEL\n\n⚠ ${e.message}`, latencia_ms: Date.now() - t0 };
  }
}

// ============================================================
// MÓDULO: discord 24h
// ============================================================
async function modulo_discord({ dia_alvo_brt }) {
  const t0 = Date.now();
  try {
    // V2.14 D Fix — janela = dia_alvo BRT inteiro [00:00 → 23:59]
    const j = googleCalendar.janelaDiaBRT(dia_alvo_brt);
    const sql = `
      SELECT message_id, canal_nome, autor_nome, conteudo, postado_em, mencoes_users
      FROM pinguim.discord_mensagens
      WHERE postado_em >= '${j.inicio_iso}'
        AND postado_em <= '${j.fim_iso}'
        AND autor_bot = false
      ORDER BY postado_em DESC
      LIMIT 200;
    `;
    const msgs = await db.rodarSQL(sql);

    if (msgs.length === 0) {
      return {
        slug: 'discord-24h', ok: true,
        conteudo_md: `## 💬 Discord do time — ${j.data_br}\n\nNada relevante neste dia.`,
        conteudo_estruturado: { total: 0, dia_alvo_brt },
        latencia_ms: Date.now() - t0,
      };
    }

    // Detecção de pontos de atenção (regex — versão sem LLM ainda; LLM refino entra depois)
    const PADROES = {
      reembolso:   /reembols|cancelar|desist[êe]ncia|chargeback/i,
      cadastro:    /cadastro|liberar acesso|n[ãa]o consegui entrar|n[ãa]o chegou login|acesso pendente|sem acesso|sem o acesso/i,
      bug:         /n[ãa]o funciona|erro |bug|quebrad|caiu|fora do ar|t[áa] dando problema|status\s*5\d\d/i,
      decisao:     /decidimos|aprovado|vetado|fechado/i,
    };

    const sinais = { reembolso: [], cadastro: [], bug: [], decisao: [] };
    for (const m of msgs) {
      const txt = m.conteudo || '';
      for (const [cat, re] of Object.entries(PADROES)) {
        if (re.test(txt)) {
          sinais[cat].push(m);
          break;
        }
      }
    }

    const porCanal = new Map();
    for (const m of msgs) {
      const k = m.canal_nome || '?';
      porCanal.set(k, (porCanal.get(k) || 0) + 1);
    }

    const linhas = [`## 💬 Discord do time — ${j.data_br}`, ''];
    const totalSinais = sinais.reembolso.length + sinais.cadastro.length + sinais.bug.length + sinais.decisao.length;
    if (totalSinais > 0) {
      linhas.push(`**Pontos de atenção (${totalSinais})**`);
      linhas.push('');
      const labels = [
        ['reembolso', '🔴 **Reembolso**'],
        ['cadastro',  '🟠 **Sem acesso / cadastro pendente**'],
        ['bug',       '⚠️ **Bug / Reclamação**'],
        ['decisao',   '💡 **Decisão**'],
      ];
      for (const [k, label] of labels) {
        const list = sinais[k];
        if (list.length === 0) continue;
        linhas.push(`${label} (${list.length})`);
        list.slice(0, 4).forEach(m => {
          const data = new Date(m.postado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          linhas.push(`- ${data} · #${m.canal_nome} · @${m.autor_nome}: "${(m.conteudo || '').slice(0, 140).replace(/\n/g, ' ')}"`);
        });
        if (list.length > 4) linhas.push(`  *(+${list.length - 4} similares)*`);
        linhas.push('');
      }
    } else {
      linhas.push('Sem pontos de atenção — atividade normal do time.');
      linhas.push('');
    }

    linhas.push(`**Atividade:** ${msgs.length} mensagens em ${porCanal.size} canais`);
    const topCanais = [...porCanal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, q]) => `#${n} (${q})`).join(' · ');
    if (topCanais) linhas.push(`**Top canais:** ${topCanais}`);

    return {
      slug: 'discord-24h', ok: true,
      conteudo_md: linhas.join('\n').trim(),
      conteudo_estruturado: {
        total: msgs.length,
        dia_alvo_brt,
        sinais: { reembolso: sinais.reembolso.length, cadastro: sinais.cadastro.length, bug: sinais.bug.length, decisao: sinais.decisao.length },
        por_canal: Object.fromEntries(porCanal),
      },
      latencia_ms: Date.now() - t0,
    };
  } catch (e) {
    return { slug: 'discord-24h', ok: false, motivo: e.message, conteudo_md: `## 💬 Discord — INDISPONÍVEL\n\n⚠ ${e.message}`, latencia_ms: Date.now() - t0 };
  }
}

// ============================================================
// SINTETIZADOR — chama Claude CLI com Skill compor-executivo-diario
// ============================================================
function runClaudeCLISimple(prompt, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    // Filtra CLAUDECODE/CLAUDE_CODE_* do env do filho — Claude CLI bloqueia
    // execucao "aninhada" se detectar essas vars (proibe sessao dentro de sessao).
    // No nosso caso, server-cli ja roda 'claude' filho (o Atendente), e agora o
    // sintetizador roda outro 'claude' irmao — nao e nesting real, mas o CLI
    // confunde porque ve a env var herdada. Unset resolve.
    const envFiltrado = { ...process.env };
    for (const k of Object.keys(envFiltrado)) {
      if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) {
        delete envFiltrado[k];
      }
    }

    const proc = spawn('claude', ['--print'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: envFiltrado,
    });
    let stdout = '', stderr = '';
    const killer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (_) {}
      reject(new Error(`Claude CLI timeout ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdin.write(prompt);
    proc.stdin.end();
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      clearTimeout(killer);
      if (code !== 0) reject(new Error(`Claude CLI exit ${code}: ${stderr.slice(0, 300)}`));
      else resolve(stdout.trim());
    });
    proc.on('error', e => { clearTimeout(killer); reject(e); });
  });
}

async function sintetizarExecutivoDiario({ socioInfo, modulosOutputs, dataBrt, diaSemana, janela_horas, saudacao = 'Bom dia', dataHojeBrt, diaSemanaHoje }) {
  // Carrega Skill compor-executivo-diario como contexto
  const fs = require('fs');
  const skillPath = path.join(__dirname, '..', '..', 'cerebro', 'squads', 'data', 'skills', 'compor-executivo-diario', 'SKILL.md');
  let skillMd = '';
  try { skillMd = fs.readFileSync(skillPath, 'utf-8'); }
  catch (_) { skillMd = '(Skill compor-executivo-diario nao encontrada — composicao ad-hoc)'; }

  const blocosModulos = modulosOutputs
    .filter(m => !m.skipped && m.conteudo_md)
    .map(m => `### MÓDULO ${m.slug.toUpperCase()} ${m.ok ? '✓' : '✗'}\n${m.conteudo_md}`)
    .join('\n\n---\n\n');

  const sucessos = modulosOutputs.filter(m => m.ok && !m.skipped).length;
  const total    = modulosOutputs.filter(m => !m.skipped).length;
  const falhas   = modulosOutputs.filter(m => !m.ok && !m.skipped).map(m => `${m.slug}: ${m.motivo || '?'}`);

  const prompt = `Você é o sintetizador do Relatório Executivo Diário do Pinguim OS.

## Contexto temporal
Hoje é ${diaSemanaHoje || diaSemana} ${dataHojeBrt || dataBrt} (data em que o sócio LÊ o relatório).
Dia alvo dos DADOS: ${dataBrt} (${diaSemana}) — fechamento financeiro/triagem/discord referem-se a esse dia.
Agenda do módulo já vem ajustada pra HOJE (não dia alvo).
Destinatário: ${socioInfo.nome} (${socioInfo.empresa}, slug ${socioInfo.slug}).

## Sua tarefa
Compor o relatório seguindo EXATAMENTE a anatomia abaixo. Devolver APENAS o markdown final, sem comentário antes/depois, sem \`\`\`markdown wrapper.

## REGRA -1 — FORMATO (vale pra TUDO neste relatório)

❌ **NUNCA usar tabela markdown GFM** (\`| col | col |\`). O renderer HTML do Pinguim OS NÃO suporta — tabela vira lixo na tela.
✅ **SEMPRE usar lista bullet** com bold no rótulo: \`- **Receita:** R$ X · **Vendas:** N\`.
✅ Cada item da lista pode ter campos separados por \` · \` (ponto médio com espaços).

Esta regra vale pros números, top produtos, breakdown de Ads, triagem de email, comparativos. Sem exceção.

## Anatomia obrigatória (ordem fixa)

### 1. Saudação curta (1 linha) — usa data de HOJE, não dia alvo
\`☀️ ${saudacao}, ${socioInfo.nome} · ${diaSemanaHoje || diaSemana} · ${dataHojeBrt || dataBrt} · *dados de ${dataBrt}*\`

(IMPORTANTE: a saudação SEMPRE reflete HOJE — ${diaSemanaHoje || diaSemana} ${dataHojeBrt || dataBrt}. O dia dos dados, ${dataBrt}, vai em itálico no final pra deixar claro que é o fechamento do dia anterior. Usa exatamente "${saudacao}" — já calculei pelo horário BRT atual.)

### 2. TL;DR — AÇÃO NECESSÁRIA HOJE
- Cruza TODOS os módulos pra identificar o que é acionável HOJE
- Se há ação: lista numerada (1., 2., 3.) com no máx 3 itens
- Se não há: \`✅ NADA URGENTE HOJE — relaxa, lê o resto se quiser.\` + 1 frase contextualizando ("agenda livre, financeiro saudável, etc")

### 3. Conselho do dia (2-3 linhas, opcional)
- Escolhe 1 dos 4 conselheiros do Board (Munger 🦉 / Dalio ⚖️ / Naval 🧘 / Thiel ♟️) que tem insight MAIS FORTE hoje
- Estrutura OBRIGATÓRIA (2 partes):

\`🏛 **Conselho de hoje** — [emoji] [Nome]\`
\`*Por que ele:* [1 frase explicando o critério da escolha — qual sinal nos dados puxou esse conselheiro especificamente]\`
\`*O conselho:* [parecer cruzando dados reais, 1-2 linhas]\`

- Critério de escolha por conselheiro (use isso pra justificar o "por que ele"):
  - 🦉 **Munger** → quando tem padrão de RISCO/falha (anúncio parado, churn, contradição, taxa de reembolso subindo)
  - ⚖️ **Dalio** → quando tem CENÁRIO DE PRESSÃO (vendas caindo, deadline próximo, margem apertada)
  - 🧘 **Naval** → quando tem ALAVANCA NÃO-ÓBVIA (oportunidade escondida, padrão temporal, canal subexplorado)
  - ♟️ **Thiel** → quando tem DECISÃO MONOPOLÍSTICA travada (escalar vs estabilizar, parceria, foco)
- Se nenhum tem insight claro o suficiente: omite a seção inteira

### 4. NÚMEROS (resumo curto, 3-5 linhas)
- Lista bullet com KPIs principais
- NUNCA inventar — só usa dados do módulo financeiro

### 5. HOJE (agenda, 2-3 linhas)
- Quantas reuniões hoje + próxima + amanhã resumido

### 6. Divisória + nudge
\`---\`
\`*Detalhes abaixo se quiser ler. Senão, fecha aí, tá tudo no caminho.*\`

### 7. SEÇÕES DETALHADAS (numeradas 01, 02, 03, 04)
Cada seção começa com kicker monospace caps:
\`### 01 · FINANCEIRO\`
\`### 02 · AGENDA\`
\`### 03 · TRIAGEM DE EMAILS\`
\`### 04 · DISCORD\`

Conteúdo: copia o md_final do módulo INTEGRAL, mas se tiver tabela, REESCREVE em lista bullet.

### 8. PARECER DO BOARD (numerada como 05)
\`### 05 · PARECER DO BOARD\`

4 conselheiros respondendo cada UM uma pergunta dura específica, em parágrafos compactos (máx 2-3 linhas cada):

- 🦉 **Munger** — "O que pode dar errado essa semana?"
- ⚖️ **Dalio** — "Em qual cenário esses números viram problema?"
- 🧘 **Naval** — "Onde tem alavanca não-óbvia hoje?"
- ♟️ **Thiel** — "Que decisão monopolística está sendo deixada na mesa?"

Cada um cruza DADOS REAIS dos módulos acima — nunca inventa. Se conselheiro não tem insight forte, escreve "passa o turno hoje (sem padrão claro)".

### 9. SÍNTESE FINAL DO BOARD (NOVO — Andre pediu)
Logo depois das 4 vozes, **Board Chair** consolida o conselho coletivo:

\`### 🏛 SÍNTESE — recomendação do Board\`

3-5 linhas que respondem: **dados+vozes do Board juntos, qual é a UMA coisa que o sócio deveria fazer (ou observar) essa semana?** Cita conselheiros que convergiram, aponta a aposta concreta. Se há divergência entre conselheiros, declara honesto ("Munger e Thiel divergem em X — eu fico com Y porque Z").

## Outputs dos módulos (use estes dados, NUNCA invente)

${blocosModulos}

## Resumo técnico (vai NO RODAPÉ, não no topo)
- Módulos rodados: ${sucessos}/${total}${falhas.length ? ` (falhas: ${falhas.join('; ')})` : ''}
- Esses dados vão pro card colapsável "Diagnóstico técnico" — você não precisa repetir no markdown

## Saída
Comece direto pela linha 1 ("☀️ Bom dia..."). NUNCA escreva "Aqui está o relatório:" antes. Só o markdown.`;

  const md = await runClaudeCLISimple(prompt, 120000);
  return md;
}

// ============================================================
// FUNÇÃO PRINCIPAL — gera relatório executivo end-to-end
// ============================================================
async function gerarRelatorioExecutivo({
  cliente_id = null,
  janela_horas = 24,
  dia_alvo_brt = null,
  moeda = 'BRL',
  salvar = true,
  modulos_incluir = ['financeiro', 'agenda', 'triagem-email', 'discord'], // diagnostico_inbox so se janela >= 48h
  parent_id = null, // V2.15: versionamento. Cron passa o ultimo_entregavel_id pra encadear v2, v3, etc.
} = {}) {
  const t_total_0 = Date.now();

  // 1) Resolve sócio (cliente_id + nome)
  const cid = await db.resolverClienteId(cliente_id);
  let socioInfo;
  try { socioInfo = await socio.getSocioAtual(); }
  catch (e) { socioInfo = { cliente_id: cid, slug: 'desconhecido', nome: 'Sócio', empresa: '?' }; }

  // 2) Calcula data alvo BRT (default = ontem se cron 8h, hoje se on-demand)
  const agora = new Date();
  if (!dia_alvo_brt) {
    // Default = ontem em BRT (porque relatorio das 8h fala do que aconteceu ontem)
    const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = fmt.formatToParts(ontem);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    dia_alvo_brt = `${y}-${m}-${d}`;
  }

  // V2.14 D Fix — headline e contexto temporal usam dia_alvo_brt (não 'agora')
  const dataLongaBR = googleCalendar.dataLongaBRdoDiaAlvo(dia_alvo_brt); // ex: "05 de maio"
  const diaSemana   = googleCalendar.diaSemanaBRdoDiaAlvo(dia_alvo_brt); // ex: "terça-feira"

  // V2.15 — HOJE em BRT (data em que o sócio lê o relatório), separado de dia_alvo_brt (data dos DADOS).
  // Saudação reflete HOJE; rodapé "dados de DD" reflete dia_alvo_brt.
  const fmtHoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const partsHoje = fmtHoje.formatToParts(agora);
  const hoje_brt = `${partsHoje.find(p => p.type === 'year').value}-${partsHoje.find(p => p.type === 'month').value}-${partsHoje.find(p => p.type === 'day').value}`;
  const dataHojeBrt   = googleCalendar.dataLongaBRdoDiaAlvo(hoje_brt);
  const diaSemanaHoje = googleCalendar.diaSemanaBRdoDiaAlvo(hoje_brt);

  // Saudacao dinamica BRT (manha < 12h / tarde 12-18h / noite >= 18h)
  const horaBRT = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(agora), 10);
  let saudacao = 'Bom dia';
  if (horaBRT >= 12 && horaBRT < 18) saudacao = 'Boa tarde';
  else if (horaBRT >= 18 || horaBRT < 5) saudacao = 'Boa noite';

  // 3) Roda módulos em paralelo (Munger — falhas isoladas)
  // V2.14 D Fix — TODOS os módulos recebem dia_alvo_brt pra honrar data passada
  const promises = [];
  if (modulos_incluir.includes('financeiro'))     promises.push(modulo_financeiro({ janela_horas, dia_alvo_brt, moeda }));
  if (modulos_incluir.includes('agenda'))         promises.push(modulo_agenda({ cliente_id: cid, dia_alvo_brt }));
  if (modulos_incluir.includes('triagem-email'))  promises.push(modulo_triagem_email({ cliente_id: cid, dia_alvo_brt }));
  if (modulos_incluir.includes('diagnostico-email')) promises.push(modulo_diagnostico_inbox({ cliente_id: cid, dia_alvo_brt }));
  if (modulos_incluir.includes('discord'))        promises.push(modulo_discord({ dia_alvo_brt }));

  const modulosOutputs = await Promise.all(promises);

  // 4) Sintetiza via Claude CLI com Skill compor-executivo-diario
  let md_final;
  let sintetizador_ok = true;
  let sintetizador_motivo = null;
  const fallbackBruto = () =>
    `# Relatório Executivo Diário — ${diaSemana} ${dataLongaBR}\n\n` +
    `> ⚠ Sintetizador (Claude CLI) ${sintetizador_motivo ? 'falhou: ' + sintetizador_motivo : 'devolveu vazio'}.\n> Mostrando módulos brutos.\n\n` +
    modulosOutputs.filter(m => !m.skipped && m.conteudo_md).map(m => m.conteudo_md).join('\n\n---\n\n');
  try {
    md_final = await sintetizarExecutivoDiario({
      socioInfo,
      modulosOutputs,
      dataBrt: dataLongaBR,
      diaSemana,
      janela_horas,
      saudacao,
      dataHojeBrt,
      diaSemanaHoje,
    });
    // Andre 2026-05-12: V2 do teste veio vazio porque CLI retornou "" sem throw.
    // Trata stdout vazio/curto como falha pra disparar fallback bruto.
    if (!md_final || md_final.trim().length < 200) {
      sintetizador_ok = false;
      sintetizador_motivo = `stdout vazio/curto (${md_final ? md_final.trim().length : 0} chars)`;
      md_final = fallbackBruto();
    }
  } catch (e) {
    sintetizador_ok = false;
    sintetizador_motivo = e.message;
    md_final = fallbackBruto();
  }

  // 5) Salva entregável
  let entregavel = null;
  if (salvar) {
    try {
      // Andre 2026-05-13: título reflete HOJE (data em que o sócio lê) + indica
      // dados de DD pra evitar confusão. Antes: "terça-feira 12 de maio" (dia alvo
      // ontem) lido na quarta confundia. Agora: "quarta-feira 13 de maio · dados
      // de 12 de maio".
      const titulo = `Executivo diário — ${diaSemanaHoje} ${dataHojeBrt} · dados de ${dataLongaBR}`;
      entregavel = await db.salvarEntregavel({
        cliente_id: cid,
        tipo: 'relatorio-executivo-diario',
        titulo,
        parent_id, // V2.15 versionamento: cron passa ultimo_entregavel_id; null = v1
        conteudo_md: md_final,
        conteudo_estruturado: {
          janela_horas,
          dia_alvo_brt,
          gerado_em: agora.toISOString(),
          modulos: modulosOutputs.map(m => ({
            slug: m.slug,
            ok: m.ok,
            skipped: m.skipped || false,
            latencia_ms: m.latencia_ms,
            motivo: m.motivo || null,
            estruturado: m.conteudo_estruturado || null,
          })),
          sintetizador: { ok: sintetizador_ok, motivo: sintetizador_motivo },
          socio: socioInfo,
        },
      });
    } catch (e) {
      console.error(`[relatorio-executivo] erro salvando entregavel: ${e.message}`);
    }
  }

  const dur_total = Date.now() - t_total_0;

  return {
    ok: true,
    entregavel_id: entregavel?.id || null,
    entregavel_url: entregavel?.id ? `/entregavel/${entregavel.id}` : null,
    entregavel_versao: entregavel?.versao || null,
    titulo: entregavel ? `Executivo diário — ${diaSemanaHoje} ${dataHojeBrt} · dados de ${dataLongaBR}` : null,
    janela_horas,
    dia_alvo_brt,
    md_final,
    modulos: modulosOutputs.map(m => ({ slug: m.slug, ok: m.ok, skipped: m.skipped || false, latencia_ms: m.latencia_ms, motivo: m.motivo || null })),
    sintetizador: { ok: sintetizador_ok, motivo: sintetizador_motivo },
    duracao_ms: dur_total,
  };
}

module.exports = { gerarRelatorioExecutivo };
