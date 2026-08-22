// ========================================================================
// Edge Function: bia-followup-worker  (cron pg_cron */5)
// ========================================================================
// Motor de follow-up da Bia (docs/AGENTE-BIA-VENDAS-PROALT.md §6.4):
//
//   1. RETOMADA ~20min — conversa aberta, Bia falou por último, lead mudo
//      há 20min+, nenhum follow-up enviado ainda → 1 mensagem contextual
//      leve. Agenda o toque do dia seguinte (ultima_msg_lead + 21h, nunca
//      antes das 7h30 BRT → sempre DENTRO da janela de 24h da Meta).
//   2. AGENDADOS — bia_followups pendentes com agendado_para vencido:
//      chama_mais_tarde (botão do template, +2h30) e dia_seguinte.
//   3. ENCERRAMENTO — 2 follow-ups enviados + 48h de silêncio → fecha
//      conversa (resultado 'sem_resposta'), lead 'encerrado'. Silêncio > insistência.
//
// SEGURANÇA antes de QUALQUER envio (nesta ordem, tudo re-checado na hora):
//   optout → humano → JÁ COMPROU (consulta app ProAlt em tempo real — regra
//   Andre 2026-08-22) → lead respondeu nesse meio tempo → janela Meta 24h.
//
// Modo de envio (pinguim.bia_config 'followup_modo'):
//   'dry-run' (default) — gera a mensagem e grava como papel 'sistema'
//     '[dry-run followup] ...' SEM enviar nada. Pra validar antes da F4.
//   'ativo' — envia via API Unichat (config 'unichat_envio_url' + cofre
//     UNICHAT_API_TOKEN) e grava como papel 'bia'.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireAuthTool, corsTool, jsonRespTool } from '../_shared/auth-tool.ts';
import { chamarLLM, logarCustoFinOps, calcularCustoUSD } from '../_shared/agente.ts';
import { getChave } from '../_shared/cofre.ts';
import { variantesTelefoneBR, orTelefonePostgrest } from '../_shared/telefone-br.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MODELO = 'openai:gpt-5.5';
const RETOMADA_MIN = 20;              // silêncio pra 1ª retomada
const DIA_SEGUINTE_HORAS = 21;        // ultima_msg_lead + 21h (≤24h da janela Meta)
const ENCERRAR_HORAS = 48;            // silêncio pós-2º toque → encerra
const JANELA_META_HORAS = 23.5;       // margem de segurança da janela de 24h

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: 'pinguim' },
  });
}

// ---- trava de compra (mesma lógica da edge principal) -------------------
const PROALT_APP_REST = 'https://vdrlvflludyqkyhfoiwb.supabase.co/rest/v1';
const PLANO_FULL_PROALT = '2cf21005-9c84-4c60-8566-782809edc41b';

