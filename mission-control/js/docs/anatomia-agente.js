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
