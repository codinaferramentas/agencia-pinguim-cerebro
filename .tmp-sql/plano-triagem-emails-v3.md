# Plano V3 — Relatório de Triagem de Emails (relatório com AÇÃO)

**Data:** 2026-05-13 noite
**Versão anterior:** V2 (id `a96ee331-0010-48eb-bbe6-e222b2b9b89e`) — Codina aprovou estrutura geral mas pediu evoluções
**Decisão central V3:** relatório não é só pra informar — **é ferramenta**. Codina interage com a inbox direto da página.

---

## 1) Mudanças confirmadas pelo Codina (decisões finais)

### A. Contagem por balde no TOPO (header destacado)

- Formato: **em linha**, exemplo: `🎯 1 hoje · ✋ 1 decidir · 💸 2 pagar · 🤝 0 delegar · ⏳ 0 acompanhar · 📦 3 arquivar`
- Posição: logo após o "Bom dia, André. Chegaram 6 emails desde ontem"
- Visual: cada balde clicável (scroll suave até a seção)
- Se ficar pobre depois, testar chip colorido na próxima iteração

### B. Baldes secundários ficam COLAPSÁVEIS

- Hoje (top 3) — **aberto** por padrão (sempre)
- ✋ Decidir, 💸 Pagar, 🤝 Delegar, ⏳ Acompanhar — **colapsados** por padrão
- 📦 Arquivar sem ler — **colapsado** por padrão (já era)
- Clica no header de cada balde → expande/colapsa
- Animação suave (max-height transition)

### C. Ações por item (em cada email da lista)

3 botões no hover de cada item:

| Botão | Ação Gmail | Confirmação |
|---|---|---|
| 📥 Arquivar | `arquivar` (remove label INBOX) | Não, executa direto |
| ✓ Marcar como lido | `lido` **+ `arquivar` JUNTO** (1 op composta) | Não, executa direto |
| ⭐ Importante | `starred` (adiciona estrela) | Não, executa direto |
| 🗑 Apagar | `lixo` (move pra Lixeira do Gmail — recuperável 30 dias) | **SIM, pop-up "Tem certeza? [Apagar / Cancelar]"** |

**Decisão crítica:** "marcar como lido" SEMPRE arquiva junto, porque marcar lido sem arquivar = email volta no próximo relatório (janela é por data, não por status). Codina confirmou.

**Decisão crítica 2:** Apagar = mover pra Lixeira (`lixo`), NÃO permanente. Gmail não expõe deletar permanente via API anyway. Codina confirmou "porque aí se a IA errar a gente ainda tem backup".

### D. Ações EM MASSA (botões no header do balde)

Por balde:

| Balde | Ações em massa |
|---|---|
| 🎯 Hoje | Nenhuma (são prioridades) |
| ✋ Decidir | Nenhuma (cada decisão é distinta) |
| 💸 Pagar | Nenhuma (cada cobrança é distinta) |
| 🤝 Delegar | Nenhuma (cada um delega pra alguém diferente) |
| ⏳ Acompanhar | "Marcar todos como lidos" |
| 📦 Arquivar | "Arquivar todos N" + "Marcar todos como lidos N" + "Apagar todos N" |

**Confirmação dura nas ações em massa:**
- "Arquivar todos N" → confirma 1x ("Vai arquivar 12 emails. Continuar?")
- "Apagar todos N" → confirma 1x ("Vai mover 12 emails pra Lixeira do Gmail. Continuar?")

### E. Feedback visual quando ação executa

Padrão Gmail/Superhuman:

1. **Item some imediatamente da lista** (fade out 200ms)
2. **Contador do balde desce em tempo real** (`Financeiro (2)` → `Financeiro (1)`)
3. **Chip de contagem no topo atualiza** também (`💸 2 pagar` → `💸 1 pagar`)
4. **Toast fixo no canto inferior direito (6 segundos):**
   - Verde: `✓ 1 email arquivado · desfazer`
   - Vermelho: `⚠ Falha ao arquivar — tente de novo` (se backend falhar, item REAPARECE)
5. **Botão "desfazer" no toast** chama API que reverte (Gmail tem unArchive nativo via `arquivar=false`)

**Onde desfazer está habilitado:**
- ✅ Arquivar (reversível, padrão Gmail)
- ✅ Marcar como lido (reversível — apenas remove a label LIDO e devolve a INBOX)
- ✅ Importante (reversível — apenas remove `starred`)
- ❌ **Apagar não tem desfazer no toast** — pop-up dura na frente já protege. Pra recuperar, vai na Lixeira do Gmail.

---

## 2) Arquitetura técnica

### Endpoint novo: `POST /api/relatorio/triagem-acao`

**Body:**
```json
{
  "cliente_id": "<uuid>",            // opcional, resolve automático
  "messageIds": ["18a3b2c1", ...],   // 1 ou mais
  "op": "arquivar|lido_arquivar|starred|lixo|unstarred|unread_unarchive"
}
```

**Lógica:**
- Para cada `messageId`:
  - Chama `lib/google-gmail.modificarLabels(cliente_id, messageId, op)` (já existe, V2.13)
  - `lido_arquivar` é composta — chama 2 ops em sequência (`lido` + `arquivar`)
  - `unread_unarchive` é o desfazer composto — chama 2 ops (`nao-lido` + adiciona label `INBOX`)
