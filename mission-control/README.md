# Mission Control — Pinguim

Painel central de gerência do squad de agentes de IA da Agência Pinguim.

Abre em `index.html`. Navega pelas 6 telas. Apresenta pros sócios.

---

## O que é

Painel web que responde em 10 segundos:

1. **Mapa** — o que existe no universo da Pinguim e o que já está pintado
2. **Operação** — o que tá acontecendo agora (kanban + live feed)
3. **Squads** — mini-squads ativos com seus agentes e cards de contrato
4. **Roadmap** — o que entra agora, depois, e depois de depois
5. **Evolução** — pipeline de ciclo de vida de agentes
6. **Qualidade** — latência, acerto, gargalos, alertas

---

## Como rodar

O painel usa `fetch()` pra ler JSON local, então precisa de um servidor HTTP (não funciona abrindo `index.html` direto como `file://`).

```bash
cd mission-control
python -m http.server 7788
# abre http://localhost:7788
```

Qualquer servidor estático serve (Live Server do VS Code, `npx serve`, etc.).

---

## Estrutura

```
mission-control/
├── index.html              # Shell + nav das 6 telas
├── css/
│   └── style.css           # Tokens do DESIGN_SYSTEM.md (dark + laranja + Jakarta/Inter)
├── js/
│   └── app.js              # Vanilla JS; lê JSON e renderiza as 6 telas
├── data/                   # V0: JSON fake. V1: substituído por queries Supabase.
│   ├── agentes.json        # Agentes com card de 7 campos
│   ├── tasks.json          # Tasks do kanban + live feed
│   ├── squads.json         # Mini-squads com metas e métricas
│   └── roadmap.json        # Fases + pipeline de evolução + qualidade
├── AGENT-CARD-TEMPLATE.md  # Template dos 7 campos que cada agente preenche
└── README.md
```

---

## V0 → V1: como a troca pra Supabase funciona

O `app.js` carrega os 4 JSONs via `fetch()`. Pra virar V1:

1. Sobe schema equivalente no Supabase (tabelas: `agentes`, `tasks`, `squads`, `roadmap_itens`, `logs_qualidade`)
2. Troca as 4 chamadas `loadJSON('data/…')` por `supabase.from('…').select()`
3. UI e layout não mudam

As chaves dos JSONs foram desenhadas pra mapear 1-pra-1 nas colunas da tabela Supabase — ver `AGENT-CARD-TEMPLATE.md` pra referência dos campos.

---

## Padrão visual

- Dark mode `#121212` / cards `#1A1A1A`
- Laranja `#E85C00` como identidade (status ativo, focus, logo)
- **Plus Jakarta Sans** nos títulos e nomes de agente
- **Inter** no corpo
- Cards: `rounded-xl` com borda sutil (ring-1 foreground/10)
- Botões: `rounded-lg` com feedback tátil (`active:translate-y-px`)

Fonte dos tokens: `DESIGN_SYSTEM.md` na raiz do projeto.

Inspiração de layout da tela Operação: print do Mission Control do OpenClaw (Teja) — sidebar de agentes + kanban + live feed.

---

## Canais de acionamento

Os agentes são acionados por **Discord, Telegram e WhatsApp** (via OpenClaw). O painel **não é chat** — é gerência.

No V2 o painel ganha ações: editar SOUL de agente, clonar mente, pausar agente. Botões já aparecem nos cards da tela Squads, mas sem lógica implementada no V0.

---

## Lógica de crescimento

Resolve dor latente (primeiro: Suporte Operacional Pinguim) → produção → pinta o pedaço do Mapa → próximo squad (Low Ticket) → pinta mais → até cobrir todo o mapa de 30 squads / 211 agentes.
