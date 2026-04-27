"""
Sobe as 11 fontes do Cerebro low-ticket-digital diretamente no banco:
1. Le os 11 .md em ferramentas/metodologias-comerciais/fontes-low-ticket-digital/
2. Cria registro em pinguim.cerebro_fontes (tipo='externo', origem='curado', status='ok')
3. Chunka conteudo em ~2000 chars com overlap de 200
4. Gera embeddings via OpenAI text-embedding-3-small
5. Insere em pinguim.cerebro_fontes_chunks

Eh um caminho direto que pula ingest-pacote (que espera ZIP).
Material curado nao precisa de classificacao via LLM — eu ja sei o tipo.
"""
import json, urllib.request, os, sys, glob, time
sys.stdout.reconfigure(encoding='utf-8')

# =====================================================================
# Config
# =====================================================================
CEREBRO_ID = '2775ba42-a368-4d8a-afae-d36ae636fdfd'  # low-ticket-digital
FONTES_DIR = 'ferramentas/metodologias-comerciais/fontes-low-ticket-digital'
EMBEDDING_MODEL = 'text-embedding-3-small'
CHUNK_SIZE = 2000
CHUNK_OVERLAP = 200

# =====================================================================
# Helpers
# =====================================================================

def sql(query):
    """Executa SQL via Management API."""
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
    """Quebra texto em chunks com overlap. Tenta cortar em paragrafo/frase."""
    if len(text) <= size:
        return [text]
    chunks = []
    pos = 0
    while pos < len(text):
        end = pos + size
        if end >= len(text):
            chunks.append(text[pos:])
            break
        # Tenta quebrar em \n\n, depois \n, depois '. ', depois size
        cut = text.rfind('\n\n', pos, end)
        if cut == -1 or cut < pos + size // 2:
            cut = text.rfind('\n', pos, end)
        if cut == -1 or cut < pos + size // 2:
            cut = text.rfind('. ', pos, end)
            if cut != -1:
                cut += 1  # inclui o ponto
        if cut == -1 or cut < pos + size // 2:
            cut = end
        chunks.append(text[pos:cut].strip())
        pos = max(cut - overlap, pos + 1)
    return [c for c in chunks if c.strip()]


def embed_batch(texts):
    """Gera embeddings em lote via OpenAI."""
    req = urllib.request.Request(
        'https://api.openai.com/v1/embeddings',
        data=json.dumps({'model': EMBEDDING_MODEL, 'input': texts}).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {os.environ["OPENAI_API_KEY"]}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return [d['embedding'] for d in data['data']]
    except urllib.error.HTTPError as e:
        raise Exception(f'OpenAI error {e.code}: {e.read().decode("utf-8")[:500]}')


def escape_sql_string(s):
    """Escape SQL string usando dollar quoting com tag unica."""
    tag = 'p' + str(int(time.time() * 1000))[-6:]
    while f'${tag}$' in s:
        tag += 'x'
    return f'${tag}${s}${tag}$'


# =====================================================================
# Pipeline principal
# =====================================================================

def main():
    arquivos = sorted(glob.glob(os.path.join(FONTES_DIR, '*.md')))
    if not arquivos:
        print(f'ERRO: nenhum .md em {FONTES_DIR}')
        sys.exit(1)

    print(f'Encontrados {len(arquivos)} arquivos:')
    for a in arquivos:
        print(f'  - {os.path.basename(a)}')
    print()

    total_chunks_global = 0

    for path in arquivos:
        nome = os.path.basename(path).replace('.md', '')
        with open(path, 'r', encoding='utf-8') as f:
            md = f.read()

        # Extrai titulo do primeiro h1
        titulo = nome
        for line in md.split('\n'):
            line = line.strip()
            if line.startswith('# '):
                titulo = line[2:].strip()
                break

        size = len(md)
        print(f'[{nome}]')
        print(f'  titulo: {titulo}')
        print(f'  tamanho: {size} chars')

        # 1. Insere fonte
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
  {escape_sql_string(json.dumps({'arquivo': nome + '.md', 'rascunho_base': True, 'pendente_revisao_humana': True}))}::jsonb
) RETURNING id;
""")
        fonte_id = result[0]['id']
        print(f'  fonte_id: {fonte_id}')

        # 2. Chunka
        chunks = chunk_text(md)
        print(f'  chunks: {len(chunks)}')

        # 3. Gera embeddings em lote (max 50 por chamada)
        BATCH = 50
        all_embeddings = []
        for i in range(0, len(chunks), BATCH):
            batch = chunks[i:i + BATCH]
            embs = embed_batch(batch)
            all_embeddings.extend(embs)
        print(f'  embeddings: {len(all_embeddings)} gerados')

        # 4. Insere chunks (em batch de 20 pra não estourar SQL)
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

        total_chunks_global += inseridos
        print()

    # Atualiza ultima_alimentacao do Cerebro
    sql(f"""UPDATE pinguim.cerebros SET ultima_alimentacao = now() WHERE id = '{CEREBRO_ID}';""")

    print('=' * 60)
    print(f'CONCLUIDO')
    print(f'Total fontes: {len(arquivos)}')
    print(f'Total chunks: {total_chunks_global}')
    print(f'Cerebro ID: {CEREBRO_ID}')
    print()
    print('Proximos passos:')
    print('1. Hard reload no painel (Ctrl+Shift+R)')
    print('2. Sidebar > Cerebros > Metodologias > Low Ticket Digital')
    print('3. Skills > buscar-cerebro > Playground: testa com "como construir oferta irresistivel"')


if __name__ == '__main__':
    main()
