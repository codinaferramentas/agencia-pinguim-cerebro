/* Doc: Cerebros */

import { fetchCerebrosVivos } from '../docs.js?v=20260425k';

export async function gerar() {
  const cerebros = await fetchCerebrosVivos();

  const cerebrosHTML = cerebros.length === 0
    ? '<p style="color:var(--fg-muted)">Nenhum Cérebro cadastrado ainda.</p>'
    : `<ul class="docs-list">${cerebros.map(c => `
        <li>
          <strong>${c.nome}</strong> · <span style="color:var(--fg-muted)">${c.total_fontes || 0} fontes</span>
          ${c.descricao ? `<br><span style="color:var(--fg-muted);font-size:0.9em">${c.descricao}</span>` : ''}
        </li>
      `).join('')}</ul>`;

  return {
    titulo: 'Cérebros',
    lede: 'A memória viva da agência. Cada produto tem um Cérebro alimentado com tudo que existe sobre ele — e tudo que o sistema gera depois nasce daqui.',
    secoes: [
      {
        id: 'o-que-e',
        titulo: 'O que é um Cérebro',
        html: `
          <p>Um <strong>Cérebro</strong> é o repositório vivo de tudo que a Pinguim sabe sobre um produto específico. Cada produto tem o seu próprio Cérebro, separado dos outros.</p>
          <p>Pense num Cérebro como o "departamento de inteligência" daquele produto. Tudo que entra — aula gravada, página de venda, mensagem de aluno no Discord, objeção que apareceu na ligação, sacada que o Luiz teve no áudio — vai pro Cérebro do produto certo.</p>
          <p>Quando alguém (humano ou agente IA) precisa de algo sobre o produto, é o Cérebro que responde.</p>
        `,
      },
      {
        id: 'quatro-familias',
        titulo: 'As 4 famílias de Cérebro',
        html: `
          <p>Cérebros não são todos iguais. O Pinguim OS organiza Cérebros em <strong>4 famílias</strong>, cada uma com natureza própria mas compartilhando o mesmo motor de busca, vetorização e ingestão.</p>

          <h3>📦 Internos · Os produtos da Pinguim</h3>
          <p>Cada produto comercial vira um Cérebro Interno. Tem persona, prova social, cases por nicho, objeções, aulas, página de venda. É a memória completa do produto. Hoje a Pinguim tem <strong>9 produtos com Cérebro Interno</strong> ativos.</p>

          <h3>🔍 Externos · Concorrentes mapeados</h3>
          <p>Mesma anatomia dos Internos, só que apontando pra fora. Permite ao agente comercial comparar honestamente o que o concorrente entrega vs o que a Pinguim entrega. Será alimentado por raspagem de página de venda, aula, depoimento de concorrente.</p>

          <h3>📚 Metodologias · Biblioteca de técnica de venda</h3>
          <p>Diferente dos produtos: não tem aluno, não tem prova social, não tem nicho. Tem princípios, scripts e frameworks. <strong>5 metodologias já alimentadas</strong>: SPIN Selling, Sandler, Challenger, Tactical Empathy (Voss), MEDDIC. Cada uma tem um switch on/off — agentes consultam só as metodologias ativas.</p>

          <h3>👤 Clones · Sócios e conselheiros</h3>
          <p>Voz, manias, tom de pessoas — sócios da Pinguim (Luiz, Micha) ou conselheiros de mercado. Permite que agentes respondam "no tom" do sócio quando aluno pergunta algo estratégico. Camada futura.</p>

          <h3>Cérebros ativos hoje</h3>
          ${cerebrosHTML}
          <p style="margin-top:1.5em;font-size:0.9em;color:var(--fg-muted)">A lista atualiza automaticamente conforme novos Cérebros são criados, em qualquer das 4 famílias.</p>
        `,
      },
      {
        id: 'tipos-fonte',
        titulo: 'Os 5 tipos de fonte',
        html: `
          <p>O conhecimento dentro de um Cérebro é classificado em 5 tipos. Cada tipo serve a um propósito diferente, e o sistema usa essa categorização pra recuperar o material certo na hora certa.</p>
          <ul class="docs-list">
            <li><strong>Aula</strong> — conteúdo gravado do produto. Material denso, a base da entrega.</li>
            <li><strong>Página de venda</strong> — copy oficial em uso. Como o produto é comunicado pro mercado.</li>
            <li><strong>Depoimento</strong> — fala real de aluno satisfeito. Prova social, vocabulário autêntico.</li>
            <li><strong>Objeção</strong> — resistência que apareceu nas vendas. O que o lead reclama, duvida, hesita.</li>
            <li><strong>Sacada</strong> — insight do time, do Luiz, dos sócios. Conhecimento implícito que precisa virar explícito.</li>
          </ul>
        `,
      },
      {
        id: 'como-alimentar',
        titulo: 'Como o Cérebro é alimentado',
        html: `
          <p>O sistema é onívoro: aceita praticamente qualquer formato de conteúdo, e usa IA quando precisa pra ler:</p>
          <ul class="docs-list">
            <li><strong>Texto</strong> (TXT, MD, CSV, JSON, HTML) — caminho rápido, custo zero</li>
            <li><strong>PDF com texto selecionável</strong> — extrai direto, custo zero</li>
            <li><strong>PDF gráfico ou escaneado</strong> — IA Vision lê automaticamente, ~R$ 0,15 por arquivo</li>
            <li><strong>Imagem</strong> (PNG, JPG, screenshot, foto de quadro) — OCR via IA Vision, ~R$ 0,02</li>
            <li><strong>Áudio</strong> (MP3, áudio do WhatsApp, OGG, M4A) — Whisper transcreve, ~R$ 0,03 por minuto</li>
            <li><strong>URL do YouTube</strong> — primeiro tenta legendas oficiais (grátis), depois RapidAPI (~R$ 0,15)</li>
            <li><strong>URL do Instagram/TikTok/Facebook Ads</strong> — extrai legenda + hashtags + métricas via Apify</li>
            <li><strong>URL de página de venda, blog, artigo</strong> — primeiro tenta leitura direta de HTML (grátis, ~95% das páginas tradicionais), só cai pro Apify se a página for SPA ou bloquear bot</li>
          </ul>

          <p>Existem três modos de entrada:</p>
          <ol>
            <li><strong>Avulso</strong> — sobe um arquivo único OU cola uma URL. Ideal pra depoimento solto, sacada nova, vídeo do YouTube específico.</li>
            <li><strong>Pacote ZIP</strong> — sobe vários arquivos de uma vez (ex: pasta com todas as aulas do produto). Processa em ondas, sem travar.</li>
            <li><strong>Automático</strong> (em construção) — agentes monitorando Discord, WhatsApp, formulários. Quando aparece conteúdo novo, vai pro Cérebro certo sem ninguém precisar mexer.</li>
          </ol>
          <p>Em todos os casos, o sistema decide sozinho o melhor método. Se o custo de IA estimado passar de R$ 0,05, mostra um aviso antes — abaixo disso, processa silenciosamente.</p>
        `,
      },
      {
        id: 'consumo',
        titulo: 'O que o Cérebro alimenta',
        html: `
          <p>Um Cérebro nunca fica parado. Ele alimenta:</p>
          <ul class="docs-list">
            <li><strong>Persona</strong> — gerada e mantida automaticamente a partir do Cérebro</li>
            <li><strong>Copy e ofertas</strong> — agentes consultam antes de escrever (em construção)</li>
            <li><strong>Scripts de venda</strong> — Juliana usa as objeções recorrentes (em construção)</li>
            <li><strong>Atendimento</strong> — Luizinho responde aluno baseado nas dúvidas já mapeadas (em construção)</li>
            <li><strong>Decisões da Diretoria</strong> — sócios olham métricas reais do Cérebro pra decidir o que escalar</li>
          </ul>
        `,
      },
      {
        id: 'editar',
        titulo: 'Editar e gerenciar fontes',
        html: `
          <p>Cérebro não é caixa preta. A qualquer momento dá pra:</p>
          <ul class="docs-list">
            <li><strong>Editar o Cérebro</strong> — nome, ícone, emoji, descrição (botão ✎ no header)</li>
            <li><strong>Editar fonte individual</strong> — clica em qualquer fonte (Kanban, Lista ou Timeline) e o painel lateral abre com botões "✎ Editar", "🏷 Reclassificar", "🗑 Excluir"</li>
            <li><strong>Editar conteúdo</strong> — quando você muda o texto de uma fonte, o sistema apaga os vetores antigos e revetoriza automaticamente (custa frações de centavo)</li>
            <li><strong>Ver histórico</strong> de cargas (saber quando cada peça entrou e por quem)</li>
            <li><strong>Quarentena</strong> — arquivos que falharam ficam num bucket separado, gerenciáveis (excluir libera reupload)</li>
            <li><strong>Zerar</strong> — apagar todas as fontes pra recomeçar (operação destrutiva, com confirmação)</li>
          </ul>
          <p>Edição manual fica registrada no metadata (<code>editado_manualmente</code>) — auditoria sem fricção.</p>
        `,
      },
    ],
    pitch: `
      <p>Sem o Cérebro, conhecimento de produto vive em pastas no Drive, mensagens no WhatsApp, cabeças de pessoas. Inacessível pra IA, inconsistente pra humanos, perdível quando alguém sai da empresa.</p>
      <p>Com o Cérebro, a inteligência da agência fica <strong>protegida e produtiva</strong> — sempre disponível, sempre alimentando o que precisa ser feito. Vira ativo da empresa, não passivo dependente de pessoa.</p>
    `,
  };
}
