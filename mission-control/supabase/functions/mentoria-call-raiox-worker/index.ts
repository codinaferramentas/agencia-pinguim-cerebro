// ========================================================================
// Edge Function: mentoria-call-raiox-worker
// ========================================================================
// Raio-X INTERNO das calls 1:1 de mentoria (André 10/11/2026).
//   1. Lista as subpastas novas em "Google Meet" (Drive do contato@; o Meet cria uma por reunião,
//      com a gravação e o doc "Anotações do Gemini", que já traz a TRANSCRIÇÃO com o nome de quem fala).
//   2. Confere na agenda do contato@ se é call individual: organizada pelo contato@ (não pelas agendas
//      das turmas) e com 1 ou 2 convidados de fora (casal no Taurus Plus). Grupo/interna → 'ignorado'.
//   3. OpenAI (modelo da config) → raio-X em JSON (só o que foi dito; nada inventado).
//   4. Google Doc (editável) + PDF na própria subpasta.
//   5. Registro em pinguim.crm_call_mentoria (aba "Calls de mentoria" no CRM) + aviso no Discord.
// Modos (body): {} = cron (só depois de config.desde, se config.ativo) · {de, ate} = histórico sob pedido
//               · {pasta_id} = uma call · {dry_run:true} = só lista o que faria.
// Config: pinguim.crm_call_mentoria_config (UPDATE, sem deploy).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
  db: { schema: 'pinguim' },
});
const CONSUMIDOR = 'mentoria-call-raiox-worker';
const CONTA_ROBO = 'ferramenta@agenciapinguim.com';
const SEM_TRANSCRICAO_DESISTE_H = 24; // o Gemini publica o doc minutos depois da call; passou disso, desiste
const INTERNO = /@agenciapinguim\.com$|agenciapinguim@gmail\.com$|\.agenciapinguim@gmail\.com$/i;

