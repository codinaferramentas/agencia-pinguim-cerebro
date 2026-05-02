/* Doc: Customer Profile — 5a familia conceitual de Cerebro */

export async function gerar() {
  return {
    titulo: 'Customer Profile',
    lede: 'Memória viva de cada lead/cliente. Cérebro de produto sabe O QUE vendemos. Customer Profile sabe PRA QUEM. É a 5ª família conceitual de Cérebro do Pinguim OS — com tela própria por causa de escala.',
    secoes: [
      {
        id: 'principio',
        titulo: 'Princípio',
        html: `
          <p>Quando o agente comercial atender o lead João Silva, o Cérebro tradicional sabe responder sobre Elo, ProAlt, sobre SPIN ou Cialdini. Mas <strong>não sabe</strong> que João já entrou em 2 desafios e abandonou o checkout. Sem isso, o agente atende como se fosse a primeira vez — e cliente fareja em 10 segundos.</p>
          <p><strong>Customer Profile preenche esse vazio.</strong> Cada pessoa que toca o funil ganha uma memória viva: compras, eventos comportamentais, onboarding, health score, LTV. Tudo num lugar só, atualizado em tempo real, consultável por e-mail.</p>
        `,
      },
      {
        id: 'arquitetura-conceitual',
        titulo: 'Arquitetura conceitual',
        html: `
          <p>Customer Profile é, conceitualmente, a <strong>5ª família de Cérebro</strong> do Pinguim OS. As outras 4:</p>
          <ul>
            <li><strong>Internos</strong> — produtos da casa (Elo, ProAlt, Lira)</li>
            <li><strong>Externos</strong> — concorrentes mapeados</li>
            <li><strong>Metodologias</strong> — SPIN, Sandler, Challenger, Voss, MEDDIC, Low Ticket</li>
            <li><strong>Clones</strong> — pessoas que inspiram (Hormozi, Cialdini, Voss)</li>
            <li><strong>Customer Profile</strong> — pessoas reais que tocam o funil</li>
          </ul>
          <p>Por escala (centenas/milhares de entradas) e UX específica (consulta por e-mail/nome em vez de browse de cards), <strong>Customer Profile ganhou tela própria no sidebar</strong>. Não vive dentro de "Cérebros" como sub-aba.</p>
        `,
      },
      {
        id: 'origem-dados',
        titulo: 'Origem dos dados',
        html: `
          <p><strong>Fonte primária: Clint via webhook.</strong> Não competimos com CRM — complementamos. Hotmart entrega "compra seca". Clint entrega o comportamento (qual funil, qual etapa, abandono, recompra, upsell em curso). É comportamento que faz o agente decidir bem.</p>
          <p>Fontes secundárias possíveis: onboarding (formulário pós-compra), Discord (engajamento), manual (admin adiciona evento), Hotmart (fallback se Clint cair).</p>
        `,
      },
      {
        id: 'estrutura-banco',
        titulo: 'Estrutura no banco',
        html: `
          <p>3 tabelas normalizadas em <code>schema pinguim</code>:</p>
          <h3>customer_profiles</h3>
          <p>1 linha por pessoa. Chave: <code>email</code>. Campos agregados: <code>ltv_total_brl</code>, <code>status</code> (lead/cliente/ex-cliente), <code>health_score</code>, <code>primeira_compra_em</code>, <code>ultima_atividade_em</code>.</p>

          <h3>customer_compras (1:N)</h3>
          <p>Cliente comprou ProAlt → 1 linha. Comprou Elo depois → 2ª linha. <strong>Nunca duplica profile.</strong> Histórico todo preservado. Trigger atualiza <code>ltv_total_brl</code> automaticamente.</p>

          <h3>customer_events (N:1)</h3>
          <p>Tudo que <em>não</em> é compra: onboarding respondido, módulo completo, post no Discord, abandono de checkout, abertura de e-mail. Timeline completa por cliente, com <code>payload jsonb</code> flexível por origem.</p>
        `,
      },
      {
        id: 'caminho-c-hibrido',
        titulo: 'Caminho C (híbrido) — escalada quando importa',
        html: `
          <p>Default: 1 linha estruturada por cliente em <code>customer_profiles</code> + eventos. Custo praticamente zero, escala fácil pra 100k+ clientes/ano.</p>
          <p><strong>Quando cliente vira high-ticket ou advocate</strong>, sobe pra nível 2: liga ingestão de calls dele (Whisper transcreve), gera fontes vetorizadas vinculadas. Permite busca semântica ("acha contexto de quando ele falou tá caro").</p>
          <p>Decisão de "subir nível" é por evento (LTV passou de R$ X) ou manual (humano marca). Custo controlado, riqueza onde importa.</p>
        `,
      },
      {
        id: 'escala',
        titulo: 'Escala',
        html: `
          <ul>
            <li><strong>250 clientes/dia</strong> (média low ticket Pinguim) → 91 mil/ano</li>
            <li><strong>~1 GB/ano</strong> de dados (profile + compras + eventos)</li>
            <li>Plano Pro Supabase (8 GB inclusos) → 8 anos só com isso</li>
            <li>Index em <code>email</code>, <code>customer_id</code>, <code>ocorrido_em</code> → consultas em &lt; 50ms</li>
            <li>Paginação infinita: 50 por vez na tela</li>
          </ul>
        `,
      },
      {
        id: 'integracao-agentes',
        titulo: 'Como agentes consomem',
        html: `
          <p>Squad consome via RPC <code>get_customer_profile(email)</code> — retorna JSON pronto pro prompt do agente, com profile + últimas 100 eventos + todas compras. Resposta única em ~10ms.</p>
          <p>Squads que vão depender disso:</p>
          <ul>
            <li><strong>SDR Squad</strong> — atende lead já sabendo se ele já entrou em algum funil antes</li>
            <li><strong>Closer Squad</strong> — copiloto vê histórico de objeção real do cliente</li>
            <li><strong>Growth Squad</strong> (Health Score / Upsell / Win-back) — toma decisão baseada em LTV + eventos comportamentais</li>
          </ul>
          <p>Ou seja: Customer Profile é <strong>infraestrutura transversal</strong>, não pertence a uma squad só.</p>
        `,
      },
      {
        id: 'lgpd',
        titulo: 'LGPD e retenção',
        html: `
          <p>Política definida com Andre em 2026-05-02:</p>
          <ul>
            <li>Quem tem acesso ao painel Pinguim OS vê todos os profiles (sem RLS por usuário por enquanto)</li>
            <li>Retenção: <strong>3 anos pós-última compra</strong> antes de varredura/anonimização. Cliente que não compra mais nada continua na base por causa de campanhas de win-back.</li>
            <li>Cliente que pedir esquecimento explícito: anonimização imediata.</li>
          </ul>
        `,
      },
      {
        id: 'origem',
        titulo: 'Origem da decisão',
        html: `
          <p>Brainstorm aberto em 2026-05-02. Conselheiros: <strong>Patrick Lencioni</strong> (vocabulário), <strong>Charlie Munger</strong> (inverter), <strong>Reid Hoffman</strong> (não competir com CRM). Decisão: caminho C híbrido, nome <em>Customer Profile</em>, item próprio no sidebar.</p>
          <p>Pré-requisito pra Plano Comercial V2 ser escrito (Pré/Durante/Pós/Growth).</p>
        `,
      },
    ],
  };
}
