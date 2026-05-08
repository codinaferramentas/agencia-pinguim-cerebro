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
| `GET /conectar-google` | V2.12 — página de status + botão OAuth. |
| `GET /api/health` | Checa CLI Claude |
| `GET /api/info` | Lista skills + scripts disponíveis |

## Permissões

`server-cli/.claude/settings.json` permite Bash/Read/Glob/Grep. Sem WebFetch/WebSearch (Atendente não precisa).
