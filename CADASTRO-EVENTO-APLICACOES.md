# 🎟️ Cadastro de Aplicações de Evento — Guia Mestre

> **O que é:** tela isolada (URL própria) que roda num evento presencial. O aluno assiste ao pitch, paga (Hotmart QR ou Pix na hora) e senta com um consultor. O consultor busca o comprador, completa o cadastro (endereço, CPF, empresa, 2ª cadeira/sócio, responsável financeiro) e libera. No fim, exporta CSV pra seguir com o contrato.
>
> **Onde vive:** mesmo projeto Supabase do Squad (`wmelierxzpjamiofeemh`), schema `pinguim`, tabelas próprias. Tela = página `.html` standalone no `mission-control/` (padrão `relatorio.html`), **fora** do login atual (email+senha) — sem atrapalhar o Mission Control.
>
> **Autor do plano:** consolidado a partir de reunião de conselho (3 arquitetos) + simulação da consultora "Karen" atendendo ao vivo. Este arquivo é o guia único de construção.

---

## 0. TL;DR das decisões (o que foi cravado)

| # | Decisão | Escolha |
|---|---------|---------|
| 1 | Modelo de dados | **1:N** — `pinguim.evento_aplicacoes` (1) + `pinguim.evento_aplicacao_pessoas` (N, máx 2). Responsável financeiro = bool com `UNIQUE parcial`. |
| 2 | Segurança | Tela pública **NUNCA escreve direto no banco**. Toda escrita passa por Edge Function `evento-aplicacao` protegida por **EVENT_TOKEN** (cofre). RLS fechado (zero policy `anon`). |
| 3 | Consultor | **Combo box** de identificação (nome + WhatsApp), gravado em cada registro. Sem senha, sem login real. Segurança está no token, não no consultor. |
| 4 | Dados Hotmart | **Pré-importar** compradores dos produtos `8103827` e `2605400` do **banco Dashboard** pra cache local `pinguim.evento_hotmart_cache`. Busca instantânea/offline. Botão "buscar agora" (fallback ao vivo). **Manual (Pix) sempre disponível.** |
| 5 | Export CSV | **Atrás do Mission Control autenticado** (email+senha), nunca da tela pública. |

---

## 1. Chaves e acessos do sistema (o que já existe)

Todas as credenciais vivem em `c:\Squad\.env.local` (gitignored) e/ou no **Cofre Pinguim** (RPC `pinguim.get_chave`). **Nunca** commitar valores — este MD só lista os NOMES.

### 1.1 Supabase principal (onde vamos criar as tabelas)

