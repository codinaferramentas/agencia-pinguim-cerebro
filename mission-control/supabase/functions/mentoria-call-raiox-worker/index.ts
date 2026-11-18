// ========================================================================
// Edge Function: mentoria-call-raiox-worker
// ========================================================================
// Raio-X INTERNO das calls 1:1 de mentoria (André 10/11/2026).
//   1. Lê a AGENDA do contato@ (ele é convidado de toda call 1:1, não importa quem marcou nem em qual
//      agenda o evento mora) e pega as calls encerradas. O doc "Anotações do Gemini" (que já traz a
//      TRANSCRIÇÃO com o nome de quem fala) e a gravação vêm como ANEXOS do evento, e o contato@ lê os
//      dois mesmo quando ficam no Drive do sócio. (André 17/11: a busca pela pasta "Google Meet" ficou
//      cega: o Meet abriu outra pasta em 11/11 e call na agenda do sócio grava no Drive dele.)
//   2. É call individual quando tem 1 ou 2 convidados de fora (casal no Taurus Plus) e não é de turma
//      (organizador = agenda de grupo). O resto nem é registrado.
//   3. OpenAI (modelo da config) → raio-X em JSON (só o que foi dito; nada inventado).
//   4. Google Doc (editável) + PDF na subpasta da call: a que o Meet criou, se for do contato@; senão
//      uma subpasta criada em config.pasta_meet_id.
//   5. Registro em pinguim.crm_call_mentoria (aba "Calls de mentoria" no CRM) + aviso no Discord.
// Modos (body): {} = cron (só depois de config.desde, se config.ativo) · {de, ate} = histórico sob pedido
//               · {evento_id} = uma call pela agenda · {pasta_id} = uma call pela subpasta do Meet (modo antigo)
//               · {so: "trecho do título"} = filtra o período · {dry_run:true} = só lista o que faria.
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
const CONTA_ROBO = 'ferramenta@agenciapinguim.com'; // dona dos raio-X de antes de 17/11 (só para apagar no refazer_docs)
const CONTA_CALLS = 'contato@agenciapinguim.com'; // convidada de toda call: lê agenda e anexos, dona das pastas
const SEM_TRANSCRICAO_DESISTE_H = 24; // o Gemini publica o doc minutos depois da call; passou disso, desiste
// Call na agenda do sócio: o Meet dele só gera as anotações do Gemini (resumo + detalhes), sem a transcrição.
// O raio-X sai dessas anotações e avisa disso no Doc e no Discord.
const SO_NOTAS = 'feito pelas anotações do Gemini (a call não teve transcrição)';
const SO_NOTAS_MIN = 2500; // menos que isso não sustenta um raio-X
const SO_NOTAS_ESPERA_MIN = 60; // dá tempo de a transcrição aparecer antes de aceitar só as anotações
// gente da casa (não conta como aluno): equipe Pinguim e o Codina, que faz reuniões de automação com o time
const INTERNO = /@agenciapinguim\.com$|agenciapinguim@gmail\.com$|\.agenciapinguim@gmail\.com$|^codinaandre@gmail\.com$/i;

