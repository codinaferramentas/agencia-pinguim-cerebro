/* Doc: Clones — fonte de voz pros agentes Pinguim */

export async function gerar() {
  return {
    titulo: 'Clones',
    lede: 'Clone não é agente. É fonte de voz que outros agentes consultam quando precisam soar como uma pessoa específica — um sócio interno ou um expert externo. Subtipo de Cérebro com mesma engine de busca semântica.',
    secoes: [
      {
        id: 'o-que-e',
        titulo: 'O que é um Clone',
        html: `
          <p>Quando um agente Pinguim gera um output (uma copy, uma resposta, uma página), ele consulta 5 fontes vivas: Cérebro do produto, Persona, Skill, <strong>Clone</strong> e Funil. Cada uma responde uma pergunta diferente.</p>
          <p>O Clone responde: <strong>"como soar?"</strong></p>
          <p>É a voz, o método, o estilo de uma pessoa específica — convertida em fonte vetorizada e consultável. Não é um agente com missão própria; é matéria-prima de personalidade que outros agentes carregam.</p>
        `,
      },
      {
        id: 'duas-categorias',
        titulo: 'Duas categorias',
        html: `
          <p>Mesma estrutura técnica, usos diferentes:</p>

          <h3>Internos · Sócios e equipe Pinguim</h3>
          <p>Os 3 sócios da Pinguim (Luiz, Micha, Pedro) e, no futuro, funcionários e parceiros operacionais. Fontes típicas:</p>
          <ul>
            <li>Áudios mandando ideia, opinião, conteúdo</li>
            <li>Posts próprios (Reels, Stories, LinkedIn)</li>
            <li>Calls gravadas, podcasts onde a pessoa fala</li>
            <li>E-mails que a pessoa escreveu</li>
            <li>Manifestos, valores, princípios próprios</li>
          </ul>
          <p><strong>Uso:</strong> agente escreve "como o Luiz escreveria" ou "no tom do Micha". Garante que o output sai com a voz da casa, não genérico.</p>

          <h3>Externos · Experts de referência</h3>
          <p>Especialistas reconhecidos do mercado que viraram referência: copywriters lendários, storytellers, traffic masters, advisors. Hoje a Pinguim já tem 36 importados:</p>
          <ul>
            <li><strong>24 copywriters</strong>: Hormozi, Halbert, Bencivenga, Ogilvy, Schwartz, Hopkins, Sugarman, Kennedy, Carlton, Makepeace, Deutsch, Lampropoulos, Brown, Rutz, Georgi, Schwartz (Ry), Chaperon, Settle, Benson, Kern, Brunson, Walker, Koe, Collier</li>
            <li><strong>12 storytellers</strong>: Joseph Campbell, Donald Miller, Oren Klaff, Kindra Hall, Matthew Dicks, Park Howell, Marshall Ganz, Blake Snyder, Nancy Duarte, Shawn Coyne, Dan Harmon, Keith Johnstone</li>
          </ul>
          <p>Próximas categorias previstas: advisors (Dalio, Munger, Naval), traffic (Pedro Sobral, Molly Pittman), design (Chris Do, Brad Frost).</p>
          <p><strong>Uso:</strong> agente consulta Hormozi pra estrutura de oferta + Bencivenga pra gancho + Luiz pra voz da marca. O output combina método de classe mundial com identidade própria.</p>
        `,
      },
      {
        id: 'caso-uso',
        titulo: 'Caso de uso prático',
        html: `
          <p>Aurora (futuro agente de copy) recebe pedido do Luiz: <em>"escreve copy de e-mail pro Elo, foco em objeção de preço."</em></p>
          <p>O AGENT-CARD da Aurora declara quais Clones ela consulta:</p>
          <pre style="background:var(--surface-2);border:1px solid var(--border-subtle);border-radius:6px;padding:0.875rem;font-size:0.8125rem;overflow-x:auto;margin:0.75rem 0">## clones_consultados
- alex-hormozi      # estrutura de oferta + Value Equation
- gary-bencivenga   # gancho e curiosidade
- ben-settle        # estilo de e-mail diário
- luiz              # voz da marca Pinguim</pre>
          <p>Quando Aurora monta o contexto pra geração:</p>
          <ol>
            <li>Carrega o SOUL.md do Hormozi (Value Equation, "frases curtas, soco")</li>
            <li>Carrega o SOUL.md do Bencivenga (gancho de curiosidade, "advertise the curiosity")</li>
            <li>Carrega o SOUL.md do Settle (e-mail diário, primeira pessoa, sem frescura)</li>
            <li>Carrega o SOUL.md do Luiz (vocabulário Pinguim, jeito do sócio)</li>
            <li>Junta tudo no prompt + Cérebro do Elo + Persona do aluno</li>
            <li>Gera</li>
          </ol>
          <p>O resultado: copy tecnicamente correta sobre o Elo + estrutura de oferta do Hormozi + gancho do Bencivenga + cadência do Settle + voz do Luiz. <strong>Output que parece escrito pelo Luiz inspirado pelo melhor da escola direct response.</strong></p>
          <p>Trocar um Clone do AGENT-CARD muda o output da próxima execução. Se você tirar Hormozi e botar Eugene Schwartz, o tom muda — mais analítico, menos brutal. Mesma Aurora, voz diferente.</p>
        `,
      },
      {
        id: 'arquitetura',
        titulo: 'Arquitetura técnica',
        html: `
          <p>Decisão dura: Clone <strong>não tem tabela própria</strong>. Vive em <code>pinguim.produtos</code> com:</p>
          <ul>
            <li><code>categoria = 'clone'</code></li>
            <li><code>subcategoria</code>: <code>socio_pinguim</code> | <code>externo_copy</code> | <code>externo_storytelling</code> | <code>externo_advisor</code> | etc</li>
          </ul>
          <p>Razão: mesma engine de busca semântica que serve Cérebros de produto serve Cérebros de Clone. Reusa ingestão, vetorização, RPC, RLS — zero duplicação de motor.</p>

          <h3>Em disco</h3>
          <p>Os SOULs (a alma de cada Clone) ficam versionados em git em pastas que já existem:</p>
          <ul>
            <li><code>cerebro/agentes/pessoais/&lt;slug&gt;/SOUL.md</code> (sócios)</li>
            <li><code>cerebro/squads/&lt;categoria&gt;/agentes/&lt;slug&gt;/SOUL.md</code> (externos)</li>
          </ul>
          <p>O script <code>ferramentas/clones/importar-clones.py</code> varre essas pastas, cria 1 row em <code>produtos</code> por Clone, cria o Cérebro 1:1 e cadastra a SOUL.md como primeira fonte vetorizada (status=ok). Idempotente — pode rodar quantas vezes quiser.</p>

          <h3>Como o agente consome</h3>
          <p>No AGENT-CARD do agente real, campo <code>clones_consultados</code> lista os slugs dos Clones que devem ser carregados. O SYSTEM-PROMPT.md do agente é gerado incluindo um trecho dos SOULs desses Clones (ou os SOULs inteiros, dependendo do orçamento de tokens).</p>
        `,
      },
      {
        id: 'estado-roadmap',
        titulo: 'O que está pronto vs roadmap',
        html: `
          <h3>✅ Em produção</h3>
          <ul>
            <li>Estrutura no banco (categoria=clone + subcategoria em pinguim.produtos)</li>
            <li>39 clones importados (3 sócios Pinguim + 24 copywriters + 12 storytellers)</li>
            <li>SOULs ricos (~80-140 linhas cada) já vetorizados como primeira fonte de cada Cérebro de Clone</li>
            <li>Sub-árvore na sidebar de Cérebros agrupando por subcategoria</li>
            <li>Filtro visual por subcategoria</li>
          </ul>

          <h3>⧗ Em construção</h3>
          <ul>
            <li>AGENT-CARD com campo <code>clones_consultados</code> sendo lido em runtime</li>
            <li>Importação dos próximos pacotes: 7 traffic masters, 10 advisors, 9 designers, 7 data experts</li>
            <li>UI pra ver e editar quais Clones cada agente consulta</li>
          </ul>

          <h3>◯ Planejado</h3>
          <ul>
            <li>Alimentar Sócios com fontes próprias (áudios do Luiz, posts do Micha) além da SOUL inicial</li>
            <li>Sistema de "rodízio de voz" — agente alterna entre 3 Clones de uma área pra evitar viés único</li>
            <li>Agente Coach sugere mudança de combinação de Clones quando detecta padrão de feedback negativo</li>
          </ul>
        `,
      },
    ],
    pitch: `
      <p>Construtor de IA generativa virou commodity em 2026. ChatGPT, Claude, Gemini — todos geram texto. O que diferencia uma agência que usa IA bem é <strong>o que vai antes do prompt</strong>: Cérebro pra contexto, Persona pra avatar, Skill pra processo, Clone pra voz, Funil pra estratégia.</p>
      <p>Pinguim já tem 39 Clones prontos pra alimentar agentes — voz dos 3 sócios e DNA dos maiores nomes de copy e storytelling do mundo. Quando agente comercial entrar em produção, vai falar com peso de quem leu Hormozi, com cadência de quem estudou Settle, com gancho de quem conhece Bencivenga, e com a voz da casa.</p>
      <p>Pra Dolphin, Clones é o feature que faz Pinguim OS sair de "construtor de chatbot" e virar <strong>plataforma de agentes proprietária</strong> — vendável pra qualquer agência que quer subir o nível dos próprios outputs.</p>
    `,
  };
}
