# Anatomia EPP — 3 Camadas de Inteligência Reflexiva (Pinguim OS)

> Padrão obrigatório de TODO agente Pinguim. Todo Worker, Chief, Atendente herda automaticamente via `executarComEPP()` em `_shared/agente.ts`.
>
> Decisão arquitetural: **2026-05-07** (André + conselho de Steinberger/Replit/Munger/Dalio/Thiel + pesquisa indústria).

---

## Por que existe

Sem reflexão automática, agentes IA falham silenciosamente. Cliente vê resposta ruim e pensa "produto ruim". O Pinguim OS é vendido como "agente que evolui" — sem mecanismo de auto-correção, isso é mentira de marketing.

Indústria 2026 (Replit, Anthropic, OpenClaw): agentes com reflexão entregam **25-50% mais sucesso** em tarefas multi-step. Custo adicional: **+20-30%**. ROI claro.

## As 3 camadas

### Camada 1 — Self-Verification (interno, obrigatório)

**O que faz:** antes de devolver resposta final, agente roda checklist via `gpt-4o-mini` (50× mais barato que gpt-4o). Output checado contra critérios objetivos do role do agente.

**Quando dispara:** sempre, automático, em todo `executarComEPP()`.

**Custo:** ~US$ 0,0005 por chamada (1 round mini-modelo).

**Implementação:** `verificarOutput()` em `_shared/agente.ts`. Checklist por role:
- **Atendente** (Pinguim): delegou pro Chief? devolveu output completo? não inventou número?
- **Chief de squad** (Copy/Story/Design/Board): output em 4 blocos? cita mestres invocados? sem invenção?
- **Mestre individual** (Hormozi, Halbert, Campbell, etc): aplicou seu método? marca registrada presente? sem invenção?

**Output do Verifier:**
```json
{
  "aprovado": true|false,
  "problemas": ["problema concreto 1", "problema concreto 2"],
  "recomendacao_refazer": "instrução curta pro agente refazer"
}
```

### Camada 2 — Feedback humano (👍 👎 ✏️)

**O que faz:** abaixo de toda resposta do Pinguim no painel, 3 botões. Cliente avalia. Resultado vai pra `pinguim.aprendizados_cliente_agente` (Tier 2 — perfil específico do cliente).

**Quando dispara:** explícito, humano clica.

**Custo:**
- 👍: zero (só append em MD).
- 👎 ou ✏️: ~US$ 0,03 (re-executa Atendente + Verifier com crítica como contexto).

**Endpoint:** `feedback-pinguim` (Edge Function dedicada).

**Loop fechado:** próxima execução do mesmo cliente já recebe contexto do feedback no perfil Tier 2 → agente naturalmente evita repetir o erro. **EPP funcionando de verdade.**

### Camada 3 — Reflection loop (com guardrails duros)

**O que faz:** se Verifier reprovou, agente refaz com a recomendação do Verifier injetada no briefing. Refaz no MÁXIMO 1 vez (2 tentativas total).

**Quando dispara:** automático, quando Camada 1 reprova.

**Custo:** +100% no caso (15% dos casos típicos), capado em US$ 0,20 por turno.

**Guardrails duros (anti-OpenClaw infinite loop bug):**

| Guardrail | Limite | Por quê |
|---|---|---|
| `MAX_REFLECTIONS` | **1** | Evita Chief com N mestres aninhados estourar timeout 150s da Edge Function |
| `MAX_IDENTICAL_SIMILARITY` | **0.85** | Se nova tentativa é > 85% igual à anterior (jaccard de palavras), STOP — sem progresso |
| `MAX_COST_USD_TURNO` | **US$ 0,20** | Cost cap automático. Atingiu, devolve melhor tentativa |
| `MAX_LATENCIA_MS_TURNO` | **110.000 ms** | Deadline antes do hard limit Supabase 150s |

**Verifier NÃO roda em mestre individual** quando Chief delega. Mestre é execução simples; o Verifier do Chief que consolida pega problemas dos mestres. Sem isso, 4 mestres × Verifier = explosão de timeout.

## Fluxo completo (exemplo: "copy pro Lo-fi")

