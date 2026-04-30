/* Doc: Segurança — pilar Cyber do Pinguim OS */

export async function gerar() {
  return {
    titulo: 'Segurança',
    lede: 'Segurança não é correção pontual. É camada permanente do framework — defesa em profundidade, Zero Trust, monitoramento contínuo, políticas escritas. Tudo automático, tudo visível, tudo escalável.',
    secoes: [
      {
        id: 'principio',
        titulo: 'Princípio',
        html: `
          <p>Toda feature nova passa pelo Squad Cyber antes de ser declarada pronta. Isso é portão obrigatório, não review opcional.</p>
          <ul>
            <li>Tabela nova? Trigger valida que tem RLS ativo.</li>
            <li>Edge Function nova? Validar JWT é obrigatório.</li>
            <li>Tool de agente nova? Allowlist explícita.</li>
            <li>Chave nova? Escopo mínimo possível.</li>
          </ul>
          <p>Esse princípio existe porque <strong>Pinguim OS é vendido como produto</strong>. Quando o cliente perguntar "como vocês cuidam disso?", a resposta é "cron + painel + agente cyber dedicado", não "rodei um script no início".</p>
        `,
      },
      {
        id: 'squad-cyber',
        titulo: 'Squad Cyber — quem opera',
        html: `
          <p>6 conselheiros (clones reais) consultados pelo sistema:</p>
          <table class="docs-table">
            <thead><tr><th>Conselheiro</th><th>Especialidade</th><th>O que opera</th></tr></thead>
            <tbody>
              <tr><td><strong>Peter Kim</strong></td><td>The Hacker Playbook · Red Team</td><td>Simula ataque diariamente — F12, query injection, IDOR. Tudo que vaza vira incidente.</td></tr>
              <tr><td><strong>Georgia Weidman</strong></td><td>Penetration Testing</td><td>OWASP Top 10 contra o sistema toda semana. Princípio do menor privilégio.</td></tr>
              <tr><td><strong>Jim Manico</strong></td><td>OWASP / Secure Coding</td><td>Audita código novo a cada push. Validação de input, autenticação, sessão.</td></tr>
              <tr><td><strong>Marcus Carey</strong></td><td>Threat Intelligence</td><td>Lê logs do Vercel/Supabase de 6 em 6h. Coleta → análise → disseminação → feedback.</td></tr>
              <tr><td><strong>Omar Santos</strong></td><td>Cisco / Zero Trust</td><td>Verifica que toda Edge Function valida JWT. Toda tool tem allowlist. Nenhum acesso é confiável por padrão.</td></tr>
              <tr><td><strong>Chris Sanders</strong></td><td>Intrusion Detection (IDS)</td><td>Compara tráfego com baseline de 7 dias. Alerta em desvio.</td></tr>
            </tbody>
          </table>
          <p>Conselho transversal: <strong>Ray Dalio</strong> (cada decisão de segurança vira política escrita) e <strong>Charlie Munger</strong> (inverte o problema — lista os 10 piores cenários, escreve a defesa de cada um).</p>
        `,
      },
      {
        id: 'arquitetura',
        titulo: 'Arquitetura',
        html: `
          <h3>Camadas (defesa em profundidade)</h3>
          <ol>
            <li><strong>Banco</strong> — RLS em toda tabela, validado por trigger em <code>CREATE TABLE</code>. Funções com <code>SECURITY DEFINER</code> obrigam <code>search_path</code> seguro.</li>
            <li><strong>API</strong> — Edge Functions validam JWT por padrão. Service role só em cron interno.</li>
            <li><strong>Front</strong> — login obrigatório. Variáveis sensíveis nunca hardcoded.</li>
            <li><strong>Cofre</strong> — chaves vivem em Vercel env vars. Painel mostra nomes mascarados (último 4 chars), nunca valor.</li>
            <li><strong>Cron</strong> — pg_cron + pg_net disparam Edge Functions noturnas. Histórico em <code>cron.job_run_details</code>.</li>
          </ol>

          <h3>Tabelas do schema pinguim</h3>
          <ul>
            <li><code>seguranca_relatorios</code> — toda auditoria grava aqui (RLS, policies, security_definer, raio_x_banco, etc.)</li>
            <li><code>banco_metricas</code> — série histórica de tamanho/linhas pra projeção</li>
            <li><code>politicas_seguranca</code> — regras escritas (Dalio). Feedback vira política.</li>
            <li><code>seguranca_incidentes</code> — tentativas de invasão, anomalias do IDS</li>
          </ul>

          <h3>Edge Functions</h3>
          <ul>
            <li><code>auditar-seguranca</code> — checks RLS + policies + security_definer + incidentes_abertos</li>
            <li><code>raio-x-banco</code> — contagens reais (sem limite PostgREST), tamanhos, projeção</li>
            <li><code>vercel-env-vars</code> — sincroniza chaves Vercel quando plano permite (Pro+). Em Hobby, fallback é cofre próprio.</li>
          </ul>

          <h3>Cofre como fonte canônica (não inventário)</h3>
          <p>O cofre Pinguim OS <strong>controla</strong> as chaves. Quando você rotaciona/edita no painel, o sistema todo passa a usar a nova versão na próxima invocação (cache 5min). Sem deploy, sem mexer em Vercel/Supabase secrets, sem mexer em .env.</p>

          <h4>Componentes</h4>
          <ul>
            <li><code>pinguim.cofre_chaves</code> — tabela com nome, provedor, escopo, onde vive, valor (criptografado por RLS), últimos 4 chars, última rotação</li>
            <li><code>vw_cofre_chaves</code> — view que NUNCA expõe <code>valor_completo</code></li>
            <li><code>get_chave(nome, consumidor, origem)</code> — RPC SECURITY DEFINER que retorna o valor + audita uso</li>
            <li><code>chave_uso</code> — toda leitura registrada (chave, consumidor, origem, sucesso, timestamp)</li>
            <li><code>listar_chaves_em_uso(horas)</code> — agrega leituras pra dashboard</li>
            <li><code>chaves-gateway</code> Edge Function — gateway central (raramente usada — Edge Functions chamam direto)</li>
            <li><code>_shared/cofre.ts</code> — helper das Edge Functions (<code>getChave('OPENAI_API_KEY', 'buscar-cerebro')</code>)</li>
            <li><code>ingest-engine/lib/cofre.mjs</code> — espelho do helper pro lado local</li>
          </ul>

          <h4>O que o cofre controla</h4>
          <p>Hoje 5 Edge Functions já leem do cofre: <code>buscar-cerebro</code>, <code>gerar-persona</code>, <code>ingest-pacote</code>, <code>ingest-url</code>, <code>revetorizar-fonte</code>. Mais o ingest-engine local. Todas com <strong>fallback em <code>Deno.env</code> / <code>.env.local</code></strong> — se cofre não tiver valor, sistema continua funcionando.</p>

          <h4>O que o cofre NÃO controla (bootstrap secrets)</h4>
          <ul>
            <li><strong><code>SUPABASE_URL</code></strong> e <strong><code>SUPABASE_SERVICE_ROLE_KEY</code></strong> — usadas pra <em>autenticar no banco</em> antes de ler o cofre. Bootstrap clássico — ovo precisa vir antes da galinha. Continuam vindo de <code>Deno.env</code>.</li>
            <li><strong><code>SUPABASE_URL</code></strong> e <strong><code>SUPABASE_ANON_KEY</code></strong> no front — vão pro browser do cliente, cofre não pode entregar (expor service_role). Continuam em Vercel env vars.</li>
          </ul>
          <p>Total: 3 chaves bootstrap (1 delas duplicada em front e Edge), todo o resto vem do cofre.</p>

          <h4>Auditoria viva</h4>
          <p>Toda leitura grava em <code>chave_uso</code>: chave, consumidor (qual Edge Function leu), origem (edge-function/local/painel), sucesso/falha, motivo. A aba "Cofre" mostra: total de leituras nas últimas 24h, % de sucesso, consumidores ativos, quando foi a última leitura.</p>

          <h4>Por que cofre próprio</h4>
          <p>Plano Hobby da Vercel não retorna env vars via REST API. Isolar do provedor torna o framework portável: cliente Pinguim OS pode usar Vercel/Cloudflare/AWS/Railway, o cofre funciona igual. Vantagem maior: <strong>rotação centralizada</strong>. Cliente roda compromisso vazado, abre o painel, troca chave em 1 lugar, sistema inteiro passa a usar a nova em ≤5min.</p>
        `,
      },
      {
        id: 'estado-roadmap',
        titulo: 'O que está pronto vs roadmap',
        html: `
          <h3>✅ Fase 1 (entregue)</h3>
          <ul>
            <li>Schema seguranca + RLS em todas as 30 tabelas + trigger em CREATE TABLE</li>
            <li>RPCs de auditoria (listar_tabelas_rls, listar_tabelas_policies, listar_funcoes_security_definer, raio_x_banco, contar_tabela)</li>
            <li>3 Edge Functions deployadas (auditar-seguranca, raio-x-banco, vercel-env-vars)</li>
            <li>Painel /seguranca com 6 abas (Visão, Cofre, Raio-X, Incidentes, Políticas, Histórico)</li>
            <li>Cron pg_cron agendado (auditoria diária 03h, raio-X diário 04h)</li>
            <li>Função <code>contar_tabela()</code> resolve o problema do limite 500/1000 do PostgREST</li>
          </ul>

          <h3>⧗ Fase 2 (próxima — Squad Cyber Operacional)</h3>
          <ul>
            <li>Criar 6 agentes reais no banco, cada um com <code>clones_consultados</code> apontando pro respectivo clone</li>
            <li>Roteiro de animação Squad Cyber (mesmo padrão de Persona/Cérebro), com falas dos 6 conselheiros</li>
            <li>Console de detecção visual (cards de incidentes em tempo real)</li>
            <li>Agente Red Team rodando F12 simulado, IDOR test, injection test</li>
          </ul>

          <h3>◯ Fase 3 (depois — Painel completo + Mapa)</h3>
          <ul>
            <li>Bloco "Segurança Contínua" no Mapa do Sistema (entre Cérebros e Inteligência)</li>
            <li>Tela de "ajustar curadoria do framework Cyber" pro cliente que adotar Pinguim OS</li>
            <li>Princípio feedback → política automatizado (feedback do André sobre segurança vira política escrita)</li>
          </ul>
        `,
      },
      {
        id: 'cliente',
        titulo: 'Como o cliente Pinguim OS adota',
        html: `
          <p>O framework Cyber é vendável. Outro cliente adotar significa:</p>
          <ol>
            <li>Aplicar <code>sql/seguranca.sql</code> + <code>seguranca-rpcs.sql</code> no projeto Supabase dele</li>
            <li>Deploy das 3 Edge Functions (auditar-seguranca, raio-x-banco, vercel-env-vars)</li>
            <li>Configurar VERCEL_TOKEN + VERCEL_PROJECT_ID nos secrets da Edge <code>vercel-env-vars</code></li>
            <li>Popular <code>vault.pinguim_service_role_key</code> com a chave service_role do projeto</li>
            <li>Ativar pg_cron no Dashboard Supabase (uma vez)</li>
            <li>Squad Cyber começa a operar — sem treinar nada, sem desenvolver nada</li>
          </ol>
          <p>Esse é o valor do framework: <strong>cliente adota a postura de segurança da Pinguim sem precisar de equipe Cyber dedicada</strong>. Os clones já trabalham; ele só vê o painel.</p>
        `,
      },
    ],
    pitch: `
      <p>Software como serviço sem squad de segurança é como casa nova sem fechadura — funciona até alguém testar a porta. Pinguim OS já vem com Squad Cyber operando antes do primeiro cliente entrar.</p>
      <p>Peter Kim simulando ataque diário, Georgia Weidman rodando OWASP semanal, Jim Manico auditando código a cada push, Marcus Carey lendo threat intel a cada 6h, Omar Santos validando Zero Trust, Chris Sanders detectando anomalia em tempo real. Não é gente — é metodologia destilada em agente.</p>
      <p>Pra Pinguim, isso é vitrine. Pra cliente, é confiança vendável: "como vocês cuidam disso?" — abre o painel, mostra. Não é discurso, é dado vivo.</p>
    `,
  };
}
