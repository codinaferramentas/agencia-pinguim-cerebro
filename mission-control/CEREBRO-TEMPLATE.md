# Template — Como montar um Cérebro de Produto novo

> Cada produto da Pinguim (Elo, ProAlt, Taurus, Lira, Orion — e futuros) tem 1 Cérebro.
> Este arquivo explica a estrutura padrão. Quando cadastrar produto novo, o sistema cria essa hierarquia automaticamente.

---

## Os 3 pilares

Todo Cérebro tem 3 pastas principais (estrutura idêntica entre produtos):

```
cerebros/<produto-slug>/
├── MAPA.md                       # o que existe neste Cérebro
├── contexto/                     # PILAR 1 — conhecimento do produto
│   ├── aulas/                    # transcrições de aulas do curso
│   ├── paginas-venda/            # copys de páginas atuais e antigas
│   ├── persona.md                # avatar do aluno
│   ├── objecoes.md               # objeções comuns + respostas
│   ├── prova-social.md           # depoimentos e cases
│   ├── fontes-manual/            # sacadas de Luiz/Micha/André/Pedro
│   ├── fontes-grupos/            # varredura Discord/WA/Telegram
│   └── fontes-externas/          # referências de concorrentes
├── skills/                       # PILAR 2 — receitas específicas do produto
└── rotinas/                      # PILAR 3 — crons específicos do produto
```

---

## Peças no Cérebro

Toda peça (arquivo ou registro) tem metadados padronizados. Na UI, a tela Cérebro lê esses metadados e organiza no grafo.

**Metadados obrigatórios:**

| Campo | Descrição | Exemplo |
|---|---|---|
| `tipo` | Categoria da peça | `aula` / `pagina-venda` / `persona` / `objecao` / `depoimento` / `sacada` / `externo` / `csv` |
| `titulo` | Nome curto | "Aula 3 Mod 2 — A Escalada" |
| `origem` | De onde veio | `upload` / `lote` / `discord` / `wa` / `telegram` / `expert` / `externo` / `csv` |
| `autor` | Quem alimentou (se humano) | `Luiz` / `Micha` / `André` / `Pedro` |
| `data` | Quando entrou | ISO 8601 |
| `status_curador` | Aprovação | `aprovado` / `pendente` / `ruido` / `duplicado` |
| `peso` | Relevância (1-10) | `8` |
| `tags` | Palavras-chave | `["funil", "alta-performance", "módulo-2"]` |
| `fonte_url` | URL origem (se externa) | `https://youtube.com/...` |

---

## Conexões (grafo)

Peças podem estar conectadas entre si. Essas conexões formam o grafo visual.

Tipos de conexão:
- `responde_a` — uma aula responde a uma objeção
- `comprovada_por` — uma promessa é comprovada por um depoimento
- `alinha_com` — duas peças falam da mesma coisa
- `contradiz` — duas peças se contradizem (importante pra detectar inconsistência)
- `mesmo_modulo` — pertencem ao mesmo módulo/bloco
- `referenciada_por` — uma peça cita outra

Conexões ficam na tabela `cerebro_conexoes` do Supabase. Podem ser criadas manualmente ou inferidas pelo curador-agente.

---

## Fluxo de alimentação

Independente da origem (upload, Discord, sacada), toda entrada passa por:

1. **Ingestão** — peça entra como `pendente` no Supabase
2. **Curador-agente** (V1) — classifica como `aprovado`/`ruido`/`duplicado` e identifica o produto
3. **Publicação** — vira nó no grafo do Cérebro correto
4. **Auditoria** — registra evento em `cerebro_eventos`

No V0, sem curador-agente rodando, a aprovação é manual via UI (botão "Aprovar" na tela Cérebro).

---

## MAPA.md — obrigatório por Cérebro

Cada `cerebros/<produto>/MAPA.md` descreve em linguagem natural:
- O que o produto é
- O que o Cérebro já tem (resumo)
- O que falta pra estar "completo"
- Canais ativos de alimentação
- Última revisão

Esse arquivo é o que o AGENTE lê primeiro quando entra no Cérebro. Ele serve de bússola.

---

## Cadastrar produto novo — checklist

Ao criar produto novo pela UI ("+ Novo Produto"):
- [ ] Criar registro em `produtos` (Supabase) + `cerebros` (Supabase)
- [ ] Criar pasta `cerebros/<slug>/` com as 3 subpastas (`contexto/`, `skills/`, `rotinas/`)
- [ ] Criar as 8 subpastas de `contexto/` (aulas, paginas-venda, persona, objecoes, prova-social, fontes-manual, fontes-grupos, fontes-externas)
- [ ] Criar `MAPA.md` inicial com template
- [ ] Card aparecer na tela Cérebros com 0% de preenchimento

---

## Exemplo mínimo de MAPA.md

```markdown
# Cérebro Elo

## O que é o Elo
Programa de aceleração da Pinguim voltado pra XYZ. Ticket médio R$ X. Entrega: Y semanas.

## Estado atual do Cérebro
- 21 aulas transcritas (Mod 1 + 2 + 3 + 5 + Protocolos)
- Página de vendas atual + 2 antigas
- Persona documentada
- 8 objeções cobertas
- 14 depoimentos

## Gaps
- Mod 4 ainda não transcrito
- Persona precisa de revisão (feedback Luiz 2026-03)
- Faltam cases de sucesso recentes

## Canais ativos
- Discord #depoimentos (varredura semanal)
- WA grupo Elo alumni (varredura diária)

## Última revisão
2026-04-20 — André
```

---

Este arquivo é template. Todo Cérebro começa assim, e vai ganhando peças conforme é alimentado.
