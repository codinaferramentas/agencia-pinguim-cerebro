"""Sobe todos os anexos da pasta anexos/ pro bucket pinguim-provas-sociais.
Salva mapa msg_id+filename -> public_url em uploads_map.json.
"""
import os
import sys
import json
import time
import urllib.request
import urllib.error
import mimetypes
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

SAIDA = Path(__file__).parent
ANEXOS = SAIDA / "anexos"
MAPA_OUT = SAIDA / "uploads_map.json"

PROJECT_REF = "wmelierxzpjamiofeemh"
BUCKET = "pinguim-provas-sociais"

with open(r"c:\Squad\.env.local", encoding="utf-8") as f:
    env = {}
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
BASE = f"https://{PROJECT_REF}.supabase.co/storage/v1"

mapa_existente = {}
if MAPA_OUT.exists():
    mapa_existente = json.loads(MAPA_OUT.read_text(encoding="utf-8"))
    print(f"Carregado mapa existente: {len(mapa_existente)} ja subidos")

arquivos = sorted(ANEXOS.glob("*"))
print(f"Total de arquivos: {len(arquivos)}\n")

novos = 0
ja = 0
erros = 0

for i, arq in enumerate(arquivos, 1):
    nome = arq.name
    if nome in mapa_existente:
        ja += 1
        continue

    # mime
    mime = mimetypes.guess_type(nome)[0] or "application/octet-stream"
    # webp -> imagem
    if nome.lower().endswith(".png") and arq.read_bytes()[:4] == b"RIFF":
        mime = "image/webp"

    # path no bucket: ano-mes/nome
    path = nome  # nome ja tem msg_id como prefixo, garante unicidade
    url = f"{BASE}/object/{BUCKET}/{path}"

    data = arq.read_bytes()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {SERVICE_KEY}",
            "apikey": SERVICE_KEY,
            "Content-Type": mime,
            "x-upsert": "true",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            r.read()
        public_url = f"https://{PROJECT_REF}.supabase.co/storage/v1/object/public/{BUCKET}/{path}"
        mapa_existente[nome] = {
            "public_url": public_url,
            "mime": mime,
            "tamanho": len(data),
        }
        novos += 1
        if novos % 20 == 0:
            print(f"  {novos} novos subidos | {i}/{len(arquivos)}")
            MAPA_OUT.write_text(json.dumps(mapa_existente, ensure_ascii=False, indent=2), encoding="utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  ERRO {nome}: HTTP {e.code} {body[:200]}")
        erros += 1
    except Exception as e:
        print(f"  ERRO {nome}: {e}")
        erros += 1
    time.sleep(0.05)

MAPA_OUT.write_text(json.dumps(mapa_existente, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\n=== Resumo ===")
print(f"Ja existiam: {ja}")
print(f"Novos subidos: {novos}")
print(f"Erros: {erros}")
print(f"Mapa: {MAPA_OUT}")
