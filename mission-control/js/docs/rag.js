/* Doc: RAG e consumo de tokens */

export async function gerar() {
  return {
    titulo: 'RAG e consumo de tokens',
    lede: 'Como o sistema reduz drasticamente o custo de IA usando recuperação contextual. As três portas de entrada do conhecimento e as cinco regras de ouro pra manter o consumo sob controle.',
    secoes: [
      {
        id: 'problema',
        titulo: 'O problema que o RAG resolve',
        html: `
          <p>IA cobra por <strong>token</strong> — pedaço de texto consumido no processamento. Quanto mais texto você manda pra IA, mais caro. E o conhecimento de uma agência (todas as aulas, depoimentos, páginas, objeções) é muito grande pra mandar tudo de uma vez, toda vez.</p>
          <p>A abordagem ingênua seria: "todo pedido de copy ou persona, manda todo o material do produto pra IA". Custo: proibitivo. E pior — IA com contexto gigante perde precisão (efeito "lost in the middle").</p>
        `,
      },
      {
        id: 'rag-explicado',
        titulo: 'O que é RAG (em linguagem simples)',
        html: `
          <p><strong>RAG</strong> = Retrieval Augmented Generation. Em português técnico: geração aumentada por recuperação. Em português normal: <em>"em vez de mandar tudo, manda só o que é relevante"</em>.</p>
          <p>Funciona assim:</p>
          <ol>
            <li>Quando uma fonte entra no Cérebro (aula, depoimento, etc), o sistema corta ela em pedaços pequenos — <strong>chunks</strong></li>
            <li>Cada chunk é convertido num vetor numérico que representa o significado (não as palavras literais — o significado)</li>
            <li>Os vetores ficam guardados num banco especial</li>
            <li>Quando alguém faz um pedido ("escreve copy pro Elo focando em pais de criança pequena"), o sistema busca os 5-10 chunks mais relevantes pra esse pedido específico</li>
            <li>Só esses chunks vão pra IA, junto com a pergunta. A IA gera a resposta usando esse contexto enxuto e exato.</li>
          </ol>
          <p>Resultado: 90%+ de redução de tokens consumidos por chamada, sem perda de qualidade — pelo contrário, qualidade sobe porque o contexto fica focado.</p>
        `,
      },
      {
        id: 'tres-portas',
        titulo: 'As três portas de entrada do conhecimento',
        html: `
          <p>Conhecimento entra no Cérebro de três formas, e cada uma tem seu lugar:</p>

          <h3>1. Carga inicial (pacote ZIP)</h3>
          <p>Quando um produto novo é cadastrado, sobe-se de uma vez o "tudo" daquele produto: pasta com aulas, página de venda atual, depoimentos coletados, sacadas anotadas. O sistema processa em ondas, sem travar — cada onda processa 5 arquivos antes de pedir a próxima.</p>

          <h3>2. Upload manual (avulso)</h3>
          <p>No dia a dia, alguém da equipe sobe peça única: "esse depoimento de hoje", "essa objeção que apareceu na ligação", "essa sacada que o Luiz mandou em áudio". Botão Alimentar Avulso, sobe 1 arquivo, processa em segundos.</p>

          <h3>3. Cron (automático)</h3>
          <p>Em construção. Agentes rodando em segundo plano monitorando Discord, WhatsApp, formulários. Quando aparece conteúdo novo classificável, vai pro Cérebro do produto certo automaticamente. Zero atrito.</p>
        `,
      },
      {
        id: 'cinco-regras',
        titulo: 'As 5 regras de ouro pra manter custo baixo',
        html: `
          <ol>
            <li><strong>Chunk pequeno e específico</strong> — pedaços de 500-800 tokens funcionam melhor que pedaços de 3000. Recuperação fica mais precisa, contexto fica mais enxuto.</li>
            <li><strong>Modelo certo pra tarefa certa</strong> — não usa modelo top de linha pra tarefa boba. Vetorização usa modelo barato; síntese de Persona usa modelo de qualidade. Cada um no seu lugar.</li>
            <li><strong>Cache de respostas frequentes</strong> — se 10 pessoas pedem a mesma copy básica, a primeira chama IA, as outras 9 leem a resposta cacheada.</li>
            <li><strong>Reuso de derivados</strong> — Persona não é regenerada toda hora. É regenerada quando o Cérebro mudou de verdade. Daí o versionamento Opção B (só cria versão se houve mudança real).</li>
            <li><strong>Métrica de custo visível</strong> — todo painel mostra tokens consumidos. Quem paga vê o quanto, e isso disciplina o uso.</li>
          </ol>
        `,
      },
      {
        id: 'consumo-real',
        titulo: 'Consumo real esperado',
        html: `
          <p>Pra dar uma ideia de ordem de grandeza, com a arquitetura atual:</p>
          <ul class="docs-list">
            <li><strong>Carga inicial</strong> de um produto (50 arquivos, ~500 chunks): processamento custa centavos a poucos reais por produto</li>
            <li><strong>Geração de Persona</strong>: alguns centavos por geração, dependendo do tamanho do Cérebro</li>
            <li><strong>Geração de copy via agente</strong>: centavos por copy</li>
            <li><strong>Chamada conversacional</strong> (chat com agente): frações de centavo por turno</li>
          </ul>
          <p>O custo escala com o uso, mas a alavanca é forte: o que custaria horas de trabalho humano custa centavos de IA — desde que a arquitetura RAG esteja certa.</p>
        `,
      },
    ],
    pitch: `
      <p>Sistemas de IA sem RAG ficam caros e imprecisos no momento que crescem. O Pinguim OS foi desenhado com RAG desde o primeiro dia. Isso significa que <strong>a infraestrutura aguenta multiplicação</strong>: 10 produtos, 50 produtos, 500 produtos — o motor não muda, só os dados.</p>
      <p>Pra venda do sistema, esse argumento técnico vira argumento comercial: "o concorrente vai sangrar token quando crescer; nós, não".</p>
    `,
  };
}
