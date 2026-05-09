---
name: discord-24h
description: Resumo CONCENTRADO do Discord do time nas últimas 24h — pontos de atenção (reembolsos, cadastros pendentes, bugs, reclamações de cliente), tópicos discutidos por canal, atividade do time. NÃO lista mensagem por mensagem (ruído). Lê pinguim.discord_mensagens (alimentada em tempo real pelo bot Pinguim Bot via Gateway WebSocket). Cada mensagem do time vira sinal pro relatório executivo. Squad data — V2.14 Frente B.
---

# Skill: discord-24h

## Quando usar

- Cron diário 8h dispara como módulo do executivo-diario
- Sócio pede "tem reembolso hoje?", "alguém pediu cadastro?", "tem reclamação no Discord?", "o que aconteceu no time ontem?"
- Outro relatório executivo precisa do bloco Discord (composição modular V2.14)

## Quando NÃO usar

- Pedido de **buscar mensagem específica** ("o que o Pedro disse no #automacoes ontem?") — usa endpoint `POST /api/discord/buscar` direto com query
- Pedido de **listar mensagens cruas** ("mostra tudo que rolou no #suporte") — usa `POST /api/discord/listar-24h` direto
- Pedido de **enviar mensagem no Discord** — esta Skill é READ-only. Vai pra `hybrid-ops-squad` quando frente V2.15 popular Skill `enviar-discord`.

## REGRA ZERO — produto é SINAL, não MENSAGEM

André foi taxativo (2026-05-09): "**não quero ver tudo o que é discutido no Discord. Não precisa.**" O valor não está em listar 200 mensagens — está em destacar **pontos de atenção** que o sócio precisa AGIR ou DECIDIR.

**4 categorias de sinal que importam:**

| Categoria | Padrão de detecção | Ação esperada do sócio |
|---|---|---|
| 🔴 **Reembolso** | `reembolso`, `cancelar`, `desistência`, `chargeback`, `quero meu dinheiro` | Investigar produto X — taxa subindo? furo de onboarding? |
| 🟠 **Cadastro pendente** | `cadastro`, `liberar acesso`, `não consegui entrar`, `não chegou login`, `acesso pendente` | Automação Hotmart→área de membros pode estar quebrada |
| ⚠️ **Bug/Reclamação** | `não funciona`, `erro`, `bug`, `quebrado`, `caiu`, `está fora do ar`, cliente reclamando | Suporte engajar, dev investigar |
| 💡 **Decisão importante** | `decidimos`, `vamos`, `aprovado`, `vetado`, mention `@everyone` ou `@here`, ou alta reação (≥5) | Sócio deve estar ciente, talvez chancelar |

## Como executar

### Passo 1 — Coleta (via endpoint HTTP do server-cli)

```js
const resp = await fetch('http://localhost:3737/api/discord/listar-24h', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ horas: 24, incluir_bots: false, limite: 500 })
});
const d = await resp.json();
// d = { ok, total, mensagens: [...], resumo_canais: [...], janela_horas, desde }
```

### Passo 2 — Detecção de pontos de atenção (regex + LLM)

**Regex pra rastreio rápido (alto recall):**

```js
const PADROES = {
  reembolso:    /reembols|cancelar|desist[êe]ncia|chargeback|quero meu dinheiro/i,
  cadastro:     /cadastro|liberar acesso|n[ãa]o consegui entrar|n[ãa]o chegou login|acesso pendente/i,
  bug_reclama:  /n[ãa]o funciona|erro |bug|quebrado|caiu|fora do ar|t[áa] dando problema/i,
  decisao:      /decidimos|aprovado|vetado|fechado/i,
};
```

**Pra cada mensagem que casa, anota:**
- Categoria (reembolso/cadastro/bug/decisao)
- Quem postou (autor_nome)
- Em qual canal (canal_nome)
- Quando (postado_em em BRT)
- Trecho do conteúdo (max 200 chars)
- **Produto mencionado** se houver (cruza com slugs conhecidos: `elo`, `lyra`, `proalt`, `lo-fi`, `taurus`, `orion`, `mentoria express`)

**LLM faz refino (alta precisão):** depois do regex marcar candidatos, passar lista pro Claude CLI:
> "Das mensagens abaixo do Discord do time, classifica cada uma em [reembolso/cadastro/bug/decisao/falso-positivo]. Pra cada VERDADEIRO, extrai (cliente_mencionado?, produto_mencionado?, severidade=baixa/media/alta). Devolve JSON."

Isso evita falso-positivo do regex (alguém dizendo "não funciona explicar isso por mensagem" não é bug). Custo: 1 chamada CLI ~5s pra ~50 mensagens flagadas, vale.

### Passo 3 — Composição do bloco markdown

Estrutura fixa (compactável pra entrar no Executivo Diário):