// ---------------- Google ----------------
async function tokenGoogle(): Promise<string> {
  const { data: c } = await sb.from('conexoes_google').select('refresh_token').eq('email_google', CONTA_ROBO).is('revogado_em', null).limit(1).maybeSingle();
  if (!c) throw new Error('conexão Google da conta robô não encontrada');
  const [id, sec] = await Promise.all([getChave('GOOGLE_OAUTH_CLIENT_ID', CONSUMIDOR), getChave('GOOGLE_OAUTH_CLIENT_SECRET', CONSUMIDOR)]);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: c.refresh_token, client_id: id, client_secret: sec, grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google: ' + (j.error_description || j.error));
  return j.access_token;
}
async function drive(tok: string, q: string, fields = 'files(id,name,mimeType,createdTime,webViewLink,videoMediaMetadata)') {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=200&orderBy=createdTime&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${tok}` } });
  const j = await r.json();
  if (j.error) throw new Error('Drive: ' + j.error.message);
  return j.files || [];
}
async function textoDoc(tok: string, id: string): Promise<string> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error('exportar doc: ' + r.status);
  return await r.text();
}
// sobe um arquivo na pasta; se mimeDestino = Google Doc, o Drive converte o HTML
async function subir(tok: string, pasta: string, nome: string, conteudo: Uint8Array | string, mimeOrigem: string, mimeDestino?: string) {
  const fronteira = 'raiox' + crypto.randomUUID();
  const meta = JSON.stringify({ name: nome, parents: [pasta], ...(mimeDestino ? { mimeType: mimeDestino } : {}) });
  const enc = new TextEncoder();
  const corpo = typeof conteudo === 'string' ? enc.encode(conteudo) : conteudo;
  const partes = [enc.encode(`--${fronteira}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${fronteira}\r\nContent-Type: ${mimeOrigem}\r\n\r\n`), corpo, enc.encode(`\r\n--${fronteira}--`)];
  const total = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of partes) { total.set(p, o); o += p.length; }
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': `multipart/related; boundary=${fronteira}` }, body: total });
  const j = await r.json();
  if (!j.id) throw new Error('subir no Drive: ' + JSON.stringify(j).slice(0, 200));
  return j as { id: string; webViewLink: string };
}

// ---------------- raio-X (OpenAI) ----------------
const lista = { type: 'array', items: { type: 'string' } };
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['nome_do_mentor', 'nome_do_aluno', 'tema_principal', 'resumo', 'momento_do_negocio', 'objetivo_principal', 'desafio_da_semana', 'problemas_trazidos',
    'o_que_o_mentor_ensinou', 'plano_de_acao_do_aluno', 'compromissos_do_mentor_e_time', 'decisoes', 'reclamacoes_e_insatisfacoes', 'desejos_e_metas', 'sinais_de_alerta', 'frases_marcantes', 'checar_na_proxima_call'],
  properties: {
    nome_do_mentor: { type: 'string' }, nome_do_aluno: { type: 'string' }, tema_principal: { type: 'string' }, resumo: { type: 'string' },
    momento_do_negocio: { type: 'string' }, objetivo_principal: { type: 'string' }, desafio_da_semana: { type: 'string' },
    problemas_trazidos: lista, o_que_o_mentor_ensinou: lista,
    plano_de_acao_do_aluno: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['acao', 'prazo', 'detalhe'],
      properties: { acao: { type: 'string' }, prazo: { type: 'string' }, detalhe: { type: 'string' } } } },
    compromissos_do_mentor_e_time: lista, decisoes: lista, reclamacoes_e_insatisfacoes: lista, desejos_e_metas: lista, sinais_de_alerta: lista,
    frases_marcantes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['quem', 'frase'], properties: { quem: { type: 'string' }, frase: { type: 'string' } } } },
    checar_na_proxima_call: lista,
  },
};
const SISTEMA = `Você prepara o RAIO-X INTERNO de uma call de mentoria individual da Agência Pinguim, para o mentor ler antes da próxima call com o mesmo aluno. Não é para o aluno.
Regras:
- Use SOMENTE o que está na transcrição. Nada de inventar, supor ou completar. Se um campo não aparece na conversa, devolva "" ou lista vazia.
- Português do Brasil, frases curtas e concretas, com números e nomes quando a conversa trouxer (valores, prazos, ferramentas, produtos).
- "plano_de_acao_do_aluno": só o que o ALUNO ficou de fazer. "prazo": o que foi combinado ("até sexta", "30 dias") ou "" se não houve.
- "compromissos_do_mentor_e_time": o que o mentor ou a equipe Pinguim ficou de fazer ou mandar.
- "sinais_de_alerta": risco de cancelamento, frustração, desânimo, dinheiro apertado, comparação com concorrente. Lista vazia se não houver.
- "frases_marcantes": até 4 falas literais curtas que mostram a dor, a meta ou a virada do aluno.
- "checar_na_proxima_call": perguntas objetivas para o mentor abrir a próxima call (ex.: "Contratou o 2º vendedor?").
- "nome_do_mentor": quem conduz a mentoria (equipe Pinguim). "nome_do_aluno": o aluno (se forem sócios/casal, os dois nomes).`;
// preço de tabela aproximado (US$ por 1M tokens) só para a estimativa de custo
const PRECO: Record<string, [number, number]> = { 'gpt-5.5': [5, 30], 'gpt-5.4': [2.5, 15], 'gpt-5.4-mini': [0.4, 1.6] };

async function gerarRaio(modelo: string, titulo: string, quando: string, notas: string, transcricao: string) {
  const k = await getChave('OPENAI_API_KEY', CONSUMIDOR);
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelo, messages: [{ role: 'system', content: SISTEMA },
      { role: 'user', content: `Call: ${titulo}\nData: ${quando}\n\nNOTAS AUTOMÁTICAS DO GEMINI (apoio):\n${notas.slice(0, 6000)}\n\nTRANSCRIÇÃO COMPLETA:\n${transcricao.slice(0, 180000)}` }],
      response_format: { type: 'json_schema', json_schema: { name: 'raio_x', strict: true, schema: SCHEMA } } }),
  });
  const j = await r.json();
  if (!j.choices) throw new Error('OpenAI: ' + JSON.stringify(j.error || j).slice(0, 300));
  const [pi, po] = PRECO[modelo] || [5, 30];
  return { raio: JSON.parse(j.choices[0].message.content), tokens: j.usage, custo: (j.usage.prompt_tokens * pi + j.usage.completion_tokens * po) / 1e6 };
}

// ---------------- documento (HTML que o Google converte em Doc) ----------------
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function docHtml(c: any): string {
  const r = c.raio;
  const ini = new Date(c.inicio);
  const data = ini.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const hora = ini.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const ul = (arr: string[], vazio = 'Não apareceu na conversa.') => arr?.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p style="color:#8a8a8a"><i>${vazio}</i></p>`;
  const h2 = (t: string, cor = '#111111') => `<h2 style="font-family:Arial;font-size:12pt;color:${cor};letter-spacing:1px;margin-top:16pt">${t.toUpperCase()}</h2>`;
  const celula = (rot: string, val: string) => `<td style="background:#f4f4f2;padding:6pt;border:1px solid #e3e3e3;vertical-align:top"><span style="font-size:8pt;color:#8a8a8a">${rot.toUpperCase()}</span><br>${esc(val)}</td>`;
  const a = c.aluno || {};
  return `<html><head><meta charset="utf-8"></head><body style="font-family:Arial;font-size:10.5pt;color:#111111">
<p style="font-size:8pt;color:#555555;letter-spacing:1px">RAIO-X DA MENTORIA · ${esc(c.titulo.split('|')[0].trim()).toUpperCase()} · USO INTERNO</p>
<h1 style="font-family:Arial;font-size:22pt;margin:0">${esc(r.nome_do_aluno)}</h1>
<p style="color:#555555">com ${esc(r.nome_do_mentor)} · ${esc(data)}, ${hora}${c.duracao_min ? ` · ${c.duracao_min} min` : ''}</p>
<table style="border-collapse:collapse;width:100%"><tr>${celula('Aluno', a.nome || r.nome_do_aluno)}${celula('Email', c.aluno_email || a.email || (c.emails_convite || []).join(', '))}${celula('WhatsApp', c.aluno_telefone ? telFmt(c.aluno_telefone) : (a.telefone || 'não encontrado'))}</tr>
<tr>${celula('Mentor', r.nome_do_mentor)}${celula('Call', c.titulo)}${celula('Produtos', (a.produtos || []).join(', ') || 'não encontrado no CRM')}</tr></table>
<p style="font-size:13pt"><b>${esc(r.tema_principal)}</b></p><p>${esc(r.resumo)}</p>
<table style="border-collapse:collapse;width:100%"><tr>${celula('Momento do negócio', r.momento_do_negocio || '—')}${celula('Objetivo principal', r.objetivo_principal || '—')}${celula('Desafio da semana', r.desafio_da_semana || '—')}</tr></table>
${h2('Plano de ação do aluno')}${r.plano_de_acao_do_aluno.length ? `<table style="border-collapse:collapse;width:100%"><tr><td style="padding:4pt;border-bottom:2px solid #111111"><b>O que fazer</b></td><td style="padding:4pt;border-bottom:2px solid #111111"><b>Prazo</b></td><td style="padding:4pt;border-bottom:2px solid #111111"><b>Detalhe</b></td></tr>${r.plano_de_acao_do_aluno.map((p: any) => `<tr><td style="padding:4pt;border-bottom:1px solid #e3e3e3;vertical-align:top"><b>${esc(p.acao)}</b></td><td style="padding:4pt;border-bottom:1px solid #e3e3e3;vertical-align:top;color:#555555">${esc(p.prazo || '—')}</td><td style="padding:4pt;border-bottom:1px solid #e3e3e3;vertical-align:top">${esc(p.detalhe)}</td></tr>`).join('')}</table>` : '<p><i>Nenhuma ação combinada.</i></p>'}
${h2('Compromissos do mentor e do time')}${ul(r.compromissos_do_mentor_e_time, 'Nenhum compromisso do time.')}
${h2('Problemas que o aluno trouxe')}${ul(r.problemas_trazidos)}
${h2('O que o mentor ensinou')}${ul(r.o_que_o_mentor_ensinou)}
${h2('Decisões')}${ul(r.decisoes)}
${h2('Reclamações e insatisfações')}${ul(r.reclamacoes_e_insatisfacoes, 'Nenhuma reclamação.')}
${h2('Desejos e metas')}${ul(r.desejos_e_metas)}
${r.sinais_de_alerta.length ? h2('Sinais de alerta', '#b42318') + `<ul>${r.sinais_de_alerta.map((x: string) => `<li style="color:#b42318">${esc(x)}</li>`).join('')}</ul>` : ''}
${r.frases_marcantes.length ? h2('Frases marcantes') + r.frases_marcantes.map((f: any) => `<p style="background:#f4f4f2;padding:6pt;border-left:3px solid #111111">“${esc(f.frase)}”<br><span style="font-size:8pt;color:#555555">${esc(f.quem)}</span></p>`).join('') : ''}
${h2('Para checar na próxima call')}${ul(r.checar_na_proxima_call)}
${h2('Arquivos da call')}<p><a href="${esc(c.gravacao_url)}">Gravação</a> · <a href="${esc(c.transcricao_url)}">Transcrição e anotações do Gemini</a> · <a href="${esc(c.pasta_url)}">Pasta da call</a></p>
<p style="font-size:8pt;color:#8a8a8a">Gerado automaticamente a partir da transcrição do Google Meet. Documento interno da equipe Pinguim, não enviar ao aluno.</p>
</body></html>`;
}

