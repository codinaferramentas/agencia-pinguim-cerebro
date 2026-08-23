// Monitor do piloto da Bia: mostra cada lead, etapa, estado e últimas mensagens.
const fs = require('fs');
const env = fs.readFileSync('c:/Squad/.env.local', 'utf8');
env.split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'pinguim' } });

const ESTADO_EMOJI = {
  novo: '🆕', template_enviado: '📤', conversando: '💬', aguardando_retorno: '⏳',
  humano: '🙋', comprou: '💰', comprou_antes: '🎓', optout: '🚫', encerrado: '🔚',
};

(async () => {
  const { data: leads } = await s.from('bia_leads').select('*').order('criado_em', { ascending: true });
  if (!leads?.length) { console.log('Nenhum lead ainda. Aguardando o disparo...'); return; }

  console.log(`\n=== PILOTO BIA — ${leads.length} lead(s) ===\n`);
  let vendas = 0, conversando = 0, optout = 0, humano = 0, jaAluno = 0;

  for (const l of leads) {
    const { data: conv } = await s.from('bia_conversas').select('*').eq('lead_id', l.id).order('criado_em', { ascending: false }).limit(1).maybeSingle();
    const { data: msgs } = conv ? await s.from('bia_mensagens').select('papel,conteudo,criado_em').eq('conversa_id', conv.id).order('criado_em', { ascending: false }).limit(2) : { data: [] };
    const nQ = conv ? (await s.from('bia_mensagens').select('id', { count: 'exact', head: true }).eq('conversa_id', conv.id).eq('papel', 'lead')).count : 0;

    if (l.estado === 'comprou') vendas++;
    else if (l.estado === 'comprou_antes') jaAluno++;
    else if (l.estado === 'optout') optout++;
    else if (l.estado === 'humano') humano++;
    else if (l.estado === 'conversando' || l.estado === 'aguardando_retorno') conversando++;

    const emoji = ESTADO_EMOJI[l.estado] || '❓';
    console.log(`${emoji} ${l.nome || l.telefone} | ${l.estado} | etapa=${conv?.etapa || '-'} | ${nQ} msgs do lead`);
    (msgs || []).reverse().forEach(m => {
      const tag = m.papel === 'lead' ? '  👤' : m.papel === 'bia' ? '  🐧' : '  ·';
      console.log(`${tag} ${(m.conteudo || '').slice(0, 90)}`);
    });
    console.log();
  }

  console.log('--- PLACAR ---');
  console.log(`💰 vendas: ${vendas} | 💬 conversando: ${conversando} | ⏳ aguardando: parte de conversando`);
  console.log(`🎓 já eram alunos: ${jaAluno} | 🙋 pediram humano: ${humano} | 🚫 opt-out: ${optout}`);
})();
