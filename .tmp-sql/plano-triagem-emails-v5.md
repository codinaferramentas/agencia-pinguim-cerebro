# Plano V5 — Relatório de Triagem (transparência + feedback + aprendizado)

**Data:** 2026-05-14 madrugada
**Versão anterior:** V4 (snippet + ver mais + abrir Gmail opcional) — Codina aprovou estrutura mas pediu transparência da classificação + ponta de feedback pra IA aprender.
**Decisão central V5:** o relatório ensina (descrição de cada balde) E aprende (reclassificação + baldes custom pessoais).

---

## 1) Decisões confirmadas pelo Codina

**Q1 — Descrição dos baldes:** SEMPRE VISÍVEL embaixo do header, não tooltip. Texto curto descrevendo o que cada balde significa.

**Q2 — Reclassificar:** opção COMPLETA. Inclui criar balde novo pessoal. Regra: se vai fazer, faz completo agora — sem deixar pra V6.

**Q3 — Aprendizado:** PESSOAL. Cada sócio tem seu próprio sistema de classificação. Aprendizado vai pra `aprendizados_cliente_agente` (cliente-específico), NÃO `aprendizados_agente` (compartilhado).

---

## 2) Descrições canônicas dos baldes

| Slug | Header | Descrição (sempre visível) |
|---|---|---|
| `responder_hoje` | 🔴 Responder hoje | Só você resolve. Cliente urgente, reclamação, proposta com prazo, jurídico/fiscal. |
| `decidir` | ✋ Esperando sua decisão | Pedem aprovação/OK seu. Funcionário ou sócio aguardando validação, contrato pra revisar. |
| `pagar` | 💸 Financeiro | Boleto ativo, fatura, NF, reembolso a aprovar, cobrança. Recibos passados ficam em arquivar. |
| `delegar` | 🤝 Pode delegar | Funcionário do time resolve. Cadastro Princípia Pay, dúvida operacional sobre produto, agendamento. |
| `acompanhar` | ⏳ Aguardando resposta de terceiros | Você está esperando o outro responder. Follow-up que você iniciou. |
| `arquivar` | 📦 Pode arquivar sem ler | Newsletter, confirmação automática, notificação Slack/GitHub/Drive, CC informativo, recibo já pago. |

---

## 3) Tabela de baldes custom (nova)

```sql
CREATE TABLE pinguim.triagem_baldes_custom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES pinguim.clientes(id) ON DELETE CASCADE,
  slug text NOT NULL,                  -- ex: "lead-frio", "noticia-cliente"
  nome text NOT NULL,                  -- ex: "Lead frio que pode esperar"
  icone text DEFAULT '🏷',
  descricao text DEFAULT '',
  cor text DEFAULT 'mute',             -- bom/warn/bad/mute (visual)
  criado_em timestamptz DEFAULT now(),
  desativado boolean DEFAULT false,
  UNIQUE(cliente_id, slug)
);
ALTER TABLE pinguim.triagem_baldes_custom ENABLE ROW LEVEL SECURITY;
```

Cliente só vê/escreve nos próprios baldes (RLS).

---

## 4) Tabela de aprendizados de reclassificação (nova)

```sql
CREATE TABLE pinguim.triagem_aprendizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES pinguim.clientes(id) ON DELETE CASCADE,
  message_id text NOT NULL,            -- Gmail message id (referência)
  assunto text,
  remetente_email text,
  remetente_nome text,
  snippet text,
  balde_antigo text NOT NULL,          -- o que o LLM/heurística decidiu
  balde_novo text NOT NULL,            -- o que o sócio corrigiu
  motivo_humano text,                  -- opcional: campo livre
  criado_em timestamptz DEFAULT now()
);
CREATE INDEX idx_triagem_aprendizados_cliente ON pinguim.triagem_aprendizados(cliente_id, criado_em DESC);
ALTER TABLE pinguim.triagem_aprendizados ENABLE ROW LEVEL SECURITY;
```

Aprendizados mais recentes (max 30) viram exemplos no prompt do LLM-classifier na próxima triagem. Sistema aprende em fluxo.

---

## 5) Mudanças no backend

### `relatorio-triagem-emails.js`

1. **Carregar baldes custom + aprendizados** antes da classificação:
   - `db.rodarSQL('SELECT * FROM pinguim.triagem_baldes_custom WHERE cliente_id = $1 AND desativado = false')`
   - `db.rodarSQL('SELECT * FROM pinguim.triagem_aprendizados WHERE cliente_id = $1 ORDER BY criado_em DESC LIMIT 30')`

2. **Atualizar lista de BALDES_VALIDOS dinamicamente** com slugs custom

3. **Injetar aprendizados no prompt do LLM-classifier**:
   ```
   ## REGRAS APRENDIDAS DESTE SÓCIO (correções manuais anteriores — RESPEITAR)
   
   - Email "{assunto antigo}" do remetente "{X}" → balde "{novo}" (não "{antigo}")
   - ...
   ```

4. **Adicionar baldes custom ao agrupamento** + retornar na resposta

### `index.js`

3 endpoints novos:

**`POST /api/relatorio/triagem-reclassificar`**
- Body: `{cliente_id?, messageId, balde_antigo, balde_novo, assunto, snippet, remetente_email, remetente_nome}`
- Grava em `triagem_aprendizados`
- Retorna `{ok}`

