# Bloco 0C — Decisão de Memória (versão limpa pra leigo)

**Data:** 2026-05-05
**Status:** DECISÃO FINAL — André reverteu recomendação dos conselheiros e foi de **B FULL ATIVO desde v1**.

> ⚠️ Esta seção foi escrita ANTES da reversão do André. A decisão final está na seção "DECISÃO FINAL" no fim deste arquivo.

---

## A pergunta que estava em jogo

> Cliente volta 2 dias depois e fala "aquela copy, melhora só o item 3". Onde mora a memória disso?

---

## O que os especialistas decidiram

Reunião com 4 especialistas reais em memória de IA:
- **Charles Packer** (criador do MemGPT/Letta — referência mundial em memória de longo prazo)
- **Harrison Chase** (criador do LangChain/LangGraph — define padrões de mercado)
- **Andrej Karpathy** (ex-OpenAI — referência em "comece simples")
- **Peter Steinberger** (criador do OpenClaw — referência do André)

**Veredito coletivo:** começar simples, mas deixar gancho pronto pra evoluir.

> "Comecem com o caminho A. Quando aparecer dor real, ligam o B na hora — schema já tá preparado."

---

## A decisão em linguagem normal

### O que vamos construir agora

**3 conceitos novos no sistema:**

1. **Chief é o orquestrador** — só ele fala com cliente, só ele guarda memória da conversa.
2. **Agentes especialistas** (Copywriter, Designer, SDR) são **"funções de execução"** — recebem instrução do Chief, devolvem o entregável, e pronto. Não guardam nada por conta própria. (Pelo menos por enquanto.)
3. **Entregáveis** (a copy, a página, o relatório) viram **objetos versionados** no banco — toda v2 lembra que veio da v1. Cliente pediu ajuste? Vira v3. Sempre rastreável.

### Como funciona o caso "ajusta item 3"

1. Cliente manda mensagem.
2. Chief lê a conversa anterior (que está guardada num lugar só).
3. Chief identifica: cliente quer ajustar a copy que entregamos antes. Busca a última copy desse cliente.
4. Chief chama o Copywriter passando: a copy original + o pedido "ajusta o item 3".
5. Copywriter devolve copy nova (v2).
6. Chief mostra pro cliente.

Ponto. Não tem mistério.

### O gancho pro futuro

Vamos criar **uma tabela vazia** chamada `aprendizados_agente` agora. Ela fica dormindo. Quando aparecer o primeiro cliente reclamando *"esse Copywriter tá repetindo erro que eu já corrigi mês passado"*, a gente liga essa tabela com **2 linhas de código**:

- Copywriter manda 1 frase de aprendizado pro Chief depois de cada execução.
- Próxima execução, Chief inclui essa frase no briefing.

Custo de criar a tabela vazia agora: **zero**. Custo de migrar depois se a gente não tiver criado: **alto**. Por isso o Packer recomendou: já cria, deixa dormindo.

---

## Custo real (cálculo dos especialistas)

**Cenário: 20 clientes ativos, cada um conversando 2x/semana, gerando ~30 entregáveis/mês.**

| Item | Custo/mês | Observação |
|---|---|---|
| Supabase Pro | US$ 25 | Já pagamos hoje |
| Edge Functions | **US$ 0** | Dentro do free tier |
| OpenAI (gpt-4o-mini) | US$ 8 a 12 | Modelo barato, qualidade ok |
| OpenAI (gpt-4o se for o caso) | US$ 80 a 120 | Modelo bom, qualidade alta |
| Storage de entregáveis | **US$ 0** | Texto é leve |
| **Total estimado** | **US$ 35 a 145/mês** | Pra agência com 20 clientes |

**Custo por entregável: ~R$ 0,30.**

Com 1.000 entregáveis/mês = **R$ 300/mês**. Vendável tranquilo (cliente paga centenas/mês pelo serviço).

---

## O que o cliente percebe

