/* Doc: Fluxo do Pinguim — como o pedido vira entregavel.
   Diagrama visual da REGRA ZERO (roteamento por categoria) + Plan-and-Execute.
   Tom: PRD de negocio. Visual editorial dark. Sem dependencia externa. */

export async function gerar() {
  return {
    titulo: 'Fluxo do Pinguim',
    lede: 'O caminho que toda mensagem percorre — da entrada no chat até a resposta ou entregável final. Mostra como o agente decide o que é resposta direta, o que é pedido criativo que vai pra squad, e o que é pedido complexo que entra na fila Plan-and-Execute. Material de onboarding e debug.',
    secoes: [
      {
        id: 'em-uma-frase',
        titulo: 'Em uma frase',
        html: `
          <p>O Atendente Pinguim é um <strong>roteador</strong>, não um criador. Toda mensagem cai em uma de seis categorias, e cada categoria tem um caminho de execução próprio. Pedido complexo (relatório, agregação, multi-fonte) é separado do resto e entra num ciclo <strong>Plan-Validate-Execute</strong> — porque agente que tenta fazer tudo em tempo real falha em pedido pesado.</p>
        `,
      },
      {
        id: 'regra-zero',
        titulo: 'REGRA ZERO — roteamento por categoria',
        html: `
          <p>A primeira coisa que o agente faz com qualquer mensagem é classificar em <strong>uma das seis categorias</strong>. Isso decide tudo: se responde direto, se delega pra squad, ou se entra na fila P-V-E.</p>

          <div style="margin:1.5rem 0;display:grid;grid-template-columns:1fr;gap:.5rem">

            <div style="display:grid;grid-template-columns:120px 1fr;gap:1rem;padding:1rem;border:1px solid var(--docs-line);border-radius:4px;background:var(--docs-paper)">
              <div style="font-family:var(--docs-mono);font-size:1.5rem;font-weight:600;color:var(--docs-fg)">A</div>
              <div>
                <div style="font-weight:600;margin-bottom:.25rem">Saudação / social</div>
                <div style="font-size:.8125rem;color:var(--docs-fg-2);margin-bottom:.5rem">"oi", "tudo bem", "valeu"</div>
                <div style="font-size:.8125rem;color:var(--docs-fg-3)">→ Responde curto, zero ferramenta. Fim.</div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:120px 1fr;gap:1rem;padding:1rem;border:1px solid var(--docs-line);border-radius:4px;background:var(--docs-paper)">
              <div style="font-family:var(--docs-mono);font-size:1.5rem;font-weight:600;color:var(--docs-fg)">B</div>
              <div>
                <div style="font-weight:600;margin-bottom:.25rem">Pergunta factual sobre produto/sistema</div>
                <div style="font-size:.8125rem;color:var(--docs-fg-2);margin-bottom:.5rem">"o que é o Elo?", "como funciona X?"</div>
                <div style="font-size:.8125rem;color:var(--docs-fg-3)">→ Consulta Cérebro + Persona, junta numa resposta de 2-3 parágrafos. Se voltou só depoimento, refaz query com método antes de responder.</div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:120px 1fr;gap:1rem;padding:1rem;border:1px solid var(--docs-line);border-radius:4px;background:var(--docs-paper)">
              <div style="font-family:var(--docs-mono);font-size:1.5rem;font-weight:600;color:var(--docs-fg)">C</div>
              <div>
                <div style="font-weight:600;margin-bottom:.25rem">Pedido criativo (entregável)</div>
                <div style="font-size:.8125rem;color:var(--docs-fg-2);margin-bottom:.5rem">"monta uma copy de e-mail", "escreve a página de vendas", "cria um hook"</div>
                <div style="font-size:.8125rem;color:var(--docs-fg-3)">→ Consulta 5 fontes vivas, monta briefing, <strong>delega pro Chief da squad certa</strong>. Devolve o output integral ao sócio.</div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:120px 1fr;gap:1rem;padding:1rem;border:1px solid var(--docs-line);border-radius:4px;background:var(--docs-paper)">
              <div style="font-family:var(--docs-mono);font-size:1.5rem;font-weight:600;color:var(--docs-fg)">D</div>
              <div>
                <div style="font-weight:600;margin-bottom:.25rem">Comando administrativo</div>
                <div style="font-size:.8125rem;color:var(--docs-fg-2);margin-bottom:.5rem">"lista agentes", "verifica X", "atualiza Y"</div>
                <div style="font-size:.8125rem;color:var(--docs-fg-3)">→ Executa script de leitura ou edição, mostra resultado.</div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:120px 1fr;gap:1rem;padding:1rem;border:1px solid var(--docs-line);border-radius:4px;background:var(--docs-paper)">
              <div style="font-family:var(--docs-mono);font-size:1.5rem;font-weight:600;color:var(--docs-fg)">E</div>
              <div>
                <div style="font-weight:600;margin-bottom:.25rem">Operações externas</div>
                <div style="font-size:.8125rem;color:var(--docs-fg-2);margin-bottom:.5rem">Drive, Gmail, Calendar, Discord, WhatsApp</div>
                <div style="font-size:.8125rem;color:var(--docs-fg-3)">→ 9 sub-áreas (buscar Drive, ler planilha, editar célula, enviar e-mail, agendar evento, postar Discord, etc). Cada uma com regra própria de confirmação por risco.</div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:120px 1fr;gap:1rem;padding:1rem;border:1px solid var(--docs-line);border-radius:4px;background:var(--docs-paper)">
              <div style="font-family:var(--docs-mono);font-size:1.5rem;font-weight:600;color:var(--docs-fg)">F</div>
              <div>
                <div style="font-weight:600;margin-bottom:.25rem">Pedido complexo / multi-fonte</div>
                <div style="font-size:.8125rem;color:var(--docs-fg-2);margin-bottom:.5rem">"top engajados nos 3 produtos", "relatório executivo do mês", "cruza vendas com triagem de e-mail"</div>
                <div style="font-size:.8125rem;color:var(--docs-fg-3)">→ <strong>Entra no ciclo Plan-Validate-Execute</strong> (P-V-E). Não tenta resolver em tempo real. Veja seção abaixo.</div>
              </div>
            </div>

          </div>

          <p><strong>Por que separar em categorias?</strong> Um agente que tenta resolver tudo do mesmo jeito vira lento e errático. Saudação não precisa consultar Cérebro. Pergunta factual precisa de Cérebro mas não de squad. Entregável criativo precisa da squad inteira. Relatório complexo precisa de planejamento antes da execução. Cada caminho é otimizado pro tipo de pedido.</p>
        `,
      },
      {
        id: 'diagrama',
        titulo: 'O caminho completo, visualizado',
        html: `
          <p>O fluxograma abaixo mostra o que acontece desde a mensagem chegar até o entregável ser entregue. Quadros pretos sólidos são <strong>decisões</strong> (o agente classifica). Quadros pontilhados são <strong>processos</strong> (algo é executado). A coluna da direita mostra o ciclo P-V-E em detalhe — usado só pela categoria F.</p>

          <div style="margin:2rem 0;padding:1.5rem;border:1px solid var(--docs-line);border-radius:4px;background:var(--docs-paper);overflow-x:auto">

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;min-width:640px">

              <!-- COLUNA ESQUERDA: fluxo principal -->
              <div>
                <div style="font-family:var(--docs-mono);font-size:.75rem;color:var(--docs-fg-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:1rem">Fluxo principal</div>

                <div style="padding:.75rem 1rem;border:2px solid var(--docs-fg);border-radius:4px;background:var(--docs-paper);text-align:center;font-weight:600">Mensagem do sócio</div>
                <div style="text-align:center;color:var(--docs-fg-3);padding:.25rem 0">↓</div>

                <div style="padding:.75rem 1rem;border:2px solid var(--docs-fg);border-radius:4px;background:var(--docs-paper);text-align:center">
                  <div style="font-weight:600;margin-bottom:.25rem">REGRA ZERO</div>
                  <div style="font-size:.75rem;color:var(--docs-fg-3)">classifica em A/B/C/D/E/F</div>
                </div>
                <div style="text-align:center;color:var(--docs-fg-3);padding:.25rem 0">↓</div>

                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem">
                  <div style="padding:.5rem;border:1px dashed var(--docs-line-2);border-radius:4px;text-align:center;font-size:.75rem"><strong>A</strong><br>resposta curta</div>
                  <div style="padding:.5rem;border:1px dashed var(--docs-line-2);border-radius:4px;text-align:center;font-size:.75rem"><strong>B</strong><br>Cérebro + Persona</div>
                  <div style="padding:.5rem;border:1px dashed var(--docs-line-2);border-radius:4px;text-align:center;font-size:.75rem"><strong>C</strong><br>delega squad</div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-top:.5rem">
                  <div style="padding:.5rem;border:1px dashed var(--docs-line-2);border-radius:4px;text-align:center;font-size:.75rem"><strong>D</strong><br>script admin</div>
                  <div style="padding:.5rem;border:1px dashed var(--docs-line-2);border-radius:4px;text-align:center;font-size:.75rem"><strong>E</strong><br>op externa</div>
                  <div style="padding:.5rem;border:2px solid var(--docs-fg);border-radius:4px;text-align:center;font-size:.75rem;font-weight:600"><strong>F</strong><br>→ P-V-E</div>
                </div>

                <div style="text-align:center;color:var(--docs-fg-3);padding:1rem 0">↓</div>
                <div style="padding:.75rem 1rem;border:2px solid var(--docs-fg);border-radius:4px;background:var(--docs-paper);text-align:center;font-weight:600">Resposta no chat</div>
                <div style="font-size:.75rem;color:var(--docs-fg-3);text-align:center;margin-top:.5rem">A/B/C/D/E voltam aqui imediato. F só volta depois do ciclo P-V-E (à direita).</div>
              </div>

              <!-- COLUNA DIREITA: ciclo P-V-E -->
              <div>
                <div style="font-family:var(--docs-mono);font-size:.75rem;color:var(--docs-fg-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:1rem">Ciclo P-V-E (categoria F)</div>

                <div style="padding:.75rem 1rem;border:2px solid var(--docs-fg);border-radius:4px;background:var(--docs-paper);text-align:center">
                  <div style="font-weight:600">1. Planner</div>
                  <div style="font-size:.75rem;color:var(--docs-fg-3);margin-top:.25rem">LLM analisa pedido, gera plano JSON: fontes, critérios, etapas, perguntas pendentes</div>
                </div>
                <div style="text-align:center;color:var(--docs-fg-3);padding:.25rem 0">↓</div>

                <div style="padding:.75rem 1rem;border:1px dashed var(--docs-line-2);border-radius:4px;text-align:center">
                  <div style="font-weight:600;margin-bottom:.25rem;font-size:.875rem">Tem pergunta pendente?</div>
                  <div style="font-size:.75rem;color:var(--docs-fg-3)">Sim → Pinguim pergunta ao sócio. Sócio responde. Re-planeja.</div>
                  <div style="font-size:.75rem;color:var(--docs-fg-3)">Não → segue.</div>
                </div>
                <div style="text-align:center;color:var(--docs-fg-3);padding:.25rem 0">↓</div>

                <div style="padding:.75rem 1rem;border:2px solid var(--docs-fg);border-radius:4px;background:var(--docs-paper);text-align:center">
                  <div style="font-weight:600">2. Validate</div>
                  <div style="font-size:.75rem;color:var(--docs-fg-3);margin-top:.25rem">Sócio aprova briefing. "sim" ou "não".</div>
                </div>
                <div style="text-align:center;color:var(--docs-fg-3);padding:.25rem 0">↓</div>

                <div style="padding:.75rem 1rem;border:2px solid var(--docs-fg);border-radius:4px;background:var(--docs-paper);text-align:center">
                  <div style="font-weight:600">3. Execute</div>
                  <div style="font-size:.75rem;color:var(--docs-fg-3);margin-top:.25rem">Worker em background pega da fila <code>pinguim.jobs</code>, roda Claude CLI com escopo restrito (só leitura), salva <code>/entregavel/&lt;id&gt;</code></div>
                </div>
                <div style="text-align:center;color:var(--docs-fg-3);padding:.25rem 0">↓</div>

                <div style="padding:.75rem 1rem;border:2px solid var(--docs-fg);border-radius:4px;background:var(--docs-paper);text-align:center">
                  <div style="font-weight:600">4. Notify</div>
                  <div style="font-size:.75rem;color:var(--docs-fg-3);margin-top:.25rem">Worker avisa Pinguim. Pinguim manda link no canal de origem (chat, WhatsApp, Discord).</div>
                </div>

              </div>

            </div>
          </div>

          <p><strong>Tempo médio por categoria:</strong> A é instantâneo. B/D/E ficam em 2-5 segundos. C (pedido criativo) leva 30-90 segundos (squad inteira roda em paralelo). F (P-V-E) pode levar 2-10 minutos — por isso é assíncrono e o sócio recebe o link quando termina, não fica esperando no chat.</p>
        `,
      },
      {
        id: 'por-que-pve',
        titulo: 'Por que Plan-Validate-Execute existe',
        html: `
          <p>Antes do P-V-E, qualquer pedido caía no loop "raciocina → chama ferramenta → repete até terminar". Funciona pra 1-3 ferramentas. Quebra em pedido multi-fonte (5-10 ferramentas sequenciais, cada uma com 60-80 segundos). Resultado: agente trava em 5+ minutos e o sócio acha que crashou.</p>

          <p>P-V-E resolve isso separando <strong>pensar</strong> de <strong>fazer</strong>:</p>

          <ul>
            <li><strong>Planner</strong> roda rápido (10-40 segundos) e gera um plano em texto que o sócio consegue ler e aprovar.</li>
            <li><strong>Validate</strong> é o sócio falando "sim, é isso" antes de gastar tempo executando. Se o plano estiver errado, conserta antes — não depois de 5 minutos perdidos.</li>
            <li><strong>Execute</strong> roda em background. O chat fica livre. O sócio recebe notificação quando terminar.</li>
          </ul>

          <p><strong>Não é overhead — é honestidade.</strong> O sócio sabe o que vai sair antes de sair. O agente não promete o que não consegue cumprir. E se algo falhar no meio da execução, o entregável traz a falha documentada, não fingida.</p>
        `,
      },
      {
        id: 'como-usar',
        titulo: 'Como o time usa esse fluxo',
        html: `
          <p>Três cenários práticos:</p>

          <h3 style="margin-top:1.5rem">Onboarding de sócio novo</h3>
          <p>Mostra este doc na primeira conversa. Sócio entende em 3 minutos por que o agente às vezes responde na hora e às vezes diz "vou puxar e te aviso". Reduz fricção de "por que isso demora tanto?" porque o sócio agora vê o motivo: pedido complexo entra na fila justamente pra não falhar.</p>

          <h3 style="margin-top:1.5rem">Debug quando algo dá errado</h3>
          <p>"O agente fez X e era pra fazer Y." Volta pro fluxo, identifica em qual categoria caiu. Se foi mal classificado (B virou C, por exemplo), conserta no <code>AGENTS.md</code> do agente. Se foi P-V-E que falhou, olha qual fase (Planner errou? Executor sem permissão? Worker parou?). O fluxo serve de mapa pra encontrar a falha rápido.</p>

          <h3 style="margin-top:1.5rem">Decidir se um pedido novo precisa de novo workflow</h3>
          <p>Quando aparece um tipo de pedido recorrente que não cabe em nenhuma categoria existente, é sinal de que falta sub-fluxo. Antes de criar agente novo ou squad nova, vê se cabe estendendo o que já existe. Quase sempre cabe.</p>
        `,
      },
    ],
    pitch: `
      <p>Plataforma de IA sem fluxo definido é caixa-preta. O sócio manda mensagem, o agente "decide alguma coisa", e quando dá errado ninguém sabe onde quebrou. Pinguim OS mostra o fluxo explícito — toda mensagem passa por seis caminhos definidos, e o caminho mais pesado (Plan-Validate-Execute) é o mesmo padrão que LangChain, Microsoft e SAP publicaram como referência em 2025.</p>
      <p>Pra cliente em apresentação isso vira credibilidade técnica: "vocês não inventaram, vocês adotaram o estado da arte". Pra time interno vira velocidade de debug: identificar onde algo quebrou leva 1 minuto, não 1 dia. Pra novo agente que entra no sistema vira contrato: ele já nasce sabendo em qual categoria opera.</p>
    `,
  };
}