// ---------------- Google ----------------
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
async function arquivo(tok: string, id: string, fields = 'id,name,mimeType,parents,webViewLink,videoMediaMetadata,capabilities(canAddChildren)') {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${tok}` } });
  return r.ok ? await r.json() : null;
}
// subpasta da call dentro da pasta-mãe (reaproveita se já existe com o mesmo nome)
async function pastaDaCall(tok: string, mae: string, nome: string): Promise<string> {
  const ja = await drive(tok, `'${mae}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and name='${nome.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
  if (ja[0]) return ja[0].id;
  const r = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [mae] }) });
  const j = await r.json();
  if (!j.id) throw new Error('criar pasta da call: ' + JSON.stringify(j).slice(0, 200));
  return j.id;
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
      { role: 'user', content: transcricao
        ? `Call: ${titulo}\nData: ${quando}\n\nNOTAS AUTOMÁTICAS DO GEMINI (apoio):\n${notas.slice(0, 6000)}\n\nTRANSCRIÇÃO COMPLETA:\n${transcricao.slice(0, 180000)}`
        : `Call: ${titulo}\nData: ${quando}\n\nESTA CALL NÃO TEVE TRANSCRIÇÃO. A única fonte são as anotações automáticas do Gemini abaixo: trate-as como a "transcrição" das regras e use somente o que está nelas. Como não há falas literais, devolva "frases_marcantes" vazio.\n\nANOTAÇÕES DO GEMINI:\n${notas.slice(0, 60000)}` }],
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
<h1 style="font-family:Arial;font-size:22pt;margin:0">${esc(a.nome || r.nome_do_aluno)}</h1>${a.nome && normNome(a.nome) !== normNome(r.nome_do_aluno) ? `<p style="color:#555555;margin:0">na call: ${esc(r.nome_do_aluno)}</p>` : ""}
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
<p style="font-size:8pt;color:#8a8a8a">${c.motivo === SO_NOTAS ? 'Gerado automaticamente a partir das anotações do Gemini: esta call não teve transcrição, por isso o raio-X é mais resumido e não traz frases literais.' : 'Gerado automaticamente a partir da transcrição do Google Meet.'} Documento interno da equipe Pinguim, não enviar ao aluno.</p>
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
// PDF abre na página de visualização do Drive (tem botão de baixar). O download direto (uc?export=download)
// dava "sem acesso" para quem tem mais de uma conta Google no navegador (André 11/11).
const pdfDownload = (url: string | null) => url;

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
    // com ficha, o nome principal é SEMPRE o do CRM (é o que acha na busca de Clientes); o do Meet vira "na call" (André 11/11)
    `## 📋 ${c.cliente_id && c.aluno_nome ? c.aluno_nome : r.nome_do_aluno}`,
    `**${programa}** · ${data} às ${hora}${c.duracao_min ? ` · ${c.duracao_min} min` : ''} · com ${idMentor ? `<@${idMentor}>` : c.mentor_nome || r.nome_do_mentor}`,
    '',
    c.cliente_id && c.aluno_nome && normNome(c.aluno_nome) !== normNome(r.nome_do_aluno) ? `🎙️ **Na call:** ${r.nome_do_aluno}` : '',
    `📧 **Email:** ${c.aluno_email || 'não encontrado'}`,
    `📱 **WhatsApp:** ${c.aluno_telefone ? `${telFmt(c.aluno_telefone)} · [chamar no WhatsApp](<https://wa.me/55${c.aluno_telefone}>)` : 'não encontrado'}`,
    c.cliente_id ? '' : '🔎 *Aluno não encontrado no CRM pelo email do convite.*',
    '',
    `🎯 **Tema:** ${r.tema_principal}`,
    `✅ ${r.plano_de_acao_do_aluno?.length || 0} ação(ões) combinada(s) com o aluno${nAlertas ? `  ·  ⚠️ ${nAlertas} sinal(is) de alerta` : ''}`,
    c.motivo === SO_NOTAS ? '📝 *Raio-X feito pelas anotações do Gemini: esta call não teve transcrição.*' : '',
    '',
    '**Arquivos da call**',
    `📄 [Abrir o raio-X completo](<${c.doc_url}>)`,
    `⬇️ [Abrir o PDF (para baixar)](<${pdfDownload(c.pdf_url)}>)`,
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
  return await concluir(tok, cfg, reg, gravar, doc, video, externos, dryRun, async () => pasta.id);
}

