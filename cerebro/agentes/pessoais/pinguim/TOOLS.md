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

Quando o sócio pede "encontra arquivo X", "procura no Drive", "busca documento Y", o Atendente tem acesso ao Google Drive (read-only) do sócio que conectou OAuth em `/conectar-google`.

| Tool | O que entrega | Como acessar |
|---|---|---|
| 📂 **Drive busca** | Arquivos do Drive (Docs, Sheets, PDFs, etc) com link clicável + dono + data de modificação | `bash scripts/buscar-drive.sh "<query>" [pageSize]` |

**Quando usar `buscar-drive.sh`:**
- Sócio pede "encontra o arquivo da copy do Elo", "procura o pitch do Pedro", "lista os contratos de 2026", "tem algum doc sobre X no Drive?"
- Verbo + objeto que sugere arquivo digital

**Quando NÃO usar:**
- Pedido criativo (montar copy, parecer, etc) — vai pro pipeline criativo normal
- Pergunta factual sobre produto/sistema — usa Cérebro
- Pedido de agenda — vai pra `agenda-do-socio.sh` quando estiver implementado (Fase 3)

**Se Drive não estiver conectado:** o script retorna mensagem honesta tipo "GAP: Google nao conectado". Nesse caso, dizer ao sócio: "Drive ainda não está conectado pra você. Acesse `http://localhost:3737/conectar-google` pra autorizar."

**Escopo atual:** read-only (`drive.readonly`). Editar arquivo virá em Fase 4 com confirmação humana.

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
| `GET /conectar-google` | V2.12 — página de status + botão OAuth. |
| `GET /api/health` | Checa CLI Claude |
| `GET /api/info` | Lista skills + scripts disponíveis |

## Permissões

`server-cli/.claude/settings.json` permite Bash/Read/Glob/Grep. Sem WebFetch/WebSearch (Atendente não precisa).
