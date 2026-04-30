# TOOLS.md — Persona Pinguim

## Ferramentas ativas
- **Supabase RPC `buscar_chunks_semantico`** — retrieval vetorial sobre `cerebro_fontes_chunks`
- **OpenAI Chat Completions** — `gpt-4o-mini` com `tool_choice` forçado
- **OpenAI Embeddings** — `text-embedding-3-small` (usado pra embedar a query de retrieval)

## Ferramentas planejadas
- **Filtro por tipo de fonte no retrieval** — hoje o RPC busca por cérebro inteiro; no futuro, adicionar parâmetro `tipos_preferidos` pra priorizar depoimentos/objeções ao gerar blocos emocionais.
- **Diff visual entre versões** — quando UI da Persona evoluir, mostrar o que mudou entre v2 e v3.

## Integrações (canais)
- **Painel Mission Control** — tela dedicada `/personas/<slug>` com geração, histórico e edição.
- **Outros agentes** (futuro) — qualquer agente pode consultar a última versão da persona via SELECT direto em `pinguim.personas WHERE cerebro_id=X ORDER BY versao DESC LIMIT 1`.