// ---------------- uma call, achada pela agenda do contato@ ----------------
const fimDe = (e: any) => new Date(e.end?.dateTime || e.start?.dateTime || 0);
// 1:1 = evento com hora, não cancelado, organizado por alguém da casa (não agenda de turma) e 1 ou 2 convidados de fora
function externosDaCall(ev: any): string[] | null {
  if (ev.status === 'cancelled' || !ev.start?.dateTime) return null;
  const org = String(ev.organizer?.email || '');
  if (/@group\.calendar\.google\.com$/i.test(org) || !INTERNO.test(org)) return null;
  const ext = (ev.attendees || []).filter((a: any) => !a.resource && !INTERNO.test(a.email || '')).map((a: any) => String(a.email).toLowerCase());
  return ext.length >= 1 && ext.length <= 2 ? ext : null;
}
// Call de aluno marcada só na agenda do sócio: sem o contato@ no convite, a gravação e as anotações ficam no Drive
// do sócio e o robô não abre. Então, ANTES da call, o contato@ entra como convidado (sem e-mail para ninguém).
// Só vale para call que ainda não terminou: incluir depois não dá acesso aos arquivos. (André 18/11/2026)
const AGENDAS_SOCIOS = ['micha@agenciapinguim.com', 'pedro@agenciapinguim.com', 'luiz@agenciapinguim.com'];
const CALL_DE_ALUNO = /taurus|orion|lyra|express|mentoria|onboarding|1:1/i;
async function convidarContato(tok: string, dryRun: boolean): Promise<string[]> {
  const out: string[] = [], H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  const series = new Set<string>();
  const incluir = async (base: string, ev: any) => {
    const r = await fetch(`${base}/${encodeURIComponent(ev.id)}?sendUpdates=none`, { method: 'PATCH', headers: H,
      body: JSON.stringify({ attendees: [...(ev.attendees || []), { email: CONTA_CALLS, responseStatus: 'accepted' }] }) });
    if (!r.ok) throw new Error(`incluir o contato@: ${r.status} ${(await r.text()).slice(0, 150)}`);
  };
  const tem = (ev: any) => (ev.attendees || []).some((a: any) => String(a.email).toLowerCase() === CONTA_CALLS);
  for (const ag of AGENDAS_SOCIOS) {
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ag)}/events`;
    try {
      const j = await (await fetch(`${base}?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${new Date().toISOString()}&timeMax=${new Date(Date.now() + 30 * 864e5).toISOString()}`, { headers: H })).json();
      if (j.error) throw new Error(j.error.message);
      for (const ev of j.items || []) {
        // só evento do próprio sócio, com Meet, de aluno (1 ou 2 convidados de fora) e ainda sem o contato@
        if (ev.organizer?.email !== ag || !ev.hangoutLink || !CALL_DE_ALUNO.test(ev.summary || '') || !externosDaCall(ev) || tem(ev)) continue;
        const rot = `${String(ev.start.dateTime).slice(0, 16)} ${String(ev.summary).trim().slice(0, 60)} (${ag.split('@')[0]})`;
        if (dryRun) { out.push(`incluiria o contato@: ${rot}`); continue; }
        // call que se repete: inclui na série inteira de uma vez; se a série já tem, esta data foi alterada à parte
        if (ev.recurringEventId && !series.has(ev.recurringEventId)) {
          series.add(ev.recurringEventId);
          const m = await (await fetch(`${base}/${encodeURIComponent(ev.recurringEventId)}`, { headers: H })).json();
          if (m.id && !tem(m)) { await incluir(base, m); out.push(`contato@ incluído na série: ${rot}`); continue; }
        } else if (ev.recurringEventId) continue;
        await incluir(base, ev); out.push(`contato@ incluído: ${rot}`);
      }
    } catch (e) { out.push(`agenda ${ag}: ERRO ${String((e as Error).message || e).slice(0, 200)}`); }
  }
  return out;
}
async function processarEvento(tok: string, cfg: any, ev: any, dryRun: boolean): Promise<string> {
  const externos = externosDaCall(ev);
  if (!externos) return 'fora: não é call 1:1';
  const titulo = String(ev.summary || 'Call sem título').trim();
  const inicio = new Date(ev.start.dateTime);
  const { data: ant } = await sb.from('crm_call_mentoria').select('id, pasta_id').eq('evento_id', ev.id).limit(1);
  const reg: any = { pasta_id: ant?.[0]?.pasta_id || `evento:${ev.id}`, evento_id: ev.id, titulo, inicio: inicio.toISOString(), emails_convite: externos, atualizado_em: new Date().toISOString() };
  const gravar = async (extra: any) => {
    if (dryRun) return;
    const linha = { ...reg, ...extra };
    const { error } = ant?.[0] ? await sb.from('crm_call_mentoria').update(linha).eq('id', ant[0].id) : await sb.from('crm_call_mentoria').upsert(linha, { onConflict: 'pasta_id' });
    if (error) throw new Error('gravar a call: ' + error.message);
  };
  // gravação e anotações do Gemini chegam como anexos do evento (o contato@ lê os dois, de quem for o Drive)
  const anexos = ev.attachments || [];
  const aDoc = anexos.find((a: any) => a.mimeType === 'application/vnd.google-apps.document' && /Gemini|Anota|Transcri|Notes/i.test(a.title || ''));
  const aVid = anexos.find((a: any) => String(a.mimeType).startsWith('video/'));
  const doc = aDoc ? await arquivo(tok, aDoc.fileId) : null;
  const video = aVid ? await arquivo(tok, aVid.fileId) : null;
  if (aDoc && !doc) throw new Error('o contato@ não conseguiu abrir as anotações do Gemini anexadas ao evento');
  const p = (x: number) => String(x).padStart(2, '0');
  const l = new Date(+inicio - 3 * 3600e3); // horário de Brasília
  const nomePasta = `${titulo} - ${l.getUTCFullYear()}/${p(l.getUTCMonth() + 1)}/${p(l.getUTCDate())} ${p(l.getUTCHours())}:${p(l.getUTCMinutes())} GMT-03:00`;
  // Doc + PDF: na subpasta que o Meet criou, se for do contato@; senão (Drive do sócio) numa subpasta nossa
  const destino = async () => {
    const mae = doc?.parents?.[0] ? await arquivo(tok, doc.parents[0]) : null;
    return mae?.capabilities?.canAddChildren ? mae.id : await pastaDaCall(tok, cfg.pasta_meet_id, nomePasta);
  };
  return await concluir(tok, cfg, reg, gravar, doc, video, externos, dryRun, destino, fimDe(ev));
}

// ---------------- comum: transcrição → raio-X → Doc + PDF → registro + aviso ----------------
async function concluir(tok: string, cfg: any, reg: any, gravar: (extra: any) => Promise<void>, doc: any, video: any, externos: string[], dryRun: boolean,
  destino: () => Promise<string>, fim?: Date): Promise<string> {
  const titulo = reg.titulo, inicio = new Date(reg.inicio);
  reg.gravacao_url = video?.webViewLink || null;
  reg.duracao_min = video?.videoMediaMetadata?.durationMillis ? Math.round(+video.videoMediaMetadata.durationMillis / 60000) : null;
  const texto = doc ? await textoDoc(tok, doc.id) : '';
  const iT = texto.search(/ - Transcrição\s*\n|Transcript\s*\n/);
  const temTranscricao = !!doc && iT >= 0 && texto.length - iT >= 2000;
  const horas = (Date.now() - +(fim || inicio)) / 3600e3;
  const soNotas = !temTranscricao && !!doc && texto.trim().length >= SO_NOTAS_MIN;
  if (soNotas && horas * 60 < SO_NOTAS_ESPERA_MIN) return 'aguardando: só as anotações por enquanto';
  if (!temTranscricao && !soNotas) {
    if (horas < SEM_TRANSCRICAO_DESISTE_H) return 'aguardando: transcrição ainda não publicada';
    await gravar({ status: 'sem_transcricao', motivo: 'a call não tem transcrição nem anotações do Gemini' });
    return 'sem transcrição';
  }
  reg.transcricao_url = doc.webViewLink;
  reg.motivo = soNotas ? SO_NOTAS : null;
  const transcricao = soNotas ? '' : texto.slice(iT), notas = soNotas ? texto : texto.slice(0, iT);

  // mentor = quem da lista de mentores mais falou (sem transcrição: quem mais aparece no título e nas anotações)
  const falas: Record<string, number> = {};
  for (const x of transcricao.matchAll(/^([^:\n]{3,40}): /gm)) falas[x[1].trim()] = (falas[x[1].trim()] || 0) + 1;
  const citado = (n: string) => (titulo + '\n' + notas).split(n).length - 1;
  const nomes = Object.keys(cfg.mentores || {});
  const mentor = (soNotas ? nomes.filter((n) => citado(n)).sort((a, b) => citado(b) - citado(a))[0] : nomes.filter((n) => falas[n]).sort((a, b) => falas[b] - falas[a])[0]) || null;
  const aluno = (await alunoPorEmails(externos)) || (await alunoPorFalantes(falas, Object.keys(cfg.mentores || {})));
  const contato = await contatoAluno(externos, aluno);
  if (dryRun) return `faria${soNotas ? ' (só anotações)' : ''}: ${titulo} · mentor ${mentor || '?'} · aluno ${aluno?.nome || 'não achado no CRM (' + externos.join(', ') + ')'}`;

  const quando = inicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const { raio, tokens, custo } = await gerarRaio(cfg.modelo, titulo, quando, notas, transcricao);
  const call = { ...reg, raio, aluno, mentor_nome: mentor || raio.nome_do_mentor, aluno_email: contato.email, aluno_telefone: contato.telefone };
  const dia = inicio.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/');
  const nome = `Raio-X da mentoria · ${aluno?.nome || raio.nome_do_aluno} · ${dia[0]}-${dia[1]}-${dia[2]}`;
  const pastaId = await destino();
  reg.pasta_id = pastaId; reg.pasta_url = call.pasta_url = `https://drive.google.com/drive/folders/${pastaId}`;
  const gdoc = await subir(tok, pastaId, nome, docHtml(call), 'text/html', 'application/vnd.google-apps.document');
  const pdfR = await fetch(`https://www.googleapis.com/drive/v3/files/${gdoc.id}/export?mimeType=application/pdf`, { headers: { Authorization: `Bearer ${tok}` } });
  const pdf = await subir(tok, pastaId, nome + '.pdf', new Uint8Array(await pdfR.arrayBuffer()), 'application/pdf');

  const final = { ...reg, status: 'ok', motivo: reg.motivo || null, mentor_nome: call.mentor_nome, cliente_id: aluno?.cliente_id || null, aluno_nome: aluno?.nome || raio.nome_do_aluno,
    aluno_email: contato.email, aluno_telefone: contato.telefone,
    raio, doc_url: gdoc.webViewLink, pdf_url: pdf.webViewLink, discord_msg_id: null as string | null, modelo: cfg.modelo, tokens, custo_usd: +custo.toFixed(4) };
  if (cfg.aviso_discord) final.discord_msg_id = await avisarDiscord(cfg, final);
  await gravar(final);
  return `ok: ${titulo} (US$ ${custo.toFixed(2)})`;
}

