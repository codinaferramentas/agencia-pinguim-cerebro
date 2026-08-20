// Ingesta o MD de funcionalidades do app ProAlt (material de vendas da Bia)
// em pinguim.cerebro_fontes. Vetorizacao: rodar src/vetorizar-pendentes.mjs depois.
const fs = require('fs');
const env = fs.readFileSync('c:/Squad/.env.local', 'utf8');
env.split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'pinguim' } });

const TITULO = 'APP ProAlt — Guia de Funcionalidades (material de vendas Bia)';

(async () => {
  // resolve cerebro do proalt via slug (nunca hardcode cego)
  const { data: prod, error: e1 } = await s.from('produtos').select('id, nome').eq('slug', 'proalt').maybeSingle();
  if (e1 || !prod) { console.error('produto proalt nao encontrado', e1); process.exit(1); }
  const { data: cer, error: e2 } = await s.from('cerebros').select('id').eq('produto_id', prod.id).maybeSingle();
  if (e2 || !cer) { console.error('cerebro proalt nao encontrado', e2); process.exit(1); }
  console.log('cerebro proalt:', cer.id);

  // Principio 11: SELECT antes de CREATE
  const { data: existentes } = await s.from('cerebro_fontes')
    .select('id, titulo, ingest_status')
    .eq('cerebro_id', cer.id)
    .ilike('titulo', '%funcionalidade%');
  if (existentes && existentes.length) {
    console.log('JA EXISTE fonte parecida — atualizando conteudo em vez de duplicar:');
    existentes.forEach(f => console.log(' ', f.id, f.titulo, f.ingest_status));
    const alvo = existentes[0];
    const conteudo = fs.readFileSync('c:/Squad/docs/BIA-PROALT-APP-FUNCIONALIDADES.md', 'utf8');
    const { error: eU } = await s.from('cerebro_fontes')
      .update({ conteudo_md: conteudo, titulo: TITULO })
      .eq('id', alvo.id);
    if (eU) { console.error('erro update', eU); process.exit(1); }
    // apaga chunks antigos pra revetorizar
    const { error: eD } = await s.from('cerebro_fontes_chunks').delete().eq('fonte_id', alvo.id);
    if (eD) { console.error('erro delete chunks', eD); process.exit(1); }
    console.log('ATUALIZADO (chunks antigos removidos, rodar vetorizar-pendentes):', alvo.id);
    return;
  }

  const conteudo = fs.readFileSync('c:/Squad/docs/BIA-PROALT-APP-FUNCIONALIDADES.md', 'utf8');
  const { data: nova, error: e3 } = await s.from('cerebro_fontes').insert({
    cerebro_id: cer.id,
    titulo: TITULO,
    tipo: 'material_apoio',
    origem: 'lote',   // export manual do app entregue pelo Andre
    conteudo_md: conteudo,
    metadata: {
      origem: 'app-proalt-export',
      uso: 'agente-vendas-bia',
      data_entrega: '2026-08-20',
      nota: 'Andre: app = ~80% do motivo de compra do ProAlt. Tom: "O Sistema", nunca "a IA".',
    },
  }).select('id').single();
  if (e3) { console.error('erro insert', e3); process.exit(1); }
  console.log('INSERIDO:', nova.id, '- rodar: node src/vetorizar-pendentes.mjs');
})();