- Retorna `{ok, sucessos: N, falhas: N, detalhes: [{messageId, ok, erro?}]}`

**Segurança:**
- OAuth refresh_token isolado por `cliente_id` no Cofre
- Só funciona pro sócio dono da inbox

**Anti-padrão:**
- NÃO grava nada em `pinguim.entregaveis` (não polui banco com ações operacionais)
- Loga em `console.log` pra debug

### Mudanças em `google-gmail.js` (lib)

Verificar se a função `modificarLabels` (ou equivalente) já aceita as ops abaixo. Caso falte, adicionar:
- `lido` → remove label `UNREAD`
- `nao-lido` → adiciona label `UNREAD`
- `arquivar` → remove label `INBOX`
- `unarchive` (NOVO) → adiciona label `INBOX`
- `starred` → adiciona label `STARRED`
- `unstarred` (NOVO) → remove label `STARRED`
- `lixo` → adiciona label `TRASH` (Gmail auto-remove `INBOX`)

### Mudanças em `template-relatorio-triagem-emails.js`

#### Header
- Adicionar bloco **"Resumo da inbox"** (logo abaixo do hero, antes do top3)
- Linha visual com 6 contadores clicáveis (links com `href="#balde-X"`)

#### Baldes secundários (todos exceto top3)
- Wrappar em `<details>` HTML (colapsável nativo)
- Header com botão de toggle visual (▾/▴)
- Quando expandido, mostra a lista de items

#### Cada item de email
- Hover mostra row de 3-4 botões (ícones com tooltip)
- `data-message-id="<id>"` no item pra JS achar
- JS handler que chama `/api/relatorio/triagem-acao` via fetch

#### Toast container
- Fixed bottom-right
- z-index alto
- Auto-hide após 6s (timer)
- Botão "desfazer" inline (X) + ação inversa

#### CSS/JS
- Tudo inline no HTML (entregável é standalone)
- Sem framework externo (vanilla JS suficiente)

---

## 3) Plano de execução (ordem)

**Fase 1 — Verificar tool `gmail-modificar` existente:**
1. Ler `lib/google-gmail.js` pra ver assinatura da função de modificar labels
2. Confirmar ops suportadas (lido, arquivar, starred, lixo) e listar gaps
3. Se faltar `unarchive`/`unstarred`, adicionar

**Fase 2 — Criar endpoint `/api/relatorio/triagem-acao`:**
1. Adicionar handler no `index.js` antes do `app.listen`
2. Aceita lote (1 a N messageIds) + op
3. Loop chamando a função do gmail lib
4. Retorna estatística `{sucessos, falhas, detalhes}`

**Fase 3 — Refatorar template HTML:**
1. Adicionar bloco "Resumo" com 6 contadores linkados
2. Trocar `<section>` por `<details>` nos baldes secundários
3. Adicionar botões de ação por item (com `data-message-id`)
4. Adicionar botões de ação em massa nos baldes que pedem
5. Adicionar container de toast (CSS + DOM)
6. Adicionar `<script>` com:
   - `acaoIndividual(messageId, op, elemento)` — fade out + fetch + toast com desfazer
   - `acaoEmMassa(baldeSlug, op)` — confirm() + fetch lote + toast agregado
   - `desfazerAcao(messageIds, opInversa)` — fetch inverso + reaparecer items
   - `mostrarToast(msg, tipo, undoFn?)` — DOM toast com timer 6s

**Fase 4 — Testar end-to-end:**
1. Reiniciar server-cli (carrega endpoint novo)
2. Gerar V3 do relatório
3. Codina valida visual + ações funcionam + desfazer funciona
4. Se OK, commit `feat(triagem V3): relatorio interativo com acoes Gmail (arquivar/lido/star/lixo) + desfazer`

---

## 4) Critério de "ficou bom"

- ✅ Contagem por balde no topo, em linha, clicável
- ✅ Baldes secundários colapsam/expandem suavemente
- ✅ Cada item tem 4 botões: 📥 ✓ ⭐ 🗑
- ✅ Apagar pede confirmação (pop-up)
- ✅ Ações em massa nos baldes 📦 e ⏳
- ✅ Item some imediatamente após clicar
- ✅ Contador desce em tempo real
- ✅ Toast verde "✓ desfazer" 6s
- ✅ Desfazer funciona (item reaparece, contador volta)
- ✅ Toast vermelho se backend falhar + item REAPARECE
- ✅ Latência < 1s pra ações individuais (Gmail API é rápida)

---

## 5) Anti-padrões a evitar

- ❌ Marcar como lido SEM arquivar (email volta no próximo relatório)
- ❌ Apagar permanente (sempre Lixeira, nunca delete real)
- ❌ Botão de ação destrutiva sem feedback visual (perde confiança)
- ❌ Esconder a ação que falhou (item tem que REAPARECER se Gmail rejeitar)
- ❌ Toast que some sem desfazer pra ações reversíveis (Codina pediu explícito)
- ❌ Confirmação dupla pra ação individual rotineira (vira chato — só apagar confirma)
- ❌ "Desfazer apagar" no toast (apagar já tem pop-up; misturar dois layers confunde)
