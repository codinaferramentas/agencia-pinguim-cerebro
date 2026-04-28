/* Doc: Visao geral · Arquitetura */

export async function gerar() {
  return {
    titulo: 'Visão geral · Arquitetura',
    lede: 'O que é o Pinguim OS, por que ele existe, e como tudo dentro dele se conecta. Esta é a porta de entrada — leia primeiro.',
    secoes: [
      {
        id: 'o-que-e',
        titulo: 'O que é o Pinguim OS',
        html: `
          <p>O <strong>Pinguim OS</strong> é o sistema operacional da Agência Pinguim. A palavra "OS" é literal: assim como Windows ou macOS organizam o que roda em cima do computador, o Pinguim OS organiza tudo que roda dentro da agência — produtos, conteúdo, vendas, pessoas, agentes IA.</p>
          <p>Ele não é um dashboard. Não é um Notion. Não é um CRM. É a <strong>infraestrutura</strong> em cima da qual o trabalho acontece.</p>
          <p>Quando alguém da equipe precisa criar uma copy nova, gerar uma persona, responder a objeção de aluno, lançar uma campanha — em todos esses momentos, o que ela usa é o Pinguim OS.</p>
        `,
      },
      {
        id: 'por-que-existe',
        titulo: 'Por que existe',
        html: `
          <p>Agência cresce, time multiplica, processos engordam. Cada novo cliente exige aprender a marca dele do zero. Cada nova copy demora porque ninguém lembra exatamente o que o aluno disse na última pesquisa. Cada agente IA que entra no fluxo precisa ser explicado de novo.</p>
          <p>O Pinguim OS nasceu pra resolver isso de raiz: <strong>centralizar a inteligência da agência num lugar só, sempre vivo, sempre consultável</strong>. Tanto humano quanto IA bebem da mesma fonte.</p>
          <p>O efeito direto é menos esforço cognitivo, menos retrabalho, mais tempo livre pra trabalho de verdade — e mais clientes atendidos com a mesma equipe.</p>
        `,
      },
      {
        id: 'tres-camadas',
        titulo: 'As três camadas do sistema',
        html: `
          <p>O Pinguim OS é construído em três camadas que conversam entre si:</p>

          <h3>1. Cérebros — a memória</h3>
          <p>Cada produto da Pinguim (Elo, ProAlt, Lira, Taurus, Orion) tem um Cérebro. Um Cérebro é um repositório de fontes — aulas, depoimentos, objeções, sacadas, páginas de venda — sobre aquele produto específico. É a memória institucional viva.</p>

          <h3>2. Personas e derivados — a interpretação</h3>
          <p>A partir das fontes do Cérebro, o sistema gera artefatos prontos pra uso: a Persona (dossiê de 11 blocos sobre quem compra), e no futuro copies, scripts, ofertas. Esses derivados versionam — toda mudança fica registrada.</p>

          <h3>3. Squad de agentes — a execução</h3>
          <p>9 agentes IA organizados como uma agência (Diretoria, Marketing, Comercial, RH, Financeiro, Atendimento). Cada um sabe consultar o Cérebro certo, conversa com os outros, e executa o trabalho do dia a dia.</p>
        `,
      },
      {
        id: 'epp',
        titulo: 'EPP — Evolução Permanente Pinguim',
        html: `
          <p><strong>Agente Pinguim ≠ chatbot.</strong> Um chatbot responde. Um Agente Pinguim evolui.</p>
          <p>Premissa dura do Pinguim OS: nenhum agente é estático. Todo agente nasce sabendo seguir três leis — e quem não segue, não é agente Pinguim, é só um prompt.</p>
          <p><em>Origem da sigla:</em> EPP nasceu como "Evolução Permanente Pessoal", método criado pelo André Codina pra evolução individual contínua. Quando virou protocolo de agente, o segundo P passou a significar Pinguim — mesma sigla, mesma filosofia, agora aplicada à empresa.</p>

          <h3>Lei 1 — Captação alimenta o Cérebro <em>(em produção)</em></h3>
          <p>Toda fonte que entra (Discord, Upload, Integração) é processada e indexada na hora. Vira parte da memória disponível pra qualquer agente buscar. Nada se perde, nada precisa ser ensinado de novo.</p>

          <h3>Lei 2 — Output aprovado vira referência <em>(em construção)</em></h3>
          <p>Quando você aprova uma persona, copy ou página gerada por agente, ela é salva como <strong>nova fonte do Cérebro</strong>. Na próxima geração, o agente consulta "o que já funcionou aqui" e usa de exemplo.</p>
          <p>Exemplo prático: você pede uma página pro Elo, gera, ajusta o título, aprova. Da próxima vez que alguém pedir página pro Elo, o agente lê: "essa página foi aprovada com esse padrão de título", e segue na mesma direção.</p>

          <h3>Lei 3 — Feedback humano vira contexto <em>(planejado)</em></h3>
          <p>Cada execução de agente é logada (input, output, contexto usado). Você dá 👍/👎 ou comentário livre. Antes da próxima geração do mesmo tipo, o agente lê os feedbacks anteriores e ajusta — sem treinar modelo, sem fine-tuning. É contexto acumulado.</p>
          <p>Exemplo: você diz pro agente de copy "evite gatilhos de medo no Elo, o público reage mal". Da próxima copy pro Elo, esse aprendizado entra no prompt automaticamente.</p>

          <h3>Por que importa</h3>
          <p>Sem EPP, agente IA é fotografia: nasce bom, envelhece igual. Com EPP, agente é vídeo: cada uso o melhora. <strong>O agente que você usa hoje é melhor que o agente de ontem</strong> — sem retreino, sem custo extra de IA, sem trabalho adicional do time. É infraestrutura que vira ativo, não software que vira passivo.</p>
        `,
      },
      {
        id: 'fluxo',
        titulo: 'Como o trabalho flui',
        html: `
          <p>Exemplo prático — alguém precisa de uma copy nova pra anúncio do Elo:</p>
          <ol>
            <li>O agente Aurora (Marketing) recebe o pedido</li>
            <li>Aurora consulta o <strong>Cérebro do Elo</strong>: pega depoimentos relevantes, objeções recorrentes, vocabulário do aluno</li>
            <li>Consulta a <strong>Persona do Elo</strong>: vê quem é o avatar, qual o nível de consciência, qual a dor latente</li>
            <li>Escreve a copy com tudo isso em mente</li>
            <li>O resultado é registrado e fica disponível pra próxima vez</li>
          </ol>
          <p>Sem o Pinguim OS, esse mesmo processo demanda horas: caçar o material, ler tudo de novo, lembrar do que o aluno falou, e aí escrever. Com o sistema, vira minutos.</p>
        `,
      },
      {
        id: 'replicavel',
        titulo: 'É replicável',
        html: `
          <p>O Pinguim OS foi desenhado desde o início pra ser <strong>replicável</strong>. Hoje é o sistema da Pinguim. Amanhã pode ser o sistema operacional de qualquer agência ou empresa de educação:</p>
          <ul>
            <li><strong>Pinguim OS</strong> — Pinguim, hoje</li>
            <li><strong>Acme OS</strong> — outra agência, mesma estrutura, dados diferentes</li>
            <li><strong>Beta OS</strong> — empresa de educação, mesmo motor</li>
          </ul>
          <p>O que muda entre clientes é o conteúdo dos Cérebros, a paleta visual, e os agentes específicos. O motor é o mesmo.</p>
        `,
      },
    ],
    pitch: `
      <p>Quando um cliente em potencial abre o Pinguim OS pela primeira vez, ele não vê uma planilha bonita — ele vê uma <strong>operação inteligente em movimento</strong>. Ele vê que a agência tem método, tem memória, tem processo escalável.</p>
      <p>Isso muda completamente a percepção de valor. Deixa de ser "uma agência que faz copy" e passa a ser "uma agência com plataforma proprietária". O ticket sobe, a retenção aumenta, e a agência ganha reputação de empresa de tecnologia — não só de serviço.</p>
    `,
  };
}
