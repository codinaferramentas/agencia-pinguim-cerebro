# Plano V4 — Relatório de Triagem (autossuficiente: snippet + ver mais)

**Data:** 2026-05-14 madrugada
**Versão anterior:** V3 (relatório interativo com ações Gmail) — Codina aprovou ações + UX mas faltou contexto pra decidir.
**Decisão central V4:** o relatório precisa ser **autossuficiente**. Sócio NÃO deveria abrir Gmail só pra entender se arquiva/marca-lido/apaga. Snippet visível + "ver mais" expande inline.

---

## 1) Problema do V3

Item de email mostra só:
- Assunto
- Remetente

Codina NÃO TEM PODER DE DECISÃO com só essas 2 informações. Pra decidir "arquivar / marcar lido / apagar", precisa ver o conteúdo.

**Hoje, pra ver o conteúdo, ele clica no link → Gmail pede login → frustração.**

V4 corrige isso trazendo conteúdo INLINE no próprio relatório. Custo = zero token IA (Gmail API já retorna snippet em cada email).

---

## 2) Mudanças confirmadas pelo Codina

### A. Snippet SEMPRE visível (sem clique)

- Gmail API já retorna `snippet` de ~150 chars por email
- Backend (V2/V3) já coleta isso, só não estava propagando no `conteudo_estruturado`
- Mostrar em cada item, abaixo do assunto e remetente

### B. Botão "ver mais" expande inline

- Quando clica, expande pra mostrar até **600 chars** do corpo
- Como buscar 600 chars? Opções:
  - **(b1)** Usar só o snippet que já temos (~150 chars) e mostrar tudo na expansão — fácil, zero API extra
  - **(b2)** Chamar Gmail API on-demand pra puxar `body` completo (lazy load) — 1 API call por clique, dá pra cachear

**Decisão V4:** começar simples com (b1) — snippet completo de ~200 chars sempre visível, e "ver mais" abre o corpo completo via Gmail API lazy load (b2). Backend já tem função `lerEmail()` ou similar — preciso checar.

Se a função não existir / for complicada, fallback pra (b1) só.

### C. Botão "abrir no Gmail" opcional

- Não é mais comportamento padrão do clique no card
- Aparece como botão pequeno na área expandida (junto com 📥 ✓ ⭐ 🗑)

### D. Comportamento de clique

- **Antes:** clicar no card abre Gmail (problema do login)
- **Depois:** clicar no card expande/colapsa o card pra mostrar mais conteúdo
- O link explícito pro Gmail é só um botão pequeno depois do snippet

---

## 3) Arquitetura técnica

### Backend (`relatorio-triagem-emails.js`)

Olhar a função `coletarTriagemEmails()` — checar se `snippet` está sendo propagado no array de emails que vai pro `conteudo_estruturado`. Provavelmente sim (já está no V1/V2/V3, vinha junto da Gmail API). Mas garantir que está chegando no template.

Adicionar talvez:
- Endpoint **NOVO** `POST /api/relatorio/triagem-corpo-completo` que recebe `{cliente_id, messageId}` e retorna `{body: "..."}` puxando da Gmail API
- Usa função `lerEmail()` (lib/google-gmail.js já tem) — só wrappa
- Permite lazy load on-demand do corpo quando usuário clica "ver mais"

### Frontend (template)

Cada item de email vira:

```html
<li class="balde-item" data-message-id="...">
  <div class="balde-link">
    <div class="balde-cabecalho">
      <span class="balde-assunto">Action Required: Add Funds...</span>
      <span class="balde-meta">Lovable</span>
    </div>
    <div class="balde-snippet">Your Lovable workspace 'Agencia Dolphin' has run out of credits. Add funds to continue...</div>
    <div class="balde-corpo-expandido" style="display:none">
      <!-- preenchido por lazy load -->
    </div>
  </div>
  <div class="item-acoes">
    <button data-op="ver-mais">▾ ver mais</button>
    <button data-op="starred">⭐</button>
    <button data-op="arquivar">📥</button>
    <button data-op="lido_arquivar">✓</button>
    <button data-op="lixo" data-confirma="1">🗑</button>
    <a href="link_gmail" target="_blank" class="btn-gmail">↗ abrir no Gmail</a>
  </div>
</li>
```

JS:
- Clique no card (não nos botões de ação) → toggle classe `is-expandido` no item
- Quando expande pela primeira vez → fetch `/api/relatorio/triagem-corpo-completo` → renderiza corpo
- Quando colapsa → mantém corpo carregado (cache local), só esconde

### CSS

- `.balde-snippet` — sempre visível, fonte menor que assunto, cor mute
- `.balde-corpo-expandido` — pre-formatado, max-height transition, scroll se for grande
- `.is-expandido .balde-corpo-expandido` — display block, max-height auto

---

## 4) Plano de execução

**Fase 1 — Backend:**
1. Verificar `coletarTriagemEmails` propaga `snippet` em cada email do `conteudo_estruturado` ✓ (já propaga via spread `{ ...e }`, confere)
2. Adicionar endpoint `POST /api/relatorio/triagem-corpo-completo` no index.js

**Fase 2 — Frontend:**
1. Atualizar render de cada item do balde (e top3) pra mostrar snippet
2. Adicionar bloco "balde-corpo-expandido" hidden
3. Adicionar botão "ver mais" nas ações
4. Adicionar botão "abrir no Gmail" como link separado
5. JS: handler de "ver mais" que fetch corpo + renderiza
6. CSS: estados expandido/colapsado

**Fase 3 — Teste end-to-end:**
1. Reiniciar server-cli
2. Gerar V4
3. Codina valida: snippet aparece, "ver mais" expande, "abrir Gmail" só quando quer

---

## 5) Critério de "ficou bom"

- ✅ Snippet visível em todos os emails (sem clique)
- ✅ "ver mais" expande inline (com corpo completo via lazy load)
- ✅ "abrir no Gmail" só quando o sócio quer (não como padrão de clique)
- ✅ Custo IA = ZERO (snippet já vem da Gmail API; corpo completo idem)
- ✅ Latência expand "ver mais" < 1.5s
- ✅ Codina consegue decidir arquivar/lido/apagar SEM abrir Gmail

---

## 6) Anti-padrões

- ❌ Chamar IA pra resumir cada email (Codina pediu explícito: sem gastar token)
- ❌ Truncar snippet pra <100 chars (perde contexto)
- ❌ Forçar abertura do Gmail no clique do card (era o problema do V3)
- ❌ Manter "ver mais" em modal/lightbox (quebra fluxo de scroll do relatório)
- ❌ Pré-carregar corpo de TODOS emails no boot (latência inicial absurda)