✅ Cliente fala "ajusta item 3" — Chief responde em 5-15 segundos com a versão nova.

✅ Cliente percebe consistência — copy v2 mantém tom da v1 porque Chief passou a v1 no briefing.

✅ Cliente percebe que o agente **lembra** das conversas anteriores.

✅ Quando ligar o "modo aprendizado" (gancho B), cliente percebe agente que **aprende preferências dele** ("parou de usar exclamação igual eu pedi mês passado").

❌ Cliente NÃO vê arquitetura. Vê produto que funciona.

---

## Comparação com OpenClaw (que André quer modelar)

A pesquisa traduziu OpenClaw pro nosso stack. **O que copiamos:**

- Chief é dono da memória → ✅ (igual no nosso modelo)
- Conversa sempre guardada (não "evapora") → ✅
- Especialistas começam zerados a cada chamada → ✅ (modo "isolated" do OpenClaw)
- Entregáveis viram objetos versionados → ✅ (na verdade, MELHORIA nossa: OpenClaw esconde no transcript, nós promovemos a primeira-classe)

**O que adaptamos:**

- OpenClaw usa filesystem local. Nós usamos Supabase Postgres (porque rodamos na nuvem, multi-cliente).
- OpenClaw tem reset diário fixo às 4h. Nós configuramos por cliente.

**O que NÃO copiamos (por enquanto):**

- Cada agente com MEMORY.md próprio acumulando aprendizados ao longo do tempo. **Steinberger defendeu isso, mas o conselho votou pra deixar pra depois** — só liga se aparecer caso real onde "Copywriter A virou veterano" tem valor de venda. Por enquanto, todo Copywriter é fungível (intercambiável).

---

## O que o André precisa autorizar

**1 botão pra apertar:** *"Sim, vai com essa decisão (caminho A com gancho pra B)."*

Aí eu sigo:
1. Atualizo o BLOCO-0 oficial com a decisão.
2. Atualizo `ANATOMIA-AGENTE.md` no repo com o novo conceito de "Memória do Chief" + "Especialista é função".
3. Sigo pro Bloco 0.5 (conselho geral revisita o desenho do Chief, agora com memória decidida).
4. Bloco 1: monto os 7 MDs do Chief.
5. Bloco 2: crio as tabelas no banco (`conversas`, `entregaveis`, `aprendizados_agente` vazia).

Se quiser ajustar algo antes de eu começar, fala. Se tá bom, é "vai".

---

## Lições gravadas em memória

(Pra eu não repetir os erros desta sessão)

- ✅ Decisão arquitetural relevante = pesquisa + conselho + alternativas. Sempre.
- ✅ Conselho não pode ser genérico — precisa ser dos especialistas DO TEMA específico (não os mesmos conselheiros de tudo).
- ✅ Linguagem do cliente, não do dev. "Worker" → "agente especialista". "Artefato" → "entregável".
- ✅ Recomendação tem que vir com custo $$ + impacto que cliente percebe — não só decisão técnica.

---

# DECISÃO FINAL (2026-05-05) — André reverteu

Após esta análise, André puxou pra **caminho B FULL, ATIVO desde v1**. Não "gancho" — implementação real desde dia 1.

## Argumentos do André que venceram

1. **EPP é DNA, não opcional.** Memória `project_premissa_agentes_epp.md`: *"Agente Pinguim ≠ Chatbot. Chatbot responde, agente evolui."* Sem memória individual, o agente é chatbot caro — quebra o pitch.
2. **"Não é se — é quando".** Com 200+ agentes em produção, "agente repete erro corrigido" é certeza estatística. Esperar dor real = pagar pra ver.
3. **Estamos vendendo, não experimentando.** Karpathy/Chase otimizam pra startup que pode pivotar. Pinguim não pode pivotar pra "agente sem memória".
4. **Steinberger (OpenClaw) tinha razão sozinho.** Nosso modelo declarado é OpenClaw. "Faz agora, do jeito que tem que ser feito."