async function rodar(body: any) {
  const { data: cfg } = await sb.from('crm_call_mentoria_config').select('*').eq('id', 1).single();
  // refazer_docs: remonta Doc + PDF das calls prontas a partir do raio-X guardado (sem OpenAI), apaga os antigos e refaz o aviso
  if (body.refazer_docs) {
    const tok = await tokenGoogle(), tokRobo = await tokenGoogle(CONTA_ROBO).catch(() => '');
    let q = sb.from('crm_call_mentoria').select('*').eq('status', 'ok').order('inicio');
    if (body.id) q = q.eq('id', body.id);
    const { data: prontas } = await q;
    const out: string[] = [];
    for (const c of prontas || []) {
      const aluno = c.cliente_id ? await alunoPorCliente(c.cliente_id) : null;
      const call = { ...c, aluno };
      const d = new Date(c.inicio).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/');
      const nome = `Raio-X da mentoria · ${aluno?.nome || c.raio.nome_do_aluno} · ${d[0]}-${d[1]}-${d[2]}`;
      const gdoc = await subir(tok, c.pasta_id, nome, docHtml(call), 'text/html', 'application/vnd.google-apps.document');
      const pdfR = await fetch(`https://www.googleapis.com/drive/v3/files/${gdoc.id}/export?mimeType=application/pdf`, { headers: { Authorization: `Bearer ${tok}` } });
      const pdf = await subir(tok, c.pasta_id, nome + '.pdf', new Uint8Array(await pdfR.arrayBuffer()), 'application/pdf');
      for (const u of [c.doc_url, c.pdf_url]) { // apaga os arquivos antigos (os de antes de 17/11 são da conta robô)
        const id = String(u || '').match(/\/d\/([^/]+)/)?.[1];
        for (const t of id ? [tok, tokRobo].filter(Boolean) : []) {
          const d = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } }).catch(() => null);
          if (d?.ok) break;
        }
      }
      Object.assign(c, { doc_url: gdoc.webViewLink, pdf_url: pdf.webViewLink, aluno_nome: aluno?.nome || c.aluno_nome });
      if (cfg.aviso_discord) c.discord_msg_id = await avisarDiscord(cfg, c);
      await sb.from('crm_call_mentoria').update({ doc_url: c.doc_url, pdf_url: c.pdf_url, aluno_nome: c.aluno_nome, discord_msg_id: c.discord_msg_id, atualizado_em: new Date().toISOString() }).eq('id', c.id);
      out.push(`${c.titulo} → ${nome}`);
      await new Promise((ok) => setTimeout(ok, 1200));
    }
    return { refeitos: out };
  }
  // vincular: liga uma call à ficha certa do CRM (quando o email do convite não bate) e refaz o aviso
  if (body.vincular) {
    const { id, cliente_id } = body.vincular;
    const { data: c } = await sb.from('crm_call_mentoria').select('*').eq('id', id).single();
    const a = await alunoPorCliente(cliente_id);
    const ct = await contatoAluno([], a);
    Object.assign(c, { cliente_id, aluno_nome: a.nome, aluno_email: ct.email, aluno_telefone: ct.telefone });
    await sb.from('crm_call_mentoria').update({ cliente_id, aluno_nome: c.aluno_nome, aluno_email: c.aluno_email, aluno_telefone: c.aluno_telefone,
      atualizado_em: new Date().toISOString() }).eq('id', id);
    // refaz Doc + PDF + aviso já com o nome e o contato da ficha
    const refeito = await rodar({ refazer_docs: true, id });
    return { vinculado: `${c.titulo} → ${a.nome} (${ct.telefone || 'sem WhatsApp'})`, ...refeito };
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
  const manual = !!(body.de || body.pasta_id || body.evento_id);
  if (!cfg.ativo && !manual && !body.dry_run) return { ativo: false };
  const tok = await tokenGoogle();
  const res: string[] = [];
  const erro = (e: unknown) => String((e as Error).message || e).slice(0, 300);
  if (body.convidar || !manual) {
    const conv = await convidarContato(tok, !!body.dry_run);
    if (body.convidar) return { convidar: conv };
    res.push(...conv);
  }
  // modo antigo, sob pedido: uma subpasta do Meet
  if (body.pasta_id) {
    const p = await arquivo(tok, body.pasta_id, 'id,name,createdTime');
    if (!p) return { erro: 'pasta não encontrada' };
    try { res.push(`${p.name.slice(0, 70)} → ${await processarPasta(tok, cfg, p, !!body.dry_run)}`); }
    catch (e) {
      if (!body.dry_run) await sb.from('crm_call_mentoria').upsert({ pasta_id: p.id, status: 'erro', motivo: erro(e), atualizado_em: new Date().toISOString() }, { onConflict: 'pasta_id' });
      res.push(`${p.name.slice(0, 70)} → ERRO ${erro(e)}`);
    }
    return { resultado: res };
  }
  // agenda do contato@: calls 1:1 já encerradas no período
  const AG = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cfg.agenda_id)}/events`;
  let evs: any[] = [];
  if (body.evento_id) {
    const r = await fetch(`${AG}/${encodeURIComponent(body.evento_id)}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) return { erro: 'evento não encontrado na agenda do contato@' };
    evs = [await r.json()];
  } else {
    const de = body.de ? new Date(body.de) : new Date(Math.max(+new Date(cfg.desde), Date.now() - 7 * 864e5));
    const ate = body.ate ? new Date(body.ate) : new Date();
    let pagina = '';
    do {
      const r = await fetch(`${AG}?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${de.toISOString()}&timeMax=${ate.toISOString()}${pagina ? `&pageToken=${pagina}` : ''}`, { headers: { Authorization: `Bearer ${tok}` } });
      const j = await r.json();
      if (j.error) throw new Error('Agenda: ' + j.error.message);
      evs.push(...(j.items || [])); pagina = j.nextPageToken || '';
    } while (pagina);
    // só o que começou dentro do período e já terminou (com folga para o Gemini publicar as anotações)
    evs = evs.filter((e) => e.start?.dateTime && +new Date(e.start.dateTime) >= +de && +fimDe(e) < Date.now() - 10 * 60e3 && externosDaCall(e));
    if (body.so) evs = evs.filter((e) => String(e.summary || '').toLowerCase().includes(String(body.so).toLowerCase()));
  }
  // já resolvidas (ok/ignorado/sem transcrição) não voltam
  const { data: feitas } = evs.length ? await sb.from('crm_call_mentoria').select('evento_id').in('evento_id', evs.map((e) => e.id)).neq('status', 'erro') : { data: [] };
  const ja = new Set((feitas || []).map((x: any) => x.evento_id));
  const fila = evs.filter((e) => body.evento_id || !ja.has(e.id));
  let pesadas = 0;
  for (const e of fila) {
    const rot = `${String(e.start?.dateTime || '').slice(0, 16)} ${String(e.summary || '').slice(0, 60)}`;
    if (pesadas >= (body.max || cfg.max_por_execucao)) { res.push(`(restam ${fila.length - fila.indexOf(e)} para a próxima execução)`); break; }
    try {
      const r = await processarEvento(tok, cfg, e, !!body.dry_run);
      if (r.startsWith('ok')) pesadas++;
      res.push(`${rot} → ${r}`);
    } catch (x) {
      if (!body.dry_run) {
        const { data: ant } = await sb.from('crm_call_mentoria').select('id').eq('evento_id', e.id).limit(1);
        const linha = { evento_id: e.id, titulo: String(e.summary || '').trim(), inicio: e.start?.dateTime ? new Date(e.start.dateTime).toISOString() : null, status: 'erro', motivo: erro(x), atualizado_em: new Date().toISOString() };
        if (ant?.[0]) await sb.from('crm_call_mentoria').update(linha).eq('id', ant[0].id);
        else await sb.from('crm_call_mentoria').upsert({ pasta_id: `evento:${e.id}`, ...linha }, { onConflict: 'pasta_id' });
      }
      res.push(`${rot} → ERRO ${erro(x)}`);
    }
  }
  return { calls: evs.length, novas: fila.length, resultado: res };
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