| Chave | Onde | Uso |
|-------|------|-----|
| `SUPABASE_PROJECT_REF` = `wmelierxzpjamiofeemh` | `.env.local` | projeto do Squad |
| `SUPABASE_URL` = `https://wmelierxzpjamiofeemh.supabase.co` | `.env.local` | base das Edge Functions |
| `SUPABASE_ANON_KEY` | `.env.local` / `window.__ENV__` | chave **pública** (frontend). Só valida JWT — **não escreve nas tabelas do evento** (RLS bloqueia). |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` (auto-injetada nas Edge) | bypassa RLS. **Só a Edge Function usa.** |
| `SUPABASE_ACCESS_TOKEN` | `.env.local` | deploy de functions via CLI |

- **Schema:** `pinguim` (NUNCA `public` — `public` é do app comercial da Dolphin).
- Cliente frontend seta `db: { schema: 'pinguim' }` (ver `mission-control/js/sb-client.js:17`).
- Cliente Edge (service role) idem (`_shared/agente.ts:26`).

### 1.2 Banco Dashboard (2º Supabase — de onde vêm os compradores Hotmart)

Toda compra nova da Hotmart cai neste banco via webhook do Pedro. É a fonte primária dos dados do aluno.

| Chave (no cofre) | Uso |
|------------------|-----|
| `DASHBOARD_PROJECT_REF` = `lkrehtmdqkgkyyotvjpz` | project ref do banco Dashboard |
| `DASHBOARD_ACCESS_TOKEN` | acesso read-only via Management API |

- **Lib pronta:** `server-cli/lib/db-dashboard.js` (read-only, roda SQL via Management API).
- **Camada de decisão:** `server-cli/lib/hotmart-hibrido.js` (tenta Dashboard, fallback API direta).
- **Tabelas relevantes:**
  - `hotmart_buyers` → `id, email, name, document (CPF), phone, country_name, first_purchase_at, created_at`
  - `hotmart_transactions` → `transaction_code, status, payment_type, price_value, price_currency, purchase_date, approved_date, buyer_id, product_id, is_order_bump`
  - `hotmart_products` → `id (uuid interno), hotmart_product_id, name, is_active`
- **Como puxar por produto:** filtrar `hotmart_transactions` por `product_id` (join `hotmart_products` onde `hotmart_product_id IN (8103827, 2605400)`), status aprovado (`APPROVED`/`COMPLETE`), join `hotmart_buyers` pelo `buyer_id`.

### 1.3 Hotmart API direta (fallback + confirmar nome dos produtos)

| Chave (no cofre) | Uso |
|------------------|-----|
| `HOTMART_CLIENT_ID` | OAuth2 client_credentials |
| `HOTMART_CLIENT_SECRET` | idem |
| `HOTMART_BASIC_TOKEN` | base64 pronto do painel |

- **Lib pronta:** `server-cli/lib/hotmart.js` (token cache 6h, `listarVendas`, etc).
- **Produtos do evento:**
  - `2605400` → **Taurus Mentoring** (confirmado, Club `taurusmentoring`).
  - `8103827` → **existe na Hotmart, ainda não catalogado no nosso sistema.** Confirmar nome via API na 1ª importação (`hotmart.listarVendas({ product_id: 8103827 })` pega `product.name`).

### 1.4 EVENT_TOKEN (novo — a criar)

| Chave (no cofre) | Uso |
|------------------|-----|
| `EVENTO_TOKEN` (ou `EVENTO_TOKEN_<slug-evento>`) | segredo compartilhado do evento. A tela envia no header; a Edge Function valida. Rotacionável/descartável após o evento. |

---

## 2. Modelo de dados (schema-034)

Arquivo: `mission-control/supabase/schema-034-evento-aplicacoes.sql`. Idempotente, no schema `pinguim`, aplicado via SQL Editor (padrão do projeto — não usa pasta migrations).

### 2.1 `pinguim.evento_aplicacoes` (a aplicação = 1 dossiê)

```
id                 uuid PK default gen_random_uuid()
evento_slug        text NOT NULL default 'evento-2026'   -- multi-evento já no dia 1 (coluna, não tabela)
origem             text NOT NULL CHECK (origem IN ('hotmart','pix','manual'))
product_id         bigint                                 -- 8103827 | 2605400 | null (pix)
nome_empresa       text
faturar_em         text CHECK (faturar_em IN ('pf','pj'))  -- PF ou PJ (muda o contrato)
cnpj               text                                   -- se PJ
razao_social       text                                   -- se PJ
valor_pago         numeric                                -- valor REAL (evento tem upsell/desconto de palco)
forma_pagamento    text                                   -- hotmart_cartao | hotmart_boleto | pix | transferencia
comprovante_ref    text                                   -- id transação / últimos dígitos / link comprovante (Pix)
consultor_nome     text NOT NULL                          -- quem atendeu (do combo box)
consultor_whatsapp text
observacao         text                                   -- CAMPO OURO: "sócio entra semana que vem", "2ª parcela quinta"
consentimento_at   timestamptz                            -- base legal LGPD (aluno consentiu o cadastro ali)
status             text NOT NULL default 'captado'        -- captado | contrato_enviado | assinado (máquina de estados fica pro SaaS)
criado_em          timestamptz NOT NULL default now()
atualizado_em      timestamptz NOT NULL default now()
```

### 2.2 `pinguim.evento_aplicacao_pessoas` (cadeiras — 1 ou 2 por aplicação)

```
id                       uuid PK default gen_random_uuid()
aplicacao_id             uuid NOT NULL REFERENCES pinguim.evento_aplicacoes(id) ON DELETE CASCADE
is_responsavel_financeiro boolean NOT NULL default false
origem_pessoa            text CHECK (origem_pessoa IN ('hotmart','manual'))  -- cadeira 2 costuma ser manual, mas pode ser hotmart
nome                     text NOT NULL
nome_guerra              text                             -- como quer ser chamado
cpf                      text                             -- validar dígito verificador na UI
email_compra             text                             -- email usado na compra (pode ser da esposa)
email_contato            text                             -- email que a pessoa REALMENTE lê (≠ compra)
telefone                 text
whatsapp                 text                             -- confirmar se é o mesmo do telefone
data_nascimento          date
-- endereço completo (CEP puxa o resto via ViaCEP na UI)
cep                      text
rua                      text
numero                   text
complemento              text
bairro                   text
cidade                   text
uf                       text
hotmart_transaction      text                             -- vínculo com a venda (nullable)
criado_em                timestamptz NOT NULL default now()

