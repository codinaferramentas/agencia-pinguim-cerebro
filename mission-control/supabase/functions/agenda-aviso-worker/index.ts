// ========================================================================
// Edge Function: agenda-aviso-worker
// ========================================================================
// Avisos por WhatsApp das calls marcadas na Agenda Inteligente do CRM (André 17/11/2026).
// São dois disparos por marcação, saindo do WhatsApp da tutora escolhida na tela (Ingrid ou Fernanda):
//   1. CONFIRMAÇÃO: na hora em que a marcação é oficializada (o CRM chama com {id}).
//   2. LEMBRETE: no dia da call, às 9h. Só existe se a marcação foi feita em dia anterior ao da call
//      (marcou e a call é no mesmo dia = só a confirmação).
// Regras de segurança:
//   - No máximo uma vez: a linha é carimbada ANTES do envio. Erro não reenvia sozinho na confirmação
//     (a tela mostra e oferece «Enviar de novo»); o lembrete tenta de novo nos ticks seguintes (até 3).
//   - Antes de enviar, lê o evento no Google Agenda: se foi apagado ou mudou de dia, não envia;
//     se mudou de horário, vale o horário da agenda. O link do Meet vem do evento.
//   - Marcação cancelada ou de teste (sem evento no Google) nunca dispara.
//   - Falha técnica: DM só para o Codina, nunca em canal do time.
// Modos (body): {id} = confirmação · {id, reenviar:true} = repete a confirmação que deu erro
//               · {} = cron do lembrete (job a cada 10 min das 9h às 9h50)
//               · {previa:true, id} = devolve os dois textos, sem enviar · {dry_run:true} = lista o que o cron faria.
// Tabela: pinguim.crm_agenda_sugestao (colunas aviso_* e lembrete_*).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE, { auth: { persistSession: false }, db: { schema: 'pinguim' } });
const CONSUMIDOR = 'agenda-aviso-worker';
const CONTA_GOOGLE = 'luiz@agenciapinguim.com'; // dona das três agendas (só leitura aqui)
const EMAIL_SOCIO: Record<string, string> = { L: 'luiz@agenciapinguim.com', M: 'micha@agenciapinguim.com', P: 'pedro@agenciapinguim.com' };
const NOME_COMPLETO: Record<string, string> = { L: 'Luiz Cota', M: 'Micha Menezes', P: 'Pedro Aredes' };
const VIA: Record<string, { nome: string; chave: string }> = {
  ingrid: { nome: 'Ingrid', chave: 'EVOLUTION_INSTANCE_ALERTAS_GRUPOS' },
  fernanda: { nome: 'Fernanda', chave: 'EVOLUTION_INSTANCE_ELO_FERNANDA' },
};
const DISCORD_CODINA = '1077338884981133413';
const LEMBRETE_HORA = 9, LEMBRETE_ATE = 12, LEMBRETE_TENTATIVAS = 3;
const DS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

// ---------------- datas (horário de Brasília) ----------------
const brt = (d = new Date()) => { const x = new Date(+d - 3 * 3600e3); return { dia: x.toISOString().slice(0, 10), min: x.getUTCHours() * 60 + x.getUTCMinutes() }; };
const hm = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + 'h' + String(m % 60).padStart(2, '0');
const ddmm = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
const diaSemana = (d: string) => DS[new Date(d + 'T12:00:00Z').getUTCDay()];

