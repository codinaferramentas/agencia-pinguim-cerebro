# Chamado Hotmart Suporte — API Club retorna vazia pra alguns Clubs ativos da conta

**Data:** 2026-05-11
**Conta produtor:** Agência Pinguim (ucode `c56dc856-cba8-436a-a8bb-9a1f26df8295`)
**Credencial Hotmart Developers (CLIENT_ID):** `1d9750b7-3cbe-4343-b8a3-8f38e87f1919`
**Data de criação da credencial:** semana de 05/05/2026 (~1 semana atrás)

---

## Texto pronto pra colar no chamado

---

Olá, equipe Hotmart.

Tenho uma credencial de API Hotmart Developers ativa (CLIENT_ID `1d9750b7-3cbe-4343-b8a3-8f38e87f1919`) na conta Agência Pinguim. A autenticação OAuth2 client_credentials funciona normalmente e endpoints Sales/Subscriptions respondem corretamente.

**O problema é com o endpoint `GET /club/api/v1/users`:**

A API retorna alunos corretamente pra ALGUNS Hotmart Clubs da conta:

| Subdomain (passado em `?subdomain=...`) | total_results retornado | Confirmado em |
|---|---|---|
| `proalt` | 478 | 2026-05-11 |
| `siriuslab` | 838 | 2026-05-11 |
| `protocolovendaviral` | 450 | 2026-05-11 |
| `mastermindorion` | 32 | 2026-05-11 |
| `proaltlowticketrecorrente` | 42 | 2026-05-11 |
| `clube6em30` | 7759 | 2026-05-11 |
| `taurusmentoring` | 1 | 2026-05-11 |
| `escoladoperpetuo` | 1 | 2026-05-11 |

Pra esses Clubs eu também consigo chamar `/club/api/v1/modules?subdomain=X` e recebo a lista de módulos normalmente.

**Pra OUTROS Hotmart Clubs ativos na mesma conta, a API retorna `{items: {}, page_info: {total_results: 0}}` mesmo sem filtro nenhum (sem `email`, sem `page_token`).**

Exemplos confirmados:

| Subdomain | Nome do Club no painel | Quantos produtos | total_results retornado |
|---|---|---|---|
| `michamenezes` | "Micha Menezes" | 15 produtos | 0 |
| `aceleradordeperpetuo` | "Acelerador de Perpétuo" | 1 produto | 0 |

E o Club que cobre o produto ELO (ID `6404411`) tem URL personalizada `hotmart.com/club/turbo-x` e nome "Produtos Micha Menezes" (13 produtos no painel). Quando passo `subdomain=turbo-x` ou `subdomain=turbo_x` na API, o CloudFront responde 200 com `location: /docs/` (slug com hífen não é reconhecido). Quando passo `subdomain=turbox`, recebo 200 com `{items: {}, total_results: 0}` (Club existe mas vazio na visão da minha API).

**Detalhes técnicos da request:**

```http
GET https://developers.hotmart.com/club/api/v1/users?subdomain=michamenezes&max_results=10
Authorization: Bearer <access_token>
Accept: application/json
```

**Response:**
```
HTTP/1.1 200 OK
Content-Length: 74
Content-Type: application/json

{"items":{},"page_info":{"total_results":0,"results_per_page":0}}
```

**Pra esse mesmo Club ("Micha Menezes" — 15 produtos), eu confirmo no painel admin (https://app.hotmart.com/membership/micha-menezes/products) que tem produtos ativos e alunos. Por exemplo, o produto "ProAlt - Low Ticket" (ID `6811692`) está nesse Club, e eu vejo 478 alunos lá no painel. Mas quando consulto `subdomain=michamenezes` a API retorna 0 alunos.**

Curiosamente, quando consulto `subdomain=proalt` (mesmo produto ProAlt 6811692), a API retorna os 478 alunos corretamente.

**Perguntas:**

1. Por que alguns Hotmart Clubs da minha conta retornam dados via API e outros retornam vazio?
2. Existe alguma configuração no painel admin do Hotmart Club ("Configurações → Ferramentas" ou outro lugar) que precise ser habilitada pra liberar o acesso da minha credencial àquele Club específico?
3. O subdomain correto que devo passar na query é a URL personalizada visível na seção "Informações gerais" do Club, ou existe um identificador técnico diferente?
4. Existe limitação por idade do Club, versão da plataforma, ou tipo de Club (legacy vs nova versão) que afete o acesso via API?
5. Se for limitação de versão, existe uma API v2 ou endpoint alternativo pra acessar Clubs criados na versão mais recente?

**Reproduzir:**

```bash
# Pega access token (funciona corretamente):
curl -X POST "https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=1d9750b7-3cbe-4343-b8a3-8f38e87f1919&client_secret=<MEU_SECRET>" \
  -H "Authorization: Basic <BASIC_TOKEN>"
# → Retorna access_token válido com scope "read write"

# Funciona (478 alunos):
curl "https://developers.hotmart.com/club/api/v1/users?subdomain=proalt&max_results=1" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# Vazio (mesmo Club no painel, 15 produtos):
curl "https://developers.hotmart.com/club/api/v1/users?subdomain=michamenezes&max_results=10" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
# → {"items":{},"page_info":{"total_results":0,"results_per_page":0}}
```

Obrigado pela ajuda — preciso disso pra confirmar acesso à área de membros de alunos via API.

---

## Anexar no chamado (se pedirem)

- Print: tela "Configurações → Informações gerais" do Club `turbo-x` (URL personalizada `hotmart.com/club/turbo-x`)
- Print: tela "Configurações → Ferramentas" do Club `turbo-x` (mostra Pixel/Tutor/Email/PWA mas NÃO mostra config de API)
- Print: lista de Hotmart Clubs da conta (mostra 8+ Clubs, incluindo Micha Menezes 15 produtos)

---

## Onde abrir o chamado

1. https://app.hotmart.com → suporte (canto inferior direito, ícone de chat)
2. Categoria: "Hotmart Developers / API / Integração"
3. Anexa os 3 prints

Resposta esperada: 24-72h pelo chat do suporte.