**`POST /api/relatorio/triagem-balde-novo`**
- Body: `{cliente_id?, slug, nome, icone, descricao}`
- Grava em `triagem_baldes_custom` (UPSERT por slug)
- Retorna `{ok, balde: {...}}`

**`GET /api/relatorio/triagem-baldes-custom`** (opcional)
- Lista baldes custom do sócio
- Retorna `{ok, baldes: [...]}`

---

## 6) Mudanças no frontend (template V5)

### Descrição dos baldes (sempre visível)

Logo abaixo do `<h3>` de cada balde:
```html
<div class="balde-descricao">Só você resolve. Cliente urgente, reclamação...</div>
```

CSS: fonte menor, cor mute, padding-top pequeno, não expansível.

### Botão ↻ reclassificar em cada item

Adicionado nas `item-acoes`:
```html
<button class="btn-acao btn-acao-reclassificar" title="Reclassificar este email">↻</button>
```

Quando clica, abre dropdown inline:
```
┌─────────────────────────────┐
│ Mover pra:                   │
│ 🔴 Responder hoje            │
│ ✋ Decidir                   │
│ 💸 Pagar                     │
│ 🤝 Delegar                   │
│ ⏳ Acompanhar                │
│ 📦 Arquivar                  │
│ ─────────                    │
│ + Criar novo balde…          │
└─────────────────────────────┘
```

Quando escolhe um balde:
1. Move o item visualmente pro novo balde (anima saindo do antigo + aparecendo no novo)
2. Atualiza contagens dos 2 baldes + chips do topo
3. Chama `POST /api/relatorio/triagem-reclassificar` em background
4. Toast `✓ Movido pra "X balde" · desfazer`

Quando escolhe "Criar novo balde…":
1. Abre modal/prompt simples com 4 campos:
   - Nome (ex: "Notificação de venda")
   - Slug auto-gerado do nome (editável)
   - Ícone (input com sugestões emoji)
   - Descrição curta
2. Cria via `POST /api/relatorio/triagem-balde-novo`
3. Move o item pro balde novo
4. **No próximo gerar relatório**, o balde novo aparece como seção própria (backend já carrega custom)

### Atualização de contagens dinâmica

`atualizarContagens()` já é genérica — só preciso garantir que conte os baldes custom também. Pra V5, baldes custom NÃO aparecem como seção no relatório atual (só no próximo gerado) — eles ficam como destino de reclassificação.

**Decisão pragmática V5:** após reclassificar, o item SOME da lista visual (esconde). Não tenta criar seção nova dinâmica. Quando o sócio gerar próxima triagem, aparece como seção própria.

---

## 7) Plano de execução

**Fase 1 — Banco (migrations SQL via Management API):**
1. Criar `pinguim.triagem_baldes_custom` + RLS
2. Criar `pinguim.triagem_aprendizados` + RLS + index

**Fase 2 — Backend:**
1. `relatorio-triagem-emails.js`:
   - Função `carregarBaldesCustom(cliente_id)` → array
   - Função `carregarAprendizados(cliente_id, limite=30)` → array
   - Em `classificarComLLM`: receber baldes custom + aprendizados, injetar no prompt
   - Atualizar `BALDES_VALIDOS` dinamicamente
2. `index.js`: 3 endpoints novos

**Fase 3 — Frontend:**
1. Template: descrição visível embaixo de cada `<details>` summary
2. Botão `↻` em cada item + JS do dropdown
3. Modal "criar balde novo"
4. JS: reclassificarItem, criarBaldeNovo, atualizar contagens
5. CSS: dropdown, modal, animações

**Fase 4 — Teste:**
1. Reiniciar server-cli (carrega endpoints novos)
2. Gerar V5
3. Codina testa:
   - Descrição visível em cada balde
   - Reclassificar "Venda Realizada" de delegar → arquivar
   - Toast "movido pra Arquivar · desfazer" funciona
   - Criar balde novo "Notificação de venda"
   - Gerar NOVO relatório → balde "Notificação de venda" aparece como seção própria
   - Aprendizado vai pro banco
   - Próxima triagem reclassifica venda Principia automaticamente como "Notificação de venda"

---

## 8) Critério de "ficou bom"

- ✅ Descrição de cada balde visível sem clique
- ✅ Botão ↻ em cada item
- ✅ Reclassificar funciona (item some, contagem atualiza, aprendizado grava)
- ✅ Criar balde novo funciona (modal simples, persiste no banco)
- ✅ Próxima triagem usa aprendizados (LLM recebe correções anteriores no prompt)
- ✅ Próxima triagem mostra baldes custom como seções próprias
- ✅ Custo IA = ZERO (não chama IA pra reclassificar — só pra próxima triagem)
- ✅ Aprendizado é pessoal (RLS garante isolamento)

---

## 9) Anti-padrões

- ❌ Chamar LLM no momento da reclassificação (só na próxima triagem)
- ❌ Aprendizado global (afeta outros sócios sem permissão)
- ❌ Forçar criar slug manualmente (auto-gera de nome, deixa editar)
- ❌ Apagar aprendizado antigo (mantém histórico — sócio pode desfazer no banco se quiser)
- ❌ Mostrar balde custom no relatório atual (esperar próxima geração — simplifica)
- ❌ Modal pesado pra criar balde (4 campos simples basta)
