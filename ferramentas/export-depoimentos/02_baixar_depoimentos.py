"""Baixa todas as mensagens de #depoimentos + anexos.
Salva: depoimentos.json + pasta anexos/
"""
import os
import sys
import time
import json
import urllib.request
import urllib.error
from pathlib import Path

TOKEN = os.environ.get("DISCORD_TOKEN", "").strip()
CANAL_ID = "1147227247883858041"  # #depoimentos
SAIDA = Path(__file__).parent
ANEXOS_DIR = SAIDA / "anexos"
ANEXOS_DIR.mkdir(exist_ok=True)
JSON_OUT = SAIDA / "depoimentos.json"

if not TOKEN:
    print("ERRO: defina DISCORD_TOKEN")
    sys.exit(1)

BASE = "https://discord.com/api/v9"
HEADERS = {
    "Authorization": TOKEN,
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
}


def api(path):
    req = urllib.request.Request(BASE + path, headers=HEADERS)
    while True:
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                body = json.loads(e.read().decode())
                wait = float(body.get("retry_after", 2))
                print(f"  rate-limit, esperando {wait:.1f}s")
                time.sleep(wait + 0.5)
                continue
            print(f"HTTP {e.code} em {path}", file=sys.stderr)
            raise


def baixar_anexo(url, destino):
    if destino.exists() and destino.stat().st_size > 0:
        return "ja-existia"
    try:
        # urls de cdn do discord nao precisam de token
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            destino.write_bytes(r.read())
        return "baixado"
    except Exception as e:
        return f"erro: {e}"


# --- coletar mensagens com paginacao ---
todas = []
ultimo_id = None
print("Coletando mensagens...")
while True:
    qs = "?limit=100"
    if ultimo_id:
        qs += f"&before={ultimo_id}"
    msgs = api(f"/channels/{CANAL_ID}/messages{qs}")
    if not msgs:
        break
    todas.extend(msgs)
    ultimo_id = msgs[-1]["id"]
    print(f"  {len(todas)} mensagens (mais antiga: {msgs[-1]['timestamp'][:10]})")
    time.sleep(0.4)
    if len(msgs) < 100:
        break

print(f"\nTotal: {len(todas)} mensagens")

# --- baixar anexos (imagens) ---
print("\nBaixando anexos...")
total_anexos = 0
baixados = 0
erros = 0
for msg in todas:
    for att in msg.get("attachments", []):
        total_anexos += 1
        url = att.get("url")
        nome_orig = att.get("filename", "arquivo")
        # nome unico: <msgid>_<filename>
        destino = ANEXOS_DIR / f"{msg['id']}_{nome_orig}"
        att["_local_path"] = str(destino.relative_to(SAIDA))
        result = baixar_anexo(url, destino)
        if result.startswith("erro"):
            erros += 1
            print(f"  ERRO: {nome_orig} ({result})")
        elif result == "baixado":
            baixados += 1
        if total_anexos % 20 == 0:
            print(f"  {total_anexos} anexos processados ({baixados} baixados, {erros} erros)")
        time.sleep(0.1)

print(f"\nAnexos totais: {total_anexos}")
print(f"Baixados agora: {baixados}")
print(f"Erros: {erros}")

# --- salvar JSON ---
JSON_OUT.write_text(json.dumps(todas, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\nJSON salvo em: {JSON_OUT}")
print(f"Anexos em: {ANEXOS_DIR}")

# --- estatisticas ---
com_texto = sum(1 for m in todas if (m.get("content") or "").strip())
com_anexo = sum(1 for m in todas if m.get("attachments"))
so_anexo = sum(1 for m in todas if m.get("attachments") and not (m.get("content") or "").strip())
print(f"\n=== Resumo ===")
print(f"Mensagens com texto: {com_texto}")
print(f"Mensagens com anexo: {com_anexo}")
print(f"So anexo (sem texto): {so_anexo}")
print(f"Pasta anexos: {sum(f.stat().st_size for f in ANEXOS_DIR.iterdir()) / 1_000_000:.1f} MB")
