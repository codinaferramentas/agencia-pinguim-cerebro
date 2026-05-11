/* Doc: Estado Atual do Pinguim OS — overview vivo do que o agente já faz */

export async function gerar() {
  return {
    titulo: '⭐ Estado Atual do Pinguim OS',
    lede: 'Foto viva do que o agente Pinguim já é capaz de fazer hoje, em quais canais ele já roda, quem usa, e o que está em fila. Atualizado em 2026-05-11. Mostra pra sócios novos pra alinhar onde estamos.',
    secoes: [
      {
        id: 'resumo',
        titulo: '🐧 Em uma frase',
        html: `
          <p>O Pinguim OS hoje é um <strong>agente único multi-canal</strong> que conhece os produtos da agência (Elo, ProAlt, Lyra, Lo-Fi, etc), atende os 4 sócios pelo nome correto, executa tarefas reais na Hotmart/Meta/Google/Discord, e aprende com feedback de cada sócio individualmente.</p>
          <p style="margin-top:.75rem;color:var(--docs-muted)">Validado em produção: WhatsApp do André recebe pedidos como "consulta esse aluno" ou "marca o Rafa no Discord" e o agente executa direto.</p>
        `,
      },

      {
        id: 'anatomia',
        titulo: '🧠 Fundação — anatomia canônica',
        html: `
          <p>Todo agente Pinguim consulta <strong>5 fontes vivas</strong> em runtime antes de responder algo que envolva conhecimento da agência:</p>
          <table style="width:100%;border-collapse:collapse;margin:1rem 0">
            <thead>
              <tr style="border-bottom:1px solid var(--docs-line);text-align:left">
                <th style="padding:.5rem;font-size:.875rem">Fonte</th>
                <th style="padding:.5rem;font-size:.875rem">O que entrega</th>
                <th style="padding:.5rem;font-size:.875rem">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--docs-line)">
                <td style="padding:.5rem;font-size:.8125rem"><strong>🧠 Cérebros</strong></td>
                <td style="padding:.5rem;font-size:.8125rem">Aulas, depoimentos, oferta, método de cada produto</td>
                <td style="padding:.5rem;font-size:.8125rem">✅ Populado: Elo, ProAlt, Lyra, Lo-fi, Taurus, Orion +</td>
              </tr>
              <tr style="border-bottom:1px solid var(--docs-line)">
                <td style="padding:.5rem;font-size:.8125rem"><strong>👤 Personas</strong></td>
                <td style="padding:.5rem;font-size:.8125rem">Dossiê 11 blocos sobre quem compra</td>
                <td style="padding:.5rem;font-size:.8125rem">✅ Existe pra produtos principais</td>
              </tr>
              <tr style="border-bottom:1px solid var(--docs-line)">
                <td style="padding:.5rem;font-size:.8125rem"><strong>🛠 Skills</strong></td>
                <td style="padding:.5rem;font-size:.8125rem">Receitas de como executar cada tipo de entregável</td>
                <td style="padding:.5rem;font-size:.8125rem">✅ 46 Skills no banco</td>
              </tr>
              <tr style="border-bottom:1px solid var(--docs-line)">
                <td style="padding:.5rem;font-size:.8125rem"><strong>👥 Clones</strong></td>
                <td style="padding:.5rem;font-size:.8125rem">Voz de mestres (Hormozi, Halbert, Brunson, Sobral...)</td>
                <td style="padding:.5rem;font-size:.8125rem">✅ Populado pra squad de copy</td>
              </tr>
              <tr>
                <td style="padding:.5rem;font-size:.8125rem"><strong>🎯 Funis</strong></td>
                <td style="padding:.5rem;font-size:.8125rem">Etapas dos funis ativos de cada produto</td>
                <td style="padding:.5rem;font-size:.8125rem">✅ Existe pra produtos com funil mapeado</td>
              </tr>
            </tbody>
          </table>
        `,
      },

      {
        id: 'tools',
        titulo: '🤖 Habilidades operacionais — o que ele JÁ SABE FAZER',
        html: `
          <p>Além de conhecer os produtos, o agente <strong>executa tarefas reais</strong> nos sistemas que a agência usa. Cada bloco abaixo é uma integração ativa, validada em produção:</p>

          <h3 style="margin-top:1.5rem;font-size:.95rem">💰 Hotmart (100% ativo)</h3>
          <ul style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.6">
            <li>Consultar comprador por email — histórico completo</li>
            <li>Verificar acesso real ao Club (último login, engajamento, progresso por aula)</li>
            <li>Listar vendas / reembolsos por período</li>
            <li>Verificar assinatura ativa</li>
            <li>Aprovar reembolso (sócio confirma antes)</li>
            <li>Cancelar assinatura (sócio confirma antes)</li>
            <li>Criar cupom de desconto (sócio only)</li>
            <li>Abrir ticket pra cadastro manual via Princípia Pay</li>
            <li style="color:var(--docs-muted)">❌ Criar oferta nova: API Hotmart não permite (só painel manual)</li>
          </ul>

          <h3 style="margin-top:1.25rem;font-size:.95rem">📊 Meta Marketing API (100% ativo)</h3>
          <ul style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.6">
            <li>Listar todas ad accounts (20 contas em 9 businesses)</li>
            <li>Listar campanhas de uma conta</li>
            <li>Insights de campanha (CTR, CPM, gasto, ROAS)</li>
            <li>Listar Pages do Facebook (com info de IG conectado)</li>
            <li>Inspecionar/renovar token (válido até 09/07/2026)</li>
            <li style="color:var(--docs-muted)">⏳ Instagram orgânico — pendente sócios autorizarem popup Meta</li>
            <li style="color:var(--docs-muted)">⏳ Criar/pausar/editar campanha — frente futura</li>
          </ul>

          <h3 style="margin-top:1.25rem;font-size:.95rem">📧 Google Workspace (ativo p/ André)</h3>
          <ul style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.6">
            <li><strong>Drive:</strong> buscar arquivos, ler Doc/Sheet/PDF, editar planilhas</li>
            <li><strong>Gmail:</strong> listar, ler, responder, arquivar, marcar spam</li>
            <li><strong>Calendar:</strong> ler agenda (criar/editar pendente)</li>
            <li style="color:var(--docs-muted)">⏳ Demais sócios precisam fazer OAuth em <code>/conectar-google</code></li>
          </ul>

          <h3 style="margin-top:1.25rem;font-size:.95rem">💬 Discord (100% ativo)</h3>
          <ul style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.6">
            <li>Ler mensagens em tempo real (48 canais do servidor)</li>
            <li>Buscar mensagens por palavra-chave</li>
            <li>Responder @menção (diferencia sócio vs funcionário)</li>
            <li>Postar mensagem em canal (cross-canal — WhatsApp manda postar no Discord)</li>
            <li>Apagar/editar mensagens próprias via comando WhatsApp</li>
            <li>Apagar via reação ❌ direto no Discord (só sócios)</li>
          </ul>

          <h3 style="margin-top:1.25rem;font-size:.95rem">📱 WhatsApp Evolution (100% ativo)</h3>
          <ul style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.6">
            <li>Receber mensagens (texto + áudio com transcrição via Whisper)</li>
            <li>Responder em texto + áudio (TTS) + anexo HTML</li>
            <li>Whitelist de números (5 cadastrados)</li>
            <li>Enviar mensagem pra número externo (sócio confirma antes)</li>
          </ul>

          <h3 style="margin-top:1.25rem;font-size:.95rem">📋 Relatórios (esqueleto pronto)</h3>
          <ul style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.6">
            <li>Gerar Relatório Executivo Diário sob demanda</li>
            <li>Criar relatório customizado via chat ("manda X todo dia 7h")</li>
            <li>5 módulos disponíveis: financeiro 24h, agenda, triagem de emails, Discord, diagnóstico de inbox</li>
            <li style="color:var(--docs-muted)">⏳ Cron diário do Codina configurado mas precisa validação em produção</li>
          </ul>

          <h3 style="margin-top:1.25rem;font-size:.95rem">🎓 Memória do agente (V2.14.5)</h3>
          <ul style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.6">
            <li>Identidade automática por número WhatsApp / Discord ID</li>
            <li>Memória <strong>geral</strong> do agente (vale pra todos sócios)</li>
            <li>Memória <strong>pessoal</strong> de cada sócio (preferências individuais)</li>
            <li>Classificação automática de feedback: pessoal vs geral vs sobre produto</li>
            <li>Sempre confirma o aprendizado de volta antes de gravar</li>
          </ul>
        `,
      },

      {
        id: 'canais',
        titulo: '🎭 Multi-canais — onde o agente já roda',
        html: `
          <table style="width:100%;border-collapse:collapse;margin:1rem 0">
            <thead>
              <tr style="border-bottom:1px solid var(--docs-line);text-align:left">
                <th style="padding:.5rem;font-size:.875rem">Canal</th>
                <th style="padding:.5rem;font-size:.875rem">Status</th>
                <th style="padding:.5rem;font-size:.875rem">Quem usa</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--docs-line)">
                <td style="padding:.5rem;font-size:.8125rem"><strong>WhatsApp</strong> (Evolution "Agente Pinguim")</td>
                <td style="padding:.5rem;font-size:.8125rem">✅ Ativo</td>
                <td style="padding:.5rem;font-size:.8125rem">4 sócios + 1 número de teste</td>
              </tr>
              <tr style="border-bottom:1px solid var(--docs-line)">
                <td style="padding:.5rem;font-size:.8125rem"><strong>Discord</strong> (servidor Agência Pinguim)</td>
                <td style="padding:.5rem;font-size:.8125rem">✅ Ativo</td>
                <td style="padding:.5rem;font-size:.8125rem">Sócios + Rafa + Djairo + fallback auto pra membros do server</td>
              </tr>
              <tr style="border-bottom:1px solid var(--docs-line)">
                <td style="padding:.5rem;font-size:.8125rem"><strong>Chat web</strong> (porta 3737)</td>
                <td style="padding:.5rem;font-size:.8125rem">🟡 Ativo só pro André</td>
                <td style="padding:.5rem;font-size:.8125rem">V3 vai ter login Google OAuth pra todos</td>
              </tr>
              <tr>
                <td style="padding:.5rem;font-size:.8125rem"><strong>Telegram</strong></td>
                <td style="padding:.5rem;font-size:.8125rem">❌ Não implementado</td>
                <td style="padding:.5rem;font-size:.8125rem">Frente futura (~30 min, mesma arquitetura)</td>
              </tr>
            </tbody>
          </table>
        `,
      },

      {
        id: 'papeis',
        titulo: '👥 Multi-sócio + escopo por papel',
        html: `
          <p><strong>Sócios</strong> (escopo total — todas as tools):</p>
          <ul style="margin:.25rem 0 1rem 1.25rem;font-size:.875rem">
            <li>André Codina (sócio Dolphin, parceiro Pinguim)</li>
            <li>Luiz Cota (sócio fundador estratégico)</li>
            <li>Pedro Aredes (sócio, tráfego/escala)</li>
            <li>Micha Menezes (sócia, lo-fi/audiência)</li>
          </ul>

          <p><strong>Funcionários</strong> (escopo operacional reduzido):</p>
          <ul style="margin:.25rem 0 1rem 1.25rem;font-size:.875rem">
            <li>Rafael Sousa</li>
            <li>Djairo Alves</li>
            <li>+ qualquer membro do server Pinguim (auto-cadastra como funcionário ao marcar o bot pela primeira vez)</li>
          </ul>

          <p style="margin-top:1rem"><strong>Funcionário pode:</strong> consultar Hotmart, operar Hotmart com confirmação, buscar/ler/editar Drive, ler/postar Discord, cross-canal pro time interno.</p>
          <p style="color:var(--docs-muted)"><strong>Funcionário NÃO pode:</strong> acessar Gmail/Calendar/Meta dos sócios, gerar relatórios estratégicos, mudar configuração do agente, criar cupom Hotmart, enviar WhatsApp em nome da empresa, apagar mensagem do bot no Discord.</p>
        `,
      },

      {
        id: 'autonomia',
        titulo: '⭐ Princípio operacional — autonomia >90%',
        html: `
          <p>Decisão canonizada pelo André em 2026-05-11. O agente <strong>NÃO fica pingando "tem certeza?" pra toda ação</strong>. Decisão em árvore:</p>
          <ol style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.7">
            <li>Entendeu &gt;90% do pedido? Não → pergunta curto, 1 frase.</li>
            <li>Ação tem risco real (dinheiro saindo, exclusão definitiva, mensagem pública em nome da marca)? Sim → confirma com preview e espera "sim" antes de executar.</li>
            <li>Resto (90%+ certeza + risco baixo) → <strong>executa direto</strong>. Confirma depois naturalmente ("mandei", "já tá editado").</li>
          </ol>
          <p><strong>Confirma sempre:</strong> aprovar reembolso, cancelar assinatura, criar cupom, deletar arquivo, mensagem em canal público em nome da marca.</p>
          <p style="color:var(--docs-muted)"><strong>Vai direto:</strong> consultar dado, postar mensagem operacional interna no Discord, editar célula de planilha que sócio especificou, gravar preferência pessoal.</p>
        `,
      },

      {
        id: 'infra',
        titulo: '🏗 Infraestrutura',
        html: `
          <ul style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.7">
            <li><strong>Banco:</strong> Supabase (schema <code>pinguim</code>, ~30 tabelas)</li>
            <li><strong>Cofre de credenciais:</strong> <code>pinguim.cofre_chaves</code> (Hotmart, Meta, Discord, Google — fonte canônica única)</li>
            <li><strong>LLM:</strong> Claude CLI local (assinatura Max, login OAuth — token externo zero)</li>
            <li><strong>Backend:</strong> Express porta 3737 (<code>server-cli/index.js</code>)</li>
            <li><strong>Ingest:</strong> <code>ingest-engine/</code> (processamento de arquivos, áudio, vídeo via Whisper)</li>
            <li><strong>Painel admin:</strong> <code>mission-control/</code> Vercel</li>
            <li><strong>Onde roda hoje:</strong> máquina do André + ngrok</li>
            <li><strong>Onde vai rodar:</strong> servidor do Pedro (V3) — bot 24/7 disponível pra todos</li>
          </ul>
        `,
      },

      {
        id: 'cron',
        titulo: '⏰ Cron / automações',
        html: `
          <p>Quantos crons agendados ativos: <strong>1</strong> (Relatório Executivo Diário do Codina, configurado todo dia 8h BRT).</p>
          <p>Disparo em produção real: <strong>pendente validação</strong> — o agendamento existe no banco mas não houve confirmação visual de disparo nos últimos testes. Item em fila pra investigar.</p>
          <p style="margin-top:.5rem;color:var(--docs-muted)">A capacidade de <strong>criar novos crons via chat</strong> ("manda relatório X todo dia às 7h") já está pronta — quando os sócios começarem a usar, vão poder cadastrar automações próprias sem depender do Codina.</p>
        `,
      },

      {
        id: 'proximos',
        titulo: '🎯 Próximos passos — onde queremos chegar',
        html: `
          <ol style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.8">
            <li><strong>V3 — Servidor Pedro:</strong> sair da máquina do Codina, subir no servidor 24/7 (libera os sócios usarem mesmo com Codina offline).</li>
            <li><strong>Login OAuth no chat web:</strong> cada sócio entra no painel via Google, identifica auto, sem depender de SOCIO_SLUG fixo.</li>
            <li><strong>Instagram orgânico:</strong> 5 min com cada sócio pra autorizar popup Meta — habilita análise de posts, comentários, insights de IG.</li>
            <li><strong>Telegram:</strong> bot Telegram com mesma arquitetura WhatsApp/Discord (~30 min).</li>
            <li><strong>Squad de relatórios (Data) expandir:</strong> mais módulos — Meta financeiro, KPI semanal, comparativos.</li>
            <li><strong>Squad criativa (Copy) via Atendente:</strong> validar fluxo de delegação — Atendente entrega briefing → Copy Chief → mestres → output final.</li>
            <li><strong>Frente operacional V2.15 (hybrid-ops-squad):</strong> Atendente CRIAR/PAUSAR campanha Meta, criar/editar evento Calendar, enviar mensagem em nome da empresa.</li>
          </ol>
        `,
      },

      {
        id: 'pendencias-socios',
        titulo: '📌 O que preciso de cada sócio pra avançar',
        html: `
          <p>Lista direta do que cada sócio precisa fazer pra desbloquear capacidades novas do agente. Pra usar como pauta em reuniões 1:1.</p>

          <h3 style="margin-top:1.25rem;font-size:.95rem">🧠 Luiz</h3>
          <ul style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.7">
            <li><strong>OAuth Google Workspace</strong> (Drive + Gmail + Calendar) — habilita agente ler email/agenda/Drive do Luiz. Melhor fazer só na V3 (quando subir no servidor do Pedro). Hoje funciona local, mas precisa Codina ligado.</li>
            <li><strong>Instagram comercial no BM Grupo Pinguim</strong> — IG dele precisa estar na BM da Pinguim conectado a uma Page. Como hoje tem o do Pedro. Depois disso, 5 min de autorização via popup Meta libera análise de posts/comentários/insights.</li>
            <li><strong>Instância Evolution WhatsApp dele</strong> — Codina cria instância separada conectada ao número do Luiz. Habilita: agente ler WhatsApp do Luiz no fim do dia + relatório "X pessoas perguntaram e você não respondeu" no final da tarde.</li>
            <li><strong>Marcar @Pinguim IA no Discord 1x</strong> — auto-captura o discord_user_id dele pra promover de funcionário pra sócio (hoje já cadastrado como sócio via banco, mas confirma).</li>
          </ul>

          <h3 style="margin-top:1.25rem;font-size:.95rem">⚡ Pedro Aredes</h3>
          <ul style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.7">
            <li><strong>OAuth Google Workspace</strong> — só na V3</li>
            <li><strong>Instagram orgânico</strong> — popup Meta de 5 min (IG dele já está na BM Grupo Pinguim)</li>
            <li><strong>Instância Evolution dele</strong> — quando fizer sentido</li>
            <li><strong>Marcar @Pinguim IA no Discord 1x</strong> pra captura de ID</li>
          </ul>

          <h3 style="margin-top:1.25rem;font-size:.95rem">🎨 Micha</h3>
          <ul style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.7">
            <li><strong>OAuth Google Workspace</strong> — só na V3</li>
            <li><strong>Instagram orgânico</strong> — popup Meta de 5 min (IG dela "Micha Menezes - Espanol" já está na BM com IG ID <code>17841463887023598</code>)</li>
            <li><strong>Instância Evolution dela</strong> — quando fizer sentido</li>
          </ul>

          <h3 style="margin-top:1.25rem;font-size:.95rem">🚀 Coletivo (todos juntos)</h3>
          <ul style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.7">
            <li><strong>Reunião 30 min de alinhamento V3:</strong> decidir cronograma de subir servidor próprio do Pedro pra todo mundo ter acesso 24/7</li>
            <li><strong>Definir squads prioritárias</strong> pra popular próximas (advisory-board já populada; storytelling, design, traffic-masters em fila)</li>
            <li><strong>Decidir cronos compartilhados</strong> (ex: relatório diário do time, executivo semanal coletivo, etc)</li>
          </ul>
        `,
      },

      {
        id: 'limites',
        titulo: '⚠️ Limitações conhecidas (transparência)',
        html: `
          <ul style="margin:.5rem 0 .5rem 1.25rem;font-size:.875rem;line-height:1.7">
            <li><strong>Refém da máquina do André até V3:</strong> se desliga o PC, bot fica offline pra todos.</li>
            <li><strong>Chat web só pro André hoje:</strong> demais sócios usam WhatsApp ou Discord.</li>
            <li><strong>Instagram orgânico depende de autorização individual:</strong> 4 sócios = 4 sessões de 5 min.</li>
            <li><strong>Relatório financeiro F3</strong> depende de credenciais do 2º Supabase (banco que tem dados Meta + Hotmart agregados).</li>
            <li><strong>Cron agendado em produção:</strong> ainda precisa validação visual de disparo real.</li>
            <li><strong>Hotmart bloqueia algumas escritas:</strong> criar oferta nova, cadastrar aluno na área de membros — API não expõe. Caminho continua manual no painel.</li>
          </ul>
        `,
      },

      {
        id: 'por-que-importa',
        titulo: 'Por que isso importa',
        html: `
          <p>Esse documento existe pra responder uma pergunta simples na primeira reunião com qualquer sócio novo: <em>"o agente já faz o quê?"</em>.</p>
          <p>A resposta longa está acima. A curta é: <strong>o agente Pinguim hoje é um colega de trabalho disponível por WhatsApp e Discord que conhece os produtos da agência, sabe consultar/operar Hotmart e Meta, sabe ler Drive/Gmail/Calendar, sabe diferenciar sócio de funcionário, aprende com feedback individual de cada sócio, e tem rede de segurança pra desfazer qualquer mensagem dele com 1 reação.</strong></p>
          <p>O que falta é menos do que parece. A fundação está feita. Daqui pra frente é multiplicar (mais tools, mais canais, mais sócios) sobre a base sólida.</p>
        `,
      },
    ],
  };
}
