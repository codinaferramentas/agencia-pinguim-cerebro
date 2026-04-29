/* Doc: Funis — 5o pilar do Pinguim OS */

export async function gerar() {
  return {
    titulo: 'Funis',
    lede: 'Não é desenho bonito. É inteligência comercial executável que os agentes Pinguim consomem em tempo real.',
    secoes: [
      {
        id: 'o-que-e',
        titulo: 'O que é um funil no Pinguim OS',
        html: `
          <p>Construtores de funil tradicionais (Geru, MailChimp Customer Journey, ManyChat) servem pra <strong>desenhar</strong> uma jornada de venda: produto A leva ao B, com order bump C, upsell D. O artefato é um diagrama bonito que vive isolado da operação.</p>
          <p><strong>Funil no Pinguim OS é diferente.</strong> Cada bloco arrastado, cada conexão, cada papel atribuído (entrada, order bump, upsell, downsell) vira <strong>dado estruturado no banco</strong>. Esse dado é consumível por qualquer agente Pinguim — SDR, Co-piloto, Analista, Cliente Oculto.</p>
          <p>O desenho é pra você visualizar a estratégia. O dado é pra agente operar com ela.</p>
        `,
      },
      {
        id: 'tres-camadas',
        titulo: 'As 3 camadas do funil',
        html: `
          <p>Funil no Pinguim opera em 3 camadas que conversam entre si:</p>

          <h3>Camada 1 — Visual <em>(em produção)</em></h3>
          <p>É o que você vê quando entra em <strong>Funis</strong> no menu. Construtor drag-to-connect com sidebar de produtos internos, ferramenta condicional, conexões em linha bezier viva. Você arrasta produto pro canvas, escolhe o papel, conecta com setas. Cada movimento é salvo em tempo real no banco.</p>
          <p>Padrão visual de referência: n8n, Figma, MailChimp Customer Journey. Construído do zero em SVG vanilla pra ter identidade Pinguim e zero dependência externa.</p>

          <h3>Camada 2 — Estratégica <em>(em produção)</em></h3>
          <p>Cada funil tem uma <strong>chave de habilitação por agente</strong> — você marca quais agentes Pinguim podem consultar aquele funil específico. Esse é o pulo do gato.</p>
          <p>Significa que você pode ter:</p>
          <ul>
            <li>Funil "Lançamento Elo Q2" lido só pelo SDR</li>
            <li>Funil "Campanha Aniversário" lido pelo SDR + Co-piloto</li>
            <li>Funil "Reativação inativos" lido só pelo Atendimento</li>
          </ul>
          <p>Mesma estrutura de banco, mas cada agente vê o conjunto que importa pra ele. Outras ferramentas tratam funil como dado global; Pinguim trata como dado curado por uso.</p>

          <h3>Camada 3 — Operacional <em>(em construção)</em></h3>
          <p>Quando os agentes comerciais entrarem em produção (ver <a href="#" onclick="event.preventDefault();window.dispatchEvent(new CustomEvent('docs:select',{detail:{slug:'comercial'}}));">Plano Comercial</a>), eles consultam os funis habilitados em tempo real e tomam decisões baseadas neles. O funil deixa de ser "dashboard interno" e vira <strong>fonte de inteligência consumida automaticamente</strong>.</p>
        `,
      },
      {
        id: 'caso-uso',
        titulo: 'Caso de uso prático — agente SDR',
        html: `
          <p>Imagina o cenário (próximo de hoje, parte ainda em construção):</p>
          <ol>
            <li>Lead novo entra no Clint vindo do <strong>Desafio LoFi</strong></li>
            <li>O agente <strong>SDR</strong> recebe a notificação e antes de classificar, consulta os funis habilitados pra ele</li>
            <li>Encontra o funil "Lançamento Elo Q2", onde Desafio LoFi está mapeado como <strong>entrada</strong> que leva pro <strong>Elo</strong> como upsell, com <strong>Análise de Perfil</strong> como order bump no checkout</li>
            <li>SDR escreve briefing pra vendedora: "Lead vindo de LoFi. Produto-alvo é o Elo (R$997). Order bump natural: Análise de Perfil. Não oferecer Taurus nem Lira ainda — não é caminho mapeado pra esse perfil."</li>
            <li>Vendedora pega o lead com briefing pronto e contexto estratégico, não tendo que decifrar pra qual produto direcionar</li>
          </ol>
          <p>Sem o funil mapeado, o SDR ficaria adivinhando. Com o funil, ele segue a estratégia que <strong>você</strong> desenhou — e quando você muda o funil, todos os agentes habilitados ajustam o comportamento na próxima execução.</p>
        `,
      },
      {
        id: 'por-que-vende',
        titulo: 'Por que isso vende',
        html: `
          <p>Construtor de funil é commodity em 2026. Geru existe há anos. MailChimp tem Customer Journey. ManyChat tem visual flow. Todos são bons. Nenhum é diferencial.</p>
          <p>O que faz Funis no Pinguim OS ser <strong>vendável</strong> não é o canvas — é o que vem depois:</p>
          <ul>
            <li><strong>Funil é dado consultável por agente IA</strong> — no concorrente, é diagrama isolado</li>
            <li><strong>Chave por agente</strong> — cada funil pode ter combinação própria de leitores. No concorrente, funil é global ou tem permissão por usuário humano, não por agente</li>
            <li><strong>Loop EPP</strong> — toda execução baseada em funil é registrada e vira aprendizado pro agente seguinte (ver <a href="#" onclick="event.preventDefault();window.dispatchEvent(new CustomEvent('docs:select',{detail:{slug:'arquitetura'}}));">Arquitetura</a>)</li>
            <li><strong>Replicável</strong> — qualquer cliente da Dolphin abre o Pinguim OS dele e desenha o funil próprio. SaaS de inteligência comercial pronto pra licenciar</li>
          </ul>
          <p>Pinguim é o primeiro caso de uso. Pinguim OS é o produto que será vendido pra outras agências e empresas de educação.</p>
        `,
      },
      {
        id: 'estado',
        titulo: 'O que está pronto vs. roadmap',
        html: `
          <p>Honesto sobre o estado atual:</p>

          <h3>✅ Em produção</h3>
          <ul>
            <li>Construtor visual completo: drag-to-connect, sidebar com produtos internos + ferramentas, condicional com Sim/Não, conexões bezier vivas, persistência em tempo real</li>
            <li>4 papéis de etapa: Entrada, Order Bump, Upsell, Downsell</li>
            <li>Múltiplas saídas e múltiplas entradas por etapa (campanhas estratégicas com caminhos convergindo)</li>
            <li>Bloqueio de loop (A → B → A) com aviso amigável — funil é direcional</li>
            <li>Status do funil: Rascunho, Ativo, Arquivado</li>
            <li>Chave de habilitação por agente — chips no header mostram quais agentes leem o funil</li>
            <li>Tabela <code>pinguim.funis</code> + 3 tabelas relacionadas + view de catálogo prontas</li>
          </ul>

          <h3>⏳ Em construção</h3>
          <ul>
            <li>Consumo do funil pelos agentes em tempo real — depende dos agentes comerciais entrarem em produção</li>
            <li>Métricas de performance por etapa do funil (conversão entre Desafio → Elo, taxa de aceitação de order bump, etc.)</li>
            <li>Versionamento de funil (igual Personas) — guardar histórico de mudanças estratégicas</li>
          </ul>

          <h3>◯ Planejado</h3>
          <ul>
            <li>Templates de funil (começa de um modelo pronto: "Funil Desafio Pago", "Funil High Ticket", etc.)</li>
            <li>Análise comparativa: dois funis lado a lado, qual converte melhor</li>
            <li>Sugestão automática: agente Coach sugere mudança no funil baseado em padrão observado</li>
          </ul>
        `,
      },
    ],
    pitch: `
      <p>Quando um cliente vê o construtor de funis pela primeira vez, a reação inicial é <em>"bonito"</em>. Quando você explica que o funil é lido por agentes IA em tempo real e que cada funil pode ter combinação própria de leitores, a reação muda pra <em>"como vocês fizeram isso"</em>.</p>
      <p>Esse é o momento da conversão. Funis no Pinguim OS é a peça que transforma a apresentação técnica em pitch comercial — porque mostra que a agência opera com método, com estratégia codificada, com agentes que executam consistentemente o que foi desenhado.</p>
      <p>Pra Pinguim, isso significa vendedoras com mais foco e menos adivinhação. Pra Dolphin, significa um produto vendável pra qualquer agência ou empresa de educação que queira o mesmo nível de organização operacional.</p>
    `,
  };
}
