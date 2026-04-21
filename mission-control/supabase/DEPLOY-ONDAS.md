# Deploy da Edge Function em modo ONDAS

A Edge Function `ingest-pacote` foi refatorada. Agora processa em 2 fases:
- `preparar` (rápido, ~10s): extrai zip, cria linhas em `ingest_arquivos` com status `pendente`
- `processar-onda` (~30-60s): pega 5 arquivos por vez, vetoriza, marca `ok`

O painel dispara `preparar` uma vez e depois `processar-onda` em loop até terminar.

## Deploy — caminho mais fácil (dashboard)

1. Abre o dashboard Supabase do projeto
2. Vai em **Edge Functions** → `ingest-pacote`
3. Clica em **Edit function** (ou equivalente)
4. Cola o conteúdo novo de `supabase/functions/ingest-pacote/index.ts`
5. Deploy

## Deploy — via CLI (se tiver npm)

```bash
cd mission-control
npx supabase@latest functions deploy ingest-pacote --project-ref <PROJECT_REF>
```

O `PROJECT_REF` é o que aparece na URL do dashboard (ex: `abcdefghijklmno`).

Precisa estar logado: `npx supabase@latest login`.

## Variáveis de ambiente (confirmar que estão setadas)

A função usa:
- `SUPABASE_URL` (auto)
- `SUPABASE_SERVICE_ROLE_KEY` (auto)
- `OPENAI_API_KEY` (manual — já estava setada antes)

## Testar

Depois do deploy:
1. Abre o painel Mission Control
2. Entra num cérebro
3. Clica em "Alimentação em pacote"
4. Sobe o `elo.zip` de teste
5. Deve ver a barra avançar de 5% até 100% em ondas
6. No console do navegador: vai ver chamadas POST pra `/functions/v1/ingest-pacote` acontecendo em sequência (uma por onda, ~30s cada)

## Se travar de novo

- Abre o dashboard → Edge Functions → `ingest-pacote` → **Logs**
- Se aparecer `WORKER_LIMIT` dentro de uma onda: reduz `ONDA_TAMANHO` de 5 pra 3 no `index.ts`
- Se aparecer erro 429 do OpenAI: adiciona delay entre ondas