async function jaComprouProAlt(telefone: string, email: string | null): Promise<boolean> {
  try {
    const key = await getChave('PROALT_SERVICE_ROLE_KEY', 'bia-followup-worker');
    if (!key) return false;
    const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` };
    const variantes = variantesTelefoneBR(telefone);
    const filtros: string[] = [];
    if (variantes.length) filtros.push(orTelefonePostgrest('phone', variantes));
    if (email) filtros.push(`email=eq.${encodeURIComponent(email.toLowerCase())}`);
    const userIds = new Set<string>();
    for (const filtro of filtros) {
      const r = await fetch(`${PROALT_APP_REST}/profiles?select=user_id&${filtro}&limit=10`, { headers });
      if (!r.ok) continue;
      for (const p of await r.json()) if (p.user_id) userIds.add(p.user_id);
    }
    if (userIds.size === 0) return false;
    const r2 = await fetch(
      `${PROALT_APP_REST}/user_plans?select=user_id&user_id=in.(${[...userIds].join(',')})&plan_id=eq.${PLANO_FULL_PROALT}&limit=1`,
      { headers },
    );
    return r2.ok && (await r2.json()).length > 0;
  } catch { return false; } // fail-open: na dúvida NÃO marca comprado (mas ver nota abaixo)
}

// ---- geração da mensagem ------------------------------------------------
async function gerarFollowup(
  tipo: 'retomada_20min' | 'chama_mais_tarde' | 'dia_seguinte',
  lead: any,
  historico: Array<{ papel: string; conteudo: string }>,
): Promise<{ texto: string; tokensIn: number; tokensOut: number; tokensCached: number; modelo: string }> {
  const primeiro = (lead.nome || '').split(' ')[0] || null;
  const instrucoes: Record<string, string> = {
    retomada_20min:
      'O lead parou de responder há ~20 minutos, no meio da conversa. Escreva UMA mensagem CURTA e leve de retomada. ' +
      'Se a conversa parou numa pergunta sua, relembre com leveza ("ficou uma pergunta tua no ar 🙂"). ' +
      'Se parou depois da oferta, mande um ATIVO (referência a um case/número já citado na conversa), nunca cobrança. ' +
      'PROIBIDO: "oi sumido", "conseguiu ver?", "e aí, pensou?", pressão, link de checkout.',
    chama_mais_tarde:
      'O lead clicou "Me chama mais tarde" no template inicial (sobre a condição especial do ProAlt pra quem fez o Desafio Low Ticket) e agora chegou a hora prometida. ' +
      'Escreva UMA mensagem curta e simpática honrando a promessa ("prometido é devido" vibe, sem essa frase clichê) e reabrindo: ' +
      'reancore no desafio em meia frase e faça UMA pergunta leve de abertura. Nada de oferta ainda.',
    dia_seguinte:
      'Último toque: o lead sumiu ontem e a retomada leve não teve resposta. Escreva UMA mensagem no formato no-oriented do Chris Voss: ' +
      'retome a DOR ESPECÍFICA que o lead verbalizou (use as palavras dele, do histórico) e pergunte "você desistiu de [objetivo dele]?" (a resposta natural "não" reabre a conversa). ' +
      'Alternativa se o lead era racional/numérico: a matemática do custo da inação com os números QUE ELE deu. ' +
      'Tom calmo, zero desespero, zero desconto, zero link. Se não houver dor clara no histórico, pergunta aberta e honesta sobre o que faltou.',
  };

  const systemPrompt =
    `Você é a Bia, assistente do time do Pedro Aredes, vendedora consultiva do ProAlt no WhatsApp. ` +
    `${primeiro ? `O lead se chama ${primeiro}. ` : ''}` +
    `Português brasileiro natural, informal-profissional, no máximo 1 emoji, mensagem de WhatsApp CURTA (1-2 frases, máx ~200 caracteres). ` +
    `Responda APENAS com o texto da mensagem — sem aspas, sem markdown, sem explicação.\n\nTAREFA: ${instrucoes[tipo]}`;

  const contexto = historico.length
    ? 'HISTÓRICO RECENTE DA CONVERSA (mais antigo → mais novo):\n' +
      historico.map(m => `${m.papel === 'lead' ? 'LEAD' : m.papel === 'bia' ? 'BIA' : 'SISTEMA'}: ${m.conteudo.slice(0, 300)}`).join('\n')
    : 'Ainda não houve conversa além do template inicial.';

  const llm = await chamarLLM({
    modelo: MODELO,
    systemPrompt,
    messages: [{ role: 'user', content: contexto }],
    maxTokens: 300,
  }, 'bia-followup-worker');

  return { texto: (llm.content || '').trim().replace(/^["“]|["”]$/g, ''), tokensIn: llm.tokensIn, tokensOut: llm.tokensOut, tokensCached: llm.tokensCached, modelo: llm.modeloUsado };
}

// ---- envio --------------------------------------------------------------
// Reusa o MESMO canal de entrega da edge principal: o Fluxo 3 "Resposta da IA"
// da Unichat (config unichat_resposta_url), com o mesmo payload que ela já
// entrega. Assim o follow-up sai pelo caminho já testado e funcionando.
async function enviar(
  modo: string,
  config: Record<string, string>,
  telefone: string,
  texto: string,
): Promise<{ ok: boolean; dry: boolean; erro?: string }> {
  if (modo !== 'ativo') return { ok: true, dry: true };
  const url = config['unichat_resposta_url'];
  if (!url || url === 'PENDENTE') return { ok: false, dry: false, erro: 'unichat_resposta_url não configurada' };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefone, nome: null, mensagens: [texto], resposta: texto, anexos: [], lead_estado: 'conversando' }),
    });
    if (!r.ok) return { ok: false, dry: false, erro: `fluxo3 ${r.status}: ${(await r.text()).slice(0, 150)}` };
    return { ok: true, dry: false };
  } catch (e) {
    return { ok: false, dry: false, erro: String(e?.message || e) };
  }
}

// ---- helpers ------------------------------------------------------------
function proxDiaSeguinteISO(ultimaMsgLead: string): string {
  const base = new Date(new Date(ultimaMsgLead).getTime() + DIA_SEGUINTE_HORAS * 3600_000);
  // nunca antes das 7h30 BRT (UTC-3 → 10:30 UTC); empurrar mantém ≤23h30 da janela
  const horaBRT = (base.getUTCHours() - 3 + 24) % 24;
  if (horaBRT < 7.5) {
    base.setUTCHours(10, 30, 0, 0);
    if (base.getTime() < Date.now()) base.setUTCDate(base.getUTCDate() + 1);
  }
  return base.toISOString();
}

function dentroJanelaMeta(ultimaMsgLead: string | null): boolean {
  if (!ultimaMsgLead) return false;
  return Date.now() - new Date(ultimaMsgLead).getTime() < JANELA_META_HORAS * 3600_000;
}

// ========================================================================
// Handler
// ========================================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsTool });
  if (!(await requireAuthTool(req))) return jsonRespTool({ error: 'não autorizado' }, 401);

  const t0 = Date.now();
  const db = sb();
  const { data: cfgRows } = await db.from('bia_config').select('chave, valor');
  const config: Record<string, string> = {};
  (cfgRows || []).forEach((r: any) => { config[r.chave] = r.valor; });
  const modo = config['followup_modo'] || 'dry-run';

  const stats = {
    modo,
    retomadas: 0, agendados_enviados: 0, encerradas: 0,
    pulados: { comprou: 0, optout_ou_estado: 0, respondeu: 0, fora_janela: 0, erro_envio: 0 },
  };
  let tokensIn = 0, tokensOut = 0, tokensCached = 0;
  let modeloUsado = MODELO;

  const agora = Date.now();

  async function despachar(
    tipo: 'retomada_20min' | 'chama_mais_tarde' | 'dia_seguinte',
    lead: any,
    conversa: any,
  ): Promise<'enviado' | 'pulado'> {
    // segurança na ordem: estado → compra em tempo real → janela
    if (lead.optout || ['optout', 'humano', 'comprou', 'comprou_antes', 'encerrado'].includes(lead.estado)) {
      stats.pulados.optout_ou_estado++;
      return 'pulado';
    }
    if (await jaComprouProAlt(lead.telefone, lead.email || null)) {
      await db.from('bia_leads').update({ estado: 'comprou', atualizado_em: new Date().toISOString() }).eq('id', lead.id);
      await db.from('bia_conversas').update({ resultado: 'venda', etapa: 'pos', atualizado_em: new Date().toISOString() }).eq('id', conversa.id);
      await db.from('bia_followups').update({ status: 'cancelado' }).eq('lead_id', lead.id).eq('status', 'pendente');
      await db.from('bia_mensagens').insert({ conversa_id: conversa.id, papel: 'sistema', conteudo: '[trava followup] compra aprovada detectada — follow-up abortado' });
      stats.pulados.comprou++;
      return 'pulado';
    }
    if (tipo !== 'chama_mais_tarde' && !dentroJanelaMeta(conversa.ultima_msg_lead_em)) {
      stats.pulados.fora_janela++;
      return 'pulado';
    }

    const { data: histRows } = await db.from('bia_mensagens')
      .select('papel, conteudo').eq('conversa_id', conversa.id)
      .order('criado_em', { ascending: false }).limit(14);
    const historico = (histRows || []).reverse();

    const g = await gerarFollowup(tipo, lead, historico);
    tokensIn += g.tokensIn; tokensOut += g.tokensOut; tokensCached += g.tokensCached; modeloUsado = g.modelo;

    const env = await enviar(modo, config, lead.telefone, g.texto);
    if (!env.ok) {
      stats.pulados.erro_envio++;
      await db.from('bia_mensagens').insert({ conversa_id: conversa.id, papel: 'sistema', conteudo: `[followup ${tipo} FALHOU] ${env.erro}` });
      return 'pulado';
    }

    await db.from('bia_mensagens').insert({
      conversa_id: conversa.id,
      papel: env.dry ? 'sistema' : 'bia',
      conteudo: env.dry ? `[dry-run followup ${tipo}] ${g.texto}` : g.texto,
    });
    await db.from('bia_conversas').update({
      ultima_msg_bia_em: new Date().toISOString(),
      followups_enviados: (conversa.followups_enviados || 0) + (tipo === 'chama_mais_tarde' ? 0 : 1),
      atualizado_em: new Date().toISOString(),
    }).eq('id', conversa.id);
    return 'enviado';
  }

  // ---------------------------------------------------------------
  // 1. RETOMADAS ~20min
  // ---------------------------------------------------------------
  const corte20 = new Date(agora - RETOMADA_MIN * 60_000).toISOString();
  const { data: paraRetomar } = await db.from('bia_conversas')
    .select('*, lead:bia_leads(*)')
    .eq('aberta', true)
    .eq('followups_enviados', 0)
    .not('ultima_msg_bia_em', 'is', null)
    .not('ultima_msg_lead_em', 'is', null)
    .lte('ultima_msg_bia_em', corte20)
    .limit(30);

  for (const conv of paraRetomar || []) {
    const lead = conv.lead;
    if (!lead) continue;
    // Bia falou por último? (lead mudo desde a última da Bia)
    if (new Date(conv.ultima_msg_lead_em) >= new Date(conv.ultima_msg_bia_em)) continue;
    const r = await despachar('retomada_20min', lead, conv);
    if (r === 'enviado') {
      stats.retomadas++;
      // agenda o último toque (dia seguinte)
      await db.from('bia_followups').insert({
        lead_id: lead.id,
        conversa_id: conv.id,
        tipo: 'dia_seguinte',
        agendado_para: proxDiaSeguinteISO(conv.ultima_msg_lead_em),
      });
    }
  }

  // ---------------------------------------------------------------
  // 2. AGENDADOS vencidos (chama_mais_tarde + dia_seguinte)
  // ---------------------------------------------------------------
  const { data: vencidos } = await db.from('bia_followups')
    .select('*, lead:bia_leads(*), conversa:bia_conversas(*)')
    .eq('status', 'pendente')
    .lte('agendado_para', new Date(agora).toISOString())
    .limit(30);

  for (const fu of vencidos || []) {
    const lead = fu.lead;
    let conversa = fu.conversa;
    if (!lead) continue;
    if (!conversa) {
      // chama_mais_tarde do template pode não ter conversa ainda — abre uma
      const { data: nova } = await db.from('bia_conversas').insert({ lead_id: lead.id }).select('*').single();
      conversa = nova;
      if (!conversa) continue;
    }
    // lead respondeu depois do agendamento? follow-up morreu (a conversa viva manda)
    if (conversa.ultima_msg_lead_em && new Date(conversa.ultima_msg_lead_em) > new Date(fu.criado_em)) {
      await db.from('bia_followups').update({ status: 'cancelado' }).eq('id', fu.id);
      stats.pulados.respondeu++;
      continue;
    }
    const r = await despachar(fu.tipo === 'chama_mais_tarde' ? 'chama_mais_tarde' : 'dia_seguinte', lead, conversa);
    await db.from('bia_followups').update({
      status: r === 'enviado' ? 'enviado' : 'cancelado',
      enviado_em: r === 'enviado' ? new Date().toISOString() : null,
    }).eq('id', fu.id);
    if (r === 'enviado') {
      stats.agendados_enviados++;
      if (fu.tipo === 'chama_mais_tarde') {
        await db.from('bia_leads').update({ estado: 'conversando', atualizado_em: new Date().toISOString() }).eq('id', lead.id);
      }
    }
  }

  // ---------------------------------------------------------------
  // 3. ENCERRAMENTO (2 toques + 48h de silêncio)
  // ---------------------------------------------------------------
  const corte48 = new Date(agora - ENCERRAR_HORAS * 3600_000).toISOString();
  const { data: paraEncerrar } = await db.from('bia_conversas')
    .select('id, lead_id')
    .eq('aberta', true)
    .gte('followups_enviados', 2)
    .lte('ultima_msg_bia_em', corte48)
    .limit(50);

  for (const conv of paraEncerrar || []) {
    await db.from('bia_conversas').update({ aberta: false, resultado: 'sem_resposta', atualizado_em: new Date().toISOString() }).eq('id', conv.id);
    await db.from('bia_leads').update({ estado: 'encerrado', atualizado_em: new Date().toISOString() }).eq('id', conv.lead_id);
    stats.encerradas++;
  }

  // ---------------------------------------------------------------
  // custo
  // ---------------------------------------------------------------
  if (tokensIn + tokensOut > 0) {
    const custoUSD = calcularCustoUSD(modeloUsado, tokensIn, tokensOut, tokensCached);
    await logarCustoFinOps({
      agenteSlug: 'bia-followup-worker', modelo: modeloUsado, custoUSD,
      tokensIn, tokensOut, tokensCached,
    }).catch(() => {});
  }

  return jsonRespTool({ ok: true, ...stats, latencia_ms: Date.now() - t0 });
});
