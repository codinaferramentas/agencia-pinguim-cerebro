"""Vetoriza todas as fontes de depoimento com ingest_status='pendente'.
Roda localmente, usa service role do Supabase + OpenAI.
Replica logica da Edge Function revetorizar-fonte.
"""
import sys, json, time
import urllib.request, urllib.error
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

env = {}
with open(r"c:\Squad\.env.local", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

OPENAI_KEY = env["OPENAI_API_KEY"]
SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
ACCESS_TOKEN = env["SUPABASE_ACCESS_TOKEN"]
PROJECT_REF = env["SUPABASE_PROJECT_REF"]
SUPABASE_URL = env["SUPABASE_URL"]

EMBEDDING_MODEL = "text-embedding-3-small"
CHUNK_SIZE = 2000
CHUNK_OVERLAP = 200
EMBED_BATCH = 50


def http_post(url, headers, data, timeout=120):
    if isinstance(data, dict):
        data = json.dumps(data).encode("utf-8")
        headers = {**headers, "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def supabase_query(sql):
    return http_post(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        {"Authorization": f"Bearer {ACCESS_TOKEN}"},
        {"query": sql},
    )


def supabase_rest(method, path, payload=None, prefer=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "Authorization": f"Bearer {SERVICE_KEY}",
        "apikey": SERVICE_KEY,
        "Content-Type": "application/json",
        "Content-Profile": "pinguim",
    }
    if prefer:
        headers["Prefer"] = prefer

    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read().decode("utf-8")
        return json.loads(body) if body else None


def chunk_text(texto):
    chunks = []
    i, idx = 0, 0
    while i < len(texto):
        conteudo = texto[i:i + CHUNK_SIZE]
        chunks.append({
            "chunk_index": idx,
            "conteudo": conteudo,
            "token_count": round(len(conteudo) / 4),
        })
        i += CHUNK_SIZE - CHUNK_OVERLAP
        idx += 1
    return chunks


def embed(textos):
    res = http_post(
        "https://api.openai.com/v1/embeddings",
        {"Authorization": f"Bearer {OPENAI_KEY}"},
        {"model": EMBEDDING_MODEL, "input": textos},
        timeout=60,
    )
    return [d["embedding"] for d in res["data"]]


# --- pega todas as fontes pendentes via PostgREST (nao Management API) ---
url = f"{SUPABASE_URL}/rest/v1/cerebro_fontes?select=id,cerebro_id,conteudo_md,titulo&tipo=eq.depoimento&ingest_status=eq.pendente"
req = urllib.request.Request(
    url,
    headers={
        "Authorization": f"Bearer {SERVICE_KEY}",
        "apikey": SERVICE_KEY,
        "Accept-Profile": "pinguim",
    },
    method="GET",
)
with urllib.request.urlopen(req, timeout=60) as r:
    fontes = json.loads(r.read().decode("utf-8"))
print(f"Fontes pendentes: {len(fontes)}\n")

custo_total = 0.0
sucesso = 0
falha = 0

for i, f in enumerate(fontes, 1):
    fid = f["id"]
    texto = (f["conteudo_md"] or "").strip()
    cerebro_id = f["cerebro_id"]

    if len(texto) < 10:
        # marca como ok mesmo, sem chunks
        try:
            supabase_rest("PATCH", f"cerebro_fontes?id=eq.{fid}", {"ingest_status": "ok"})
            sucesso += 1
        except Exception as e:
            print(f"  ERRO marcando vazia: {e}")
            falha += 1
        continue

    try:
        # apaga chunks antigos
        supabase_rest("DELETE", f"cerebro_fontes_chunks?fonte_id=eq.{fid}")

        # chunk + embed
        chunks = chunk_text(texto)
        for j in range(0, len(chunks), EMBED_BATCH):
            slice_ = chunks[j:j + EMBED_BATCH]
            vetores = embed([c["conteudo"] for c in slice_])
            tokens = sum(c["token_count"] for c in slice_)
            custo_total += (tokens / 1_000_000) * 0.02

            rows = [{
                "fonte_id": fid,
                "cerebro_id": cerebro_id,
                "chunk_index": c["chunk_index"],
                "conteudo": c["conteudo"],
                "token_count": c["token_count"],
                "embedding": vetores[k],
                "embedding_model": EMBEDDING_MODEL,
            } for k, c in enumerate(slice_)]
            supabase_rest("POST", "cerebro_fontes_chunks", rows)

        # marca ok
        supabase_rest("PATCH", f"cerebro_fontes?id=eq.{fid}", {"ingest_status": "ok"})
        sucesso += 1

        if i % 10 == 0:
            print(f"  [{i}/{len(fontes)}] ok:{sucesso} falha:{falha} custo:${custo_total:.4f}")

    except Exception as e:
        print(f"  ERRO em {fid}: {type(e).__name__}: {str(e)[:200]}")
        falha += 1
    time.sleep(0.1)

print(f"\n=== Vetorizacao final ===")
print(f"Sucesso: {sucesso}")
print(f"Falha:   {falha}")
print(f"Custo:   ${custo_total:.4f} (~R${custo_total*5.0:.3f})")
