# Mission Control — Pinguim

Painel central de gerência da Pinguim: **Cérebros por produto** (Elo, ProAlt, Taurus, Lira, Orion + empresa) + agentes + squads + crons + skills.

Inspirado no Dona System (Isis Moreira) e no Second Brain (Bruno Okamoto). Evolução: **1 Cérebro por produto**, não um só.

---

## O que é

- **Cérebros** — corpo vivo de conhecimento por produto (contexto + skills + rotinas). Os agentes consultam antes de agir.
- **Operação** — Kanban ao vivo das tasks com sidebar de agentes e live feed.
- **Squads** — mini-agências por caso de uso (Suporte Operacional, Low Ticket, High Ticket).
- **Crons** — jobs agendados no Supabase (`pg_cron`). Rotinas contínuas: varrer Discord/WhatsApp, consolidar memória noturna.
- **Skills** — receitas em Markdown (GSD Mode, Super Powers, criar-desafio-com-referência, etc). Portáveis entre LLMs.

Menu completo: 18 itens em 4 grupos (Visão, Produção, Sistema, Estratégia). V0 entrega 10 telas funcionais; V1 e V2 aparecem como stubs "em breve".

---

## Stack

- **Backend:** Supabase (PostgreSQL + pg_cron). Schema em `supabase/schema.sql`, seed em `supabase/seed.sql`.
- **Frontend:** HTML + Vanilla JS (sem framework pra manter simplicidade). Cliente Supabase carregado via CDN.
- **Deploy:** Vercel (configuração em `vercel.json`).
- **Scripts:** Node ESM (`.mjs`) pra imports de dados.

---

## Como rodar localmente

### Opção A — offline (fallback, sem Supabase)

```bash
cd mission-control
python -m http.server 7799
# abrir http://localhost:7799
```

Sem variáveis de ambiente definidas, o painel lê os JSONs em `data/` e mostra Cérebros mockados. Útil pra desenvolver UI.

### Opção B — conectado ao Supabase

1. Copie `.env.example` pra `.env` e preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
2. No Supabase (SQL Editor), rode `supabase/schema.sql` e depois `supabase/seed.sql`.
3. Injete as env vars no HTML. Em dev local, edite `index.html` adicionando antes dos scripts:
   ```html
   <script>
     window.__ENV__ = {
       SUPABASE_URL: 'https://seu-projeto.supabase.co',
       SUPABASE_ANON_KEY: 'eyJ...'
     };
   </script>
   ```
4. Sirva com qualquer HTTP server e abra.

---

## Como fazer deploy no Vercel

```bash
cd mission-control
# pela primeira vez:
npx vercel

# commits futuros fazem deploy automático se o repo estiver conectado
```

Defina as mesmas 2 variáveis (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) no dashboard Vercel em Environment Variables. Em produção, injete-as via middleware ou edge function que gera `<script>window.__ENV__=...</script>` dinamicamente.

**Simplificação V0:** commite um arquivo `config.js` local (não-versionado) que define `window.__ENV__`. Menos seguro, mas prático pra demo interna.

---

## Importar dados reais

Após aplicar schema + seed:

### Transcrições do Elo (21 aulas já no repo)

```bash
cd mission-control
npm init -y
npm i @supabase/supabase-js
node --env-file=.env scripts/import-transcricoes-elo.mjs
```

### Material do drive do Luiz (Elo + ProAlt)

1. Coloque os arquivos em `mission-control/imports/elo/` e `mission-control/imports/proalt/` (aceita `.md`, `.txt`).
2. Rode: `node --env-file=.env scripts/import-drive-luiz.mjs`

Os PDFs precisam ser convertidos pra texto antes (usar `pdf-parse` ou manualmente). V1 suporta PDF direto.

---

## Estrutura do repositório