// ---------------- CRM ----------------
async function alunoPorEmails(emails: string[]) {
  for (const e of emails) {
    const { data: idn } = await sb.from('crm_cliente_identidade').select('cliente_id').eq('tipo', 'email').eq('valor', e).limit(1);
    const cid = idn?.[0]?.cliente_id;
    if (!cid) continue;
    return await alunoPorCliente(cid, e);
  }
  return null;
}
async function alunoPorCliente(cid: string, emailPadrao?: string) {
  const { data: cli } = await sb.from('crm_cliente').select('nome, email_canon, tel_canon').eq('cliente_id', cid).maybeSingle();
  const { data: comp } = await sb.from('crm_compra').select('produto_nome').eq('cliente_id', cid).in('status', ['approved', 'complete', 'completed']);
  return { cliente_id: cid, nome: cli?.nome, email: cli?.email_canon || emailPadrao || null, telefone: String(cli?.tel_canon || ''),
    produtos: [...new Set((comp || []).map((x: any) => x.produto_nome))] };
}

// convite com email fora do CRM: tenta quem FALOU na call (fora os mentores), mas só aceita quem é
// participante de mentoria no CRM (ex.: Deivid foi o convidado; Victor Darido é o aluno do Orion)
const normNome = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
async function alunoPorFalantes(falas: Record<string, number>, mentores: string[]) {
  const nomes = Object.keys(falas).filter((n) => !mentores.includes(n) && !/presentation|apresenta/i.test(n)).sort((a, b) => falas[b] - falas[a]);
  for (const n of nomes) {
    const { data: achados } = await sb.rpc('crm_buscar', { p_q: n, p_limit: 5 });
    for (const c of achados || []) {
      const nc = normNome(c.nome), nn = normNome(n);
      if (nc !== nn && !nc.startsWith(nn + ' ')) continue;
      const { data: mp } = await sb.from('crm_mentoria_participante').select('mentoria').eq('cliente_id', c.cliente_id).not('mentoria', 'ilike', 'proalt%').limit(1);
      if (!mp?.length) continue;
      return { ...(await alunoPorCliente(c.cliente_id, c.email_canon)), falante: n };
    }
  }
  return null;
}