// ---------------- textos ----------------
const primeiroNome = (n: string) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''; };
const tituloCall = (r: any) => String(r.titulo || '').replace(/\s*1:1\s*/g, ' ').trim() + ' | 1:1 com ' + NOME_COMPLETO[r.socio];
type Quando = { dia: string; ini: number; fim: number; meet: string | null };
function textoConfirmacao(r: any, q: Quando, temLembrete: boolean) {
  return [
    `Olá, ${primeiroNome(r.aluno_nome)}! Tudo bem?`,
    '',
    `Aqui é a ${VIA[r.aviso_via].nome}, da equipe Pinguim. O seu encontro está agendado:`,
    '',
    `*${tituloCall(r)}*`,
    `🗓 ${diaSemana(q.dia)}, ${ddmm(q.dia)}`,
    `⏰ das ${hm(q.ini)} às ${hm(q.fim)} (horário de Brasília)`,
    q.meet ? `🔗 ${q.meet}` : '',
    '',
    temLembrete ? 'No dia do encontro, envio um lembrete por aqui com o link.' : '',
    'Em caso de dúvida ou imprevisto, responda esta mensagem.',
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
}
function textoLembrete(r: any, q: Quando) {
  return [
    `Olá, ${primeiroNome(r.aluno_nome)}! Bom dia!`,
    '',
    `Aqui é a ${VIA[r.aviso_via].nome}, da equipe Pinguim. Lembrando que hoje é o dia do seu encontro:`,
    '',
    `*${tituloCall(r)}*`,
    `🗓 hoje, ${diaSemana(q.dia)}, ${ddmm(q.dia)}`,
    `⏰ das ${hm(q.ini)} às ${hm(q.fim)} (horário de Brasília)`,
    q.meet ? `🔗 ${q.meet}` : '',
    '',
    'Até logo!',
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
}

// ---------------- Google Agenda (só leitura) ----------------
let tokCache: string | null = null;
async function tokenGoogle(): Promise<string> {
  if (tokCache) return tokCache;
  const { data: c } = await sb.from('conexoes_google').select('refresh_token').eq('email_google', CONTA_GOOGLE).is('revogado_em', null).limit(1).maybeSingle();
  if (!c) throw new Error('conexão Google das agendas não encontrada');
  const [id, sec] = await Promise.all([getChave('GOOGLE_OAUTH_CLIENT_ID', CONSUMIDOR), getChave('GOOGLE_OAUTH_CLIENT_SECRET', CONSUMIDOR)]);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: c.refresh_token, client_id: id, client_secret: sec, grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google: ' + (j.error_description || j.error));
  return (tokCache = j.access_token);
}
// Devolve o que está valendo na agenda do sócio: { existe:false } se o evento saiu; senão dia/horário/Meet de lá.
async function eventoNoGoogle(r: any): Promise<{ existe: boolean } & Partial<Quando>> {
  const x = await fetch('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(EMAIL_SOCIO[r.socio]) + '/events/' + encodeURIComponent(r.google_event_id),
    { headers: { Authorization: 'Bearer ' + await tokenGoogle() } });
  if (x.status === 404 || x.status === 410) return { existe: false };
  if (!x.ok) throw new Error('Google Agenda respondeu ' + x.status + ' ao ler o evento');
  const j = await x.json();
  if (j.status === 'cancelled' || !j.start?.dateTime) return { existe: false };
  const a = brt(new Date(j.start.dateTime)), b = brt(new Date(j.end.dateTime));
  const meet = j.hangoutLink || (j.conferenceData?.entryPoints || []).find((p: any) => p.entryPointType === 'video')?.uri || null;
  return { existe: true, dia: a.dia, ini: a.min, fim: b.dia === a.dia ? b.min : 1440, meet };
}

// ---------------- Evolution ----------------
async function enviarWhats(via: string, whats: string, texto: string): Promise<void> {
  const chave = VIA[via].chave;
  const [base, inst, tok] = await Promise.all([getChave('EVOLUTION_API_URL', CONSUMIDOR), getChave(chave, CONSUMIDOR), getChave(chave + '_TOKEN', CONSUMIDOR)]);
  const raiz = base.replace(/\/$/, ''), i = encodeURIComponent(inst), h = { 'Content-Type': 'application/json', apikey: tok };
  const dig = String(whats || '').replace(/\D/g, '');
  const numero = dig.length === 10 || dig.length === 11 ? '55' + dig : dig;
  // O próprio WhatsApp diz qual é o número certo (com ou sem o nono dígito).
  let destino = numero;
  const c = await fetch(`${raiz}/chat/whatsappNumbers/${i}`, { method: 'POST', headers: h, body: JSON.stringify({ numbers: [numero] }) });
  if (c.ok) {
    const j = await c.json().catch(() => []);
    const achado = Array.isArray(j) ? j[0] : null;
    if (achado && achado.exists === false) throw new Error('o número ' + numero + ' não tem WhatsApp');
    if (achado?.jid) destino = achado.jid;
  } else if (c.status === 401 || c.status === 404) throw new Error(`o WhatsApp da ${VIA[via].nome} não respondeu (${c.status})`);
  const url = `${raiz}/message/sendText/${i}`;
  let r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ number: destino, text: texto }) });
  if (r.status === 400) r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ number: destino, textMessage: { text: texto } }) });
  if (!r.ok) throw new Error(`o WhatsApp da ${VIA[via].nome} recusou o envio (${r.status}): ` + (await r.text()).slice(0, 160));
}