```
1. Atendente Pinguim recebe pedido
   ↓
2. Atendente: buscar-cerebro(elo) → delegar-chief(copy, briefing)
   ↓
3. executarComEPP(copy-chief, briefing) ──┐
                                          │
4. Copy Chief executa:                    │ (loop EPP)
   - Decision Tree                        │
   - delegar-mestre(hormozi)              │
   - delegar-mestre(halbert)              │
   - consolidar-roteiro                   │
   ↓                                      │
5. Verifier checa output do Chief         │
   - 4 blocos? ✓                          │
   - Mestres citados? ✓                   │
   - Sem invenção? ✗ (inventou preço)    │
   ↓                                      │
6. Reflection round 1:                    │
   Chief refaz com nota "remova preço"   │
   - delegar-mestre(hormozi) ─ refeito    │
   - consolidar-roteiro ─ sem preço       │
   ↓                                      │
7. Verifier checa de novo                 │
   - tudo ✓                               │
   ↓ ─────────────────────────────────────┘
8. Atendente devolve copy + chip "squads_consultadas: copy → hormozi · halbert"
   ↓
9. Cliente vê 👍/👎/✏️ na UI
   ↓
10. Se 👎: feedback-pinguim re-executa com crítica
    Se 👍: linha em perfis/<cliente>.md (Tier 2) — próxima vez já vem certo
```

## Custos esperados (real)

| Cenário | Frequência | Custo |
|---|---|---|
| Pedido simples → Chief acertou na 1ª | ~80% | US$ 0,03 (+ Verifier $0,0005) |
| Pedido complexo → 1 reflexão necessária | ~15% | US$ 0,06 |
| Caso edge → 2 reflexões + escala humano | ~4% | US$ 0,10-0,20 |
| Caso impossível → cap atingido | ~1% | US$ 0,20 (capado) |

**Custo médio ponderado: +20-30% vs sem EPP.** Em troca de 25-50% mais sucesso.

## Como aplicar em agente novo

Você não precisa fazer NADA. Toda chamada via `executarComEPP()` herda automaticamente as 3 camadas. Só garante que:

1. **Agente está em `pinguim.agentes`** (qualquer slug).
2. **`ferramentas` inclui `delegar-mestre`** se for orquestrador de squad (Chief).
3. **`system_prompt` é específico do agente** (método, regras, tom).

Tudo o que envolva o `_shared/agente.ts` ganha auto-verificação. **Anatomia obrigatória, não opcional.**

## Onde NÃO aplicar

- Saudações/agradecimentos canned (já não passam por LLM, então Verifier não precisa).
- Tools utilitárias que não envolvem julgamento (ex.: `buscar-cerebro` retorna chunks; não tem nada pra verificar).
- Mestre individual quando dentro de Chief (custo computacional não compensa; Chief consolidador pega).

## Métricas pra acompanhar

- **Taxa de aprovação no Verifier (1ª tentativa)** → meta ≥ 70%
- **Taxa de aprovação após Reflection** → meta ≥ 90%
- **Custo médio por entregável** → meta ≤ US$ 0,06
- **% de casos que atingem cost cap** → meta ≤ 2%
- **Feedback humano 👍/👎 ratio** → meta 👍 ≥ 80%

Implementadas via tabelas existentes: `pinguim.agente_execucoes`, `pinguim.aprendizados_cliente_agente`, `pinguim.custos_diarios`.

## Alternativa pros 4 sócios (custo zero)

Quando rodar via terminal + Claude Code + MCP (futuro), MESMA anatomia EPP rodará usando plano Max. Custo zero. **Sócio recebe versão mais inteligente do Pinguim que o cliente externo paga.**

Decisão arquitetural separada — ver `reference_claude_max_inviavel_para_produto.md` na memória.

## Conselheiros que validaram (registro de decisão)

- **Peter Steinberger (OpenClaw):** "Implemente, mas com max iterations duro e detector de loop idêntico — bug conhecido do OpenClaw é loop infinito sem circuit breaker."
- **Replit Agent (caso técnico):** "Reflexão a cada 5 steps, custo médio US$ 0,20/sessão. Vale o investimento."
- **Charlie Munger:** "Invert. O que faria isso falhar? Loop infinito, custo explosivo, recursão. Construa com limites desde o primeiro deploy."
- **Ray Dalio:** "All Weather: vai com 3 camadas + guardrails. Diversifica risco sem aumentar downside."
- **Peter Thiel:** "É a anatomia que torna o Pinguim monopólio vs commodity. Concorrentes vendem 'agente que responde'. Vocês vendem 'agente que se corrige antes de errar com você'."

---

**Última atualização:** 2026-05-07. Implementação inicial commit `ca9b77f` (Camadas 1+3) e `feedback-pinguim` (Camada 2).
