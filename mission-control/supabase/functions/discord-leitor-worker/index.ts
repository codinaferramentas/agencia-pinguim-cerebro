// ========================================================================
// Edge Function: discord-leitor-worker
// ========================================================================
// Lê TODOS os canais de texto do servidor do Discord (e os tópicos ativos) e guarda cada mensagem em
// pinguim.discord_mensagens (André 19/11/2026: "100% do Discord tem que estar no Mapa").
// Substitui o leitor antigo do server-cli (lib/discord-bot.js), que parou em 14/08 e só cobria 3 canais.
// SÓ LEITURA no Discord: não posta, não reage, não apaga nada.
// Roda pelo cron a cada 2 min. Cada canal continua de onde parou (maior message_id já guardado).
// Canal sem nenhuma mensagem guardada: começa pelas 100 mais recentes (não varre o histórico inteiro).
// Modos (body): {} = cron · {dry_run:true} = só conta o que leria, não grava
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getChave } from '../_shared/cofre.ts';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false }, db: { schema: 'pinguim' } });
const CONSUMIDOR = 'discord-leitor-worker';
const PAGINAS_MAX = 5; // até 500 mensagens novas por canal por rodada (o resto fica para a próxima)

let _bot = '';
async function discord(path: string): Promise<any> {
  _bot = _bot || await getChave('DISCORD_BOT_TOKEN', CONSUMIDOR);
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch('https://discord.com/api/v10' + path, { headers: { Authorization: `Bot ${_bot}` } });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await new Promise((ok) => setTimeout(ok, Math.ceil(((j as any).retry_after || 1) * 1000))); continue; }
    if (r.status === 403 || r.status === 404) return { semAcesso: r.status };
    if (!r.ok) throw new Error(`discord ${r.status} em ${path}`);
    return r.json();
  }
  throw new Error('discord: limite de chamadas');
}
const maiorId = (a: string | null, b: string | null) => (!a ? b : !b ? a : BigInt(a) >= BigInt(b) ? a : b);

function linha(m: any, guild: { id: string; nome: string }, canal: any, pai: any | null) {
  return {
    message_id: m.id, guild_id: guild.id, guild_nome: guild.nome,
    canal_id: canal.id, canal_nome: pai ? `${pai.name} › ${canal.name}` : canal.name, canal_tipo: String(canal.type), parent_canal_id: pai ? pai.id : null,
    autor_id: m.author?.id || null, autor_nome: m.member?.nick || m.author?.global_name || m.author?.username || null, autor_bot: !!m.author?.bot,
    conteudo: m.content || '', postado_em: m.timestamp, editado_em: m.edited_timestamp || null,
    mencoes_users: (m.mentions || []).map((u: any) => u.id), mencoes_roles: m.mention_roles || [], menciona_everyone: !!m.mention_everyone,
    reacoes_qtd: (m.reactions || []).reduce((s: number, r: any) => s + (r.count || 0), 0),
    thread_id: m.thread?.id || null, anexos_qtd: (m.attachments || []).length, embed_qtd: (m.embeds || []).length,
    metadata: { anexos: (m.attachments || []).map((a: any) => ({ nome: a.filename, url: a.url })), tipo: m.type, referencia: m.message_reference?.message_id || null },
  };
}

async function ultimoGuardado(canalId: string): Promise<string | null> {
  const { data } = await sb.from('discord_mensagens').select('message_id').eq('canal_id', canalId).order('postado_em', { ascending: false }).limit(1);
  return data?.[0]?.message_id || null;
}

async function lerCanal(canal: any, guild: { id: string; nome: string }, pai: any | null, dryRun: boolean) {
  const ult = await ultimoGuardado(canal.id);
  let depois = ult, total = 0;
  for (let p = 0; p < PAGINAS_MAX; p++) {
    const q = depois ? `?limit=100&after=${depois}` : '?limit=100';
    const msgs = await discord(`/channels/${canal.id}/messages${q}`);
    if (msgs?.semAcesso) return { canal: canal.name, sem_acesso: msgs.semAcesso };
    if (!Array.isArray(msgs) || !msgs.length) break;
    if (!dryRun) {
      const { error } = await sb.from('discord_mensagens').upsert(msgs.map((m: any) => linha(m, guild, canal, pai)), { onConflict: 'message_id', ignoreDuplicates: true });
      if (error) throw new Error(`${canal.name}: ${error.message}`);
    }
    total += msgs.length;
    depois = msgs.reduce((acc: string | null, m: any) => maiorId(acc, m.id), depois);
    if (!ult) break; // canal novo: só as 100 mais recentes
    if (msgs.length < 100) break;
  }
  return { canal: pai ? `${pai.name} › ${canal.name}` : canal.name, novas: total };
}

serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const dryRun = !!body.dry_run;
  try {
    const guildId = await getChave('DISCORD_GUILD_ID', CONSUMIDOR);
    const g = await discord(`/guilds/${guildId}`);
    const guild = { id: guildId, nome: g?.name || 'Pinguim' };
    const canais = await discord(`/guilds/${guildId}/channels`);
    if (!Array.isArray(canais)) throw new Error('não consegui listar os canais');
    const texto = canais.filter((c: any) => c.type === 0 || c.type === 5); // texto e anúncios
    const res: any[] = [];
    for (const c of texto) { try { res.push(await lerCanal(c, guild, null, dryRun)); } catch (e) { res.push({ canal: c.name, erro: String((e as Error).message) }); } }
    // tópicos (threads) ativos também entram, com o nome do canal-pai
    const ativos = await discord(`/guilds/${guildId}/threads/active`);
    const porId = new Map(canais.map((c: any) => [c.id, c]));
    for (const t of (ativos?.threads || [])) { try { res.push(await lerCanal(t, guild, porId.get(t.parent_id) || null, dryRun)); } catch (e) { res.push({ canal: t.name, erro: String((e as Error).message) }); } }
    const novas = res.reduce((s, r) => s + (r.novas || 0), 0);
    return Response.json({ ok: true, dry_run: dryRun, canais: res.length, novas, detalhe: res.filter((r) => r.novas || r.erro || r.sem_acesso) });
  } catch (e) {
    return Response.json({ ok: false, erro: String((e as Error).message) }, { status: 500 });
  }
});
