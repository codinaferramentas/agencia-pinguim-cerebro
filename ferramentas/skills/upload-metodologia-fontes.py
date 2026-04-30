"""
Sobe fontes novas de uma metodologia ja existente no banco.
Generico — passa o slug do produto/cerebro e o glob dos arquivos novos.

Uso:
  python upload-metodologia-fontes.py <slug-produto> <padrao-arquivos>
  ex:
  python upload-metodologia-fontes.py meddic 'meddic-scripts|meddic-exemplos-dialogo|...'

Detecta arquivos ja existentes pelo titulo h1 + tamanho — pula se ja
estiver no banco. Idempotente.
"""
import json, urllib.request, os, sys, glob, time

if len(sys.argv) < 3:
    print('Uso: python upload-metodologia-fontes.py <slug-produto> <basenames-comma-separated>')
    print('ex:  python upload-metodologia-fontes.py meddic meddic-scripts,meddic-exemplos-dialogo,meddic-objecoes-respostas,meddic-casos-famosos,meddic-anti-padroes,meddic-quando-usar')
    sys.exit(1)

PRODUTO_SLUG = sys.argv[1]
BASENAMES = sys.argv[2].split(',')

FONTES_DIR = 'ferramentas/metodologias-comerciais/fontes'
EMBEDDING_MODEL = 'text-embedding-3-small'
CHUNK_SIZE = 2000
CHUNK_OVERLAP = 200

sys.stdout.reconfigure(encoding='utf-8')


def sql(query):
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{os.environ["SUPABASE_PROJECT_REF"]}/database/query',
        data=json.dumps({'query': query}).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {os.environ["SUPABASE_ACCESS_TOKEN"]}',
            'Content-Type': 'application/json',
            'User-Agent': 'curl/8.4.0',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        raise Exception(f'SQL error {e.code}: {body[:500]}')


def chunk_text(text, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    if len(text) <= size:
        return [text]
    chunks = []
    pos = 0
    while pos < len(text):
        end = pos + size
        if end >= len(text):
            chunks.append(text[pos:])
            break
        cut = text.rfind('\n\n', pos, end)
        if cut == -1 or cut < pos + size // 2:
            cut = text.rfind('\n', pos, end)
        if cut == -1 or cut < pos + size // 2:
            cut = text.rfind('. ', pos, end)
            if cut != -1:
                cut += 1
        if cut == -1 or cut < pos + size // 2:
            cut = end
        chunks.append(text[pos:cut].strip())
        pos = max(cut - overlap, pos + 1)
    return [c for c in chunks if c.strip()]


def embed_batch(texts):
    req = urllib.request.Request(
        'https://api.openai.com/v1/embeddings',
        data=json.dumps({'model': EMBEDDING_MODEL, 'input': texts}).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {os.environ["OPENAI_API_KEY"]}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        return [d['embedding'] for d in data['data']]


def escape_sql_string(s):
    tag = 'p' + str(int(time.time() * 1000))[-6:]
    while f'${tag}$' in s:
        tag += 'x'
    return f'${tag}${s}${tag}$'


# 1. Pega cerebro_id do produto
print(f'Buscando Cerebro do produto "{PRODUTO_SLUG}"...')
result = sql(f"""
SELECT c.id AS cerebro_id, p.nome
FROM pinguim.cerebros c
JOIN pinguim.produtos p ON p.id = c.produto_id
WHERE p.slug = '{PRODUTO_SLUG}';
""")
if not result:
    print(f'ERRO: Cerebro do produto "{PRODUTO_SLUG}" nao encontrado')
    sys.exit(1)
CEREBRO_ID = result[0]['cerebro_id']
nome_produto = result[0]['nome']
print(f'  cerebro_id: {CEREBRO_ID}')
print(f'  produto: {nome_produto}')
print()

# 2. Lista titulos ja existentes pra dedup
existentes = sql(f"""
SELECT titulo FROM pinguim.cerebro_fontes
WHERE cerebro_id = '{CEREBRO_ID}';
""")
titulos_existentes = {r['titulo'] for r in existentes}
print(f'Fontes ja existentes: {len(titulos_existentes)}')
for t in sorted(titulos_existentes):
    print(f'  - {t[:80]}')
print()

# 3. Processa cada arquivo
total_chunks = 0
for basename in BASENAMES:
    path = os.path.join(FONTES_DIR, f'{basename}.md')
    if not os.path.exists(path):
        print(f'[SKIP] arquivo nao existe: {path}')
        continue

    with open(path, 'r', encoding='utf-8') as f:
        md = f.read()

    # Extrai titulo do h1
    titulo = basename
    for line in md.split('\n'):
        line = line.strip()
        if line.startswith('# '):
            titulo = line[2:].strip()
            break

    if titulo in titulos_existentes:
        print(f'[SKIP ja existe] {basename} -> "{titulo}"')
        continue

    size = len(md)
    print(f'[{basename}]')
    print(f'  titulo: {titulo}')
    print(f'  tamanho: {size} chars')

    # Insere fonte
    result = sql(f"""
INSERT INTO pinguim.cerebro_fontes (
  cerebro_id, tipo, titulo, conteudo_md, origem, autor, ingest_status,
  tamanho_bytes, metadata
) VALUES (
  '{CEREBRO_ID}',
  'externo',
  {escape_sql_string(titulo)},
  {escape_sql_string(md)},
  'curado',
  'curadoria-pinguim-rascunho-base',
  'ok',
  {size},
  {escape_sql_string(json.dumps({'arquivo': basename + '.md', 'rascunho_base': True, 'pendente_revisao_humana': True}))}::jsonb
) RETURNING id;
""")
    fonte_id = result[0]['id']
    print(f'  fonte_id: {fonte_id}')

    # Chunka
    chunks = chunk_text(md)
    print(f'  chunks: {len(chunks)}')

    # Embeddings em batch
    BATCH = 50
    all_embeddings = []
    for i in range(0, len(chunks), BATCH):
        batch = chunks[i:i + BATCH]
        embs = embed_batch(batch)
        all_embeddings.extend(embs)
    print(f'  embeddings: {len(all_embeddings)} gerados')

    # Insere chunks
    BATCH_INSERT = 10
    inseridos = 0
    for i in range(0, len(chunks), BATCH_INSERT):
        batch_chunks = chunks[i:i + BATCH_INSERT]
        batch_embs = all_embeddings[i:i + BATCH_INSERT]
        values = []
        for j, (chunk, emb) in enumerate(zip(batch_chunks, batch_embs)):
            idx = i + j
            emb_str = '[' + ','.join(f'{x:.7f}' for x in emb) + ']'
            values.append(
                f"('{fonte_id}'::uuid, '{CEREBRO_ID}'::uuid, {idx}, "
                f"{escape_sql_string(chunk)}, "
                f"NULL, '{emb_str}'::vector, '{EMBEDDING_MODEL}')"
            )
        sql(f"""
INSERT INTO pinguim.cerebro_fontes_chunks
  (fonte_id, cerebro_id, chunk_index, conteudo, token_count, embedding, embedding_model)
VALUES {','.join(values)};
""")
        inseridos += len(batch_chunks)
    print(f'  chunks inseridos: {inseridos}')
    total_chunks += inseridos
    print()

# Atualiza ultima_alimentacao
sql(f"""UPDATE pinguim.cerebros SET ultima_alimentacao = now() WHERE id = '{CEREBRO_ID}';""")

print('=' * 60)
print(f'CONCLUIDO')
print(f'Total chunks novos: {total_chunks}')
print(f'Cerebro ID: {CEREBRO_ID}')
