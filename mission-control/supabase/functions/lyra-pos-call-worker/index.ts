// ========================================================================
// Edge Function: lyra-pos-call-worker
// ========================================================================
// Pós-call da Lyra (André 23/11/2026). Depois que o Raio-X (mentoria-call-raiox-worker) conclui uma call individual
// da LYRA com o MICHA (onboarding ou acompanhamento; Express e outros produtos ficam de fora):
//   1. Data da próxima call: a combinada na call ("lá pro dia 5") ou 30 dias depois. Toda call da Lyra gera a próxima.
//   2. Marca a próxima call (1 h) pela Agenda Inteligente do CRM (mesmo motor e regras da tela: Google, Meet, aluno
//      convidado). Sem horário fora do bloqueio «Não marcar nada» = não marca (vira pendência da Fernanda).
//   3. PDF do aluno: só o plano de ação (o Raio-X interno não vai para o aluno), na pasta da call, com link compartilhado.
//   4. WhatsApp da Fernanda: mensagem com o PDF; config.espera_seg depois, a confirmação da próxima call (a mesma da
//      Agenda Inteligente, pela edge agenda-aviso-worker, que também manda o lembrete das 9h do dia).
//   5. #avisos-de-calls marcando a Fernanda: "já agendei" (ela muda na Agenda Inteligente se quiser) ou "pendência".
//   Aluno sem WhatsApp ou sem e-mail: nada vai ao aluno; vira pendência da Fernanda.
// Modos (body): {} = cron (só com config.poscall.ativo, calls a partir de poscall.desde)
//   · {call_id, teste_para:"119…"} = exemplo: gera o PDF, SIMULA a agenda (não marca) e manda as duas mensagens só
//     para o número de teste; o aviso da Fernanda vai no privado do Codina. Não grava nada na call.
//   · {call_id} = roda uma call agora (de verdade).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE, { auth: { persistSession: false }, db: { schema: 'pinguim' } });
const CONSUMIDOR = 'lyra-pos-call-worker';
const CONTA_CALLS = 'contato@agenciapinguim.com';
const CRM = 'https://crm-pinguim.vercel.app';
const DISCORD_CODINA = '1077338884981133413';
const VIA: Record<string, { nome: string; chave: string }> = {
  fernanda: { nome: 'Fernanda', chave: 'EVOLUTION_INSTANCE_ELO_FERNANDA' },
  ingrid: { nome: 'Ingrid', chave: 'EVOLUTION_INSTANCE_ALERTAS_GRUPOS' },
};
const DS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const brt = (d = new Date()) => { const x = new Date(+d - 3 * 3600e3); return { dia: x.toISOString().slice(0, 10), min: x.getUTCHours() * 60 + x.getUTCMinutes() }; };
const somaDias = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const hm = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + 'h' + String(m % 60).padStart(2, '0');
const ddmm = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
const diaSemana = (d: string) => DS[new Date(d + 'T12:00:00Z').getUTCDay()];
const primeiro = (n: string) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''; };
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const erroTxt = (e: unknown) => String((e as Error).message || e).slice(0, 300);

