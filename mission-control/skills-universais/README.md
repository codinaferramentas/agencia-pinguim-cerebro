# Skills Universais

Skills que funcionam pra qualquer agente, independente de produto.

## Como usar

1. Escreva a skill em Markdown com frontmatter (`slug`, `nome`, `categoria`, `universal: true`, `versao`).
2. Suba pro Supabase via `scripts/import-skills.mjs` (V0).
3. A skill aparece na tela **Skills** do Mission Control.
4. Agente a carrega junto com SOUL no startup.

## Skills criadas

- [`gsd-mode.md`](gsd-mode.md) — Get Shit Done: executar direto, sem pedir confirmação
- [`super-powers.md`](super-powers.md) — Plano explícito + validação + proatividade

## Skills planejadas pro V0 (seed no `seed.sql`)

- `criar-desafio-com-referencia` — analisa material externo e adapta pro produto
- `gerar-copy-pagina-de-vendas` — cria página 12 dobras do Cérebro
- `responder-objecao-aluno` — busca objeção similar no Cérebro
- `produzir-carrossel` — carrossel Instagram do Cérebro
- `briefing-pre-call` — lead + histórico → briefing closer
- `transcrever-video-youtube` — URL → Whisper → Cérebro
- `importar-csv` — CSV genérico → peças no Cérebro
- `curador-classificar` — classifica peça nova + identifica produto

Essas vão ser escritas em Markdown nas próximas iterações. Os metadados já estão no Supabase (seed).

## Padrão de arquivo

Frontmatter YAML no topo com:
```yaml
---
slug: nome-slug-sem-espaco
nome: Nome em Português
categoria: operacional | copy | suporte | comercial | ingestao | curadoria | ...
universal: true | false
versao: v1.0
cerebro: pinguim | elo | proalt | ... (se não-universal)
---
```

Conteúdo em Markdown explicando: Quando acionar / Instruções / Anti-padrões / Como medir / Exceções.