```
## 💬 Discord — últimas 24h

**Pontos de atenção (3)**

🔴 **Reembolso** — Lyra
- 09:42 #suporte · @ana_cliente: "quero pedir reembolso, o produto não atende minha necessidade"
- 14:15 #suporte · @joao_cliente: "como faço pra cancelar minha assinatura do Lyra?"

🟠 **Cadastro pendente** — ProAlt
- 11:20 #suporte · @maria_cliente: "comprei ontem, não chegou login"

⚠️ **Bug** — Checkout
- 16:33 #dev · @pedro_aredes: "checkout do Elo tá retornando 500, investigando"

**Atividade do time**
- 47 mensagens em 8 canais · 12 autores ativos
- Top canais: #suporte (18) · #dev (9) · #automacoes (7)
- 1 menção a @everyone em #anuncios às 10:00 (Pedro)

---
Fonte: Pinguim Bot · janela últimas 24h BRT · servidor "Agência Pinguim"
```

**Princípios:**

- **Pontos de atenção PRIMEIRO** (sócio escaneia em 5 segundos)
- **Por categoria + emoji** (🔴/🟠/⚠️/💡 pra escaneabilidade)
- **Cite produto mencionado** quando houver — "Lyra com 2 reembolsos hoje" é o sinal real
- **Atividade do time como rodapé** (informativo, não ação)
- **Conteúdo da mensagem em aspas** (texto real do cliente, não parafraseado)

### Passo 4 — Verifier de discord (Munger reforço)

Antes de devolver:

1. **Soma bate?** Total de pontos de atenção ≤ total de mensagens da janela (sanity)
2. **Categoria do regex/LLM bate?** Não classificar "não funciona explicar" como bug
3. **Produto mencionado existe?** Cruza com lista canônica (`elo|lyra|proalt|lo-fi|taurus|orion|mentoria express`)
4. **0 mensagens na janela?** Devolver "Nada relevante no Discord nas últimas 24h" (NÃO inventar)

Se algum check falhar:
- Adiciona bloco `⚠ ALERTA Verifier: <descrição>` no fim do output
- Marca `status='reprovado'` em `pinguim.relatorios_config.ultimo_status`

### Passo 5 — Cruzamento com outros módulos

Quando rodar como parte do executivo-diario, **passar dados estruturados** pra Skill `compor-executivo-diario` cruzar:

| Sinal Discord | Cruza com módulo | Ação combinada |
|---|---|---|
| 🔴 Reembolso Lyra | `financeiro-24h.reembolsos[produto=lyra]` | "2 reembolsos do Lyra no Discord + 3 no financeiro = problema confirmado" |
| 🟠 Cadastro ProAlt pendente | `financeiro-24h.vendas[produto=proalt]` | "venda confirmada mas cliente sem acesso = automação Hotmart quebrou" |
| ⚠️ Bug checkout | qualquer venda com checkout no dia | "checkout 500 + 0 vendas após 16:33 = sem fluxo de receita até resolver" |
| 💡 Decisão importante | agenda do dia | "Decisão sobre X tomada às 10h, reunião às 14h pode chancelar" |

## Anti-padrões proibidos

- ❌ **Listar 200 mensagens em sequência** (nem o sócio vai ler — André foi explícito)
- ❌ **Inventar reembolso/bug** sem mensagem real no banco (`pinguim.discord_mensagens` é fonte da verdade)
- ❌ **Parafrasear conteúdo** (cita TRECHO LITERAL entre aspas — credibilidade)
- ❌ **Misturar mensagens do bot** (filtro `autor_bot=false` por padrão — exceto se explicitamente pedido)
- ❌ **Ignorar canal** (sempre mostra `#canal_nome` — sócio entende contexto)
- ❌ **Reportar fuso UTC** (sempre BRT — bot grava em UTC mas SQL/template formatam pra BRT)
- ❌ **Confundir mensagem editada com nova** (campo `editado_em` indica edit; usar `postado_em` pra ordenar)
- ❌ **Escrever no Discord** (READ-only — frente V2.15 trata escrita via `hybrid-ops-squad`)

## Padrão de qualidade

- **NUNCA inventar** — todo sinal vem do banco
- **SEMPRE rodar Verifier** antes de devolver
- **SEMPRE incluir audit no rodapé** (servidor + janela BRT + total mensagens lidas)
- **SEMPRE produto explícito** quando detectar (Lyra/ProAlt/Elo)
- **Se 0 sinais relevantes:** "Nada que exija sua atenção no Discord nas últimas 24h" + linha de atividade

## Pendências conhecidas

- **Bot precisa de permissão por canal** — em canais privados (suporte, dev, restritos a role), o sócio admin precisa adicionar Pinguim Bot com "View Channel" + "Read Message History" manualmente. Sem isso, canal fica invisível pro bot e some do resumo.
- **Threads** — bot ouve threads ativas mas se thread for arquivada, mensagens novas só voltam quando thread reabrir
- **Backfill no boot** — quando server reinicia, bot perde mensagens postadas durante downtime. Mitigação: `POST /api/discord/backfill` busca via REST as últimas N horas. Idealmente rodar no boot automático (a fazer).
- **Detecção de cliente vs membro do time** — hoje qualquer autor entra. Filtrar membro do time depois (`autor_id IN role_team`) pra distinguir "cliente reclamou" vs "Pedro discutindo bug".
