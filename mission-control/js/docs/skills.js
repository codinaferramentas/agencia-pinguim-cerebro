/* Doc: Skills */

import { fetchSkillsCatalogo } from '../sb-client.js?v=20260427g';

export async function gerar() {
  let skills = [];
  try { skills = await fetchSkillsCatalogo(); } catch {}

  const universais = skills.filter(s => s.categoria === 'universal');
  const porArea = skills.filter(s => s.categoria === 'por_area');
  const especificas = skills.filter(s => s.categoria === 'especifica');

  const listaSkills = (lista) => lista.length === 0
    ? '<p style="color:var(--fg-muted);font-style:italic">Nenhuma cadastrada ainda.</p>'
    : `<ul class="docs-list">${lista.map(s => `
        <li>
          <strong>${s.nome}</strong>
          <span style="color:var(--fg-muted);font-size:.85em"> · ${s.area || '—'} · ${s.status === 'em_construcao' ? 'em construção' : s.status}</span>
          ${s.descricao ? `<br><span style="color:var(--fg-muted);font-size:.9em">${s.descricao}</span>` : ''}
        </li>
      `).join('')}</ul>`;

  return {
    titulo: 'Skills',
    lede: 'Receitas em Markdown que os agentes leem e executam. Capacidade reutilizável — uma skill, vários agentes. O que o time já sabe fazer, transformado em procedimento que escala.',
    secoes: [
      {
        id: 'o-que-e',
        titulo: 'O que é uma Skill',
        html: `
          <p>Uma <strong>Skill</strong> é um manual de procedimento pra uma habilidade específica. Não é código. Não é rotina programada. É um arquivo de texto (Markdown) que o agente lê e segue.</p>
          <p>O agente é como um analista júnior inteligente: ele tem cabeça, mas precisa do manual da empresa pra saber como cada coisa é feita. A Skill é esse manual.</p>
          <p>Cada Skill descreve: <strong>quando usar</strong> (gatilho), <strong>como executar</strong> (passo-a-passo), <strong>limites</strong> (o que NÃO fazer), <strong>critério de qualidade</strong> (como saber se ficou bom).</p>
        `,
      },
      {
        id: 'por-que-existe',
        titulo: 'Por que existe',
        html: `
          <p>Imagine ter 300 agentes. Sem Skills compartilhadas, cada agente teria que aprender do zero como buscar no Google Drive, como criar evento no Calendar, como mandar mensagem no Discord. Resultado: 300 cópias do mesmo procedimento, 300 lugares pra atualizar quando uma API muda, 300 pontos de falha.</p>
          <p>Com Skills compartilhadas: <strong>uma Skill, todos os agentes</strong>. Atualiza num lugar, todo mundo herda. É como contratar um time onde cada novo funcionário entra já com 50 procedimentos prontos da empresa — não precisa redescobrir nada.</p>
          <p>Esse é o pulo do gato pra escalar. E é exatamente o que faz um sistema sair de "5 agentes que funcionam" pra "300 agentes operando junto sem virar bagunça".</p>
        `,
      },
      {
        id: 'tres-categorias',
        titulo: 'As 3 categorias de Skill',
        html: `
          <p>Skills se dividem em 3 famílias, cada uma com escopo diferente. A regra de ouro pra decidir onde colocar: <strong>se 2+ agentes podem usar, é Universal ou Por Área. Se só 1 agente usa, é Específica.</strong></p>

          <h3>🧰 Universais</h3>
          <p>Skills que qualquer agente pode usar — independente do produto, área ou função. São as ferramentas básicas do canivete suíço.</p>
          <p><em>Exemplos:</em> ler arquivo do Google Drive, criar evento no Calendar, enviar mensagem no Discord, fazer scraping de página pública, buscar conhecimento em Cérebro.</p>
          ${listaSkills(universais)}

          <h3>🎯 Por Área</h3>
          <p>Skills compartilhadas entre agentes da mesma especialidade. Um agente comercial vai usar Skills comerciais; um de marketing vai usar Skills de marketing.</p>
          <p><em>Exemplos:</em> qualificar lead com BANT (comercial), gerar roteiro de Reels (marketing), classificar ticket de suporte (CS), gerar relatório de vendas (dados).</p>
          ${listaSkills(porArea)}

          <h3>🎁 Específicas</h3>
          <p>Skills exclusivas de um agente. São customizações que não vale generalizar — formatos muito específicos, workflows de uma pessoa só, procedimentos hiper-particulares.</p>
          <p><em>Estratégia:</em> começa sempre como Específica e <strong>promove pra Por Área quando o segundo agente precisar do mesmo procedimento</strong>. Evita generalização prematura.</p>
          ${listaSkills(especificas)}
        `,
      },
      {
        id: 'anatomia',
        titulo: 'Anatomia de uma Skill',
        html: `
          <p>Cada Skill é uma pasta em <code>cerebro/skills/&lt;slug&gt;/</code> com os seguintes arquivos:</p>
          <ul class="docs-list">
            <li><strong>SKILL.md</strong> — manifesto + procedimento. Frontmatter YAML com <code>name</code> e <code>description</code> obrigatórios. O resto é Markdown livre.</li>
            <li><strong>EXAMPLES.md</strong> (opcional) — input/output de exemplos pra balizar o agente.</li>
            <li><strong>APRENDIZADOS.md</strong> — feedback acumulado. Cada vez que um humano corrige uma execução, vira uma linha aqui. Loop de evolução permanente (EPP).</li>
          </ul>
          <p>O LLM <strong>não carrega tudo de uma vez</strong>. Ele só vê o nome + descrição no system prompt. Quando o contexto da conversa pede a Skill, aí o conteúdo completo é carregado. Isso é chamado <strong>progressive disclosure</strong> — economiza tokens, evita confusão, escala pra centenas de Skills sem comprometer performance.</p>
        `,
      },
      {
        id: 'por-que-anthropic',
        titulo: 'Por que escolhemos o padrão Anthropic',
        html: `
          <p>Em outubro de 2025 a Anthropic lançou o <strong>Agent Skills Spec</strong>, formalizado em dezembro de 2025 como spec aberto. Em poucas semanas virou o padrão dominante da indústria de agentes IA.</p>
          <h3>O que pesou na nossa escolha</h3>
          <ul class="docs-list">
            <li><strong>Aberto e portável</strong> — o spec é público no GitHub. Skills criadas no padrão funcionam em qualquer ferramenta que adote (não ficamos amarrados num fornecedor).</li>
            <li><strong>Markdown puro</strong> — Skills são lidas por humanos e por LLMs com a mesma facilidade. Sem JSON aninhado, sem SDK proprietário. Toda Skill é também documentação.</li>
            <li><strong>Marketplace público emergente</strong> (skillsmp.com, agentskills.io) — comunidade já compartilha Skills prontas. A Pinguim pode publicar e baixar.</li>
            <li><strong>Compatível com nosso stack</strong> — usamos Claude e GPT. O padrão Anthropic carrega bem nos dois (e em qualquer LLM moderno, na prática).</li>
            <li><strong>Versionável via Git</strong> — cada commit no SKILL.md é uma versão. Não precisa de tabela de versionamento, não precisa de painel de admin pra rollback. Git resolve.</li>
          </ul>
          <h3>Como o resto do mercado resolveu</h3>
          <ul class="docs-list">
            <li><strong>OpenAI AgentKit</strong> (Out/2025) — Connector Registry central + reusable prompts.</li>
            <li><strong>LangChain/LangGraph</strong> — "shared tool pool", agentes puxam de pool comum.</li>
            <li><strong>Microsoft Agent Framework</strong> (Out/2025) — funde AutoGen + Semantic Kernel num único SDK com tools registry.</li>
            <li><strong>A2A Protocol + Google ADK</strong> — agentes de frameworks diferentes invocam Skills uns dos outros.</li>
          </ul>
          <p>O consenso é claro: <strong>biblioteca compartilhada de Skills + servidores MCP + agentes leves que compõem Skills sob demanda</strong>. Skills isoladas por agente é antipattern — não escala.</p>
        `,
      },
      {
        id: 'skill-vs-resto',
        titulo: 'Skill vs Cérebro vs Persona vs Tool',
        html: `
          <p>Os quatro são diferentes — cada um responde uma pergunta sobre o agente:</p>
          <table class="docs-table">
            <thead><tr><th>Conceito</th><th>O que é</th><th>Exemplo</th></tr></thead>
            <tbody>
              <tr><td><strong>Cérebro</strong></td><td>O que ele <em>sabe</em> (conhecimento)</td><td>Cérebro do Elo: 48 fontes sobre o produto</td></tr>
              <tr><td><strong>Persona</strong></td><td>Como ele <em>fala</em> (jeito)</td><td>Tom respeitoso, fala como aluno, nunca promete</td></tr>
              <tr><td><strong>Tool</strong></td><td>O que ele <em>pode</em> chamar (capacidade técnica)</td><td>API Discord, função de query no Supabase</td></tr>
              <tr><td><strong>Skill</strong></td><td><em>Como</em> fazer uma coisa específica bem feita</td><td>"Pra responder dúvida: 1) busca no Cérebro 2) cita fonte 3) escala se score baixo"</td></tr>
            </tbody>
          </table>
          <p>A Skill é a <strong>cola</strong> entre Cérebro + Tools + objetivo. Sem ela, o agente sabe muito mas não sabe o que fazer com o que sabe.</p>
        `,
      },
      {
        id: 'ciclo-vida',
        titulo: 'Ciclo de vida de uma Skill',
        html: `
          <p>Toda Skill passa por 4 estados:</p>
          <ul class="docs-list">
            <li><strong>⚪ Planejada</strong> — está no catálogo, foi identificada como necessária, mas ainda não tem SKILL.md em disco.</li>
            <li><strong>🟡 Em construção</strong> — SKILL.md sendo escrito. Sem agentes usando ainda.</li>
            <li><strong>🟢 Ativa</strong> — em produção. Agentes usam ela em execuções reais. Métricas sendo coletadas.</li>
            <li><strong>⏸ Pausada</strong> — desativada temporariamente (bug encontrado, reformulação em curso).</li>
          </ul>
          <p>Toda execução de Skill é logada (input, output, sucesso/erro, custo, latência). Esses logs alimentam dois loops:</p>
          <ul class="docs-list">
            <li><strong>Loop de qualidade</strong> — humano vê resultado ruim, edita o APRENDIZADOS.md, próxima execução já melhora.</li>
            <li><strong>Loop de manutenção</strong> — Skill com taxa de erro alta entra no radar pra revisão.</li>
          </ul>
        `,
      },
      {
        id: 'roadmap',
        titulo: 'Por onde a gente está construindo',
        html: `
          <p>A primeira Skill universal de verdade do Pinguim OS é <strong>buscar-cerebro</strong> — porque ela é a mais estratégica: praticamente todo agente futuro vai precisar buscar conhecimento em algum momento. É testável isolada (input → output) e ataca o coração da promessa do Pinguim ("agentes que respondem com precisão baseada em conhecimento curado").</p>
          <p>Próximas em ordem de prioridade:</p>
          <ol class="docs-list">
            <li><strong>scraping-pagina-publica</strong> — já existe ferramenta em ferramentas/scrap-pagina/, falta envelopar como Skill</li>
            <li><strong>enviar-mensagem-discord</strong> — bot Discord já roda, falta o procedimento formal</li>
            <li><strong>google-drive-ler</strong> — testável isolada, alta reutilização futura</li>
          </ol>
          <p>Skills <em>Por Área</em> e <em>Específicas</em> nascem conforme primeiros agentes do framework comercial entrarem em operação — não vamos especular antes da hora.</p>
        `,
      },
    ],
  };
}
