# Book Comercial 365 — Pipeline do Consultor

> Lead compra → preenche Yay!Forms → agenda call no CloserFlow → **o Squad gera sozinho o Book do consultor** (análise de perfil IG + raio-X do cliente + munição de venda) e deixa tudo no Drive do time comercial antes da call.

Status: **EM PRODUÇÃO** desde 16/07/2026 · disparo por evento (triggers) + varredura pg_cron 15min · custo ~R$1,50/lead · ~2min por book com PDF automático

## Fluxo

```
Yay!Forms ──webhook──> Edge book-lead-form ──> pinguim.book_leads_form
                                                      │ (match email → telefone)
CloserFlow (public.bookings, evento comercial-365) ───┤ SOMENTE LEITURA
                                                      ▼
triggers (INSERT booking confirmado / INSERT formulário) + pg_cron */15min (varredura)
        └──> Edge book-comercial-worker (1 lead por invocação, checkpoint por etapa)
   ├─ a. casa booking + formulário (nicho, faturamento)
   ├─ b. tool-analise-perfil-ig  (Apify + Whisper + gpt-4o — motor existente)
   ├─ c. tool-consultar-pessoa (Hotmart/Clint/ProAlt/Elo/Sirius/boleto)
   │     + tool-buscar-prova-social (Elo, Lyra, ProAlt, Taurus, desafios)
   │     + gpt-4o → munição (produto-alvo Elo|Lyra, cases do nicho, roteiro, objeções)
   ├─ d. render 2 HTMLs pele "elo." (BOOK CONSULTOR + ANALISE CLIENTE)
   ├─ e. Storage book-html (link renderizável) + PDF (opcional, ver abaixo)
   ├─ f. Drive "Hub Comercial": `Nome - Telefone - DD-MM-AAAA - BOOK CONSULTOR.*`
   └─ g. planilha "Comercial 365 — Controle de Books" (upsert por booking_id, col O)
```

## Regra-mestra do produto

**Cliente enxerga o problema; consultor entrega a solução na call.** A ANALISE CLIENTE (DESLIGADA por padrão — religa com book_config.gerar_cliente=sim; comercial não entrega material pro lead) não contém: bio sugerida/variações, recomendações por post, identidade ideal, transcrições, playbook, raio-X, munição. Isso vive só no BOOK CONSULTOR (blocos pretos "⚡ Munição do consultor").

## Peças

| Peça | Onde |
|---|---|
| Endpoint formulário | Edge `book-lead-form` (`--no-verify-jwt`, token `BOOK_FORM_TOKEN` no cofre, query `?t=`) |
| Worker | Edge `book-comercial-worker` (auth `requireAuthTool`) |
| Renderizadores | `book-comercial-worker/render-{shared,book,cliente}.ts` |
| Tabelas | `pinguim.book_leads_form`, `pinguim.book_analises` (status/etapa/checkpoints), `pinguim.book_config` |
| Bucket | `book-html` (público, caminho com UUID do booking) |
| Disparo | triggers `tr_book_worker_booking` (public.bookings) e `tr_book_worker_form` (book_leads_form) → `pinguim.book_disparar_worker()`; varredura cron job 38 `*/15 * * * *` |
| Planilha | id em `book_config.sheet_id` (pasta Hub Comercial `1Uaz2SA2ZKQNloDE-02DcD_lYuImEmrHQ`) |
| Google | conexão `ferramenta@agenciapinguim.com` via `_shared/oauth-google.ts` |

## Config (pinguim.book_config)

- `sheet_id` — planilha de controle
- `drive_folder_id` — pasta Hub Comercial
- `pdf_endpoint` / `pdf_token` — serviço HTML→PDF (**opcional**; sem ele o pipeline sobe HTML renderizável e segue o jogo)

## PDF (ATIVO desde 17/07/2026)

Função `mission-control/api/html-para-pdf.js` no MESMO projeto Vercel do site (deploy via integração Git — sem token). Chromium via `@sparticuz/chromium-min` v149 + pack tar do release (ESM: usar `import()` dinâmico). Recebe `{url}` restrita ao Storage do Pinguim OS + header `x-pdf-token` (env `PDF_TOKEN` no Vercel). Config no worker: `book_config.pdf_endpoint` / `pdf_token`. Cold ~11s, warm ~5s.

⚠️ Lições Vercel deste projeto: (1) runtime Fluid EXIGE ≥1 env var no projeto, senão TODAS as funções morrem com FUNCTION_INVOCATION_FAILED (EnvFileReadError); (2) bloco functions.maxDuration no vercel.json também matava a invocação neste plano; (3) health check: /api/ping2.

## Operação

- Reprocessar um lead: `POST /functions/v1/book-comercial-worker` body `{"booking_id":"...","forcar":true}` (Bearer service_role)
- Falha: 3 tentativas (erro determinístico — perfil privado/inexistente — esgota na hora) → linha "Falhou" na planilha + `error_message` na tabela
- Cancelamento: worker confere `bookings.status` na hora de processar; cancelado não gera book
- Idempotência: upsert por `booking_id` em tudo (tabela, Drive por nome, planilha col O)
- Coluna "Observações do comercial" (N) nunca é sobrescrita pelo robô

## Regras respeitadas

- Tabelas do CloserFlow (`public.*`): **somente leitura**, sem FK nossa apontando pra lá
- Nunca exibir "pior post" (é "post de menor performance"); valores de compras discretos no raio-X
- Depoimentos: só os reais dos cérebros (`tipo='depoimento'`) — Taurus 56, Elo 18, ProAlt 11, Lyra 8
