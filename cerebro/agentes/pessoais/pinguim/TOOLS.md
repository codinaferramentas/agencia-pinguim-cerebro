# TOOLS.md — Atendente Pinguim

## Anatomia das 5 fontes vivas (Pinguim canônico)

Todo agente Pinguim consulta 5 fontes em runtime. O Atendente tem ferramentas pra cada uma:

| Fonte | O que entrega | Como acessar |
|---|---|---|
| 🧠 **Cérebro** | Aulas, depoimentos, oferta do produto | `bash scripts/buscar-cerebro.sh <produto-slug> "<query>"` |
| 👤 **Persona** | Dossiê 11 blocos do comprador | `bash scripts/buscar-persona.sh <produto-slug>` |
| 🛠 **Skill** | Receita ("como fazer X") | `bash scripts/buscar-skill.sh "<query>"` |
| 👥 **Clone** | Voz de mestre (Hormozi, Halbert, etc) | `bash scripts/buscar-clone.sh <clone-slug> "<query>"` |
| 🎯 **Funil** | Etapas do funil ativo | `bash scripts/buscar-funil.sh <produto-slug>` |

## Tools de produtividade (V2.12 — Squad Operacional Google)

Quando o sócio pede operação no Drive (buscar, ler, editar arquivo), o Atendente tem acesso ao Google Drive completo (`drive` scope: ler+editar+criar+deletar) do sócio que conectou OAuth em `/conectar-google`.

| Tool | O que faz | Como acessar |
|---|---|---|
| 📂 **Drive busca** | Lista arquivos do Drive por nome+conteúdo (Docs, Sheets, PDFs, Pastas) com link clicável + dono + data | `bash scripts/buscar-drive.sh "<query>" [pageSize]` |
| 📖 **Drive ler** | Lê conteúdo: Doc vira texto, Sheet vira tabela markdown (com letras de coluna A/B/C), PDF devolve metadata+link | `bash scripts/ler-drive.sh <fileId> [aba\|abas] [range]` |
| ✏️ **Drive editar** | Edita planilha: célula, range ou append. **EXIGE confirmação humana NO CHAT antes** (ver AGENTS.md → E3) | `bash scripts/editar-drive.sh <op> <fileId> <aba> <args...>` |

**Exemplos práticos:**

```bash
# Buscar arquivo
bash scripts/buscar-drive.sh "copy do Elo"

# Listar abas de uma planilha
bash scripts/ler-drive.sh 1AbCxyz... abas

# Ler aba específica e range
bash scripts/ler-drive.sh 1AbCxyz... "Página1" "A1:F50"

# Ler arquivo (auto-detecta tipo Doc/Sheet/PDF)
bash scripts/ler-drive.sh 1AbCxyz...

# Editar célula B7 (após confirmação do sócio no chat)
bash scripts/editar-drive.sh celula 1AbCxyz... "Página1" "B7" "arquivo encontrado"

# Editar range A1:B2 com matriz de valores
bash scripts/editar-drive.sh range 1AbCxyz... "Página1" "A1:B2" '[["x","y"],["a","b"]]'

# Adicionar nova linha ao final
bash scripts/editar-drive.sh append 1AbCxyz... "Página1" '[["nova linha","col2","col3"]]'
```

**Fluxo padrão de edição (NUNCA pular):**
1. `buscar-drive` → acha o arquivo
2. `ler-drive` → confirma layout (aba, coluna, valor atual)
3. **MOSTRA PLANO + PEDE "sim/não" no chat**
4. Só após "sim" explícito → `editar-drive`

**Se Drive não estiver conectado:** scripts retornam "GAP: Google nao conectado". Nesse caso, dizer ao sócio: "Drive ainda não está conectado pra você. Acesse `http://localhost:3737/conectar-google` pra autorizar."

**Escopo atual:** completo (`drive` ler+editar+criar+deletar) — confirmação humana fica NO CHAT, não no consentimento OAuth.

**Não implementado nesta versão:**
- Editar Doc (texto formatado) — só planilha
- Parser de texto de PDF — devolve metadata + link
- Office bruto (Excel `.xlsx`, Word `.docx`) — devolve metadata + link, sem leitor estruturado
- Calendar (Fase 3 + Fase 5)

## Tools de Gmail (V2.13 — escopo `gmail.modify`)

