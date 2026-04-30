"""Insere 2 fontes por metodologia (10 fontes total) nos Cerebros recem-criados.
Cada fonte e um MD rico com conteudo curado.
Apos inserir, dispara vetorizacao via mesma engine usada pra depoimentos.
"""
import sys
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

# --- env ---
env = {}
with open(r"c:\Squad\.env.local", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

OPENAI_KEY = env["OPENAI_API_KEY"]
SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
PROJECT_REF = env["SUPABASE_PROJECT_REF"]
SUPABASE_URL = env["SUPABASE_URL"]

# IDs dos cerebros (mapeados manualmente apos criacao)
CEREBROS = {
    "spin-selling":         "af87d070-a5a3-4688-8463-c171a26952e0",
    "sandler-selling":      "3bd47b86-1f79-4792-95ad-8b22fec5aaad",
    "challenger-sale":      "4d8d1a54-c649-4054-aa5b-96f82f10fa82",
    "tactical-empathy-voss":"aafe768b-2aed-4593-94d4-2b8df6143fdb",
    "meddic":               "8c65e2f4-2f8f-496e-8cad-82910087b99a",
}

EMBEDDING_MODEL = "text-embedding-3-small"
CHUNK_SIZE = 2000
CHUNK_OVERLAP = 200


def http_post(url, headers, data, timeout=120):
    if isinstance(data, dict):
        data = json.dumps(data).encode("utf-8")
        headers = {**headers, "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def supabase_rest(method, path, payload=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "Authorization": f"Bearer {SERVICE_KEY}",
        "apikey": SERVICE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
        "Content-Profile": "pinguim",
    }
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
        chunks.append({"chunk_index": idx, "conteudo": conteudo, "token_count": round(len(conteudo) / 4)})
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


def carregar_fontes():
    """Le os MDs curados do disco e retorna lista pra insercao."""
    base = Path(__file__).parent / "fontes"
    fontes = []
    for slug in CEREBROS.keys():
        for tipo_arquivo in ("principios", "execucao"):
            md_path = base / f"{slug}-{tipo_arquivo}.md"
            if not md_path.exists():
                print(f"  AVISO: {md_path} nao encontrado, pulando")
                continue
            conteudo = md_path.read_text(encoding="utf-8")
            primeira_linha = conteudo.strip().split("\n")[0].lstrip("# ").strip()
            fontes.append({
                "slug": slug,
                "cerebro_id": CEREBROS[slug],
                "titulo": primeira_linha,
                "conteudo": conteudo,
                "tipo_arquivo": tipo_arquivo,
            })
    return fontes


def main():
    fontes = carregar_fontes()
    print(f"Fontes a inserir: {len(fontes)}\n")

    for f in fontes:
        print(f"--- {f['slug']} :: {f['tipo_arquivo']} ---")
        # Insert fonte
        payload = {
            "cerebro_id": f["cerebro_id"],
            "tipo": "externo",
            "titulo": f["titulo"],
            "conteudo_md": f["conteudo"],
            "origem": "curado",
            "autor": "Material curado de fontes publicas",
            "ingest_status": "processando",
            "tamanho_bytes": len(f["conteudo"]),
            "metadata": {
                "metodologia": f["slug"],
                "secao": f["tipo_arquivo"],
                "fonte": "websearch+webfetch curado",
            },
        }
        try:
            res = supabase_rest("POST", "cerebro_fontes", payload)
            fonte_id = res[0]["id"]
            print(f"  fonte criada: {fonte_id}")
        except urllib.error.HTTPError as e:
            print(f"  ERRO insert: {e.read().decode()[:300]}")
            continue

        # Chunk + embed
        chunks = chunk_text(f["conteudo"])
        print(f"  chunks: {len(chunks)}")

        try:
            vetores = embed([c["conteudo"] for c in chunks])
            rows = [{
                "fonte_id": fonte_id,
                "cerebro_id": f["cerebro_id"],
                "chunk_index": c["chunk_index"],
                "conteudo": c["conteudo"],
                "token_count": c["token_count"],
                "embedding": vetores[k],
                "embedding_model": EMBEDDING_MODEL,
            } for k, c in enumerate(chunks)]
            supabase_rest("POST", "cerebro_fontes_chunks", rows)
            supabase_rest("PATCH", f"cerebro_fontes?id=eq.{fonte_id}", {"ingest_status": "ok"})
            print(f"  vetorizado e marcado como ok")
        except Exception as e:
            print(f"  ERRO vetorizar: {type(e).__name__}: {str(e)[:200]}")
            continue

        time.sleep(0.3)

    print("\n=== Final ===")


if __name__ == "__main__":
    main()