async function dmCodina(texto: string) {
  try {
    const bot = await getChave('DISCORD_BOT_TOKEN', CONSUMIDOR), h = { Authorization: `Bot ${bot}`, 'Content-Type': 'application/json' };
    const c = await (await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers: h, body: JSON.stringify({ recipient_id: DISCORD_CODINA }) })).json();
    if (c?.id) await fetch(`https://discord.com/api/v10/channels/${c.id}/messages`, { method: 'POST', headers: h, body: JSON.stringify({ content: texto.slice(0, 1900) }) });
  } catch (_) { /* aviso técnico não pode derrubar o envio */ }
}
const rotulo = (r: any) => `${tituloCall(r)} · ${r.aluno_nome} · ${ddmm(r.dia)} ${hm(r.ini)}`;
// o lembrete só existe quando a marcação foi feita em dia anterior ao da call
const temLembrete = (r: any, dia: string) => !!r.oficializado_em && brt(new Date(r.oficializado_em)).dia < dia;

// ---------------- confirmação (na hora da marcação) ----------------
async function confirmar(id: string, reenviar: boolean, previa: boolean) {
  const { data: r } = await sb.from('crm_agenda_sugestao').select('*').eq('id', id).maybeSingle();
  if (!r) return { ok: false, erro: 'Marcação não encontrada.' };
  if (!VIA[r.aviso_via]) return { ok: true, enviado: false, motivo: 'Marcação sem aviso por WhatsApp.' };
  if (r.status !== 'ok' || !r.google_event_id) return { ok: true, enviado: false, motivo: 'Só marcações oficializadas no Google Agenda recebem aviso.' };
  const g = await eventoNoGoogle(r);
  if (!g.existe) return { ok: false, erro: 'O evento não está mais no Google Agenda. O aviso não foi enviado.' };
  const q = g as Quando;
  if (previa) return { ok: true, via: r.aviso_via, para: r.aluno_whatsapp, confirmacao: textoConfirmacao(r, q, temLembrete(r, q.dia)), lembrete: temLembrete(r, q.dia) ? textoLembrete(r, q) : null };
  if (r.aviso_status === 'enviado') return { ok: true, enviado: false, jaEnviado: true };
  // carimbo antes do envio: duas chamadas ao mesmo tempo, só uma passa
  let trava = sb.from('crm_agenda_sugestao').update({ aviso_em: new Date().toISOString(), aviso_status: 'enviando', aviso_erro: null, meet_link: q.meet }).eq('id', id);
  trava = reenviar ? trava.or('aviso_status.eq.erro,aviso_em.is.null') : trava.is('aviso_em', null);
  const { data: minha } = await trava.select('id');
  if (!minha?.length) return { ok: true, enviado: false, jaEnviado: true };
  try {
    await enviarWhats(r.aviso_via, r.aluno_whatsapp, textoConfirmacao(r, q, temLembrete(r, q.dia)));
    await sb.from('crm_agenda_sugestao').update({ aviso_status: 'enviado', aviso_em: new Date().toISOString() }).eq('id', id);
    return { ok: true, enviado: true, via: r.aviso_via };
  } catch (e) {
    const erro = String((e as Error).message || e).slice(0, 300);
    await sb.from('crm_agenda_sugestao').update({ aviso_status: 'erro', aviso_erro: erro }).eq('id', id);
    await dmCodina(`⚠️ **Agenda Inteligente:** a confirmação por WhatsApp não saiu.\n${rotulo(r)} · pelo número da ${VIA[r.aviso_via].nome}\nMotivo: ${erro}\nA tela do CRM mostrou o erro e oferece «Enviar de novo».`);
    return { ok: false, enviado: false, erro };
  }
}