// ---------------- Google (Drive do contato@, dono das pastas das calls) ----------------
async function tokenGoogle(conta = CONTA_CALLS): Promise<string> {
  const { data: c } = await sb.from('conexoes_google').select('refresh_token').eq('email_google', conta).is('revogado_em', null).limit(1).maybeSingle();
  if (!c) throw new Error(`conexão Google de ${conta} não encontrada`);
  const [id, sec] = await Promise.all([getChave('GOOGLE_OAUTH_CLIENT_ID', CONSUMIDOR), getChave('GOOGLE_OAUTH_CLIENT_SECRET', CONSUMIDOR)]);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: c.refresh_token, client_id: id, client_secret: sec, grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google: ' + (j.error_description || j.error));
  return j.access_token;
}
async function subir(tok: string, pasta: string, nome: string, conteudo: Uint8Array | string, mimeOrigem: string, mimeDestino?: string) {
  const fronteira = 'lyra' + crypto.randomUUID(), enc = new TextEncoder();
  const meta = JSON.stringify({ name: nome, parents: [pasta], ...(mimeDestino ? { mimeType: mimeDestino } : {}) });
  const corpo = typeof conteudo === 'string' ? enc.encode(conteudo) : conteudo;
  const partes = [enc.encode(`--${fronteira}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${fronteira}\r\nContent-Type: ${mimeOrigem}\r\n\r\n`), corpo, enc.encode(`\r\n--${fronteira}--`)];
  const total = new Uint8Array(partes.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of partes) { total.set(p, o); o += p.length; }
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': `multipart/related; boundary=${fronteira}` }, body: total });
  const j = await r.json();
  if (!j.id) throw new Error('subir no Drive: ' + JSON.stringify(j).slice(0, 200));
  return j as { id: string; webViewLink: string };
}
async function compartilhar(tok: string, id: string) { // qualquer pessoa com o link pode VER (o aluno abre sem pedir acesso)
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions?supportsAllDrives=true&sendNotificationEmail=false`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
  if (!r.ok) throw new Error('compartilhar PDF: ' + r.status);
}
async function apagar(tok: string, id: string) { await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } }).catch(() => null); }

// ---------------- 1. data da próxima call (combinada na call ou 30 dias) ----------------
async function dataCombinada(c: any, modelo: string): Promise<{ tipo: string; data: string; trecho: string }> {
  const r = c.raio || {}, quando = brt(new Date(c.inicio)).dia;
  const fonte = JSON.stringify({ resumo: r.resumo, plano: r.plano_de_acao_do_aluno, compromissos: r.compromissos_do_mentor_e_time, decisoes: r.decisoes, checar: r.checar_na_proxima_call });
  const k = await getChave('OPENAI_API_KEY', CONSUMIDOR);
  const resp = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelo, messages: [
      { role: 'system', content: `Diga se mentor e aluno combinaram QUANDO será o PRÓXIMO ENCONTRO entre eles (não prazos de tarefas, não aulas, não lançamentos do aluno).
tipo "em": combinaram um dia ("lá pro dia 5", "dia 12 de dezembro"). tipo "antes": combinaram "antes do dia X". tipo "nenhum": não combinaram.
"dia": o número do dia citado (1 a 31; 0 se nenhum). "mes": o número do mês SÓ se o mês foi dito (1 a 12; 0 se não foi dito). Não calcule datas.
"trecho": a frase de onde tirou (curta). Use só o texto dado.` },
      { role: 'user', content: fonte }],
      response_format: { type: 'json_schema', json_schema: { name: 'proxima', strict: true, schema: { type: 'object', additionalProperties: false, required: ['tipo', 'dia', 'mes', 'trecho'],
        properties: { tipo: { type: 'string', enum: ['em', 'antes', 'nenhum'] }, dia: { type: 'integer' }, mes: { type: 'integer' }, trecho: { type: 'string' } } } } } }) });
  const j = await resp.json();
  if (!j.choices) return { tipo: 'nenhum', data: '', trecho: '' }; // sem resposta da IA: segue a regra dos 30 dias
  const x = JSON.parse(j.choices[0].message.content);
  if (x.tipo === 'nenhum' || !(x.dia >= 1 && x.dia <= 31)) return { tipo: 'nenhum', data: '', trecho: '' };
  // a data é calculada aqui: o próximo dia com esse número DEPOIS da call (no mês dito, se foi dito)
  const [ano, mesCall] = quando.split('-').map(Number);
  const cand = (a: number, m: number) => { const d = new Date(Date.UTC(a, m - 1, x.dia, 12)); return d.getUTCMonth() === m - 1 ? d.toISOString().slice(0, 10) : ''; };
  let data = '';
  if (x.mes >= 1 && x.mes <= 12) { data = cand(ano, x.mes); if (!data || data <= quando) data = cand(ano + 1, x.mes); }
  else for (let k = 0; k < 3 && !data; k++) { const m = ((mesCall - 1 + k) % 12) + 1, a = ano + Math.floor((mesCall - 1 + k) / 12); const d = cand(a, m); if (d && d > quando) data = d; }
  return data ? { tipo: x.tipo, data, trecho: x.trecho } : { tipo: 'nenhum', data: '', trecho: '' };
}

// ---------------- 3. PDF do aluno (só o plano de ação) ----------------
function pdfHtml(c: any, prox: any): string {
  const r = c.raio || {}, ini = new Date(c.inicio);
  const data = ini.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' });
  const hora = ini.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const ROXO = '#6d28d9', CINZA = '#6b6474';
  const h2 = (t: string) => `<p style="font-family:Arial;font-size:9pt;color:${ROXO};letter-spacing:2px;margin:18pt 0 6pt"><b>${t.toUpperCase()}</b></p>`;
  const caixa = (rot: string, val: string) => `<td style="background:#f5f1fb;padding:9pt;border:1px solid #e6dcf5;vertical-align:top;width:50%"><span style="font-size:8pt;color:${CINZA}">${rot.toUpperCase()}</span><br><span style="font-size:11pt">${esc(val)}</span></td>`;
  const plano = (r.plano_de_acao_do_aluno || []) as any[];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const proxTxt = prox?.dia ? `${cap(diaSemana(prox.dia))}, ${ddmm(prox.dia)}, das ${hm(prox.ini)} às ${hm(prox.fim)} (horário de Brasília). O link do Google Meet chega no seu WhatsApp.`
    : 'A Fernanda vai combinar com você o dia da próxima call pelo WhatsApp.';
  return `<html><head><meta charset="utf-8"></head><body style="font-family:Arial;font-size:10.5pt;color:#1c1724">
<p style="font-size:8pt;color:${ROXO};letter-spacing:2px"><b>MENTORIA LYRA · PLANO DE AÇÃO</b></p>
<h1 style="font-family:Georgia;font-size:24pt;margin:0;color:#1c1724">${esc(c.aluno_nome || r.nome_do_aluno)}</h1>
<p style="color:${CINZA};margin-top:2pt">Call com ${esc(c.mentor_nome || 'Micha Menezes')} · ${esc(data)}, ${hora}</p>
<p>Este é o plano que vocês combinaram na call. Está tudo aqui para você não depender de anotação: o que fazer, como e até quando.</p>
<table style="border-collapse:collapse;width:100%"><tr>${caixa('Onde você quer chegar', r.objetivo_principal || '—')}${caixa('O foco agora', r.desafio_da_semana || '—')}</tr></table>
${h2('O que você vai fazer')}
${plano.length ? `<table style="border-collapse:collapse;width:100%">${plano.map((p, i) => `<tr><td style="padding:7pt 6pt;border-bottom:1px solid #ece6f4;vertical-align:top;width:22pt;color:${ROXO};font-size:13pt"><b>${i + 1}</b></td><td style="padding:7pt 6pt;border-bottom:1px solid #ece6f4;vertical-align:top"><b>${esc(p.acao)}</b>${p.detalhe ? `<br><span style="color:${CINZA}">${esc(p.detalhe)}</span>` : ''}</td><td style="padding:7pt 6pt;border-bottom:1px solid #ece6f4;vertical-align:top;width:90pt;color:${ROXO}">${esc(p.prazo || '')}</td></tr>`).join('')}</table>`
    : '<p><i>Nesta call não ficou nenhuma tarefa combinada.</i></p>'}
${h2('Sua próxima call com o Micha')}
<p style="background:#f5f1fb;padding:10pt;border-left:3px solid ${ROXO}">${esc(proxTxt)}<br><span style="color:${CINZA}">Leve o que você conseguir executar desta lista: é por aí que a próxima call começa.</span></p>
<p style="font-size:8.5pt;color:${CINZA};margin-top:18pt">Qualquer dúvida ou trava, fale com a Fernanda pelo WhatsApp. · Agência Pinguim</p>
</body></html>`;
}
async function gerarPdf(tok: string, c: any, prox: any): Promise<string> {
  if (!c.pasta_id) throw new Error('a call não tem pasta no Drive');
  const d = new Date(c.inicio).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(/\//g, '-');
  const nome = `Plano de ação · ${c.aluno_nome || 'aluno'} · Lyra · ${d}`;
  const gdoc = await subir(tok, c.pasta_id, nome, pdfHtml(c, prox), 'text/html', 'application/vnd.google-apps.document');
  let pdfBytes: ArrayBuffer | null = null;
  for (let k = 0; k < 3 && !pdfBytes; k++) { // o export do Drive às vezes dá 500 passageiro
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${gdoc.id}/export?mimeType=application/pdf`, { headers: { Authorization: `Bearer ${tok}` } });
    if (r.ok) pdfBytes = await r.arrayBuffer(); else await new Promise((ok) => setTimeout(ok, 1500));
  }
  if (!pdfBytes) throw new Error('exportar o PDF do plano falhou');
  const pdf = await subir(tok, c.pasta_id, nome + '.pdf', new Uint8Array(pdfBytes), 'application/pdf');
  await apagar(tok, gdoc.id); // o aluno recebe só o PDF; o Doc intermediário sai
  await compartilhar(tok, pdf.id);
  return pdf.webViewLink;
}

