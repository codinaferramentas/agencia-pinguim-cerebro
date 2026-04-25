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
        id: 'cerebros-ativos',
        titulo: 'Cérebros ativos',
        html: `
          <p>Hoje a Pinguim tem os seguintes Cérebros configurados no sistema:</p>
          ${cerebrosHTML}
          <p style="margin-top:1.5em;font-size:0.9em;color:var(--fg-muted)">Esta lista atualiza automaticamente conforme novos Cérebros são criados.</p>
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
            <li><strong>URL do Instagram/TikTok</strong> — extrai legenda + hashtags + métricas via Apify</li>
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
            <li><strong>Scripts de venda</strong> — Zezinho usa as objeções recorrentes (em construção)</li>
            <li><strong>Atendimento</strong> — Luizinho responde aluno baseado nas dúvidas já mapeadas (em construção)</li>
            <li><strong>Decisões da Diretoria</strong> — sócios olham métricas reais do Cérebro pra decidir o que escalar</li>
          </ul>
        `,
      },
      {
        id: 'editar',
        titulo: 'Editar e zerar',
        html: `
          <p>Cérebro não é caixa preta. A qualquer momento dá pra:</p>
          <ul class="docs-list">
            <li><strong>Editar</strong> nome, ícone, emoji, descrição (botão ✎ no header do Cérebro)</li>
            <li><strong>Ver histórico</strong> de cargas (saber quando cada peça entrou e por quem)</li>
            <li><strong>Zerar</strong> — apagar todas as fontes pra recomeçar (operação destrutiva, com confirmação)</li>
          </ul>
        `,
      },
    ],
    pitch: `
      <p>Sem o Cérebro, conhecimento de produto vive em pastas no Drive, mensagens no WhatsApp, cabeças de pessoas. Inacessível pra IA, inconsistente pra humanos, perdível quando alguém sai da empresa.</p>
      <p>Com o Cérebro, a inteligência da agência fica <strong>protegida e produtiva</strong> — sempre disponível, sempre alimentando o que precisa ser feito. Vira ativo da empresa, não passivo dependente de pessoa.</p>
    `,
  };
}
