# Pinguim Ingest Engine

Motor de ingestão em massa. Recebe um `.zip` (ou pasta) com material bagunçado de um produto, classifica automaticamente cada arquivo, vetoriza via OpenAI e alimenta o Cérebro no Supabase.

## Instalação (uma vez só)

```bash
cd ingest-engine
cp .env.example .env
# edite .env com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + OPENAI_API_KEY

npm install
```

## Aplicar schema no Supabase

No dashboard do Supabase → SQL Editor, rodar **nesta ordem**:

1. `../mission-control/supabase/schema.sql`        (schema base — se ainda não rodou)
2. `../mission-control/supabase/schema-002-rag.sql` (tabelas de RAG)

Antes de `schema-002-rag.sql`, habilitar a extensão **vector** em Database → Extensions.

## Testar conexões

```bash
npm run test-env
```

Se passar nos 3 checks (Supabase, pgvector, OpenAI embeddings), segue.

## Criar produtos + cérebros base

```bash
npm run setup-elo
```

Cria 6 produtos padrão no banco (pinguim, elo, proalt, taurus, lira, orion) com seus cérebros. Idempotente.

## Rodar ingestão

```bash
npm run ingest -- "C:\Users\andre\Downloads\elo-tudo.zip" --cerebro=elo
```

Ou pasta:

```bash
npm run ingest -- "C:\Users\andre\Downloads\elo" --cerebro=elo
```

## O que o motor faz

1. Abre o zip / percorre a pasta
2. Pra cada arquivo: extrai texto (PDF/DOCX/TXT/CSV/HTML/áudio via Whisper)
3. Classifica o tipo via `gpt-4o-mini` usando só nome + primeiras 200 palavras
4. WhatsApp export é parseado especial: vira N "conversas" em vez de 1 fonte gigante
5. Chunka em ~500 tokens, embeda via `text-embedding-3-small`, salva no Supabase
6. Fontes com confiança < 0.65 vão pra quarentena (triagem humana no painel)
7. Relatório final com custo total, tempo, stats

## Custo estimado

- Classificação: ~US$ 0,0002 por arquivo
- Embedding: US$ 0,02 por 1M tokens
- Whisper: US$ 0,006 por minuto de áudio

Pacote típico de 100 arquivos sem áudio: **< R$ 1**.
