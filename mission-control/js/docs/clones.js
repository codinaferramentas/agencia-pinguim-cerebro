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
        titulo: 'Duas famílias: Sócios + Especialistas',
        html: `
          <p>O framework de Clones tem duas famílias visuais. Mesma estrutura técnica no banco — separação serve pra você (e pro cliente que adotar Pinguim OS) navegar e curar.</p>

          <h3>👤 Sócios Pinguim</h3>
          <p>Os 3 sócios da Pinguim (Luiz, Micha, Pedro). Fontes típicas que cada sócio sobe pra alimentar o próprio Cérebro de Clone:</p>
          <ul>
            <li>Áudios mandando ideia, opinião, conteúdo</li>
            <li>Posts próprios (Reels, Stories, LinkedIn)</li>
            <li>Calls gravadas, podcasts onde a pessoa fala</li>
            <li>E-mails que a pessoa escreveu</li>
            <li>Manifestos, valores, princípios próprios</li>
          </ul>
          <p><strong>Uso:</strong> agente escreve "como o Luiz escreveria" ou "no tom do Micha". Garante que o output sai com a voz da casa, não genérico.</p>

          <h3>🎓 Especialistas</h3>
          <p>Pessoas reais reconhecidas no mercado que viraram referência. Estrutura tirada da fonte canônica do ecossistema Pinguim (<code>ecossistema-squads-completo.html</code>): <strong>12 squads</strong>, <strong>100 clones</strong> em produção. Cada squad é um agrupamento por método, não por departamento.</p>

          <table class="docs-table" style="margin-top:1rem">
            <thead>
              <tr><th>Squad</th><th>Domínio</th><th>Clones</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>Advisory Board</strong></td><td>People &amp; Psychology</td><td>10 — Dalio, Munger, Naval, Thiel, Hoffman, Sinek, Brené Brown, Lencioni, Sivers, Chouinard</td></tr>
              <tr><td><strong>Copywriters</strong></td><td>Content &amp; Marketing</td><td>24 — Hormozi, Halbert, Bencivenga, Ogilvy, Schwartz, Hopkins, Sugarman, Collier, Kennedy, Carlton, Makepeace, Deutsch, Lampropoulos, Brown, Rutz, Georgi, Schwartz (Ry), Chaperon, Settle, Benson, Kern, Brunson, Walker, Koe</td></tr>
              <tr><td><strong>Storytellers</strong></td><td>Content &amp; Marketing</td><td>12 — Campbell, Miller, Klaff, Hall, Dicks, Howell, Ganz, Snyder, Duarte, Coyne, Harmon, Johnstone</td></tr>
              <tr><td><strong>Traffic Masters</strong></td><td>Content &amp; Marketing</td><td>7 — Sobral, Pittman, Kusmich, Mandalia, Aslam, Burns, Breeze</td></tr>
              <tr><td><strong>Design</strong></td><td>Design &amp; UX</td><td>8 — Chris Do, Neumeier, Draplin, Brad Frost, Malouf, Galloway, McNally, McKinnon</td></tr>
              <tr><td><strong>Data</strong></td><td>Data &amp; Analytics</td><td>6 — Kaushik, Fader, Sean Ellis, Mehta, Spinks, Wes Kao</td></tr>
              <tr><td><strong>Deep Research</strong></td><td>Data &amp; Analytics</td><td>10 — Kahneman, Klein, Ioannidis, Sackett, Cochrane, Higgins, Booth, Forsgren, Creswell, Gilad</td></tr>
              <tr><td><strong>FinOps</strong></td><td>Business Operations</td><td>4 — Storment, Quinn, Mansoor, Fuller</td></tr>
              <tr><td><strong>Legal</strong></td><td>Business Operations</td><td>3 — Brad Feld, Ken Adams, Pierpaolo Bottini</td></tr>
              <tr><td><strong>Cybersecurity</strong></td><td>Technical</td><td>6 — Peter Kim, Georgia Weidman, Jim Manico, Chris Sanders, Marcus Carey, Omar Santos</td></tr>
              <tr><td><strong>Translate</strong></td><td>Communication</td><td>7 — Vermeer, Nord, Nida, House, Baker, Pym, Venuti</td></tr>
              <tr><td><strong>Squad Creator Pro</strong></td><td>Meta &amp; Frameworks</td><td>3 — Alan Nicolas, Pedro Valerio, Thiago Finch</td></tr>
            </tbody>
          </table>

          <p style="margin-top:1rem"><strong>Como usar:</strong> agente consulta Hormozi pra estrutura de oferta + Bencivenga pra gancho + Luiz pra voz da marca. O output combina método de classe mundial com identidade própria.</p>

          <p><strong>Customizar pra outro cliente:</strong> Pinguim OS é framework. Cada cliente que adotar pode escolher quais squads de Especialistas faz sentido pro negócio dele. Quem vende serviço médico não vai ter squad Copywriters; quem vende e-commerce talvez não tenha squad Legal. As 12 squads são <strong>oferta-padrão</strong>, não obrigação.</p>
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
            <li>Estrutura no banco (categoria=clone + subcategoria=slug-da-squad-canônica em <code>pinguim.produtos</code>)</li>
            <li><strong>103 clones importados</strong> seguindo a fonte canônica do ecossistema:
              <ul>
                <li>3 Sócios Pinguim (Luiz, Micha, Pedro) — alimentação manual pelos próprios sócios</li>
                <li>100 Especialistas em 12 squads canônicas — todos com SOUL rico (média 4.700–7.400 chars)</li>
              </ul>
            </li>
            <li><strong>SOULs ricos em todos os clones de Especialistas</strong>. Padrão de 5 seções: Contexto, Metodologia Central, Estilo, Padrões de Trabalho, Exemplos Anotados. Frameworks reais (Value Equation, Daring Leadership, BRAVING, GIST, etc.) e citações reconstruídas fiéis ao estilo de cada profissional.</li>
            <li>SOULs vetorizados como primeira fonte de cada Cérebro de Clone (busca semântica funcionando)</li>
            <li>Sidebar de Cérebros mostra Clones em 2 famílias (Sócios + Especialistas), com cada uma das 12 squads colapsável e legendada com domínio canônico</li>
            <li>Filtro visual por categoria de Cérebro</li>
            <li><strong>Edição guiada do SOUL</strong>: ao abrir um Clone, painel "Voz e identidade" oferece edição por 8 campos guiados (tom, vocabulário, princípios, exemplos…) em vez de markdown livre. Salvar revetoriza automaticamente.</li>
            <li><strong>Alimentação com fontes adicionais</strong>: botão "+ Alimentar" suporta upload avulso de áudio, post, e-mail, PDF — mesmo motor de ingest dos Cérebros de produto. Animação Squad roda durante o processo se o toggle estiver ligado.</li>
            <li><strong>Versionamento do SOUL</strong>: cada edição cria um snapshot. Botão "📜 Histórico" mostra todas as versões anteriores (com motivo: edição guiada, edição livre, enriquecimento por IA), permite ver o conteúdo de qualquer versão e restaurar. A restauração também vira versão — nunca perde nada.</li>
            <li><strong>Seleção de clones por agente</strong>: na tela de Agentes, cada card tem botão "👤 Clones consultados" que abre modal pra marcar quais clones aquele agente carrega no contexto. Tabela <code>pinguim.agente_clones</code> guarda a relação. Pronto pra ser lido pelo agente em runtime.</li>
          </ul>

          <h3>⧗ Em construção</h3>
          <ul>
            <li>AGENT-CARD lendo <code>clones_consultados</code> em runtime — depende de criar o primeiro agente real (próximo pilar)</li>
            <li>Tela de "ajustar curadoria do framework" — cliente do Pinguim OS escolhe quais das 12 squads canônicas faz sentido pra negócio dele</li>
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
      <p>Pinguim já tem <strong>103 Clones</strong> prontos pra alimentar agentes — voz dos 3 sócios + DNA de 100 especialistas distribuídos em 12 squads canônicas (Advisory, Copy, Storytelling, Traffic, Design, Data, Deep Research, FinOps, Legal, Cybersecurity, Translate, Squad Creator). Quando agente comercial entrar em produção, vai falar com peso de quem leu Hormozi, com cadência de quem estudou Settle, com gancho de quem conhece Bencivenga, e com a voz da casa.</p>
      <p>Pra Dolphin, Clones é o feature que faz Pinguim OS sair de "construtor de chatbot" e virar <strong>plataforma de agentes proprietária</strong> — vendável pra qualquer agência que quer subir o nível dos próprios outputs.</p>
    `,
  };
}