// email + WhatsApp para o mentor chamar o aluno: CRM primeiro; se o convite usou um email fora do CRM,
// procura o telefone nas compras do Dash pelo mesmo email (André 10/11: "às vezes eles precisam chamar no WhatsApp")
async function contatoAluno(emails: string[], aluno: any): Promise<{ email: string | null; telefone: string | null }> {
  const email = aluno?.email || emails[0] || null;
  let dig = String(aluno?.telefone || '').replace(/\D/g, '');
  if (!dig && emails.length) {
    try {
      const [u, k] = await Promise.all([getChave('DASHBOARD_URL', CONSUMIDOR), getChave('DASHBOARD_SERVICE_ROLE_KEY', CONSUMIDOR)]);
      const r = await fetch(`${u}/rest/v1/hotmart_buyers?select=phone,checkout_phone,checkout_phone_code&email=in.(${emails.map((e) => `"${e}"`).join(',')})&limit=5`,
        { headers: { apikey: k, Authorization: `Bearer ${k}` } });
      for (const b of r.ok ? await r.json() : []) { dig = String(b.checkout_phone || b.phone || '').replace(/\D/g, ''); if (dig) break; }
    } catch (_) { /* sem telefone */ }
  }
  if (dig.startsWith('55') && dig.length >= 12) dig = dig.slice(2);
  if (dig.length === 10 && /[6-9]/.test(dig[2])) dig = dig.slice(0, 2) + '9' + dig.slice(2); // celular antigo sem o 9
  return { email, telefone: dig.length === 10 || dig.length === 11 ? dig : null };
}
const telFmt = (d: string) => `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
const pdfDownload = (url: string | null) => { const id = String(url || '').match(/\/d\/([^/]+)/)?.[1]; return id ? `https://drive.google.com/uc?export=download&id=${id}` : url; };