-- REGRA DE OURO: exatamente 1 responsável financeiro por aplicação
CONSTRAINT uq_resp_financeiro UNIQUE (aplicacao_id) WHERE (is_responsavel_financeiro = true)
```
> Nota: `UNIQUE ... WHERE` = índice único parcial (`CREATE UNIQUE INDEX ... WHERE is_responsavel_financeiro`). O banco garante 1 só responsável — não dá pra expressar isso em linha única.

Índices em `cpf`, `email_compra`, `email_contato`, `telefone`, `lower(nome)` (busca por pessoa é o que mais dói).

**Limite de 2 cadeiras = regra da Edge Function** (recusa a 3ª), NÃO `CHECK` no banco — pra não engessar o micro-SaaS depois.

### 2.3 `pinguim.evento_hotmart_cache` (compradores pré-importados)

```
id                  uuid PK default gen_random_uuid()
evento_slug         text NOT NULL default 'evento-2026'
product_id          bigint NOT NULL       -- 8103827 | 2605400
produto_nome        text
transaction_code    text
status              text
nome                text
email               text
cpf                 text                  -- hotmart_buyers.document
telefone            text
valor               numeric
data_compra         timestamptz
importado_em        timestamptz NOT NULL default now()
UNIQUE (transaction_code)                 -- re-sync não duplica (UPSERT por transaction)
```
Índices em `lower(email)`, `cpf`, `telefone`, `lower(nome)` — busca instantânea no evento.

### 2.4 RLS (fecha tudo)

```sql
ALTER TABLE pinguim.evento_aplicacoes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.evento_aplicacao_pessoas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinguim.evento_hotmart_cache      ENABLE ROW LEVEL SECURITY;
-- ZERO policy pra anon. Só service_role (via Edge Function) passa.
-- Mesmo que alguém extraia a anon key da página pública, não toca nas tabelas.
```

---

## 3. Segurança (o ponto inegociável do conselho)

**Problema:** uma página `.html` pública usa a `anon key`, que fica visível no View Source. Se a tela escrevesse direto no banco, qualquer um com a URL dumparia CPF/endereço dos alunos. A URL "secreta" vaza (histórico, WhatsApp do consultor, print no evento).

**Solução (3 camadas):**

1. **RLS fechado** (§2.4) — anon não escreve nem lê nada.
2. **Edge Function `evento-aplicacao`** — única com service role. Valida `EVENTO_TOKEN` (comparação constant-time, padrão `_shared/auth-externa.ts`). Só ela fala com o banco.
3. **EVENT_TOKEN no cofre** — a tela guarda em `localStorage` (pedido 1x ao abrir, ou embutido na URL entregue ao consultor). Rotacionável após o evento.

**Regras da Edge Function:**
- Busca é **sempre por identificador específico** — nunca retorna a base inteira.
- CPF vem **mascarado** nos resultados de busca (`***.***.***-12`), completo só no campo que o consultor edita.
- **Rate limit** por token/IP (evita dump se o token vazar).
- `consentimento_at` gravado no insert (base legal LGPD — o aluno consente o cadastro ali).

**CORS:** a tela vai chamar via `supabase.functions.invoke()`, então a Edge **precisa** dos headers `x-client-info` e `x-supabase-api-version` no `Access-Control-Allow-Headers` — senão o browser bloqueia no preflight. Reusar `corsTool` de `_shared/auth-tool.ts`. (Bug histórico já registrado: [[feedback_cors_x_client_info_edge_functions]].)

---

## 4. Fluxo de atendimento (voz da Karen — <90s por aluno)

1. **Consultor loga 1x** no começo do evento (combo box: escolhe o nome + digita WhatsApp). Nome fica fixo num canto: "Atendendo: Karen". **Não pede login a cada aluno.**
2. Aluno senta. 1ª pergunta: **"Comprou pelo QR/Hotmart ou foi Pix na hora?"**
3. **Hotmart:** busca por qualquer pedaço (nome parcial, email, CPF, telefone bagunçado). Lista com dados **mascarados** pra confirmar homônimo. Clica na pessoa certa.
4. Modal abre **já preenchido** com o que veio da Hotmart. Campos vindos da Hotmart ficam visualmente diferentes dos que faltam (destacados "falta preencher").
5. Completa: **CEP → puxa endereço** (ViaCEP), número, complemento, WhatsApp de contato, PF/PJ, empresa.
6. **2ª cadeira?** Botão "+ adicionar sócio (2ª cadeira)". Digita na mão (ou busca na Hotmart se o sócio também comprou).
7. **Marca o responsável financeiro** (radio entre cadeira 1 e 2). Não salva sem isso.
8. **Pix:** pula a busca, form manual, cola comprovante/ID da transação.
9. Revisão: sistema mostra em vermelho o que falta. Não deixa salvar sem o essencial (CPF válido, endereço, WhatsApp, financeiro definido).
10. **Salvar → confirmação grande + número do registro.** Form limpa sozinho pro próximo.

### 4.1 Fricções que a tela PRECISA resolver (senão vira retrabalho por WhatsApp)

- **Busca torta:** achar por nome parcial / CPF / telefone com ou sem DDD/+55 / email parcial. Comprou com email da esposa → busca por nome também.
- **Compra não caiu ainda:** botão **"não achei → cadastrar manual agora"**; o sistema reconcilia depois (match por CPF/email quando o dado da Hotmart chegar). Sem isso → duplicata descoberta só no contrato.
- **CPF errado:** validação de dígito verificador **em tempo real** (fica vermelho se impossível). Mata metade do retrabalho.
- **Duplicidade:** ao salvar, avisar "já existe cadastro pra esse CPF/email hoje (por [consultor], às [hora])" — **soft-warning**, não bloqueia.
- **Homônimo:** busca mostra email/telefone/CPF mascarado do lado do nome.

### 4.2 Erros de UX proibidos (deixam o consultor maluco)

- ❌ Modal que fecha e perde tudo → **autosave em `localStorage`** (rascunho por aplicação; recupera ao reabrir).
- ❌ Perder conexão e perder trabalho → **offline-first** sobre o cache já baixado; sincroniza depois.
- ❌ Salvar sem feedback → botão **desabilita ao clicar** + confirmação inequívoca + número do registro (evita 3 cliques = 3 duplicados).
- ❌ Campo de CPF/telefone sem máscara.
- ❌ Validação que só aparece depois de salvar → tudo em tempo real no campo.
- ❌ Não conseguir editar depois de salvar → reabrir o último cadastro rápido e corrigir sem criar outro.
- ❌ Autocorretor do tablet bagunçando email/CPF → campos técnicos com `autocorrect=off autocapitalize=off`.
- ❌ Ordem de Tab quebrada → preencher no teclado, Tab-Tab-Tab, sem mouse.

### 4.3 Segunda cadeira + responsável financeiro (na prática)

- Uma aplicação = **um dossiê** com 1 ou 2 pessoas amarradas (senão o contrato não sabe que é a mesma aplicação).
- Responsável financeiro = **radio no nível da aplicação** (cadeira 1 OU 2). Só um. É quem assina e paga.
- O financeiro precisa de **CPF válido + endereço completo obrigatórios**. A outra cadeira: nome + CPF + contato no mínimo.
- Tag/estrela visual em quem é o financeiro.
- **Não force "cadeira 2 = sempre manual":** caso comum é as duas cadeiras terem comprado separado na Hotmart. Poder buscar as duas e juntar.

---

## 5. Campos do formulário (checklist anti-retrabalho)

**Por cadeira:** nome*, nome de guerra, CPF* (válido), email da compra, **email de contato*** (≠ compra), telefone*, WhatsApp*, data de nascimento, CEP* → rua/bairro/cidade/UF (auto), número*, complemento.

**Por aplicação:** origem (Hotmart/Pix), produto, PF/PJ* → CNPJ + razão social (se PJ), nome da empresa, valor pago, forma de pagamento, comprovante/ID (se Pix), **responsável financeiro*** (radio), **observação livre** (sempre), consultor (do login), consentimento LGPD, timestamp (auto, fuso America/Sao_Paulo).

`*` = obrigatório pra salvar (o do financeiro é mais rígido).

---

## 6. Riscos mapeados + mitigação

| # | Risco | Mitigação |
|---|-------|-----------|
| 1 | Duplicata (2 consultores, mesma pessoa) | Edge checa CPF/email antes do insert → soft-warning "já cadastrado por X às Y". Não bloqueia. Dedupe-key = CPF. |
| 2 | Manual (Pix) que na verdade comprou Hotmart / compra depois | No re-sync e no export, match CPF/email entre pessoas manuais e o cache → sinaliza "possível match Hotmart". Não auto-merge. |
| 3 | Perda de dados por refresh/queda | Autosave `localStorage` por aplicação + salvar incremental (cria aplicação assim que a 1ª pessoa é válida, depois PATCH). |
| 4 | LGPD / CPF em tela pública | Tela nunca lista a base; CPF mascarado na UI; EVENT_TOKEN com expiração; grava `consentimento_at`. |
| 5 | Export CSV com CPF/endereço circulando | Export só atrás do Mission Control autenticado; loga quem exportou; CPF fora do CSV por padrão (export "completo" explícito e auditado). |
| 6 | Atribuição/comissão do consultor | `consultor_nome` + `criado_em` com timezone America/Sao_Paulo desde o dia 1. |

---

## 7. Arquitetura de arquivos (o que criar)

```
mission-control/
├── evento-cadastro.html              # NOVO — tela pública standalone (modelo relatorio.html)
│                                     #   window.__ENV__ + supabase-js CDN + EVENT_TOKEN em localStorage
├── js/
│   └── evento-cadastro.js            # NOVO — lógica da tela (busca, modal, autosave, 2ª cadeira, save)
├── supabase/
│   ├── schema-034-evento-aplicacoes.sql   # NOVO — tabelas + RLS (§2)
│   └── functions/
│       ├── evento-aplicacao/index.ts      # NOVO — CRUD protegido por EVENT_TOKEN (§3)
│       │                                  #   ações: buscar, criar, atualizar, adicionar_pessoa, listar
│       └── evento-importar-hotmart/index.ts  # NOVO — job de pré-importação do cache (§1.2)
```

**Export CSV:** aba nova no Mission Control autenticado (`js/evento-export.js` + `<section id="page-evento-export">` em `index.html` + `case` em `app.js`). Reusa o login email+senha existente. NÃO fica na tela pública.

**Padrões a seguir (não reinventar):**
- Modal: `.modal-backdrop`/`.modal-card` (ver `js/cerebros.js:347-436`, CSS em `css/style.css:3757+`).
- Cores: dark + acento laranja `--pc: #E85C00` (tokens em `css/style.css:13-120`). **Não** é preto/branco.
- Edge Function: `serve` + `createClient` por URL Deno; `sb()` de `_shared/agente.ts`; CORS `corsTool`.
- SQL: idempotente, `pinguim.`, `criado_em/atualizado_em`, RPCs `SECURITY DEFINER ... GRANT service_role` se preciso.