// ---------------- lembrete (cron, 9h do dia da call) ----------------
async function lembretes(dryRun: boolean, simularAgora?: string) {
  const agora = brt(simularAgora ? new Date(simularAgora) : new Date());
  if (agora.min < LEMBRETE_HORA * 60 || agora.min >= LEMBRETE_ATE * 60) return { ok: true, fora_do_horario: true, agora };
  const { data: linhas, error } = await sb.from('crm_agenda_sugestao').select('*').eq('status', 'ok').eq('dia', agora.dia)
    .not('google_event_id', 'is', null).not('aviso_via', 'is', null).or('lembrete_status.is.null,lembrete_status.eq.erro').lt('lembrete_tentativas', LEMBRETE_TENTATIVAS);
  if (error) throw new Error(error.message);
  const resultado: string[] = [];
  for (const r of linhas || []) {
    if (!VIA[r.aviso_via]) continue;
    const fecha = (status: string, motivo: string) => dryRun ? null : sb.from('crm_agenda_sugestao').update({ lembrete_status: status, lembrete_erro: motivo, lembrete_em: new Date().toISOString() }).eq('id', r.id);
    if (!temLembrete(r, r.dia)) { await fecha('pulado', 'marcada no mesmo dia da call: só a confirmação'); resultado.push(`pulado (marcada hoje): ${rotulo(r)}`); continue; }
    let g;
    try { g = await eventoNoGoogle(r); } catch (e) { resultado.push(`adiado (${(e as Error).message}): ${rotulo(r)}`); continue; }
    if (!g.existe) { await fecha('pulado', 'o evento saiu do Google Agenda'); resultado.push(`pulado (evento saiu da agenda): ${rotulo(r)}`); continue; }
    const q = g as Quando;
    if (q.dia !== agora.dia) { await fecha('pulado', 'o evento mudou para ' + ddmm(q.dia) + ' no Google Agenda'); resultado.push(`pulado (mudou de dia na agenda): ${rotulo(r)}`); continue; }
    if (q.ini <= agora.min) { await fecha('pulado', 'a call já tinha começado às 9h'); resultado.push(`pulado (call já começou): ${rotulo(r)}`); continue; }
    const texto = textoLembrete(r, q);
    if (dryRun) { resultado.push(`enviaria pelo número da ${VIA[r.aviso_via].nome} para ${r.aluno_whatsapp}: ${rotulo(r)}\n${texto}`); continue; }
    // carimbo antes do envio (a linha só é minha se ninguém a pegou desde a leitura)
    let trava = sb.from('crm_agenda_sugestao').update({ lembrete_status: 'enviando', lembrete_em: new Date().toISOString(), lembrete_tentativas: (r.lembrete_tentativas || 0) + 1, meet_link: q.meet }).eq('id', r.id).eq('lembrete_tentativas', r.lembrete_tentativas || 0);
    trava = r.lembrete_status ? trava.eq('lembrete_status', 'erro') : trava.is('lembrete_status', null);
    const { data: minha } = await trava.select('id');
    if (!minha?.length) continue;
    try {
      await enviarWhats(r.aviso_via, r.aluno_whatsapp, texto);
      await sb.from('crm_agenda_sugestao').update({ lembrete_status: 'enviado', lembrete_erro: null, lembrete_em: new Date().toISOString() }).eq('id', r.id);
      resultado.push(`enviado: ${rotulo(r)}`);
    } catch (e) {
      const erro = String((e as Error).message || e).slice(0, 300), ultima = (r.lembrete_tentativas || 0) + 1 >= LEMBRETE_TENTATIVAS;
      await sb.from('crm_agenda_sugestao').update({ lembrete_status: 'erro', lembrete_erro: erro }).eq('id', r.id);
      if (ultima) await dmCodina(`⚠️ **Agenda Inteligente:** o lembrete do dia não saiu depois de ${LEMBRETE_TENTATIVAS} tentativas.\n${rotulo(r)} · pelo número da ${VIA[r.aviso_via].nome}\nMotivo: ${erro}`);
      resultado.push(`erro (${erro}): ${rotulo(r)}`);
    }
  }
  return { ok: true, agora, analisadas: (linhas || []).length, resultado };
}

serve(async (req) => {
  // só o CRM (servidor) e o cron chamam: os dois usam a chave de serviço
  const cracha = (req.headers.get('authorization') || '').replace('Bearer ', '');
  let papel = ''; try { papel = JSON.parse(atob(cracha.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch (_) { /* não é JWT */ }
  // a assinatura do JWT já foi conferida na entrada da função; aqui só passa quem tem o papel de serviço
  if (cracha !== SERVICE && papel !== 'service_role') return new Response(JSON.stringify({ ok: false, erro: 'nao autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  let body: any = {}; try { body = await req.json(); } catch (_) { /* cron sem corpo */ }
  try {
    const out = body.id ? await confirmar(String(body.id), !!body.reenviar, !!body.previa) : await lembretes(!!body.dry_run, body.simular_agora);
    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    const erro = String((e as Error).message || e);
    if (!body.id && !body.dry_run) await dmCodina(`⚠️ **Agenda Inteligente:** o robô do lembrete falhou.\n${erro.slice(0, 500)}`);
    return new Response(JSON.stringify({ ok: false, erro }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