## O que muda na implementação

**ANTES (decisão A com gancho):** `aprendizados_agente` tabela vazia dormindo, esperando ligar quando der dor.

**AGORA (B full ativo):** memória individual nasce ativa desde a v1 do agente.

### Novos artefatos OBRIGATÓRIOS por agente

```
cerebro/squads/<squad>/agentes/<slug>/
├── IDENTITY.md            ← já existia
├── SOUL.md                ← já existia
├── AGENTS.md              ← já existia
├── TOOLS.md               ← já existia
├── AGENT-CARD.md          ← já existia
├── SYSTEM-PROMPT.md       ← já existia
├── APRENDIZADOS.md        ← memória GERAL, agregada entre clientes (ativa desde v1)
└── perfis/                ← memória POR CLIENTE
    ├── luiz.md
    ├── micha.md
    ├── pedro.md
    └── <cliente_externo>.md  ← criados on-demand quando cliente novo aparece
```

### Tabelas no banco — todas ativas desde dia 1

- `pinguim.conversas` — histórico cliente↔Chief
- `pinguim.entregaveis` — copy/página/relatório, versionado (parent_id, versao)
- `pinguim.execucoes` — log raw de cada execução (já existe como `agente_execucoes`)
- `pinguim.aprendizados_agente` — espelho banco do APRENDIZADOS.md geral
- `pinguim.aprendizados_cliente_agente` — espelho banco dos perfis/<cliente>.md

### Como funciona "ajusta item 3" agora

1. Cliente fala "ajusta item 3 da copy".
2. Chief lê histórico de `conversas` + busca último `entregaveis` desse cliente tipo=copy.
3. Chief monta briefing pro Copywriter incluindo:
   - Copy original (entregavel v1)
   - Instrução: "ajustar item 3"
4. **Copywriter, antes de gerar, lê:**
   - `APRENDIZADOS.md` próprio (geral)
   - `perfis/<cliente>.md` (esse cliente prefere copy curta sem exclamação)
5. Copywriter gera v2 incorporando preferências aprendidas.
6. Curador valida.
7. Se humano dá feedback → Copywriter atualiza `perfis/<cliente>.md` (1 linha nova).
8. Cron 1x/dia: padrões repetidos em 3+ perfis → promovidos pro `APRENDIZADOS.md` geral.

### Custo

Briefing fica ~500 tokens maior por execução. **+10-15% no LLM.** Pra 20 clientes ativos: **+R$ 30-50/mês** sobre baseline. Negligível.

### Banco vs Disco

- **Banco é fonte da verdade** — execução lê do banco, escreve no banco.
- **Disco (`.md`) é espelho legível e versionado em git** — pra auditoria humana e leitura por humano. Sync banco→disco roda 1x/dia ou on-demand pelo painel.

### Anatomia atualizada

`ANATOMIA-AGENTE.md` na raiz do repo + memória `project_anatomia_agente_pinguim.md` foram atualizadas (2026-05-05) com:
- Pasta `perfis/<cliente>.md` como obrigatória
- Tabelas `conversas`, `entregaveis`, `aprendizados_cliente_agente` documentadas
- Anti-padrão novo: "agente sem `perfis/` é violação de DNA"

### Próximos passos

Decisão de memória **fechada e implementável**. Sigo pro:
- Bloco 0.5 (conselho geral revisita desenho do Chief com memória já decidida)
- Bloco 1 (7 MDs do Chief + APRENDIZADOS.md + perfis/luiz.md + perfis/micha.md + perfis/pedro.md + perfis/andre-codina.md)
- Bloco 2 (5 tabelas no banco)
- Bloco 3 (Edge Function loader que lê APRENDIZADOS + perfis antes de chamar LLM)
- Bloco 4 (painel mínimo de teste)
- Bloco 5 (validação com André)
