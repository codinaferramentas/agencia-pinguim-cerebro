## Texto pronto pra colar no chat do suporte Hotmart (2026-05-11)

Cola tudo de uma vez. Se o chat tiver limite de caracteres por mensagem, quebra nos pontos marcados com `--- [QUEBRA AQUI SE PRECISAR] ---`.

---

Olá! Segue descrição precisa do problema.

**Resumo:** Tenho credencial Hotmart Developers ativa (CLIENT_ID `1d9750b7-3cbe-4343-b8a3-8f38e87f1919`) na conta Agência Pinguim (ucode `c56dc856-cba8-436a-a8bb-9a1f26df8295`). Autenticação OAuth2 client_credentials funciona normalmente, endpoints Sales/Subscriptions respondem corretos. **O problema é no endpoint `GET /club/api/v1/users`: ele retorna 200 com `total_results: 0` pra alguns Hotmart Clubs ativos da conta, enquanto funciona normal pra outros.**

**Tipo de autenticação:** OAuth2 client_credentials, scope retornado `"read write"`.
**Endpoint problemático:** `GET https://developers.hotmart.com/club/api/v1/users?subdomain=<X>`
**Status retornado:** HTTP 200 (não é 401/403/404 — é 200 com body vazio, esse é o sintoma estranho).

**Clubs que FUNCIONAM via API (confirmado em 2026-05-11):**

| subdomain | total_results |
|---|---|
| proalt | 478 |
| siriuslab | 838 |
| protocolovendaviral | 450 |
| mastermindorion | 32 |
| proaltlowticketrecorrente | 42 |
| clube6em30 | 7759 |
| taurusmentoring | 1 |
| escoladoperpetuo | 1 |

Pra esses Clubs `/club/api/v1/modules?subdomain=X` também responde normalmente.

**Clubs que NÃO funcionam (retornam vazio na mesma credencial):**

| subdomain testado | Nome no painel | Produtos no painel | total_results |
|---|---|---|---|
| michamenezes | "Micha Menezes" | 15 | 0 |
| aceleradordeperpetuo | "Acelerador de Perpétuo" | 1 | 0 |
| turbox | "Produtos Micha Menezes" (URL personalizada `turbo-x`) | 13 | 0 |

Obs: passando `subdomain=turbo-x` (com hífen, igual à URL personalizada) o CloudFront responde 200 com `location: /docs/` — slug com hífen não é reconhecido pela API.

--- [QUEBRA AQUI SE PRECISAR] ---

**Request exata:**

```http
GET https://developers.hotmart.com/club/api/v1/users?subdomain=michamenezes&max_results=10
Authorization: Bearer <access_token>
Accept: application/json
```

**Response:**
```
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 74

{"items":{},"page_info":{"total_results":0,"results_per_page":0}}
```

**Prova de que o Club existe e tem alunos:** no painel admin `https://app.hotmart.com/membership/micha-menezes/products` o Club "Micha Menezes" mostra 15 produtos ativos. Um deles é "ProAlt - Low Ticket" (ID `6811692`) com 478 alunos visíveis no painel. Quando consulto `subdomain=proalt` a API retorna esses 478 alunos. Quando consulto `subdomain=michamenezes` (que segundo o painel é o Club que contém esse mesmo produto), retorna 0.

**Comportamento esperado vs observado:**
- Esperado: `subdomain=michamenezes` retornar a lista de alunos do Club "Micha Menezes" (15 produtos, centenas de alunos somando todos).
- Observado: `total_results: 0` com `items: {}`.

**Perguntas:**

1. Por que alguns Hotmart Clubs da minha conta retornam dados via API e outros retornam vazio com a mesma credencial?
2. Existe alguma configuração no painel admin do Club ("Configurações → Ferramentas" ou outro local) que precise ser habilitada pra liberar acesso da minha credencial àquele Club específico?
3. O subdomain correto que devo passar na query é a URL personalizada visível em "Informações gerais" do Club, ou existe um identificador técnico diferente?
4. Existe limitação por idade do Club, versão da plataforma, ou tipo de Club (legacy vs nova versão) que afete o acesso via API?
5. Se for limitação de versão, existe API v2 ou endpoint alternativo pra acessar Clubs criados na versão mais recente?

--- [QUEBRA AQUI SE PRECISAR] ---

**Pra reproduzir do meu lado (lado a lado, mesma credencial, mesmo access_token):**

```bash
# 1) Pega access token (funciona — retorna token com scope "read write"):
curl -X POST "https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=1d9750b7-3cbe-4343-b8a3-8f38e87f1919&client_secret=<MEU_SECRET>" \
  -H "Authorization: Basic <BASIC_TOKEN>"

# 2) Funciona — retorna 478 alunos:
curl "https://developers.hotmart.com/club/api/v1/users?subdomain=proalt&max_results=1" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# 3) Vazio — mesmo Club no painel, 15 produtos:
curl "https://developers.hotmart.com/club/api/v1/users?subdomain=michamenezes&max_results=10" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
# → {"items":{},"page_info":{"total_results":0,"results_per_page":0}}
```

Obs: substituí o `client_secret` por `<MEU_SECRET>` pra não expor a credencial neste chat. Se precisarem do secret pra reproduzir do lado de vocês, me avisem o canal seguro pra enviar.

Preciso disso resolvido pra confirmar acesso à área de membros de alunos via API — é bloqueante pra uma integração que estamos rodando.

Obrigado!

---

## Anexos pra anexar no chamado (se pedirem)

1. Print: tela "Configurações → Informações gerais" do Club `turbo-x` (mostra URL personalizada `hotmart.com/club/turbo-x`)
2. Print: tela "Configurações → Ferramentas" do mesmo Club (mostra Pixel/Tutor/Email/PWA mas NÃO mostra config de API/acesso programático)
3. Print: lista de Hotmart Clubs da conta (mostra os 8+ Clubs, incluindo "Micha Menezes" com 15 produtos)
