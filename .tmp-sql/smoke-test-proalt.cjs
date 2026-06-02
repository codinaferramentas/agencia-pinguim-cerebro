const fs = require('fs');
const env = {};
fs.readFileSync('c:/Squad/.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim();
});
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const TESTES = [
  { q: 'preciso de um anúncio do ProAlt pro Meta', e: 'copy-anuncio-meta-proalt' },
  { q: 'RSA pra Google Ads do ProAlt', e: 'copy-anuncio-google-proalt' },
  { q: 'roteiro de reels do ProAlt de 60s', e: 'criativo-reels-proalt' },
  { q: 'post pra Instagram em carrossel do ProAlt', e: 'post-organico-proalt' },
  { q: 'aquecimento pré-lançamento do ProAlt 7 dias', e: 'sequencia-aquecimento-proalt' },
  { q: 'me dá 20 headlines pra ads do ProAlt', e: 'headlines-anuncio-proalt' },
  { q: 'ganchos pra stories do ProAlt', e: 'ganchos-stories-proalt' },
  { q: 'roteiro VSL do ProAlt 10 minutos', e: 'roteiro-vsl-proalt' },
  { q: 'escrever copy pra página de venda do ProAlt', e: 'copy-pagina-venda-proalt' },
  { q: 'roteiro da call de venda do ProAlt', e: 'roteiro-call-vendas-proalt' },
  { q: 'cliente do ProAlt disse tá caro', e: 'quebrador-objecao-preco-proalt' },
  { q: 'calcula ROI do ProAlt pra esse lead', e: 'calculadora-roi-proalt' },
  { q: 'criar order bump pro ProAlt', e: 'gerador-oferta-bump-proalt' },
  { q: 'resposta de DM no Insta sobre ProAlt', e: 'responder-dm-instagram-proalt' },
  { q: 'agendar call com lead do ProAlt', e: 'agendador-call-proalt' },
  { q: 'primeira call discovery com lead ProAlt', e: 'roteiro-discovery-proalt' },
  { q: 'esse lead é ProAlt? qual perfil ideal', e: 'perfil-ideal-aluna-proalt' },
  { q: 'lead do ProAlt sumiu, follow-up', e: 'follow-up-lead-frio-proalt' },
  { q: 'preciso de prova social do ProAlt', e: 'prova-social-proalt' },
  { q: 'aluno comprou ProAlt hoje, monta onboarding', e: 'pos-venda-onboarding-proalt' },
  { q: 'aluno do ProAlt não consegue acessar', e: 'suporte-aluno-proalt' },
  { q: 'aluno entregou tarefa do ProAlt, corrige', e: 'corretor-tarefa-proalt' },
  { q: 'mensagem de motivação semanal pra aluno ProAlt', e: 'motivador-aluno-proalt' },
  { q: 'check-in da semana com aluno do ProAlt', e: 'checkin-progresso-proalt' },
  { q: 'aluno do ProAlt sumiu, reativar', e: 'reativador-aluno-sumido-proalt' },
  { q: 'aluno do ProAlt vai vencer, renovação', e: 'renovacao-proalt' },
  { q: 'aluno do ProAlt pediu reembolso, segurar', e: 'retencao-reembolso-proalt' },
  { q: 'aluno do ProAlt, próximo produto Pinguim', e: 'upsell-recomendador-proalt' },
  { q: 'pedir indicação pra aluno do ProAlt com resultado', e: 'indicacao-aluno-proalt' },
  { q: 'recrutar aluno ProAlt como afiliado', e: 'affiliate-recruiter-proalt' },
  { q: 'transforma esse case do ProAlt em história', e: 'storyteller-aluno-proalt' },
  { q: 'sequência de 5 emails de venda ProAlt', e: 'email-vendas-proalt' },
  { q: 'newsletter do ProAlt essa semana', e: 'newsletter-proalt' },
  { q: 'email de nutrição pra lead ProAlt', e: 'email-nutricao-proalt' },
  { q: 'post LinkedIn sobre ProAlt', e: 'post-linkedin-proalt' },
  { q: 'roteiro do próximo episódio do podcast ProAlt', e: 'podcast-script-proalt' },
  { q: 'carta de venda long-form do ProAlt', e: 'carta-vendas-direct-mail-proalt' },
  { q: 'adiciona essa pergunta no FAQ do ProAlt', e: 'gerador-faq-vivo-proalt' },
  { q: 'sugere variações de garantia pro ProAlt', e: 'garantia-criativa-proalt' },
  { q: 'mapa da jornada do aluno do ProAlt', e: 'jornada-cliente-proalt' },
];

(async () => {
  let ok = 0, fail = 0;
  const falhas = [];
  let custoBrl = 0;
  for (const t of TESTES) {
    const r = await fetch('https://wmelierxzpjamiofeemh.supabase.co/functions/v1/tool-roteador-v5', {
      method: 'POST',
      headers: { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: t.q }),
    });
    if (!r.ok) { fail++; falhas.push({...t, v5:'HTTP_ERR'}); process.stdout.write('!'); continue; }
    const j = await r.json();
    custoBrl += j.custo?.brl || 0;
    const escolhido = j.sem_agente_apto ? 'sem_agente_apto' : j.agente_escolhido;
    if (escolhido === t.e) { ok++; process.stdout.write('.'); }
    else { fail++; falhas.push({...t, v5: escolhido}); process.stdout.write('X'); }
  }
  console.log(`\n\nAcerto: ${ok}/${TESTES.length} (${Math.round(ok/TESTES.length*100)}%)`);
  console.log(`Custo: R$ ${custoBrl.toFixed(4)}`);
  if (falhas.length) {
    console.log('\nFalhas:');
    for (const f of falhas) console.log(`  "${f.q}" → esp ${f.e} → v5 ${f.v5}`);
  }
})();