// ---------------- 4. WhatsApp e Discord ----------------
async function enviarWhats(via: string, whats: string, texto: string): Promise<void> {
  const chave = VIA[via].chave;
  const [base, inst, tok] = await Promise.all([getChave('EVOLUTION_API_URL', CONSUMIDOR), getChave(chave, CONSUMIDOR), getChave(chave + '_TOKEN', CONSUMIDOR)]);
  const raiz = base.replace(/\/$/, ''), i = encodeURIComponent(inst), h = { 'Content-Type': 'application/json', apikey: tok };
  const dig = String(whats || '').replace(/\D/g, ''), numero = dig.length === 10 || dig.length === 11 ? '55' + dig : dig;
  let destino = numero;
  const c = await fetch(`${raiz}/chat/whatsappNumbers/${i}`, { method: 'POST', headers: h, body: JSON.stringify({ numbers: [numero] }) });
  if (c.ok) { const j = await c.json().catch(() => []); const a = Array.isArray(j) ? j[0] : null; if (a && a.exists === false) throw new Error('o número ' + numero + ' não tem WhatsApp'); if (a?.jid) destino = a.jid; }
  const url = `${raiz}/message/sendText/${i}`;
  let r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ number: destino, text: texto }) });
  if (r.status === 400) r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ number: destino, textMessage: { text: texto } }) });
  if (!r.ok) throw new Error(`o WhatsApp da ${VIA[via].nome} recusou o envio (${r.status})`);
}
async function discord(canal: string | null, texto: string, mencoes: string[] = []) {
  const bot = await getChave('DISCORD_BOT_TOKEN', CONSUMIDOR), h = { Authorization: `Bot ${bot}`, 'Content-Type': 'application/json' };
  let destino = canal;
  if (!destino) { const dm = await (await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers: h, body: JSON.stringify({ recipient_id: DISCORD_CODINA }) })).json(); destino = dm.id; }
  await fetch(`https://discord.com/api/v10/channels/${destino}/messages`, { method: 'POST', headers: h, body: JSON.stringify({ content: texto.slice(0, 1900), allowed_mentions: { users: mencoes } }) });
}
const textoPdf = (c: any, via: string, link: string) => {
  const ini = new Date(c.inicio), q = brt(ini);
  return [`Olá, ${primeiro(c.aluno_nome)}! Tudo bem?`, '',
    `Aqui é a ${VIA[via].nome}, da equipe do Micha. Estou te enviando o plano de ação da sua call de hoje com o Micha (${ddmm(q.dia)} às ${hm(q.min)}): tudo o que você ficou de fazer, com os prazos combinados.`, '',
    `👉 ${link}`, '', 'Qualquer dúvida, é só me chamar por aqui.'].join('\n');
};
// mesmo texto da confirmação da Agenda Inteligente (edge agenda-aviso-worker); usado só no exemplo, que não marca de verdade
const textoConfirmacaoExemplo = (c: any, via: string, p: any) => [`Olá, ${primeiro(c.aluno_nome)}! Tudo bem?`, '',
  `Aqui é a ${VIA[via].nome}, da equipe Pinguim. O seu encontro está agendado:`, '', '*Lyra | 1:1 com Micha Menezes*',
  `🗓 ${diaSemana(p.dia)}, ${ddmm(p.dia)}`, `⏰ das ${hm(p.ini)} às ${hm(p.fim)} (horário de Brasília)`, '🔗 [link do Google Meet]', '',
  'No dia do encontro, envio um lembrete por aqui com o link.', 'Em caso de dúvida ou imprevisto, responda esta mensagem.'].join('\n');

