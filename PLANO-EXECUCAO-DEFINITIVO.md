# Plano de Execução Definitivo — Squad Agência Pinguim

> Este plano é SEQUENCIAL e FIXO. Cada fase depende da anterior.
> Não muda a ordem sem aprovação explícita do André.
> Replicável para qualquer agência.

---

## FASE 1: ESTRUTURA (concluída)
> O esqueleto do ecossistema

- [x] Criar repositório GitHub
- [x] Criar estrutura do cérebro (pastas, padrões)
- [x] Criar 211 agentes base (esqueletos)
- [x] Criar 4 mini-agências por tipo de estratégia (lançamento pago, low ticket, high ticket, produto)
- [x] Ajustar SOULs (executores, especialistas na habilidade)

**Resultado:** Estrutura completa no GitHub. 34 squads, 229+ agentes.

---

## FASE 2: ALIMENTAR (em andamento)
> Dar DNA e conhecimento aos agentes

- [x] Alimentar 38 clones (copywriters + storytellers) com conteúdo rico
- [x] Transcrever aulas do Elo (21 aulas, Whisper)
- [x] Documentar página de vendas + PDF do Elo
- [x] Documentar dashboards e métricas
- [ ] Documentar contexto do ProAlt (página de vendas, material)
- [ ] Documentar contexto das mentorias (Lira, Taurus, Orion — PDFs dos entregáveis)
- [ ] Documentar contexto do Desafio LoFi (copies atuais, estrutura dos 7 roteiros)
- [ ] Documentar contexto do Desafio Low Ticket

**Resultado:** Todos os agentes com contexto real do negócio, não genérico.

---

## FASE 3: SYSTEM PROMPTS (próximo)
> Transformar SOULs + contexto em prompts prontos pra OpenAI

- [ ] Criar system prompts no formato OpenAI para os agentes prioritários:
  1. Roteador (identifica aluno → direciona)
  2. Suporte Elo (dúvidas do aluno, base = transcrições)
  3. Suporte ProAlt
  4. Estrategista Elo (análise de campanha, acessa dashboard)
  5. Agentes pessoais dos sócios (Pedro, Micha, Luiz)
  6. Pinguim (orquestrador interno)
- [ ] Criar system prompts das mini-agências:
  7. Squad Lançamento Pago (5 agentes)
  8. Squad High Ticket (4 agentes)
- [ ] Testar prompts localmente (dry run sem API)

**Resultado:** Prompts prontos pra plugar no OpenClaw quando o servidor chegar.

---

## FASE 4: INFRAESTRUTURA (depende do Pedro)
> Servidor + API + OpenClaw

- [ ] Pedro define servidor (Hostinger ou Hetzner)
- [ ] Instalar OpenClaw no servidor
- [ ] André cria API Key OpenAI
- [ ] Configurar .env (chave segura, fora do Git)
- [ ] Configurar provider OpenAI no OpenClaw
- [ ] Configurar canais (Discord + Telegram)

**Resultado:** OpenClaw rodando no servidor com API key configurada.

---

## FASE 5: DEPLOY DOS AGENTES (depende da Fase 4)
> Dar vida — subir agentes no OpenClaw

Ordem de deploy (prioridade = gera caixa):
1. Roteador + Suporte Elo + Suporte ProAlt
2. Agentes pessoais dos sócios (Pedro, Micha, Luiz)
3. Pinguim (orquestrador)
4. Squad Lançamento Pago (mini-agência completa)
5. Squad High Ticket
6. Demais agentes conforme demanda

**Resultado:** Agentes funcionando, respondendo, aprendendo.

---

## FASE 6: EVOLUÇÃO CONTÍNUA
> Agentes aprendem com uso

- [ ] Feedback loop: sócios corrigem, agentes melhoram
- [ ] Compound learning: cada interação enriquece o cérebro
- [ ] Novas skills conforme demanda
- [ ] Métricas de uso e satisfação

**Resultado:** Ecossistema vivo, que melhora sozinho.

---

## Onde estamos agora

**FASE 2 — ALIMENTAR (em andamento)**

Concluído:
- Clones alimentados (38)
- Elo documentado (página + PDF + aulas transcritas + dashboards)

Próximos passos imediatos:
1. Documentar contexto do ProAlt
2. Documentar contexto dos Desafios (LoFi + Low Ticket)
3. Começar Fase 3 (system prompts) em paralelo

---

## Como replicar para outro cliente

1. **FASE 1:** Criar estrutura do cérebro (mesmo padrão de pastas)
2. **FASE 2:** Coletar material do cliente (produtos, páginas, aulas, dashboards)
3. **FASE 3:** Gerar system prompts com contexto do cliente
4. **FASE 4:** Subir infraestrutura
5. **FASE 5:** Deploy
6. **FASE 6:** Evolução

Estimativa: 1 agente/dia (pode variar, primeira implementação).
