/* Doc: Anatomia do Agente Pinguim — fonte unica da verdade */

export async function gerar() {
  return {
    titulo: 'Anatomia do Agente Pinguim',
    lede: 'Como um agente é construído no Pinguim OS — 7 arquivos de identidade, 5 fontes vivas de conhecimento, estado runtime no banco e o loop EPP que faz ele ficar mais inteligente a cada uso. Leitura obrigatória antes de criar qualquer agente novo.',
    secoes: [
      {
        id: 'definicao',
        titulo: 'O que é um agente, em uma frase',
        html: `
          <p>Um <strong>agente Pinguim</strong> é um conjunto de arquivos <code>.md</code> em uma pasta (a identidade) + uma linha numa tabela (o estado runtime), que, quando acionado, monta um prompt, consulta fontes de conhecimento, executa, registra o resultado e aprende com o feedback.</p>
          <p><strong>Não é só um prompt.</strong> Prompt é só uma das partes. Quem trata agente como "prompt mais bonito" sai com sistema instável e que não escala. Agente Pinguim tem anatomia.</p>
        `,
      },
      {
        id: 'onde-vive',
        titulo: 'Onde o agente vive',
        html: `
          <p>Cada agente vive em <strong>2 lugares simultâneos</strong>:</p>
          <table style="width:100%;border-collapse:collapse;margin:1rem 0">
            <thead>
              <tr style="border-bottom:1px solid var(--docs-line);text-align:left">
                <th style="padding:.5rem;font-size:.875rem">Lugar</th>
                <th style="padding:.5rem;font-size:.875rem">O que guarda</th>
                <th style="padding:.5rem;font-size:.875rem">Por quê</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--docs-line)">
                <td style="padding:.5rem;font-size:.8125rem"><strong>Disco</strong> (git)<br><code>cerebro/agentes/&lt;categoria&gt;/&lt;slug&gt;/</code></td>
                <td style="padding:.5rem;font-size:.8125rem">A <strong>identidade</strong>: personalidade, regras, ferramentas, prompt, contrato, aprendizado</td>
                <td style="padding:.5rem;font-size:.8125rem">Versionado, portátil, diff visível, zero overhead de banco</td>
              </tr>
              <tr>
                <td style="padding:.5rem;font-size:.8125rem"><strong>Banco</strong><br><code>pinguim.agentes</code></td>
                <td style="padding:.5rem;font-size:.8125rem">O <strong>estado runtime</strong>: modelo atual, status, kill switch, contadores</td>
                <td style="padding:.5rem;font-size:.8125rem">Muda em tempo real, precisa ser consultável</td>
              </tr>
            </tbody>
          </table>
          <p><strong>Regra de ouro do banco:</strong> uma tabela de agentes, uma tabela de execuções. Não criar tabela nova por tipo de agente. Escala pra centenas sem mexer em schema.</p>
        `,
      },
      {
        id: 'sete-mds',
        titulo: 'Os 7 arquivos MD obrigatórios',
        html: `
          <p>Esta é a fundação do agente — sem qualquer um deles, ele fica incompleto.</p>
          <table style="width:100%;border-collapse:collapse;margin:1rem 0;font-size:.8125rem">
            <thead>
              <tr style="border-bottom:1px solid var(--docs-line);text-align:left">
                <th style="padding:.5rem">#</th>
                <th style="padding:.5rem">Arquivo</th>
                <th style="padding:.5rem">O que tem dentro</th>
                <th style="padding:.5rem">Alimentado por</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem">1</td><td style="padding:.5rem"><code>IDENTITY.md</code></td><td style="padding:.5rem">Nome, emoji, resumo de 1 parágrafo</td><td style="padding:.5rem">Curadoria humana na criação</td></tr>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem">2</td><td style="padding:.5rem"><code>SOUL.md</code></td><td style="padding:.5rem">Personalidade, tom, valores, limites de linguagem</td><td style="padding:.5rem">Curadoria humana + opcional <strong>Clones</strong> consultados</td></tr>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem">3</td><td style="padding:.5rem"><code>AGENTS.md</code></td><td style="padding:.5rem">Regras operacionais, escopo, permissões</td><td style="padding:.5rem">Dono do agente</td></tr>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem">4</td><td style="padding:.5rem"><code>TOOLS.md</code></td><td style="padding:.5rem">Ferramentas/APIs conectadas (endpoint, auth)</td><td style="padding:.5rem">Configurado quando integra externo</td></tr>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem">5</td><td style="padding:.5rem"><code>AGENT-CARD.md</code></td><td style="padding:.5rem">Contrato de 7 campos: missão, entrada, saída_esperada, limites, handoff, critério_qualidade, métrica_sucesso</td><td style="padding:.5rem">Resposta humana às 7 perguntas. Se não consegue responder, agente não está pronto pra ser construído</td></tr>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem">6</td><td style="padding:.5rem"><code>SYSTEM-PROMPT.md</code></td><td style="padding:.5rem">Texto final que vai pro LLM como <code>role: system</code></td><td style="padding:.5rem">Gerado a partir dos outros MDs + contextos vivos consultados em runtime</td></tr>
              <tr><td style="padding:.5rem">7</td><td style="padding:.5rem"><code>APRENDIZADOS.md</code></td><td style="padding:.5rem">Arquivo vivo. Cada feedback recebido vira uma linha</td><td style="padding:.5rem">Você (humano) dando 👍/👎/edit/comentário</td></tr>
            </tbody>
          </table>
          <p><strong>Por que MD em disco e não tudo em banco?</strong> Versionamento grátis via git. Diff visual de mudança de personalidade. Portável (clonar repo = clonar agentes). Zero overhead de banco pra identidade estável.</p>
        `,
      },
      {
        id: 'cinco-fontes',
        titulo: 'As 5 fontes de conhecimento que o agente consulta em runtime',
        html: `
          <p>Os 7 arquivos acima são a <strong>identidade fixa</strong>. Mas o agente também consulta fontes vivas a cada execução — e é aqui que o sistema fica inteligente.</p>
          <table style="width:100%;border-collapse:collapse;margin:1rem 0;font-size:.8125rem">
            <thead>
              <tr style="border-bottom:1px solid var(--docs-line);text-align:left">
                <th style="padding:.5rem">Fonte</th>
                <th style="padding:.5rem">O que entrega ao agente</th>
                <th style="padding:.5rem">Onde se encaixa</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem">🧠 <strong>Cérebro</strong> (produto)</td><td style="padding:.5rem">Aulas, depoimentos, objeções, sacadas, página de vendas</td><td style="padding:.5rem">Agente sabe <strong>sobre o quê</strong> está falando</td></tr>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem">👤 <strong>Persona</strong></td><td style="padding:.5rem">Dossiê de 11 blocos sobre quem compra</td><td style="padding:.5rem">Agente sabe <strong>com quem</strong> está falando</td></tr>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem">🛠 <strong>Skill</strong></td><td style="padding:.5rem">Receita executável em Markdown</td><td style="padding:.5rem">Agente sabe <strong>como fazer</strong> o trabalho</td></tr>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem">👥 <strong>Clone</strong></td><td style="padding:.5rem">Voz/método de uma pessoa (sócio interno OU expert externo)</td><td style="padding:.5rem">Agente sabe <strong>como soar</strong></td></tr>
              <tr><td style="padding:.5rem">🎯 <strong>Funil</strong></td><td style="padding:.5rem">Estratégia comercial (qual produto vai pra qual)</td><td style="padding:.5rem">Agente sabe <strong>pra onde direcionar</strong></td></tr>
            </tbody>
          </table>
          <p><strong>Ponto importante sobre Clones:</strong> Clone <strong>não é agente</strong>. É <strong>fonte de voz</strong>, igual Cérebro é fonte de fato. Hormozi por si só não tem missão única ou métrica de sucesso — ele é um componente de personalidade que outros agentes consultam quando precisam daquela voz.</p>
        `,
      },
      {
        id: 'diagrama',
        titulo: 'Diagrama da anatomia',
        html: `
          <p>Tudo que o agente Pinguim é, em uma figura:</p>
          <pre style="background:var(--docs-code-bg,#0a0a0a);color:var(--docs-code-fg,#e6e6e6);padding:1.25rem;border-radius:8px;font-size:.75rem;line-height:1.4;overflow-x:auto;font-family:'Geist Mono','JetBrains Mono',ui-monospace,monospace">                    ┌─────────────────────────────────┐
                    │      AGENTE PINGUIM             │
                    │   (ex: Atendente, Hormozi)      │
                    └─────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼

  ┌─────────────┐           ┌──────────────┐         ┌───────────────┐
  │  IDENTIDADE │           │     EPP      │         │     TOOLS     │
  │   (7 MDs)   │           │ (3 camadas)  │         │  (capacidade) │
  └─────────────┘           └──────────────┘         └───────────────┘
                                                              │
   IDENTITY                  Camada 1 Verifier         buscar-cerebro
   SOUL                      Camada 2 Reflection       buscar-persona
   AGENTS                    Camada 3 Feedback         buscar-skill ◄── chave
   TOOLS                     humano                    buscar-clone     que abre
   AGENT-CARD                                          buscar-funil     as Skills
   SYSTEM-PROMPT
   APRENDIZADOS                                              │
   perfis/cliente                                            │
                                                             ▼
                                                    ┌─────────────────┐
                                                    │  5 FONTES VIVAS │
                                                    │   (no banco)    │
                                                    └─────────────────┘

   🧠 Cérebro      👤 Persona      🛠 Skill      👥 Clone      🎯 Funil
   sobre o quê     com quem        como fazer    como soar    pra onde
   ──────────      ─────────       ─────────     ─────────    ─────────
   Aulas, depoi-   Dossiê 11       Receita       Voz de       Etapas
   mentos, obje-   blocos do       executável    pessoa real  do produto
   ções, oferta    comprador       (MD)          (Hormozi,    (consciência
                                                  Halbert)     →decisão)</pre>
          <p><strong>Como ler:</strong> o agente é os 7 MDs (quem ele é) + EPP (como aprende) + Tools (suas mãos). As Tools alcançam as 5 Fontes Vivas que estão no banco. Sem Tool, a fonte fica inalcançável; sem fonte populada, a Tool busca o vazio.</p>
        `,
      },
      {
        id: 'skill-vs-tool',
        titulo: 'Skill vs Tool — não confundir',
        html: `
          <p>Skill e Tool são parceiras, mas são <strong>coisas diferentes</strong>. Confundir as duas é a fonte mais comum de agente "perdidaço" — agente que tem ferramenta de buscar mas não tem nada pra encontrar, ou agente que tem método escrito mas não tem como acessar.</p>
          <table style="width:100%;border-collapse:collapse;margin:1rem 0;font-size:.8125rem">
            <thead>
              <tr style="border-bottom:1px solid var(--docs-line);text-align:left">
                <th style="padding:.5rem"></th>
                <th style="padding:.5rem">🛠 Skill</th>
                <th style="padding:.5rem">🔧 Tool</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem"><strong>O que é</strong></td><td style="padding:.5rem">Conhecimento / método (<em>como fazer X</em>)</td><td style="padding:.5rem">Capacidade técnica (<em>chamar sistema Y</em>)</td></tr>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem"><strong>Forma</strong></td><td style="padding:.5rem">Markdown com receita escrita por humano</td><td style="padding:.5rem">Função de código que chama API ou banco</td></tr>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem"><strong>Quem cria</strong></td><td style="padding:.5rem">Curadoria humana (baseado em Clones)</td><td style="padding:.5rem">Engenharia</td></tr>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem"><strong>Vive onde</strong></td><td style="padding:.5rem"><code>pinguim.skills</code> + MD em <code>cerebro/skills/</code></td><td style="padding:.5rem">Edge Function + registro em <code>pinguim.agentes.tools[]</code></td></tr>
              <tr style="border-bottom:1px solid var(--docs-line)"><td style="padding:.5rem"><strong>Exemplo</strong></td><td style="padding:.5rem"><em>Página de venda longa: Hormozi pra oferta, Halbert pra headline, Bencivenga pra prova, ordem X…</em></td><td style="padding:.5rem"><code>buscar-skill('pagina-de-venda-longa')</code> que devolve o MD da Skill</td></tr>
            </tbody>
          </table>
          <p><strong>Análogo humano:</strong> Skill é o <em>conhecimento</em> do funcionário ("sei escrever página de venda"). Tool é a <em>chave</em> do escritório ("posso entrar no banco e ler o arquivo X"). Skill sem Tool fica só no MD parado. Tool sem Skill busca conhecimento que não existe.</p>
          <p><strong>Categorias de Skill:</strong></p>
          <ul>
            <li><strong>Universais</strong> — todo agente Pinguim usa: <code>pesquisar-cerebro</code>, <code>aprender-com-feedback</code>, <code>seguir-anatomia</code></li>
            <li><strong>Por área</strong> — agentes da mesma família: <code>escrever-headline</code>, <code>montar-oferta</code>, <code>gerar-pesquisa-de-persona</code></li>
            <li><strong>Específicas</strong> — formato concreto: <code>pagina-de-venda-longa</code>, <code>vsl-curta</code>, <code>email-de-lancamento</code>, <code>roteiro-de-aula</code></li>
          </ul>
          <p><strong>Como Skill se relaciona com Clone:</strong> a Skill <em>não inventa método</em>. Ela aponta: "pra esse formato, considera consultar Clones [A, B, C], na ordem Y, com foco em Z." Os Clones já têm o método deles — Skill só agrega e dá direção. É assim que mantemos a inteligência dos Clones e ainda damos consistência ao agente.</p>

          <h3 style="margin-top:1.5rem">Padrão técnico — não inventamos do zero</h3>
          <p>Pinguim segue a <strong>spec aberta Agent Skills</strong> (<a href="https://agentskills.io" target="_blank" rel="noopener">agentskills.io</a>) — formato originado pela Anthropic em 18-Dez-2025 e hoje adotado por <strong>36+ ferramentas</strong>: OpenAI Codex, GitHub Copilot, VS Code, Cursor, Gemini CLI, JetBrains Junie, AWS Kiro, Mistral, Snowflake Cortex, Claude Code.</p>
          <p>Da spec, dois campos são <strong>obrigatórios</strong>: <code>name</code> + <code>description</code>. Tudo que é Pinguim-específico (família, formato, clones consultados) vive dentro do campo opcional <code>metadata</code> — exatamente como a spec prevê pra extensões de fornecedor. Isso mantém nossas Skills <em>portáveis</em> e <em>forward-compatible</em>: qualquer ferramenta da spec consegue ler o essencial; quem entende Pinguim aproveita o resto.</p>
          <p>Estrutura final de uma Skill Pinguim:</p>
          <pre style="background:var(--docs-code-bg,#0a0a0a);color:var(--docs-code-fg,#e6e6e6);padding:1rem;border-radius:8px;font-size:.75rem;line-height:1.5;overflow-x:auto;font-family:'Geist Mono','JetBrains Mono',ui-monospace,monospace">---
name: copy-headline-pas
description: Aplica framework P.A.S. em headlines de página de venda quando o gancho precisa ser curto e emocional.
metadata:
  pinguim:
    familia: copywriting
    formato: framework
    clones: [eugene-schwartz, hormozi]
---

# Headline P.A.S.

## Quando aplicar
## Receita
## O que NÃO fazer
## Exemplo aplicado</pre>
          <p><strong>Sobre a separação Skill vs Clone:</strong> a spec aberta não trata "voz/persona" como entidade — só Skill. O precedente conceitual da nossa separação Skill/Clone vem do <a href="https://docs.crewai.com/en/guides/agents/crafting-effective-agents" target="_blank" rel="noopener">CrewAI</a>, que separa formalmente <code>tools</code> (skills/capacidades) de <code>backstory</code> (persona/voz). É decisão arquitetural deliberada do Pinguim, defensável e documentada.</p>
        `,
      },
      {
        id: 'fluxo',
        titulo: 'Fluxo de execução — passo a passo',
        html: `
          <p>Cenário: <strong>Aurora gera copy de e-mail pro Elo</strong>, foco em objeção de preço.</p>

          <h3>1. Entrada</h3>
          <p>Luiz pede: <em>"Aurora, gera copy de e-mail pro Elo, foco em objeção de preço."</em></p>

          <h3>2. Aurora monta o contexto</h3>
          <ul>
            <li>Lê própria identidade: SOUL + AGENTS + TOOLS + AGENT-CARD + SYSTEM-PROMPT</li>
            <li>Lê próprio APRENDIZADOS.md (ex: <em>"Em 14/05 Luiz editou pra remover gatilho de medo"</em>)</li>
            <li>Consulta <strong>Cérebro Elo</strong>: pega depoimentos sobre preço, objeções já respondidas</li>
            <li>Consulta <strong>Persona do Elo</strong>: vê linguagem que o aluno usa</li>
            <li>Carrega <strong>Skill</strong> "gerar-email-objecao-preco"</li>
            <li>Consulta <strong>Clones</strong> configurados: Hormozi (oferta) + Bencivenga (gancho) + Luiz (voz)</li>
            <li>Consulta <strong>Funil</strong> "Lançamento Elo Q2" (se habilitado pra Aurora): vê que Elo é upsell de LoFi</li>
          </ul>

          <h3>3. Aurora executa</h3>
          <p>LLM (gpt-4o-mini) recebe o contexto montado e gera a copy.</p>

          <h3>4. Aurora registra</h3>
          <p>Linha em <code>pinguim.agente_execucoes</code> (input, output, contexto_usado, custo, latência) + output entregue pro Luiz.</p>

          <h3>5. Luiz dá feedback</h3>
          <p><em>"Bom, mas o gancho está fraco. Reescrevi assim: [...]"</em></p>

          <h3>6. Aurora aprende (EPP — premissa dura)</h3>
          <p>Linha nova em APRENDIZADOS.md: <em>"Em [data] Luiz editou gancho pra [X]. Aplicar padrão similar em e-mails de objeção de preço."</em></p>
          <p>Próxima execução: Aurora lê APRENDIZADOS atualizado e ajusta. <strong>O agente que você usa amanhã é melhor que o de hoje</strong> — sem retreino, sem custo extra, sem trabalho do time.</p>
        `,
      },
      {
        id: 'framework-criacao',
        titulo: 'Framework de criação — 5 fases',
        html: `
          <p>Todo agente passa por essas 5 fases, nesta ordem:</p>
          <ol>
            <li><strong>COLETAR</strong> — entender a necessidade real. Que dor resolve? Quem aciona? Qual o output útil? Conversa com o stakeholder, não chutar.</li>
            <li><strong>CRIAR</strong> — montar os 7 MDs do diretório + preencher o AGENT-CARD com os 7 campos.</li>
            <li><strong>CONECTAR</strong> — integrar ao canal de acionamento (painel, Discord, Telegram, WhatsApp, API) e às ferramentas que vai usar.</li>
            <li><strong>ENTREGAR</strong> — colocar no ar com <code>status=em_producao</code>. Começar com volume baixo e <code>limite_execucoes_dia</code> conservador.</li>
            <li><strong>EVOLUIR</strong> — coletar feedback, atualizar APRENDIZADOS.md, ajustar SYSTEM-PROMPT quando necessário. Nunca termina.</li>
          </ol>
          <p><strong>Velocidade-alvo:</strong> 1 agente por dia. Se está levando semana, o escopo está grande demais — quebrar em agentes menores.</p>
        `,
      },
      {
        id: 'anti-padroes',
        titulo: 'Anti-padrões — o que NÃO fazer',
        html: `
          <ul>
            <li>❌ Criar tabela nova no banco pra cada tipo de agente</li>
            <li>❌ Guardar personalidade/regras no banco (isso é MD, em git)</li>
            <li>❌ Fazer agente sem APRENDIZADOS.md ("a gente adiciona depois")</li>
            <li>❌ Misturar SOUL.md (personalidade) com AGENTS.md (regras operacionais) — são coisas diferentes</li>
            <li>❌ AGENT-CARD com menos de 7 campos preenchidos</li>
            <li>❌ Agente sem <code>handoff</code> definido — vai travar e ninguém sabe pra onde escalar</li>
            <li>❌ Agente sem <code>métrica_sucesso</code> numérica — não dá pra saber se está funcionando</li>
            <li>❌ Tratar Clone como agente pleno — Clone é fonte de voz, não tem missão única</li>
            <li>❌ Propor "arquitetura nova" sem ler este doc primeiro</li>
          </ul>
        `,
      },
    ],
    pitch: `
      <p>Quando alguém pergunta <em>"o que tem dentro de um agente Pinguim?"</em>, a resposta não é "um prompt bom". É <strong>7 arquivos de identidade + 5 fontes vivas + estado runtime + loop de aprendizado</strong>. Essa é a anatomia que faz a diferença entre um chatbot genérico e um Agente Pinguim que evolui a cada uso.</p>
      <p>Pra Pinguim, isso significa que cada agente que entra em produção tem fundamento documentado, escala sem virar caos, e fica mais inteligente automaticamente. Pra Dolphin, significa um framework de agente vendável — qualquer cliente pode adotar a mesma estrutura e ter o mesmo padrão de qualidade.</p>
    `,
  };
}
