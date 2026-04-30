"""Lista servidores e canais de texto onde o usuario participa.
Uso unico: descobrir o ID do canal de depoimentos.
"""
import os
import sys
import time
import urllib.request
import urllib.error
import json

TOKEN = os.environ.get("DISCORD_TOKEN", "").strip()
if not TOKEN:
    print("ERRO: defina a variavel de ambiente DISCORD_TOKEN")
    sys.exit(1)

BASE = "https://discord.com/api/v9"
HEADERS = {
    "Authorization": TOKEN,
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
}


def api(path):
    req = urllib.request.Request(BASE + path, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code} em {path}: {body}", file=sys.stderr)
        raise


me = api("/users/@me")
print(f"Logado como: {me.get('username')} (id {me.get('id')})\n")

guilds = api("/users/@me/guilds")
print(f"Voce esta em {len(guilds)} servidores.\n")

target = None
for g in guilds:
    nome = g["name"]
    print(f"  - {nome}  (id {g['id']})")
    if "pinguim" in nome.lower():
        target = g

if not target:
    print("\nNenhum servidor com 'pinguim' no nome. Saindo.")
    sys.exit(1)

print(f"\n=== Canais do servidor '{target['name']}' ===\n")
time.sleep(0.5)
canais = api(f"/guilds/{target['id']}/channels")

# Type 0 = texto, 5 = announcement, 15 = forum
TIPOS_TEXTO = {0: "texto", 5: "anuncio", 15: "forum", 11: "thread", 12: "thread"}

candidatos = []
for c in sorted(canais, key=lambda x: (x.get("position", 0))):
    tipo = c.get("type")
    if tipo not in TIPOS_TEXTO:
        continue
    nome = c["name"]
    print(f"  [{TIPOS_TEXTO[tipo]:8}] #{nome}  (id {c['id']})")
    if any(k in nome.lower() for k in ["depoiment", "prova", "case", "result", "venda"]):
        candidatos.append(c)

print(f"\n=== Candidatos a 'depoimentos' ===")
if not candidatos:
    print("Nenhum canal obvio. Olhe a lista acima e me diga qual e.")
else:
    for c in candidatos:
        print(f"  -> #{c['name']}  (id {c['id']}, tipo {TIPOS_TEXTO.get(c.get('type'), '?')})")
