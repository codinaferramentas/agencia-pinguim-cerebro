/* Doc: FinOps — pilar de gestão de custo do Pinguim OS */

export async function gerar() {
  return {
    titulo: 'FinOps',
    lede: 'Cliente do Pinguim OS abre o painel e VÊ quanto está gastando. Custo por provedor, custo por operação, projeção de fim de mês, alertas. Sem surpresa.',
    secoes: [
      {
        id: 'principio',
        titulo: 'Princípio',
        html: `
          <p>Tem que ser possível responder em 10 segundos: <strong>"quanto eu gastei esse mês?"</strong> e <strong>"em que está indo o dinheiro?"</strong>. Pinguim OS vem com isso ligado desde o dia 1, antes do primeiro cliente entrar.</p>
          <p>Sem visibilidade, cliente fica com medo de usar (não sabe se está caro), e sócio é surpreendido pela fatura. Visibilidade não é luxo — é higiene básica de SaaS.</p>
        `,
      },
      {
        id: 'squad-finops',
        titulo: 'Squad FinOps — quem opera',
        html: `
          <table class="docs-table">
            <thead><tr><th>Conselheiro</th><th>Especialidade</th><th>O que opera</th></tr></thead>
            <tbody>
              <tr><td><strong>JR Storment</strong></td><td>FinOps Foundation co-founder</td><td>Custo agregado mensal, framework FinOps, governança</td></tr>
              <tr><td><strong>Corey Quinn</strong></td><td>Last Week in AWS · waste detection</td><td>Detecta padrão "está pagando por algo que não usa". Alerta sobre desperdício.</td></tr>
              <tr><td><strong>Eli Mansoor</strong></td><td>Cloud cost optimization</td><td>Otimização contínua: identificar quando trocar plano, quando consolidar, quando comprar reserved capacity</td></tr>
              <tr><td><strong>Mike Fuller</strong></td><td>Atlassian FinOps</td><td>Cost-per-workload: custo por agente Pinguim, custo por cliente, custo por tipo de operação</td></tr>
            </tbody>
          </table>
        `,
      },
      {
        id: 'arquitetura',
        titulo: 'Arquitetura',
        html: `
          <h3>Coleta de dados</h3>
          <ul>
            <li><code>ingest_lotes.custo_usd</code> — todo pacote/URL/avulso já gravava custo desde antes (origem original)</li>
            <li><code>chave_uso</code> — toda chamada do cofre (proxy de invocação por consumidor)</li>
            <li><code>banco_metricas</code> — % do plano Supabase usado no dia (do raio-X)</li>
          </ul>

          <h3>Agregação</h3>
          <p>Edge Function <code>auditar-custos</code> roda diariamente (5h UTC) e agrega tudo em <code>pinguim.custos_diarios</code> com chave única <code>(dia, provedor, operacao)</code>.</p>

          <h3>RPCs disponíveis</h3>
          <ul>
            <li><code>custo_mes_corrente()</code> — total + breakdown por provedor/operação + projeção</li>
            <li><code>custos_30_dias()</code> — série temporal pra gráfico</li>
            <li><code>tokens_ia_mes()</code> — detalhamento OpenAI/Anthropic por consumidor</li>
          </ul>

          <h3>Alertas</h3>
          <p>Tabela <code>custos_alertas</code> guarda regras configuradas. Tipos suportados:</p>
          <ul>
            <li><strong>mensal_total</strong> — avisa se total do mês passar US$ X</li>
            <li><strong>mensal_provedor</strong> — avisa se provedor específico (OpenAI, Supabase) passar US$ X</li>
            <li><strong>banco_pct_plano</strong> — avisa se banco passar X% do plano Supabase</li>
            <li><strong>crescimento_pct</strong> — avisa se crescimento mês-a-mês passar X%</li>
          </ul>
          <p>Pré-cadastrados: alerta OpenAI mensal &gt; US$ 50, total mensal &gt; US$ 100, banco &gt; 80% do plano.</p>
        `,
      },
      {
        id: 'cinco-abas',
        titulo: 'O painel',
        html: `
          <ol>
            <li><strong>Visão geral</strong> — Card grande com total do mês, BRL aproximado, projeção de fim de mês. Cards por provedor (OpenAI/Supabase/Vercel) com %. Tabela por operação.</li>
            <li><strong>Tokens IA</strong> — Detalhamento OpenAI/Anthropic por consumidor (qual Edge Function gastou quanto). Eventos + custo + %.</li>
            <li><strong>Banco</strong> — Reusa o raio-X do banco (% plano, projeção, top tabelas). Banco é custo, não segurança.</li>
            <li><strong>Alertas</strong> — Lista de regras ativas/inativas + último disparo.</li>
            <li><strong>Histórico 30d</strong> — Gráfico de barras + tabela cronológica.</li>
          </ol>
          <p>Botão "↻ Atualizar agora" no header dispara <code>auditar-custos</code> manualmente (sem esperar cron diário).</p>
        `,
      },
      {
        id: 'cliente',
        titulo: 'Como cliente Pinguim OS adota',
        html: `
          <ol>
            <li>Aplicar SQL: <code>finops.sql</code> + <code>finops-cron.sql</code></li>
            <li>Deploy Edge Function <code>auditar-custos</code></li>
            <li>Cron pg_cron já agendado pelo SQL — começa rodar 5h UTC todo dia</li>
            <li>Painel <code>/finops</code> aparece automático (frontend já leva isso)</li>
            <li>Configurar alertas próprios em <code>custos_alertas</code> (defaults vêm com 3 prontos)</li>
          </ol>
          <p><strong>Custo de adoção:</strong> zero (FinOps roda no plano Free do Supabase).</p>
        `,
      },
    ],
    pitch: `
      <p>Cliente que vai pagar pra usar Pinguim OS quer saber o que está pagando. Squad FinOps é a resposta: 4 conselheiros vivos no painel, cron diário, alertas configuráveis, projeção de fim de mês.</p>
      <p>Não é dashboard de vaidade. É <strong>governança operacional</strong>: o sócio abre antes da reunião com o financeiro e tem o número. JR Storment olha o agregado, Corey Quinn caça desperdício, Eli Mansoor sugere otimização, Mike Fuller mostra custo-por-agente quando agentes existirem.</p>
      <p>Para vender: "vocês vão saber, todo dia, quanto custa o sistema rodando — sem precisar abrir 4 painéis de 4 fornecedores diferentes".</p>
    `,
  };
}
