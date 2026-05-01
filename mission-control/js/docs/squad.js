/* Doc: Squad de agentes */

export async function gerar() {
  return {
    titulo: 'Squad de agentes',
    lede: 'Os 9 agentes IA da Pinguim, organizados como uma agência. Cada um tem casa, papel, voz própria, e atua em paralelo no Squad.',
    secoes: [
      {
        id: 'conceito',
        titulo: 'Por que organizar IA como uma agência',
        html: `
          <p>A maioria das empresas usa IA como ferramenta solta — "ChatGPT pra copy, Claude pra código, Midjourney pra imagem". Cada uso é isolado, sem memória do anterior, sem coordenação entre tarefas.</p>
          <p>O Pinguim OS faz diferente: organiza os agentes IA como uma <strong>agência paralela</strong>. Existe um Squad com Diretoria, departamentos, hierarquia, conversa entre agentes. Quando uma tarefa entra no sistema, ela é distribuída pro agente certo, que pode pedir input dos outros, escalar pra Diretoria se for decisão grande.</p>
          <p>Isso espelha como uma agência humana funciona — e é por isso que faz sentido pra negócio. O time aprende mais rápido a interagir com o Squad porque ele já está estruturado de forma familiar.</p>
        `,
      },
      {
        id: 'os-9-agentes',
        titulo: 'Os 9 agentes',
        html: `
          <h3>Diretoria</h3>
          <ul class="docs-list">
            <li><strong>Luiz</strong> · CEO — fala de números, meta, CAC, caixa, decisão de aprovar/dobrar</li>
            <li><strong>Pedro</strong> · Estratégia — fala de tese, funil, timing, posicionamento</li>
            <li><strong>Micha</strong> · Inovação — fala de Reels, Stories, audiência, conteúdo lo-fi, viralização</li>
          </ul>
          <p style="font-size:0.9em;color:var(--fg-muted)">A Diretoria delibera entre si quando está em ação. Você vê os 3 sócios conversando com balões de fala curtos, refletindo o vocabulário real de cada um.</p>

          <h3>Departamentos operacionais</h3>
          <ul class="docs-list">
            <li><strong>Aurora</strong> · Marketing — escreve copy, consulta persona, monta narrativas</li>
            <li><strong>Codina</strong> · Marketing IA — automatiza fluxos, otimiza CAC, cuida da stack técnica</li>
            <li><strong>Juliana</strong> · Comercial — gerencia pipeline, fecha venda, lida com objeções</li>
            <li><strong>Ludmila</strong> · RH — entrevistas, contratos, cultura, avaliação</li>
            <li><strong>Brenda</strong> · Financeiro — caixa, boleto, nota fiscal, orçamento</li>
            <li><strong>Luizinho</strong> · Atendimento — responde aluno, fecha ticket, resolve dúvida</li>
          </ul>
        `,
      },
      {
        id: 'animacao',
        titulo: 'Animação visível do Squad em ação',
        html: `
          <p>Quando o sistema executa uma tarefa longa (gerar Persona, alimentar Cérebro com pacote, etc), o painel mostra o Squad trabalhando em pixel art. Não é decoração — é <strong>visualização real do que está acontecendo</strong> nos bastidores.</p>
          <p>Você vê:</p>
          <ul class="docs-list">
            <li>Os agentes envolvidos na tarefa caminhando entre os cômodos</li>
            <li>Falas em balões refletindo o que cada um está fazendo</li>
            <li>Cômodo da Diretoria iluminado quando os sócios estão deliberando</li>
            <li>Agentes ociosos fazendo ações idle decorativas (olhar ao redor, ler papel, conversar)</li>
            <li>Quadro do Pinguim na parede da Diretoria, headline "Agência Pinguim · IA" no topo</li>
          </ul>
          <p>O efeito é que tarefa de IA deixa de ser "loading abstrato" e vira "operação acontecendo". Apresentação do sistema fica memorável.</p>
        `,
      },
      {
        id: 'identidade',
        titulo: 'Identidade espelha a agência real',
        html: `
          <p>Os nomes do Squad não são fictícios — são os mesmos da agência humana. Luiz, Pedro, Micha são sócios reais da Pinguim. Aurora, Codina, Juliana, Ludmila, Brenda, Luizinho são personagens que representam funções reais.</p>
          <p>Cada agente IA tem voz própria, treinada com o vocabulário real da pessoa correspondente. O Micha digital fala de Reels e lo-fi porque o Micha humano fala disso o dia todo. Isso cria <strong>identificação</strong> — sócios reconhecem a si mesmos na animação, time reconhece o tom de cada pessoa.</p>
          <p>Vira marketing interno do sistema. E externo: cliente que vê a animação entende imediatamente que isso aqui não é template genérico de SaaS.</p>
        `,
      },
      {
        id: 'toggle',
        titulo: 'Liga e desliga',
        html: `
          <p>A animação do Squad é um <strong>recurso opcional</strong>. No rodapé da sidebar tem um botão "Squad · on/off". Quando desligado, todas as tarefas longas mostram a barra de progresso tradicional. Quando ligado, mostra a animação do Squad.</p>
          <p>Isso é importante: pra demonstração e momento de vender o sistema, anima. Pra rotina rápida, alguém pode preferir a barra simples. Escolha do usuário.</p>
        `,
      },
    ],
    pitch: `
      <p>Squad de agentes não é só feature técnica. É <strong>narrativa de produto</strong>. Quando um cliente em potencial vê a animação rodando enquanto o sistema gera uma Persona dele, ele não vê "loading bar" — ele vê uma <em>operação inteligente em ação</em>.</p>
      <p>Isso muda completamente o pitch comercial. Deixa de ser "compra um software de IA" e vira "contrata uma agência paralela de IA". O preço justificável sobe; a memorabilidade da demo sobe; a chance de fechamento sobe.</p>
    `,
  };
}