```
mission-control/
├── index.html                     # Shell com menu de 18 itens
├── README.md                      # este arquivo
├── AGENT-CARD-TEMPLATE.md         # Padrão de 7 campos por agente
├── CEREBRO-TEMPLATE.md            # Como montar Cérebro novo
├── brief-original.md              # Histórico (brief que originou a direção)
├── .env.example                   # Variáveis de ambiente (template)
├── .gitignore
├── vercel.json                    # Config de deploy
├── css/
│   └── style.css                  # Design System aplicado (1700 linhas)
├── js/
│   ├── app.js                     # Bootstrap + nav + orquestração
│   ├── sb-client.js               # Cliente Supabase com fallback JSON
│   ├── home.js                    # Tela Home (overview)
│   ├── cerebros.js                # Tela Cérebros (catálogo + detalhe)
│   ├── grafo.js                   # Grafo SVG dos Cérebros
│   ├── crons.js                   # Tela Crons
│   ├── skills.js                  # Tela Skills
│   └── stubs.js                   # Telas "em breve" (V1/V2)
├── supabase/
│   ├── schema.sql                 # DDL — 12 tabelas + triggers + view
│   └── seed.sql                   # 6 produtos + squads + agentes + skills + crons
├── scripts/
│   ├── import-transcricoes-elo.mjs
│   └── import-drive-luiz.mjs
├── data/                          # JSONs fake (fallback offline)
│   ├── agentes.json
│   ├── tasks.json
│   ├── squads.json
│   └── roadmap.json
├── cerebros/                      # Conteúdo real por produto
│   ├── pinguim/MAPA.md
│   ├── elo/MAPA.md + contexto/... (estrutura pronta pra preencher)
│   ├── proalt/MAPA.md + contexto/...
│   ├── taurus/MAPA.md
│   ├── lira/MAPA.md
│   └── orion/MAPA.md
├── skills-universais/
│   ├── gsd-mode.md                # Get Shit Done
│   ├── super-powers.md            # Plano + validação + proatividade
│   └── README.md
└── referencias/
    └── RESUMOS-VIDEOS.md          # Análise dos 3 vídeos de referência
```

---

## Telas (18 itens no menu)

### Visão (V0)
1. **Home** — overview: quantos Cérebros, peças, agentes, tasks, crons.
2. **Cérebros** — catálogo dos 6 Cérebros com % de preenchimento e mini-gráfico por tipo. Clicar entra na vista detalhada com toggle Grafo / Lista / Timeline.
3. **Agentes** — catálogo com cards de 7 campos (missão → métrica).
4. **Squads** — mini-agências + seus agentes.
5. **Operação** — Kanban ao vivo.

### Produção (V1/V2 — stubs)
6. Conteúdo · 7. Funis · 8. Tráfego · 9. Vendas/CRM · 10. Suporte

### Sistema
11. **Crons** (V0) · 12. **Skills** (V0) · 13. Biblioteca (V1) · 14. **Qualidade** (V0) · 15. Segurança (V1) · 16. Debug (V1)

### Estratégia (V0)
17. **Mapa** · 18. **Roadmap**

---

## Decisões de arquitetura

- **Crons no Supabase, não no OpenClaw.** Se amanhã trocarmos de ferramenta, rotinas continuam rodando.
- **Skills em Markdown no git.** Portáveis entre LLMs.
- **1 Cérebro por produto** (evolução do modelo Second Brain).
- **Canais multicanal etiquetados por origem.** Discord / WhatsApp / Telegram / upload / expert / externo / CSV.
- **Curador-agente** classifica entradas automáticas antes de arquivar no Cérebro.
- **Menu de 18 itens** inspirado no Dona System (Isis Moreira).
- **Visual:** dark `#121212` + laranja `#E85C00` + Plus Jakarta Sans (títulos) + Inter (corpo).

---

## Status atual

- ✅ Backend: schema + seed completos
- ✅ Frontend: 10 telas V0 funcionais
- ✅ Grafo visual por Cérebro (SVG nativo)
- ✅ Fallback offline (sem Supabase) pra demo local
- ✅ Scripts de import (Elo + drive Luiz)
- ✅ Deploy Vercel configurado

## Próximos passos

1. Aplicar schema/seed no Supabase do André
2. Importar transcrições e material do drive
3. Conectar URL Vercel
4. Demonstrar pros sócios
5. V1: ativar crons reais quando Pedro liberar OpenClaw