// aviso no Discord a partir do registro gravado (usado na geração e no "reavisar"); apaga o aviso antigo se houver
async function avisarDiscord(cfg: any, c: any): Promise<string | null> {
  const bot = await getChave('DISCORD_BOT_TOKEN', CONSUMIDOR);
  const D = { Authorization: `Bot ${bot}`, 'Content-Type': 'application/json' };
  if (c.discord_msg_id) await fetch(`https://discord.com/api/v10/channels/${cfg.canal_id}/messages/${c.discord_msg_id}`, { method: 'DELETE', headers: D }).catch(() => {});
  const r = c.raio;
  const ini = new Date(c.inicio);
  const data = ini.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const hora = ini.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  const idMentor = c.mentor_nome ? cfg.mentores?.[c.mentor_nome] : null;
  const programa = String(c.titulo || '').split('|')[0].trim();
  const nAlertas = r.sinais_de_alerta?.length || 0;
  const linhas = [
    '​',
    `## 📋 ${r.nome_do_aluno || c.aluno_nome}`,
    `**${programa}** · ${data} às ${hora}${c.duracao_min ? ` · ${c.duracao_min} min` : ''} · com ${idMentor ? `<@${idMentor}>` : c.mentor_nome || r.nome_do_mentor}`,
    '',
    c.cliente_id && c.aluno_nome && normNome(c.aluno_nome) !== normNome(r.nome_do_aluno) ? `📇 **Ficha no CRM:** ${c.aluno_nome}` : '',
    `📧 **Email:** ${c.aluno_email || 'não encontrado'}`,
    `📱 **WhatsApp:** ${c.aluno_telefone ? `${telFmt(c.aluno_telefone)} · [chamar no WhatsApp](<https://wa.me/55${c.aluno_telefone}>)` : 'não encontrado'}`,
    c.cliente_id ? '' : '🔎 *Aluno não encontrado no CRM pelo email do convite.*',
    '',
    `🎯 **Tema:** ${r.tema_principal}`,
    `✅ ${r.plano_de_acao_do_aluno?.length || 0} ação(ões) combinada(s) com o aluno${nAlertas ? `  ·  ⚠️ ${nAlertas} sinal(is) de alerta` : ''}`,
    '',
    '**Arquivos da call**',
    `📄 [Abrir o raio-X completo](<${c.doc_url}>)`,
    `⬇️ [Baixar o PDF](<${pdfDownload(c.pdf_url)}>)`,
    c.gravacao_url ? `🎥 [Assistir à gravação](<${c.gravacao_url}>)` : '',
    '​',
  ].filter((l, i, a) => l !== '' || (a[i - 1] !== '' && a[i - 1] !== undefined));
  const d = await fetch(`https://discord.com/api/v10/channels/${cfg.canal_id}/messages`, { method: 'POST', headers: D,
    body: JSON.stringify({ content: linhas.join('\n').slice(0, 1990), allowed_mentions: { users: idMentor ? [idMentor] : [] } }) });
  return (await d.json().catch(() => ({})))?.id || null;
}

// ---------------- uma call ----------------
async function processarPasta(tok: string, cfg: any, pasta: any, dryRun: boolean): Promise<string> {
  const m = pasta.name.match(/^(.*?) - (\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return 'ignorado: nome fora do padrão do Meet';
  const titulo = m[1].trim();
  const inicio = new Date(`${m[2]}-${m[3]}-${m[4]}T${m[5]}:${m[6]}:00-03:00`);
  const reg: any = { pasta_id: pasta.id, titulo, inicio: inicio.toISOString(), pasta_url: `https://drive.google.com/drive/folders/${pasta.id}`, atualizado_em: new Date().toISOString() };
  const gravar = async (extra: any) => { if (!dryRun) await sb.from('crm_call_mentoria').upsert({ ...reg, ...extra }, { onConflict: 'pasta_id' }); };

  // evento da agenda: mesmo título, até 2h de diferença
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.agenda_id)}/events?timeMin=${new Date(+inicio - 2 * 3600e3).toISOString()}&timeMax=${new Date(+inicio + 2 * 3600e3).toISOString()}&singleEvents=true`,
    { headers: { Authorization: `Bearer ${tok}` } });
  const evs = (await r.json()).items || [];
  const ev = evs.find((e: any) => (e.summary || '').trim() === titulo) || evs.find((e: any) => (e.summary || '').includes(titulo.slice(0, 20)));
  if (!ev) { await gravar({ status: 'ignorado', motivo: 'evento não encontrado na agenda do contato@' }); return 'ignorado: sem evento na agenda'; }
  reg.evento_id = ev.id;
  const org = ev.organizer?.email || '';
  const externos = (ev.attendees || []).filter((a: any) => !a.resource && !INTERNO.test(a.email || '')).map((a: any) => String(a.email).toLowerCase());
  reg.emails_convite = externos;
  if (org !== cfg.agenda_id) { await gravar({ status: 'ignorado', motivo: `call de turma (agenda ${org})` }); return 'ignorado: call de turma'; }
  if (externos.length < 1 || externos.length > 2) { await gravar({ status: 'ignorado', motivo: `${externos.length} convidados de fora: não é 1:1` }); return `ignorado: ${externos.length} convidados de fora`; }

  const arqs = await drive(tok, `'${pasta.id}' in parents and trashed=false`);
  if (arqs.some((a: any) => /Raio-X da mentoria/i.test(a.name))) { await gravar({ status: 'ok', motivo: 'raio-X já existia na pasta' }); return 'já tinha raio-X'; }
  const doc = arqs.find((a: any) => a.mimeType === 'application/vnd.google-apps.document' && /Gemini|Transcri/i.test(a.name));
  const video = arqs.find((a: any) => String(a.mimeType).startsWith('video/'));
  reg.gravacao_url = video?.webViewLink || null;
  reg.duracao_min = video?.videoMediaMetadata?.durationMillis ? Math.round(+video.videoMediaMetadata.durationMillis / 60000) : null;
  const texto = doc ? await textoDoc(tok, doc.id) : '';
  const iT = texto.search(/ - Transcrição\s*\n|Transcript\s*\n/);
  if (!doc || iT < 0 || texto.length - iT < 2000) {
    const horas = (Date.now() - +inicio) / 3600e3;
    if (horas < SEM_TRANSCRICAO_DESISTE_H) return 'aguardando: transcrição ainda não publicada';
    await gravar({ status: 'sem_transcricao', motivo: 'a call não tem transcrição nas anotações do Gemini' });
    return 'sem transcrição';
  }
  reg.transcricao_url = doc.webViewLink;
  const transcricao = texto.slice(iT), notas = texto.slice(0, iT);

  // mentor = quem da lista de mentores mais falou
  const falas: Record<string, number> = {};
  for (const x of transcricao.matchAll(/^([^:\n]{3,40}): /gm)) falas[x[1].trim()] = (falas[x[1].trim()] || 0) + 1;
  const mentor = Object.keys(cfg.mentores || {}).filter((n) => falas[n]).sort((a, b) => falas[b] - falas[a])[0] || null;
  const aluno = (await alunoPorEmails(externos)) || (await alunoPorFalantes(falas, Object.keys(cfg.mentores || {})));
  const contato = await contatoAluno(externos, aluno);
  if (dryRun) return `faria: ${titulo} · mentor ${mentor || '?'} · aluno ${aluno?.nome || 'não achado no CRM (' + externos.join(', ') + ')'}`;

  const quando = inicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const { raio, tokens, custo } = await gerarRaio(cfg.modelo, titulo, quando, notas, transcricao);
  const call = { ...reg, raio, aluno, mentor_nome: mentor || raio.nome_do_mentor, aluno_email: contato.email, aluno_telefone: contato.telefone };
  const nome = `Raio-X da mentoria · ${raio.nome_do_aluno} · ${m[4]}-${m[3]}-${m[2]}`;
  const gdoc = await subir(tok, pasta.id, nome, docHtml(call), 'text/html', 'application/vnd.google-apps.document');
  const pdfR = await fetch(`https://www.googleapis.com/drive/v3/files/${gdoc.id}/export?mimeType=application/pdf`, { headers: { Authorization: `Bearer ${tok}` } });
  const pdf = await subir(tok, pasta.id, nome + '.pdf', new Uint8Array(await pdfR.arrayBuffer()), 'application/pdf');

  const final = { ...reg, status: 'ok', motivo: null, mentor_nome: call.mentor_nome, cliente_id: aluno?.cliente_id || null, aluno_nome: aluno?.nome || raio.nome_do_aluno,
    aluno_email: contato.email, aluno_telefone: contato.telefone,
    raio, doc_url: gdoc.webViewLink, pdf_url: pdf.webViewLink, discord_msg_id: null as string | null, modelo: cfg.modelo, tokens, custo_usd: +custo.toFixed(4) };
  if (cfg.aviso_discord) final.discord_msg_id = await avisarDiscord(cfg, final);
  await gravar(final);
  return `ok: ${titulo} (US$ ${custo.toFixed(2)})`;
}

async function rodar(body: any) {
  const { data: cfg } = await sb.from('crm_call_mentoria_config').select('*').eq('id', 1).single();
  // vincular: liga uma call à ficha certa do CRM (quando o email do convite não bate) e refaz o aviso
  if (body.vincular) {
    const { id, cliente_id } = body.vincular;
    const { data: c } = await sb.from('crm_call_mentoria').select('*').eq('id', id).single();
    const a = await alunoPorCliente(cliente_id);
    const ct = await contatoAluno([], a);
    Object.assign(c, { cliente_id, aluno_nome: a.nome, aluno_email: ct.email, aluno_telefone: ct.telefone });
    if (cfg.aviso_discord && body.reavisar !== false) c.discord_msg_id = await avisarDiscord(cfg, c);
    await sb.from('crm_call_mentoria').update({ cliente_id, aluno_nome: c.aluno_nome, aluno_email: c.aluno_email, aluno_telefone: c.aluno_telefone,
      discord_msg_id: c.discord_msg_id, atualizado_em: new Date().toISOString() }).eq('id', id);
    return { vinculado: `${c.titulo} → ${a.nome} (${ct.telefone || 'sem WhatsApp'})` };
  }
  // reavisar: refaz o aviso no Discord das calls já prontas (apaga o antigo), completando email/WhatsApp se faltavam
  if (body.reavisar) {
    let q = sb.from('crm_call_mentoria').select('*').eq('status', 'ok').order('inicio');
    if (body.de) q = q.gte('inicio', body.de);
    const { data: prontas } = await q;
    const out: string[] = [];
    for (const c of prontas || []) {
      if (!c.aluno_email || !c.aluno_telefone) {
        const ct = await contatoAluno(c.emails_convite || [], c.cliente_id ? await alunoPorEmails(c.emails_convite || []) : null);
        c.aluno_email = c.aluno_email || ct.email; c.aluno_telefone = c.aluno_telefone || ct.telefone;
      }
      const id = await avisarDiscord(cfg, c);
      await sb.from('crm_call_mentoria').update({ discord_msg_id: id, aluno_email: c.aluno_email, aluno_telefone: c.aluno_telefone, atualizado_em: new Date().toISOString() }).eq('id', c.id);
      out.push(`${c.titulo} → reavisado (${c.aluno_telefone ? 'com WhatsApp' : 'sem WhatsApp'})`);
      await new Promise((ok) => setTimeout(ok, 1200));
    }
    return { reavisados: out };
  }
  const manual = !!(body.de || body.pasta_id);
  if (!cfg.ativo && !manual && !body.dry_run) return { ativo: false };
  const tok = await tokenGoogle();
  let pastas: any[];
  if (body.pasta_id) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${body.pasta_id}?fields=id,name,createdTime&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${tok}` } });
    pastas = [await r.json()];
  } else {
    const de = body.de ? new Date(body.de) : new Date(Math.max(+new Date(cfg.desde), Date.now() - 7 * 864e5));
    const ate = body.ate ? new Date(body.ate) : new Date();
    pastas = await drive(tok, `'${cfg.pasta_meet_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and createdTime >= '${de.toISOString()}' and createdTime <= '${ate.toISOString()}'`);
  }
  // já resolvidas (ok/ignorado/sem transcrição) não voltam
  const { data: feitas } = await sb.from('crm_call_mentoria').select('pasta_id').in('pasta_id', pastas.map((p) => p.id)).neq('status', 'erro');
  const ja = new Set((feitas || []).map((x: any) => x.pasta_id));
  const fila = pastas.filter((p) => body.pasta_id || !ja.has(p.id));
  const res: string[] = [];
  let pesadas = 0;
  for (const p of fila) {
    if (pesadas >= (body.max || cfg.max_por_execucao)) { res.push(`(restam ${fila.length - fila.indexOf(p)} para a próxima execução)`); break; }
    try {
      const r = await processarPasta(tok, cfg, p, !!body.dry_run);
      if (r.startsWith('ok')) pesadas++;
      res.push(`${p.name.slice(0, 70)} → ${r}`);
    } catch (e) {
      const msg = String((e as Error).message || e).slice(0, 300);
      if (!body.dry_run) await sb.from('crm_call_mentoria').upsert({ pasta_id: p.id, status: 'erro', motivo: msg, atualizado_em: new Date().toISOString() }, { onConflict: 'pasta_id' });
      res.push(`${p.name.slice(0, 70)} → ERRO ${msg}`);
    }
  }
  return { pastas: pastas.length, novas: fila.length, resultado: res };
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ erro: 'Use POST' }), { status: 405 });
  const auth = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  let role = '';
  try { role = JSON.parse(atob(auth.split('.')[1])).role || ''; } catch (_) { /* não-JWT */ }
  if (role !== 'service_role') return new Response(JSON.stringify({ erro: 'Só service_role' }), { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* corpo vazio do cron */ }
  try {
    return new Response(JSON.stringify(await rodar(body)), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String((e as Error).message || e) }), { status: 500 });
  }
});