Quando o sócio pede operação no Gmail dele (listar/ler/responder), o Atendente tem acesso completo: ler, redigir, enviar, modificar labels, arquivar (sem deletar permanentemente).

| Tool | O que faz | Como acessar |
|---|---|---|
| 📥 **Gmail listar** | Lista emails (default `in:inbox`, max 10). Aceita query Gmail (`is:unread`, `from:X`, `newer_than:3d`, etc) | `bash scripts/gmail-listar.sh ["query"] [pageSize]` |
| 📧 **Gmail ler** | Lê email completo (corpo + headers + labels). Texto truncado em 8000 chars | `bash scripts/gmail-ler.sh <messageId>` |
| ✉️ **Gmail responder** | Envia email (responder thread ou novo). **EXIGE confirmação humana NO CHAT antes** (ver AGENTS.md → E6) | `bash scripts/gmail-responder.sh reply <msgId> "<corpo>"` ou `... novo "<para>" "<assunto>" "<corpo>"` |
| 🏷 **Gmail modificar** | Marca lido/star/arquivar/spam/lixo. **arquivar/spam/lixo são destrutivos — confirmação NO CHAT** | `bash scripts/gmail-modificar.sh <msgId> <op>` |

**Exemplos práticos:**

```bash
# Inbox padrão (10 últimos)
bash scripts/gmail-listar.sh

# Não-lidos
bash scripts/gmail-listar.sh "is:unread"

# Email específico de fulano
bash scripts/gmail-listar.sh "from:fulano@x.com" 5

# Ler email completo
bash scripts/gmail-ler.sh 18a3b2c1d4e5f6

# Responder (após confirmação no chat)
bash scripts/gmail-responder.sh reply 18a3b2c1 "Obrigado pelo retorno. Fechado."

# Email novo (após confirmação no chat)
bash scripts/gmail-responder.sh novo "fulano@x.com" "Sobre nosso call" "Vamos amanhã 15h?"

# Marcar como lido
bash scripts/gmail-modificar.sh 18a3b2c1 lido

# Arquivar (após confirmação)
bash scripts/gmail-modificar.sh 18a3b2c1 arquivar
```

