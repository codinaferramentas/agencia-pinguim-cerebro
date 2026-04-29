/* Doc: Plano Comercial Pinguim — fundação + roadmap dos 5 agentes */

export async function gerar() {
  return {
    titulo: 'Plano Comercial · Time de Apoio ao Comercial',
    lede: 'Transformar o comercial da Pinguim num time aumentado por IA — sem trocar Clint, sem trocar processo, agregando inteligência. Esta é a proposta a ser aprovada antes de qualquer linha de código.',
    secoes: [
      {
        id: 'problema',
        titulo: 'O problema que resolve',
        html: `
          <p>O comercial Pinguim hoje tem duas pessoas atendendo aluno via Clint e WhatsApp. Faturam, bem. Mas operam <strong>sem suporte estruturado</strong>: dependem de memória própria pra puxar caso, montar resposta, lembrar de objeção, chegar com pesquisa pronta na call.</p>
          <p>Resultado: cada vendedora vira um silo. Quando uma sai, vai embora junto a "voz" dela com o cliente. Quando uma fica sobrecarregada, leads bons esfriam. Quando um aluno faz uma pergunta sobre nicho específico, a resposta depende de qual vendedora pegou.</p>
          <p>O time comercial não precisa ser <strong>substituído</strong> — precisa ser <strong>aumentado</strong>. É o que esse plano propõe.</p>
        `,
      },
      {
        id: 'fundacao',
        titulo: 'Fundação · As 4 famílias de Cérebro',
        html: `
          <p>Antes dos agentes, a base. Todo agente comercial é tão bom quanto a fonte que consulta. Por isso primeiro a gente estrutura <strong>4 famílias de Cérebro</strong> no Pinguim OS:</p>

          <h3>1. 📦 Internos · Os produtos da Pinguim</h3>
          <p>Elo, ProAlt, Lyra, Taurus, Orion, Lo-fi Desafio, Low Ticket Desafio, Análise de Perfil, Mentoria Express. Cada um tem persona, prova social, cases por nicho, objeções, aulas, páginas de venda. <strong>Já existem hoje.</strong></p>

          <h3>2. 🔍 Externos · Concorrentes mapeados</h3>
          <p>Mesma anatomia dos Internos, só que apontando pra fora. Raspamos página de venda, aula, vídeo, depoimento de concorrente. Permite que o agente comercial saiba comparar honestamente — "o concorrente cobra X mas não entrega Y, nosso preço justifica porque…"</p>

          <h3>3. 📚 Metodologias · Biblioteca de técnica de venda</h3>
          <p>SPIN Selling, Sandler, Challenger Sale, Tactical Empathy (Voss), MEDDIC. Princípios e scripts das 5 metodologias mais reconhecidas em vendas consultivas/high-ticket. <strong>Já alimentadas no sistema</strong> com material curado em PT-BR (10 fontes, ~62KB de conteúdo, busca semântica funcionando).</p>
          <p>Por que essas 5? Cobrem o ciclo completo: SPIN pra investigação, Sandler pra qualificação, Challenger pra educar cliente confuso, Voss pra quebrar objeção, MEDDIC pra disciplina de pipeline. Outras metodologias podem entrar com 1 clique — Hormozi $100M Offers, Cialdini, Conrado Adolpho, ou metodologia própria da Pinguim quando destilada.</p>

          <h3>4. 👤 Clones · Sócios e conselheiros</h3>
          <p>Voz do Luiz, do Micha. Voz dos gurus de mercado (Hormozi, Voss, Rackham). Permite que o agente comercial responda "no tom" do sócio quando aluno tem dúvida estratégica.</p>
          <p><strong>Decisão arquitetural:</strong> tudo é Cérebro tecnicamente. Mesma engine de busca, vetorização, ingestão. O que muda é a categoria, organizada visualmente no sidebar do Pinguim OS.</p>
        `,
      },
      {
        id: 'switch',
        titulo: 'Switch de metodologia · O diferencial vendável',
        html: `
          <p>Cada Cérebro de Metodologia tem uma <strong>chave de ativação</strong>. Em qualquer momento, o gestor escolhe quais metodologias estão ativas pros agentes comerciais usarem.</p>
          <p>Aplicações no MVP (todas viáveis com os 5 Cérebros já alimentados):</p>
          <ul>
            <li><strong>Por produto:</strong> Taurus (low-ticket) usa SPIN simplificado; Elo (high-ticket) usa Sandler completo + Voss pra objeção.</li>
            <li><strong>Por vendedor:</strong> a vendedora consultiva opera melhor com Sandler; a assertiva opera melhor com Challenger.</li>
            <li><strong>Por momento de mercado:</strong> época de cliente mais resistente, ativa Voss; época de mercado aquecido, ativa SPIN.</li>
          </ul>
          <p>Esse switch é vendável amanhã para qualquer cliente da Dolphin. Outras agências não têm isso.</p>

          <h3>A/B test rotativo · evolução prevista, não promessa de hoje</h3>
          <p>No futuro, o switch evolui pra <strong>rodízio automático por interação</strong>: o sistema usa SPIN num lead, Challenger no próximo, Voss no terceiro, e mede conversão real por metodologia.</p>
          <p>Em vez de esperar uma semana inteira pra comparar, o sistema gera 10-20 micro-testes por dia. Detectação de padrão fica muito mais rápida.</p>
          <p style="font-size:0.875em;color:var(--fg-muted)"><strong>Status:</strong> em construção · <strong>Quando entra:</strong> dentro da Fase 2 (Co-piloto), depois que o agente estiver gerando dados de execução suficientes pra rodar um round-robin com sentido. Requer tabela <code>agente_execucoes</code> populada.</p>
        `,
      },
      {
        id: 'agentes',
        titulo: 'Roadmap · 5 agentes em ordem de implementação',
        html: `
          <p>Os agentes não são produtos isolados. São <strong>um time integrado</strong> trabalhando junto com o comercial humano. Cada um tem missão, entrada, saída, métrica e protocolo de evolução próprios — seguindo o framework Pinguim de criação de agente.</p>

          <h3>Agente 1 — SDR · Pré-qualificação <span style="color:var(--brand);font-weight:600;font-size:0.85em">(prioridade #1)</span></h3>
          <p><strong>Missão:</strong> qualificar todo lead novo antes de chegar pra vendedora. Decide quente / morno / frio + dor + próximo passo + roteamento de produto.</p>
          <p><strong>Por que primeiro:</strong> sem lead bom, nada do resto importa. Vendedora com tempo livre é vendedora produtiva.</p>
          <p><strong>Entrada:</strong> dados do Clint (formulário, quiz, primeira mensagem). <strong>Saída:</strong> briefing de 1 página com perfil + dor + recomendação.</p>
          <p><strong>Pré-requisito Funil:</strong> SDR consulta os <a href="#" onclick="event.preventDefault();window.dispatchEvent(new CustomEvent('docs:select',{detail:{slug:'funis'}}));"><strong>funis habilitados pra ele</strong></a> pra decidir o produto-alvo. Funil "Lançamento Elo Q2" mapeado é o que diz "lead vindo de Desafio LoFi → Elo, com Análise de Perfil como order bump". Sem funil mapeado, SDR adivinha; com funil, ele segue a estratégia desenhada.</p>
          <p><strong>Tipo:</strong> agente LLM (OpenAI gpt-4o-mini, qualificação rápida). <strong>Custo estimado:</strong> ~R$ 0,01 por lead qualificado.</p>

          <h3>Agente 2 — Co-piloto · Apoio em tempo real</h3>
          <p><strong>Missão:</strong> vendedora cola pergunta/objeção do aluno e recebe resposta no tom Pinguim, com case real, pronta pra copiar e colar no Clint/WhatsApp.</p>
          <p><strong>Entrada:</strong> texto da conversa. <strong>Saída:</strong> resposta com prova social embutida (link do print, nome do aluno-case, frase autêntica).</p>
          <p><strong>Tipo:</strong> agente LLM (OpenAI gpt-4o-mini com Vision quando há print pra ler). <strong>Custo:</strong> ~R$ 0,03 por consulta.</p>

          <h3>Agente 3 — Analista de Call · Aprendizado pós-venda</h3>
          <p><strong>Missão:</strong> vendedora sobe áudio/transcrição da call (Whisper transcreve), agente analisa pela metodologia ativa, dá nota por etapa, aponta onde perdeu, sugere o que faltou perguntar.</p>
          <p><strong>Entrada:</strong> áudio ou texto da call. <strong>Saída:</strong> relatório com nota por etapa SPIN/Sandler/etc + sugestão concreta.</p>
          <p><strong>Tipo:</strong> Whisper-1 (transcrição) + gpt-4o (análise profunda — único agente que merece o modelo grande, porque corre 1× por call e gera aprendizado caro). <strong>Custo:</strong> ~R$ 0,80 por call de 10 minutos analisada.</p>

          <h3>Agente 4 — Coach · Inteligência de padrão</h3>
          <p><strong>Missão:</strong> observa SDR + Co-piloto + Analista por 30+ dias e detecta padrões. "Vocês perdem em fechamento sempre que o cliente cita orçamento". "Lead de confeitaria converte 3x mais que de fitness". "Metodologia X bate Metodologia Y pro produto Z."</p>
          <p><strong>Entrada:</strong> histórico acumulado dos outros agentes. <strong>Saída:</strong> relatório semanal automático com 3 insights acionáveis + sugestão de calibragem dos outros agentes.</p>
          <p><strong>Tipo:</strong> cron semanal OpenAI gpt-4o-mini sobre histórico agregado. <strong>Custo:</strong> ~R$ 0,10 por relatório semanal.</p>

          <h3>Agente 5 — Cliente Oculto · Treino sem cliente real</h3>
          <p><strong>Missão:</strong> simular aluno com 4 perfis de dificuldade (receptivo, questionador, resistente, hostil). Vendedora "vende" pra ele, recebe nota, pratica sem queimar lead real.</p>
          <p><strong>Por que último:</strong> faz sentido depois que time já está usando os outros 4. Treino sem ferramenta no dia a dia não vai ser usado.</p>
          <p><strong>Tipo:</strong> agente conversacional OpenAI gpt-4o-mini (~20 turnos por sessão). <strong>Custo:</strong> ~R$ 0,20 por sessão de treino.</p>
          <p style="font-size:0.875em;color:var(--fg-muted)"><strong>Princípio do sistema:</strong> tudo é OpenAI. Não usamos Claude/Anthropic em produção comercial. gpt-4o-mini cobre a maior parte por custo/benefício; gpt-4o entra só onde análise profunda compensa.</p>
        `,
      },
      {
        id: 'orquestracao',
        titulo: 'Orquestração · Como os 5 agentes trabalham juntos',
        html: `
          <p>Os agentes não rodam sozinhos. Eles compartilham o mesmo cérebro de fundação:</p>
          <ul>
            <li>Os 4 Cérebros internos (produtos Pinguim) com persona, prova social, cases</li>
            <li>Os 5 Cérebros de metodologia (SPIN, Sandler, Challenger, Voss, MEDDIC)</li>
          </ul>
          <p>Quando lead chega:</p>
          <ol>
            <li><strong>SDR</strong> qualifica, decide produto-alvo, escreve briefing</li>
            <li>Vendedora pega o lead com briefing pronto, abre call</li>
            <li><strong>Co-piloto</strong> apoia durante a conversa, puxa case sob demanda</li>
            <li>Após call, vendedora sobe áudio</li>
            <li><strong>Analista</strong> dá nota e sugere ajuste</li>
            <li><strong>Coach</strong> observa o padrão de tudo isso semana a semana</li>
            <li><strong>Cliente Oculto</strong> entra quando vendedora quer treinar fechamento difícil</li>
          </ol>
          <p>Cada agente segue o <strong>princípio EPP — Evolução Permanente Pinguim</strong>: registra o que fez, recebe feedback do humano, e usa o feedback nas próximas execuções. Cada agente tem um arquivo <code>APRENDIZADOS.md</code> próprio que vive com ele.</p>
        `,
      },
      {
        id: 'replicabilidade',
        titulo: 'Replicabilidade · Sistema vendável amanhã',
        html: `
          <p>Tudo aqui foi desenhado pra ser <strong>replicável pra qualquer cliente da Dolphin</strong>:</p>
          <ul>
            <li>4 famílias de Cérebro funcionam pra qualquer empresa: Internos = produtos do cliente, Externos = concorrentes dele, Metodologias (universais), Clones (sócios e conselheiros do cliente)</li>
            <li>Os 5 agentes são modulares: vendem-se separadamente ou em pacote</li>
            <li>O switch de metodologia é diferencial competitivo único</li>
            <li>O motor é o mesmo Pinguim OS — só muda paleta, conteúdo dos Cérebros, e quem são os agentes específicos</li>
          </ul>
          <p>Pinguim é o primeiro caso de uso. Pinguim OS é o produto. Quando a gente roda na Pinguim e prova ROI, a Dolphin tem um SaaS de inteligência comercial pronto pra vender pra qualquer agência ou empresa de educação.</p>
        `,
      },
      {
        id: 'fases',
        titulo: 'Plano em fases',
        html: `
          <p>Ordem de implementação respeita dependências e prioridade declarada.</p>

          <h3>Fase 0 — Fundação <span style="color:var(--success,#10b981);font-weight:600;font-size:0.85em">(concluída)</span></h3>
          <ul>
            <li>✅ 4 famílias de Cérebro com coluna <code>categoria</code> no banco</li>
            <li>✅ 5 Cérebros de metodologia criados (SPIN, Sandler, Challenger, Voss, MEDDIC)</li>
            <li>✅ 10 fontes curadas em PT-BR alimentadas e vetorizadas</li>
            <li>✅ Busca semântica funcionando nos Cérebros de metodologia</li>
          </ul>

          <h3>Fase 1 — Agente SDR</h3>
          <p>Integrar com Clint, qualificar leads, mandar briefing pra vendedora. Métrica de sucesso: 70%+ dos leads chegam na vendedora com classificação correta de quente/morno/frio.</p>

          <h3>Fase 2 — Agente Co-piloto</h3>
          <p>Painel web de consulta (segundo monitor da vendedora). Métrica: vendedora usa 5+ vezes por dia em uso natural.</p>

          <h3>Fase 3 — Agente Analista de Call</h3>
          <p>Tela de upload de call. Métrica: time analisa 100% das calls high-ticket nas 24h seguintes.</p>

          <h3>Fase 4 — Agente Coach</h3>
          <p>Cron semanal automático. Métrica: 3 insights acionáveis por semana, 1 deles vira ação real.</p>

          <h3>Fase 5 — Agente Cliente Oculto</h3>
          <p>Tela de simulação com 4 perfis. Métrica: cada vendedora treina 1× por semana.</p>
        `,
      },
      {
        id: 'custo',
        titulo: 'Custo total estimado',
        html: `
          <p>Cálculo de custo mensal de IA <strong>via OpenAI</strong>, projetado pra volume Pinguim atual (estimativa conservadora):</p>
          <ul>
            <li><strong>SDR:</strong> 200 leads/mês × R$ 0,01 = R$ 2</li>
            <li><strong>Co-piloto:</strong> 300 consultas/mês × R$ 0,03 = R$ 9</li>
            <li><strong>Analista:</strong> 60 calls/mês × R$ 0,80 = R$ 48</li>
            <li><strong>Coach:</strong> 4 relatórios/mês × R$ 0,10 = R$ 0,40</li>
            <li><strong>Cliente Oculto:</strong> 30 sessões/mês × R$ 0,20 = R$ 6</li>
            <li><strong>Embeddings + busca semântica:</strong> ~R$ 5</li>
          </ul>
          <p><strong>Total: ~R$ 70/mês</strong> em IA, pra um time comercial inteiro aumentado.</p>
          <p>Pra contexto: um único almoço de equipe custa mais. Um curso de vendas tradicional custa 50-100× isso por vendedor. Esse plano cobre <strong>os dois vendedores</strong> da Pinguim com inteligência IA contínua, ininterrupta, melhorando com o tempo.</p>
          <p style="font-size:0.875em;color:var(--fg-muted)">Os números são <strong>tetos conservadores</strong> baseados em preços OpenAI atuais (gpt-4o-mini: $0.15/M input, $0.60/M output; gpt-4o pra Analista: $2.50/M input). Volume real pode ficar abaixo. À medida que o sistema escalar pra outros clientes da Dolphin, custos por cliente caem (chunks compartilhados, metodologias compartilhadas, embeddings reutilizados).</p>
        `,
      },
      {
        id: 'aprovar',
        titulo: 'O que precisa ser aprovado pra avançar',
        html: `
          <p>Antes de qualquer linha de código de agente, decisão de Luiz e Micha sobre:</p>
          <ol>
            <li><strong>Validação da arquitetura 4 famílias.</strong> Faz sentido organizar o Pinguim OS assim?</li>
            <li><strong>Aprovação da fundação Metodologias.</strong> SPIN, Sandler, Challenger, Voss, MEDDIC cobrem o que vocês querem? Falta alguma?</li>
            <li><strong>Confirmação de prioridade dos agentes.</strong> SDR primeiro, como proposto, ou outra ordem?</li>
            <li><strong>OK no investimento mensal estimado de IA.</strong> ~R$ 280/mês cabe?</li>
            <li><strong>Acesso ao Clint pra integração</strong> — quem dentro da Pinguim libera credenciais ou faz integração comigo?</li>
            <li><strong>Calendário de marcos</strong> — quanto tempo cada fase tem? (sugestão: 1 agente por sprint de 2 semanas, com testes reais antes do próximo)</li>
          </ol>
          <p>Aprovado, tocamos. Não aprovado, ajustamos sem perder o trabalho de fundação que já foi feito (Cérebros prontos, busca semântica funcionando — nada vira lixo).</p>
        `,
      },
    ],
    pitch: `
      <p>Esse plano não é "trocar o comercial por robôs". É <strong>dar superpoder pras 2 vendedoras que já estão lá</strong>. Cada uma vira o equivalente a 4-5 vendedoras tradicionais — porque tem SDR triando, Co-piloto apoiando, Analista corrigindo, Coach calibrando, Cliente Oculto treinando.</p>
      <p>Em 6 meses de operação, a Pinguim deixa de ser "uma agência que faz marketing e tem 2 vendedoras" pra ser "uma agência com plataforma de inteligência comercial proprietária". Aluno fechado com mais confiança, churn menor, pipeline transparente.</p>
      <p>E o sistema fica pronto pra ser produto Dolphin. Cada outro cliente que aprova, é uma assinatura recorrente. Pinguim OS Comercial vira receita previsível pra Dolphin sem multiplicar equipe.</p>
    `,
  };
}
