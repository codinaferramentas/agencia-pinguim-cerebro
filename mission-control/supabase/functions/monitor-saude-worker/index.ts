// ========================================================================
// monitor-saude-worker
// ========================================================================
// Vigia o jobs-worker do server-cli. O pg_cron enfileira os relatórios
// diários em pinguim.jobs, mas quem processa é o worker rodando na máquina
// do André (porta 3737 + ngrok). Quando esse processo cai, os jobs ficam
// presos em 'aprovado' e ninguém percebe — falha silenciosa que já deixou
// o André semanas sem relatório (jun/26 e ago/26).
//
// Este edge roda 1x/dia via pg_cron (13h UTC = 10h BRT, ~1h depois do
// último relatório enfileirado) e, se achar job preso há mais de 1h,
// manda alerta no WhatsApp do André via Evolution.
//
// Teste manual: POST com body {"teste": true} envia mensagem de teste.
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const LIMIAR_MINUTOS = 60;
const WHATSAPP_ANDRE = '5511985879361';
const TUNNEL_URL = 'https://almost-pawing-urban.ngrok-free.dev/api/agendamentos/listar?ativos=1';

function sb() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false }, db: { schema: 'pinguim' } },
  );
}

async function enviarWhatsApp(numero: string, texto: string): Promise<boolean> {
  // Mesmo padrão do mundo-ia-motor: credenciais Evolution via cofre.
  try {
    const [urlRaw, apiKey, instRaw] = await Promise.all([
      getChave('EVOLUTION_API_URL', 'monitor-saude-worker'),
      getChave('EVOLUTION_API_KEY', 'monitor-saude-worker'),
      getChave('EVOLUTION_INSTANCE_BOT', 'monitor-saude-worker').catch(() => 'Agente Pinguim'),
    ]);
    const url = (urlRaw || '').trim().replace(/\/+$/, '');
    const instancia = (instRaw || 'Agente Pinguim').trim();
    if (!url || !apiKey) return false;
    const send = await fetch(`${url}/message/sendText/${encodeURIComponent(instancia)}`, {
      method: 'POST',
      headers: { apikey: apiKey.trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: numero, text: texto }),
    });
    return send.ok;
  } catch { return false; }
}

// O tunnel devolve HTML (página de erro do ngrok) quando está caído — por
// isso a checagem exige resposta ok E content-type JSON.
async function tunnelOnline(): Promise<boolean> {
  try {
    const r = await fetch(TUNNEL_URL, {
      headers: { 'ngrok-skip-browser-warning': '1' },
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok && (r.headers.get('content-type') || '').includes('json');
  } catch { return false; }
}

function fmtBRT(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

serve(async (req) => {
  const body = await req.json().catch(() => ({}));

  if (body.teste) {
    const ok = await enviarWhatsApp(WHATSAPP_ANDRE, '✅ *Monitor Pinguim* — teste do monitor de saúde do worker. Se você recebeu isto, o alerta de fila travada está funcional.');
    return new Response(JSON.stringify({ ok, teste: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const corte = new Date(Date.now() - LIMIAR_MINUTOS * 60_000).toISOString();
  const { data: presos, error } = await sb()
    .from('jobs')
    .select('id, tipo_pedido, status, criado_em')
    .in('status', ['aprovado', 'executando'])
    .lt('criado_em', corte)
    .order('criado_em', { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ ok: false, erro: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  if (!presos || presos.length === 0) {
    return new Response(JSON.stringify({ ok: true, presos: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  const online = await tunnelOnline();
  const porTipo = presos.reduce<Record<string, number>>((acc, j) => {
    acc[j.tipo_pedido] = (acc[j.tipo_pedido] || 0) + 1;
    return acc;
  }, {});
  const tipos = Object.entries(porTipo).map(([t, n]) => `${t}: ${n}`).join(', ');

  const texto = [
    '🚨 *Monitor Pinguim — fila travada*',
    '',
    `${presos.length} job(s) presos há mais de ${LIMIAR_MINUTOS}min (${tipos}).`,
    `Mais antigo: ${fmtBRT(presos[0].criado_em)}.`,
    `Server-cli/ngrok: ${online ? 'RESPONDENDO (worker pode ter morrido sozinho)' : 'OFFLINE — subir server-cli + ngrok na máquina do André'}.`,
    '',
    'Se a fila acumulou dias, cancelar o backlog de cron-relatorio ANTES de subir o worker (senão vem enxurrada).',
  ].join('\n');

  const enviado = await enviarWhatsApp(WHATSAPP_ANDRE, texto);
  return new Response(
    JSON.stringify({ ok: true, presos: presos.length, tunnel_online: online, alerta_enviado: enviado }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