// ---------------- o pós-call de uma call ----------------
async function posCall(c: any, cfg: any, testePara: string | null) {
  const via = cfg.via || 'fernanda', teste = !!testePara;
  const marcar = (fdisc: string) => `<@${fdisc}>`;
  const quandoCall = brt(new Date(c.inicio));
  // 1. data da próxima call
  const comb = await dataCombinada(c, cfg.modelo_data || 'gpt-5.4-mini');
  let alvo = somaDias(quandoCall.dia, cfg.dias_padrao || 30), ateDias = cfg.procura_ate_dias || 10;
  if (comb.tipo === 'em' && comb.data > quandoCall.dia) alvo = comb.data;
  if (comb.tipo === 'antes' && comb.data > quandoCall.dia) { alvo = somaDias(comb.data, -7) > brt().dia ? somaDias(comb.data, -7) : somaDias(brt().dia, 1); ateDias = 6; }
  // 2. agenda (teste = só simula)
  const temContato = !!(c.aluno_telefone && c.aluno_email);
  let ag: any = { agendado: false, motivo: 'aluno sem WhatsApp ou sem e-mail no cadastro' };
  if (temContato) {
    const r = await fetch(`${CRM}/api/agenda-inteligente`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-token': SERVICE },
      body: JSON.stringify({ acao: 'auto', socio: 'M', tipo: 'lyra', titulo: 'Lyra 1:1', aluno: { nome: c.aluno_nome, email: c.aluno_email, whats: c.aluno_telefone },
        alvo, ate_dias: ateDias, aviso_via: via, origem: `lyra-pos-call:${c.id}`, simular: teste }) });
    ag = await r.json().catch(() => ({ agendado: false, motivo: 'a Agenda Inteligente não respondeu (' + r.status + ')' }));
    if (ag.erro) ag = { agendado: false, motivo: ag.erro };
  }
  const prox = ag.agendado || ag.simulado ? { dia: ag.dia, ini: ag.ini, fim: ag.fim } : null;
  // 3. PDF
  const tok = await tokenGoogle();
  const link = await gerarPdf(tok, c, prox);
  // 4. aluno (teste: só o número de teste)
  const para = testePara || c.aluno_telefone;
  let enviado = false, erroEnvio = '';
  if (para && (temContato || teste)) {
    try {
      await enviarWhats(via, para, textoPdf(c, via, link)); enviado = true;
      if (prox) {
        await new Promise((ok) => setTimeout(ok, (cfg.espera_seg ?? 60) * 1000));
        if (teste) await enviarWhats(via, para, textoConfirmacaoExemplo(c, via, prox));
        else await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/agenda-aviso-worker`, { method: 'POST', headers: { Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ag.id }) });
      }
    } catch (e) { erroEnvio = erroTxt(e); }
  }
  // 5. Fernanda no #avisos-de-calls (teste: privado do Codina, sem marcar)
  const nomeAl = c.aluno_nome || 'aluno', fern = teste ? '@Fernanda' : marcar(cfg.fernanda_discord);
  const combTxt = comb.tipo !== 'nenhum' ? `Data combinada na call: "${comb.trecho}".` : `Sem data combinada na call: regra dos ${cfg.dias_padrao || 30} dias.`;
  const linhas = [`📋 **Pós-call Lyra · ${nomeAl}** (call com o Micha em ${ddmm(quandoCall.dia)} às ${hm(quandoCall.min)})`];
  linhas.push(enviado ? `✅ Plano de ação enviado ao aluno pelo seu WhatsApp: ${link}` : `⚠️ Plano de ação NÃO foi enviado ao aluno (${erroEnvio || ag.motivo || 'sem WhatsApp'}). PDF: ${link}`);
  if (ag.agendado || (teste && ag.simulado)) linhas.push(`🗓 ${fern}, já agendei a próxima call no Google: **${diaSemana(prox!.dia)}, ${ddmm(prox!.dia)}, ${hm(prox!.ini)}–${hm(prox!.fim)}** com o Micha${enviado ? ', e o aluno recebeu a confirmação' : ''}. ${combTxt} Se quiser mudar, remarque na Agenda Inteligente.`);
  else linhas.push(`⏳ ${fern}, **pendência:** não consegui marcar a próxima call (${ag.motivo}). ${combTxt}${ag.sugestao ? ` Horário que serviria: ${diaSemana(ag.sugestao.dia)}, ${ddmm(ag.sugestao.dia)}, ${hm(ag.sugestao.ini)} (precisa da autorização do Micha).` : ''} Marque pela Agenda Inteligente e combine com o aluno.`);
  const texto = (teste ? '🧪 **EXEMPLO** (só no seu privado; no #avisos-de-calls sai marcando a Fernanda)\n' : '') + linhas.join('\n');
  await discord(teste ? null : cfg.canal_avisos, texto, teste ? [] : [cfg.fernanda_discord]);
  const status = teste ? 'teste' : !enviado ? (temContato ? 'erro' : 'sem_whatsapp') : ag.agendado ? 'enviado' : 'pendente';
  return { status, link, enviado, erroEnvio, comb, alvo, ag };
}

async function rodar(body: any) {
  const { data: conf } = await sb.from('crm_call_mentoria_config').select('poscall').eq('id', 1).single();
  const cfg = conf?.poscall || {};
  if (body.call_id) {
    const { data: c } = await sb.from('crm_call_mentoria').select('*').eq('id', body.call_id).single();
    if (!c) return { erro: 'call não encontrada' };
    const r = await posCall(c, cfg, body.teste_para ? String(body.teste_para) : null);
    if (!body.teste_para) await sb.from('crm_call_mentoria').update({ poscall_status: r.status, poscall_em: new Date().toISOString(), poscall_pdf_url: r.link, poscall_agenda_id: r.ag?.id || null,
      poscall_proxima: { alvo: r.alvo, combinado: r.comb, dia: r.ag?.dia || null, ini: r.ag?.ini ?? null, fim: r.ag?.fim ?? null, motivo: r.ag?.motivo || null }, poscall_erro: r.erroEnvio || null }).eq('id', c.id);
    return r;
  }
  if (!cfg.ativo) return { ativo: false };
  const re = new RegExp(cfg.titulo_regex || 'lyra', 'i');
  const { data: calls } = await sb.from('crm_call_mentoria').select('*').eq('status', 'ok').is('poscall_status', null).eq('mentor_nome', cfg.mentor || 'Micha Menezes')
    .gte('inicio', cfg.desde).order('inicio').limit(10);
  const out: string[] = [];
  for (const c of (calls || []).filter((x: any) => re.test(x.titulo || '')).slice(0, 2)) {
    // carimbo antes: duas rodadas ao mesmo tempo, só uma faz
    const { data: minha } = await sb.from('crm_call_mentoria').update({ poscall_status: 'processando', poscall_em: new Date().toISOString() }).eq('id', c.id).is('poscall_status', null).select('id');
    if (!minha?.length) continue;
    try {
      const r = await posCall(c, cfg, null);
      await sb.from('crm_call_mentoria').update({ poscall_status: r.status, poscall_em: new Date().toISOString(), poscall_pdf_url: r.link, poscall_agenda_id: r.ag?.id || null,
        poscall_proxima: { alvo: r.alvo, combinado: r.comb, dia: r.ag?.dia || null, ini: r.ag?.ini ?? null, fim: r.ag?.fim ?? null, motivo: r.ag?.motivo || null }, poscall_erro: r.erroEnvio || null }).eq('id', c.id);
      out.push(`${c.titulo} → ${r.status}`);
    } catch (e) {
      await sb.from('crm_call_mentoria').update({ poscall_status: 'erro', poscall_erro: erroTxt(e) }).eq('id', c.id);
      await discord(null, `⚠️ **Pós-call Lyra** falhou em ${c.titulo}: ${erroTxt(e)}`).catch(() => null);
      out.push(`${c.titulo} → ERRO ${erroTxt(e)}`);
    }
  }
  return { resultado: out };
}

serve(async (req) => {
  const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  let role = ''; try { role = JSON.parse(atob(auth.split('.')[1])).role || ''; } catch (_) { /* não-JWT */ }
  if (auth !== SERVICE && role !== 'service_role') return new Response(JSON.stringify({ erro: 'Só service_role' }), { status: 401 });
  let body: any = {}; try { body = await req.json(); } catch (_) { /* cron */ }
  try { return new Response(JSON.stringify(await rodar(body)), { headers: { 'Content-Type': 'application/json' } }); }
  catch (e) { return new Response(JSON.stringify({ erro: erroTxt(e) }), { status: 500 }); }
});