**Sintaxe Gmail query** (https://support.google.com/mail/answer/7190):
- `is:unread` / `is:read` / `is:starred`
- `from:email@x.com` / `to:email@x.com`
- `subject:"X"` (com aspas)
- `newer_than:3d` / `older_than:1m` / `after:2026/01/01`
- `has:attachment`
- `label:INBOX` / `label:SPAM` / `-label:TRASH`

**Fluxo padrão de envio/modificação destrutiva (NUNCA pular):**
1. `gmail-listar` → acha o email
2. `gmail-ler` → confirma contexto (de quem é, sobre o quê)
3. **MOSTRA PLANO + PEDE "sim/não" no chat** (mostra para/assunto/preview do corpo, ou op de modificação)
4. Só após "sim" explícito → `gmail-responder` ou `gmail-modificar`

**Não implementado nesta versão:**
- Anexos (enviar arquivo no email)
- Email com HTML (só plain text por enquanto)
- Filtros automáticos (criar regra "todos do X vão pra label Y")

## Tools de Calendar (V2.14 Fase 1.7 — escopo `calendar`, READ-only)

Quando o sócio pede pra ler agenda dele (eventos do dia, próxima semana, reunião quarta), o Atendente lê o Google Calendar dele. **Cada sócio vê APENAS a agenda dele** — refresh_token isolado por cliente_id no cofre.

**ESTA versão é READ-only.** Criar/editar/cancelar evento é responsabilidade da **squad operacional `hybrid-ops-squad`** em frente futura V2.15.

| Tool | O que faz | Como acessar |
|---|---|---|
| 📅 **Calendar listar (eventos)** | Lista eventos numa janela (default `primary`, max 50). Aceita janelas pré-definidas ou ISO custom | `bash scripts/calendar-listar.sh [hoje\|amanha\|proximos7] [calendarId]` |
| 📚 **Calendar listar (calendários)** | Descobre calendários do sócio (primary + secundários). Útil quando há mais de um calendário ativo | `POST /api/calendar/listar-calendarios` (sem script — usar via `curl` ou Atendente) |
| 🔍 **Calendar ler evento** | Detalhe completo de um evento específico (descrição, local, todos os participantes) | `POST /api/calendar/ler-evento` com `{calendarId, eventId}` |

**Exemplos práticos via script:**

```bash
# Eventos de hoje (primary, BRT 00:00 → 23:59)
bash scripts/calendar-listar.sh hoje

# Eventos de amanhã
bash scripts/calendar-listar.sh amanha

# Próximos 7 dias (now → +7d)
bash scripts/calendar-listar.sh proximos7

# Próximos 7 dias num calendário específico (ex: Feriados Brasil)
bash scripts/calendar-listar.sh proximos7 pt-br.brazilian#holiday@group.v.calendar.google.com
```

**Exemplos via endpoint HTTP** (Atendente usa quando precisa de janela custom):

```bash
# Janela custom: quarta-feira 13/05 BRT inteira
curl -s -X POST http://localhost:3737/api/calendar/listar-eventos \
  -H "Content-Type: application/json" \
  -d '{"calendarId":"primary","timeMin":"2026-05-13T03:00:00Z","timeMax":"2026-05-14T02:59:59Z"}'

# Listar calendários disponíveis (descobrir secundários)
curl -s -X POST http://localhost:3737/api/calendar/listar-calendarios -d '{}'
```

**Resposta padrão de `listar-eventos`:**

```json
{
  "ok": true,
  "calendario_id": "primary",
  "eventos": [
    {
      "id": "...",
      "titulo": "Daily CS (Discord)",
      "hora_inicio_br": "09:30",
      "hora_fim_br": "10:00",
      "duracao_min": 30,
      "qtd_participantes": 11,
      "link_meet": "https://meet.google.com/ney-srqr-eba",
      "dia_inteiro": false,
      "recorrente": true
    }
  ],
  "total": 1
}
```

**Janelas BRT pré-calculadas (helpers do wrapper):**

```js
const cal = require('./lib/google-calendar');
const hoje = cal.janelaHojeBRT();     // {inicio_iso, fim_iso, data_br}
const amanha = cal.janelaAmanhaBRT(); // idem pra amanhã
```

**Não implementado nesta versão (vai pra squad `hybrid-ops-squad` em V2.15):**
- Criar evento novo
- Alterar título/horário/participantes de evento existente
- Cancelar/deletar evento
- Aceitar/recusar convite
- Bloquear horário (focal time / "não disponível")

**Quando o agente precisar criar evento, declarar honesto:** "Pra criar/alterar evento ainda não tenho a Skill operacional pronta — frente V2.15 (squad `hybrid-ops-squad`). Por enquanto só consigo LER agenda."

## Tools de Discord (V2.14 Frente B — bot READ-only)

Bot **Pinguim Bot** conecta no Gateway WebSocket do Discord no boot do server-cli e salva mensagens em `pinguim.discord_mensagens` em **tempo real**. Sem cron, sem polling — stream contínuo.

**Token + Server ID** vivem no cofre (`DISCORD_BOT_TOKEN` + `DISCORD_GUILD_ID`).

| Tool | O que faz | Como acessar |
|---|---|---|
| 📊 **Discord status** | Healthcheck do bot (conectado? quantas guilds? quantas mensagens ingeridas?) | `GET /api/discord/status` |
| 💬 **Discord listar 24h** | Mensagens das últimas N horas + `resumo_canais` (canal + qtd msg + autores distintos) | `POST /api/discord/listar-24h` body `{horas?, incluir_bots?, canal_id?}` |
| 🔍 **Discord buscar** | Busca ILIKE por palavra-chave (default últimos 7 dias) | `POST /api/discord/buscar` body `{query, horas?, limite?}` |
| ⏪ **Discord backfill** | Backfill histórico via REST API (uso pontual após reinicio) | `POST /api/discord/backfill` body `{horas?, maxPorCanal?}` |

**Exemplos via curl:**

```bash
# Status do bot
curl -s http://localhost:3737/api/discord/status

# Mensagens últimas 24h (sem bots)
curl -s -X POST http://localhost:3737/api/discord/listar-24h \
  -H "Content-Type: application/json" \
  -d '{"horas":24,"incluir_bots":false}'

# Buscar quem citou "Lyra" últimos 7 dias
curl -s -X POST http://localhost:3737/api/discord/buscar \
  -H "Content-Type: application/json" \
  -d '{"query":"Lyra","horas":168}'

# Backfill 48h (uso 1x após boot, se quiser cobrir downtime)
curl -s -X POST http://localhost:3737/api/discord/backfill \
  -H "Content-Type: application/json" \
  -d '{"horas":48,"maxPorCanal":100}'
```

**Não implementado nesta versão (vai pra `hybrid-ops-squad` em V2.15):**

- Enviar mensagem em canal
- Responder thread / mention
- Adicionar reação (👍 etc)
- Criar canal / thread
- Mudar permissão de canal

## Tool de WhatsApp ENVIO pra número externo (V2.14 D)

A instância Evolution "Agente Pinguim" (5511933397541) pode enviar **texto** pra qualquer número de WhatsApp. Camada B anti-duplicação cobre (5min, igual Gmail).

| Tool | O que faz | Como acessar |
|---|---|---|
| 💬 **WhatsApp enviar** | Envia mensagem de texto pra qualquer número. **EXIGE confirmação humana NO CHAT antes** (ver AGENTS.md → E9) | `bash scripts/whatsapp-enviar.sh "<numero>" "<texto>" [forcar]` |

**Exemplos práticos:**

```bash
# Envio simples (após confirmação no chat)
bash scripts/whatsapp-enviar.sh "5511984290116" "Oi Katia, tudo bem?"

# Forçar reenvio (bypass anti-duplicacao — só após sócio confirmar explícito)
bash scripts/whatsapp-enviar.sh "5511984290116" "Oi Katia, tudo bem?" forcar
```

**Fluxo padrão (NUNCA pular):**
1. Investiga (se faltou número/texto, perguntar)
2. **MOSTRA PREVIEW + PEDE "sim/não" no chat**
3. Só após "sim" explícito → roda script

**Limites desta versão:**
- Só TEXTO (não áudio/imagem/vídeo pra número externo)
- Sem agenda de contatos (sócio fornece o número)

**Quando agente precisar enviar mensagem no Discord, declarar honesto:** "Pra enviar/responder no Discord ainda não tenho a Skill operacional pronta — frente V2.15 (squad `hybrid-ops-squad`). Por enquanto só consigo LER."

**Cofre (no servidor):**

- `DISCORD_BOT_TOKEN` — token do bot "Pinguim Bot" (App ID `1502712279907696801`)
- `DISCORD_GUILD_ID` — Server ID do "Agência Pinguim" (`1083429941300969574`). Bot ingere SÓ mensagens dessa guild (filtro hard).

**Permissão por canal:** em canais privados (suporte, dev, restritos a role), o admin precisa adicionar Pinguim Bot manualmente com "View Channel" + "Read Message History". Em canais públicos do servidor, bot lê automaticamente.

## Tools de Hotmart (V2.14 D — Categoria G)

A Pinguim vende pela Hotmart. Esta categoria cobre TODA a operação Hotmart via API + tabela auxiliar `pinguim.acessos_pendentes` pra casos de Princípia Pay (cadastro manual humano).

**Camada híbrida** (`lib/hotmart-hibrido.js`): leitura tenta 2º Supabase primeiro (tabelas `hotmart_transactions`/`hotmart_buyers`/`hotmart_products` populadas pelo webhook do Pedro) — se vazio, fallback API direta Hotmart. Escrita SEMPRE API direta + Camada B anti-duplicação.

| Tool | O que faz | Como acessar |
|---|---|---|
| 🔍 **G1 Consultar comprador** | Histórico completo de compras por email (todos produtos, do primeiro ao último) | `bash scripts/hotmart-consultar.sh "<email>"` |
| 📊 **G2 Listar vendas** | Vendas por período BRT, opcional filtro produto/status/moeda | `bash scripts/hotmart-listar-vendas.sh <start> <end> [produto] [status] [moeda]` |
| ↩️ **G3 Listar reembolsos** | Refunds por período BRT, com receita perdida | `bash scripts/hotmart-listar-reembolsos.sh <start> <end> [moeda]` |
| ✅ **G4 Verificar assinatura** | Se aluno tem assinatura ATIVA (pagando recorrência). NÃO confunde com acesso ao Club | `bash scripts/hotmart-verificar-assinatura.sh <email> [produto_id]` |
| ✅ **G4b Verificar ACESSO Club** | Estado real de acesso (ACTIVE/INACTIVE), último login, primeiro acesso, engajamento, progresso por produto. Itera nos Clubs cadastrados em `pinguim.hotmart_clubs`. V2.14 D 2026-05-10 ATIVO | `bash scripts/hotmart-verificar-acesso-membros.sh <email>` |
| ✅ **G4c Cadastrar Club** | Adiciona subdomain de Club novo em `pinguim.hotmart_clubs`. Valida via API antes de gravar. | `bash scripts/hotmart-cadastrar-club.sh <subdomain> [produto_nome] [produto_id]` |
| 💸 **G5 Aprovar refund** | Reembolsa venda. **EXIGE confirmação humana NO CHAT** + Camada B janela 60min | `bash scripts/hotmart-reembolsar.sh <transaction> [forcar]` |
| ❌ **G6 Cancelar assinatura** | Cancela. **EXIGE confirmação NO CHAT** + Camada B 30min | `bash scripts/hotmart-cancelar-assinatura.sh <subscriber_code>` |
| 🎟 **G7 Criar cupom** | Discount DECIMAL 0-1 (0.10=10%). **EXIGE confirmação NO CHAT** + Camada B 60min | `bash scripts/hotmart-cupom-criar.sh <product_id> <code> <discount> [start] [end] [max_uses]` |
| 📩 **G8 Acesso pendente** | Abre ticket em `pinguim.acessos_pendentes` pra suporte cadastrar aluno (Princípia Pay) | `bash scripts/hotmart-acesso-pendente.sh <email> <nome> <produto>` |

**Endpoints HTTP** (chamáveis direto se preferir):
- `POST /api/hotmart/consultar-comprador` (body: `{email}`)
- `POST /api/hotmart/listar-vendas` (body: `{start_date_brt, end_date_brt, produto_id?, status?, moeda?}`)
- `POST /api/hotmart/listar-reembolsos` (body: `{start_date_brt, end_date_brt, moeda?}`)
- `POST /api/hotmart/verificar-assinatura` (body: `{email, produto_id?}`)
- `POST /api/hotmart/verificar-acesso-membros` (body: `{email, produto_id?}`) — chamada REAL Members Area API
- `POST /api/hotmart/cadastrar-club` (body: `{subdomain, produto_id?, produto_nome?}`) — adiciona Club novo
- `GET /api/hotmart/clubs` — lista todos Clubs cadastrados
- `POST /api/hotmart/reembolsar` (body: `{transaction, forcar?}`)
- `POST /api/hotmart/cancelar-assinatura` (body: `{subscriber_code, send_mail?, forcar?}`)
- `POST /api/hotmart/reativar-assinatura` (body: `{subscriber_code, charge?}`)
- `POST /api/hotmart/mudar-dia-cobranca` (body: `{subscriber_code, due_day}`)
- `POST /api/hotmart/cupom-listar` (body: `{product_id}`)
- `POST /api/hotmart/cupom-criar` (body: `{product_id, code, discount, start_date?, end_date?, max_uses?, forcar?}`)
- `POST /api/hotmart/cupom-deletar` (body: `{coupon_id}`)
- `POST /api/hotmart/notificar-acesso-pendente` (body: `{email_aluno, produto_hotmart_nome|id, nome_aluno?, origem_pagamento?, evidencia?}`)

**Cofre Pinguim (V2.14 D — credenciais Hotmart Developers):**

- `HOTMART_CLIENT_ID` — do painel Hotmart > Ferramentas > Hotmart Credentials
- `HOTMART_CLIENT_SECRET` — idem
- `HOTMART_BASIC_TOKEN` — string base64 que aparece pronto no painel

**OAuth2 client_credentials.** Token vale 6h, wrapper renova automaticamente (refresh proativo 5min antes de expirar).

**Não implementado nesta versão (frente futura):**
- **Cadastrar aluno na área de membros via API** (Hotmart NÃO oferece — confirmado via investigação real 2026-05-10: `POST /club/api/v1/users` retorna 404 redirect `/docs/`). UI manual continua o caminho. Caso Princípia Pay passa por G8.
- Webhook real-time direto Hotmart→Pinguim (hoje vem indireto via 2º Supabase do Pedro)

## Tools de Meta Marketing API + Pages (V2.14 D — Categoria H)

A Pinguim roda anúncios na Meta (Facebook + Instagram). Esta categoria habilita **análise** de campanha, leitura de criativos, métricas, e Pages. App **Pinguim OS** no BM **Grupo Pinguim**. Token longo 60d no Cofre Pinguim.

**⚠ SEPARAÇÃO CANÔNICA DE FONTES (decisão Andre 2026-05-10):**
- **Número financeiro de gasto** (relatório, ROAS, fechar conta) → **Projeto Supabase compartilhado** (`db-dashboard.js`, Categoria F3). Única fonte canônica.
- **Análise de campanha** (criativo, copy, métrica de performance, breakdowns) → **Esta categoria H** (`/api/meta/*`).

Misturar fontes na mesma resposta = divergência de número entre canais. NUNCA fazer.

| Tool | O que faz | Como acessar |
|---|---|---|
| 📋 **H1 Listar ad accounts** | Todas ad accounts visíveis ao token (agrupadas por business + status) | `bash scripts/meta-listar-ad-accounts.sh` |
| 🎯 **H2 Listar campanhas** | Campanhas de um ad account, opcional filtro de status | `bash scripts/meta-listar-campanhas.sh <act_XXX> [status]` |
| 📊 **H3 Insights campanha** | Impressões, alcance, cliques, CTR, CPM, CPC, gasto, ações. Período preset (today/yesterday/last_7d/last_30d/etc) | `bash scripts/meta-insights-campanha.sh <campaign_id> [preset]` |
| 📘 **H4 Listar Pages** | Pages Facebook conectadas (com fan_count, followers, Instagram conectado se houver) | `bash scripts/meta-listar-pages.sh` |
| 🔍 **H5 Inspecionar token** | Validade, scopes, app, user_id. Útil pra saber quando renovar | `bash scripts/meta-inspecionar-token.sh` |

**Endpoints HTTP** (chamáveis direto):
- `POST /api/meta/listar-ad-accounts` (body vazio)
- `POST /api/meta/listar-campanhas` (body: `{ad_account_id, status?, limit?}`)
- `POST /api/meta/insights-campanha` (body: `{campaign_id, date_preset?, time_range?, level?, breakdowns?}`)
- `POST /api/meta/listar-pages` (body vazio)
- `POST /api/meta/inspecionar-token` (body vazio)
- `POST /api/meta/renovar-token` (body vazio — força refresh do token longo, persiste no Cofre)

**Cofre Pinguim (V2.14 D — credenciais Meta):**
- `META_APP_ID` — App ID do Pinguim OS (978157227940082)
- `META_APP_SECRET` — App Secret (rotacionável)
- `META_ACCESS_TOKEN` — Token longo 60d (expira 2026-07-09, refresh proativo quando faltar <7d)

**Permissões ativas:** `ads_read`, `ads_management`, `business_management`, `pages_show_list`, `pages_read_engagement`, `public_profile`.

**Multi-sócio (futuro):** estrutura `cliente_id` no Cofre já preparada. Quando Pedro/Luiz/Micha gerarem token próprio, vira `META_ACCESS_TOKEN_<slug>` por sócio. Hoje token único pertence ao André (cobre BM Grupo Pinguim inteiro).

**Não implementado nesta versão (frente V2.15 hybrid-ops-squad):**
- Criar/pausar/editar campanha, adset ou ad
- Ajustar budget em runtime
- Upload de criativo novo
- Postar/responder no Instagram orgânico (frente separada com token IG diferente — depende de cada sócio autorizar via popup Meta)
- Webhook real-time (mensagens IG, comentários novos)

## Mapeamento produto → cerebro_slug

| Sinal na pergunta | cerebro_slug |
|---|---|
| Menciona "Elo" | `elo` |
| Menciona "ProAlt" | `proalt` |
| Menciona "Lyra" | `lyra` |
| Menciona "Taurus" | `tuarus` |
| Menciona "Orion" | `orion` |
| Menciona "Lo-fi" | `desafio-de-conte-do-lo-fi` |
| Menciona "Mentoria Express" | `mentoria-express` |
| Menciona "SPIN Selling" | `spin-selling` |
| Menciona "Challenger Sale" | `challenger-sale` |
| Menciona "MEDDIC" | `meddic` |
| Menciona "Sandler" | `sandler-selling` |
| Menciona "Tactical Empathy" ou "Voss" | `tactical-empathy-voss` |

## Stack de runtime

- **LLM:** Claude CLI local (assinatura Max, login OAuth) — token externo zero
- **Backend:** Express na porta 3737 (`server-cli/index.js`)
- **Banco:** Supabase, schema `pinguim`
- **Skills:** `server-cli/.claude/skills/` (symlink pra `cerebro/skills/`)
- **Scripts shell:** `server-cli/scripts/buscar-*.sh` chamam Edge Functions Supabase

## Endpoints expostos pelo server-cli

| Endpoint | Pra quê |
|---|---|
| `POST /api/detectar-tipo` | Decide se mensagem é criativa/factual/saudação. Retorna `{tipo, subcategoria, squad_destino, squad_disponivel, anima}`. ~1ms. |
| `POST /api/pipeline-plan` | Roda Etapas 1+2 do pipeline criativo (consulta 5 fontes + decide mestres). Retorna `{plan_id, mestres_usados, ...}`. Plano cacheado TTL 5min. |
| `POST /api/chat` | Resposta principal. Aceita `plan_id` opcional pra pular consulta de fontes (V2.5). |
| `GET /api/entregaveis` | Lista entregáveis recentes (V2.7). |
| `POST /api/drive/buscar` | V2.12 — busca arquivos no Drive do sócio. |
| `POST /api/drive/ler` | V2.12 Fase 2 — lê conteúdo de Doc/Sheet/PDF. Body: `{fileId, tipo?, aba?, range?}`. |
| `POST /api/drive/editar` | V2.12 Fase 4 — edita planilha (célula/range/append). Confirmação humana é responsabilidade de quem chama. |
| `POST /api/calendar/listar-calendarios` | V2.14 Fase 1.7 — lista calendários do sócio (primary + secundários). |
| `POST /api/calendar/listar-eventos` | V2.14 Fase 1.7 — lista eventos numa janela BRT. Body: `{calendarId?, timeMin, timeMax, maxResults?}`. |
| `POST /api/calendar/ler-evento` | V2.14 Fase 1.7 — detalhe completo de um evento. Body: `{calendarId?, eventId}`. |
| `GET /api/discord/status` | V2.14 Frente B — status do bot Discord (conectado, total ingerido, guilds, ultimo erro). |
| `POST /api/discord/listar-24h` | V2.14 Frente B — mensagens das ultimas N horas. Body: `{horas?, incluir_bots?, canal_id?, limite?}`. Retorna `mensagens` + `resumo_canais`. |
| `POST /api/discord/buscar` | V2.14 Frente B — busca por palavra-chave nas ultimas N horas (default 7d). Body: `{query, horas?, limite?}`. |
| `POST /api/discord/backfill` | V2.14 Frente B — popula historico via REST API (uso pontual quando bot reinicia). Body: `{horas?, maxPorCanal?}`. |
| `POST /api/meta/listar-ad-accounts` | V2.14 D Categoria H — lista ad accounts visíveis ao token Meta. Body vazio. |
| `POST /api/meta/listar-campanhas` | V2.14 D Categoria H — campanhas de um ad account. Body: `{ad_account_id, status?, limit?}`. |
| `POST /api/meta/insights-campanha` | V2.14 D Categoria H — métricas (impressões, gasto, CTR, etc) de uma campanha. Body: `{campaign_id, date_preset?, time_range?, breakdowns?}`. |
| `POST /api/meta/listar-pages` | V2.14 D Categoria H — Pages Facebook conectadas (com info de IG conectado). Body vazio. |
| `POST /api/meta/inspecionar-token` | V2.14 D Categoria H — validade + scopes do token Meta atual. Body vazio. |
| `POST /api/meta/renovar-token` | V2.14 D Categoria H — força renovação do token longo (write-through no Cofre). Body vazio. |
| `GET /conectar-google` | V2.12 — página de status + botão OAuth. |
| `GET /api/health` | Checa CLI Claude |
| `GET /api/info` | Lista skills + scripts disponíveis |

## Permissões

`server-cli/.claude/settings.json` permite Bash/Read/Glob/Grep. Sem WebFetch/WebSearch (Atendente não precisa).