---

## 8. Plano de fases

### Fase 0 — Fundação (fazer primeiro; caro de refazer depois)
- [ ] `schema-034` aplicado (tabelas + RLS + índices).
- [ ] `EVENTO_TOKEN` gerado e gravado no cofre.
- [ ] Edge Function `evento-aplicacao` (buscar/criar/atualizar/adicionar_pessoa) com validação de token + CORS `corsTool`.
- [ ] Edge Function `evento-importar-hotmart` puxando `product_id IN (8103827, 2605400)` do banco Dashboard → `evento_hotmart_cache`. Rodar 1x pra confirmar nome do produto 8103827.

### Fase 1 — Tela do evento (o que roda ao vivo)
- [ ] `evento-cadastro.html` + `js/evento-cadastro.js`: login consultor (combo box), busca instantânea no cache, modal de cadastro.
- [ ] Validação CPF em tempo real + máscara + CEP→ViaCEP.
- [ ] 2ª cadeira + radio responsável financeiro.
- [ ] Autosave `localStorage` + confirmação grande + editar último.
- [ ] Botão "não achei → manual" + soft-warning de duplicata.
- [ ] Fluxo Pix 100% manual com comprovante.

### Fase 2 — Export e reconciliação
- [ ] Aba de export CSV atrás do Mission Control autenticado (com/sem CPF).
- [ ] Re-sync do cache na manhã do evento.
- [ ] Sinalização "possível match Hotmart" pra pessoas manuais.

### Depois (micro-SaaS, fora do evento)
UI de gestão de eventos · login real de consultor com papéis · reconciliação automática/merge · dashboard de conversão e comissão · webhook Hotmart próprio · assinatura de contrato integrada · máquina de estados de status.

---

## 9. Pendências pra confirmar com o André

- [ ] `evento_slug` — qual o nome/data do evento? (default `evento-2026`).
- [ ] Lista de consultores pro combo box (Karen, Djairo, …).
- [ ] Nome do produto `8103827` (será confirmado na 1ª importação via API, mas bom validar).
- [ ] CSV: quais colunas o contrato precisa exatamente?

---

_Referências no código: `server-cli/lib/hotmart-hibrido.js`, `server-cli/lib/db-dashboard.js`, `server-cli/lib/hotmart.js`, `mission-control/js/sb-client.js`, `mission-control/supabase/functions/_shared/auth-tool.ts`, `mission-control/js/cerebros.js`, `mission-control/relatorio.html`._
