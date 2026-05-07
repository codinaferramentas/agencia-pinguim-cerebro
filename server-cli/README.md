# Atendente Pinguim — runtime CLI local (V1)

Atendente Pinguim rodando via `claude` CLI na sua máquina, usando **sua assinatura Claude Max** (login OAuth) — token externo zero.

## Pré-requisitos (1 vez por máquina)

```bash
# 1. Node 18+ (se não tem)
node --version

# 2. Instalar Claude Code CLI globalmente
npm install -g @anthropic-ai/claude-code

# 3. Login Max (abre browser)
claude login

# 4. Confirmar que está autenticado
claude --version
echo "Diga ola" | claude -p
```

## Rodando o servidor

```bash
cd server-cli
npm install   # instala express (1 vez)
node index.js
```

Saída esperada:
```
============================================================
  Atendente Pinguim — runtime CLI local
============================================================
  Porta:   3737
  Chat:    http://localhost:3737
  Health:  http://localhost:3737/api/health
  Info:    http://localhost:3737/api/info
```

Abra **http://localhost:3737** no navegador. Chat funcionando.

## Estrutura

```
server-cli/
├── CLAUDE.md                    # System prompt (anatomia do Atendente)
├── index.js                     # Express porta 3737
├── package.json
├── public/
│   └── index.html               # Chat HTML
├── .claude/
│   ├── settings.json            # Permissões (Bash, Read, Glob, Grep)
│   └── skills/                  # 46 skills (symlink ou cópia de cerebro/skills/)
└── scripts/                     # 1 script por tool — chamados via Bash pelo CLI
    ├── buscar-cerebro.sh
    ├── buscar-persona.sh
    ├── buscar-skill.sh
    ├── buscar-clone.sh
    └── buscar-funil.sh
```

## Como funciona

1. Usuário abre http://localhost:3737 e digita mensagem
2. Express envia `POST /api/chat` com a mensagem + histórico
3. Express spawna `claude -p --allowedTools Bash,Read,Glob,Grep` no diretório `server-cli/`
4. Claude CLI lê automaticamente o `CLAUDE.md` (system prompt) e descobre as 46 skills
5. Quando precisa consultar Cérebro/Persona/Skill/Clone/Funil, executa script via Bash
6. Scripts fazem `curl` em Edge Functions Supabase existentes (banco fica intacto)
7. Claude monta resposta e retorna pra Express, que retorna pro chat

## V1 vs V2

**V1 (esta versão):** prova de pipeline. Conversa direta com o Atendente.
- ❌ Sem EPP (Verifier + Reflection)
- ❌ Sem delegar-chief (não monta página de venda completa ainda)
- ❌ Sem feedback humano persistido
- ❌ Histórico em memória (some quando reinicia)

**V2 (próximo):**
- ✅ EPP completo em camada de orquestração no Express
- ✅ Subagents/Chiefs também via CLI (Claude Code suporta nativo)
- ✅ Histórico persistido em Supabase
- ✅ Feedback humano (👍/👎/✏️) com aprendizado vinculado

## Endpoints

- `GET /` — chat HTML
- `POST /api/chat` — `{ message, thread_id? }` → `{ content, duracao_s }`
- `GET /api/health` — testa se CLI responde
- `GET /api/info` — lista skills + scripts disponíveis

## Troubleshooting

### "spawn claude ENOENT"
CLI não está no PATH. Verificar:
```bash
which claude
# Se vazio:
npm install -g @anthropic-ai/claude-code
```

### "cannot launch inside another Claude Code session"
Variável `CLAUDECODE` setada. O `index.js` já passa `CLAUDECODE: ''` no env do spawn. Se persistir, verificar shell do sistema.

### Resposta demora muito (>2 min)
- Em geral resposta é 5-30s
- Se travar, verificar `/api/health`
- Modelo muito grande pode estourar timeout (240s default)

### Login Max expirou
```bash
claude login
```

## Memórias relacionadas

- `project_runtime_claude_cli_local.md` — decisão arquitetural completa
- `project_anatomia_agente_pinguim.md` — anatomia que vive no `CLAUDE.md`
- `project_skills_handoff_pausa_2026_05_07.md` — estado das 46 skills
