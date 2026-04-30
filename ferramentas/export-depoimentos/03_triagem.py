"""Triagem rapida do depoimentos.json — mostra amostra de mensagens
para entender o formato antes de processar tudo.
"""
import sys
import json
from pathlib import Path
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")

SAIDA = Path(__file__).parent
data = json.loads((SAIDA / "depoimentos.json").read_text(encoding="utf-8"))

print(f"=== Total: {len(data)} mensagens ===\n")

# autores
autores = Counter()
for m in data:
    a = m.get("author", {})
    autores[f"{a.get('username', '?')} ({a.get('id', '?')})"] += 1

print(f"=== Top 10 autores (quem mais posta) ===")
for nome, n in autores.most_common(10):
    print(f"  {n:3}x  {nome}")
print(f"  ...total {len(autores)} autores diferentes\n")

# tipos de anexo
tipos_arquivo = Counter()
for m in data:
    for att in m.get("attachments", []):
        nome = att.get("filename", "")
        ext = nome.rsplit(".", 1)[-1].lower() if "." in nome else "sem-ext"
        tipos_arquivo[ext] += 1

print(f"=== Tipos de anexo ===")
for ext, n in tipos_arquivo.most_common():
    print(f"  {n:3}x  .{ext}")
print()

# distribuicao temporal
anos = Counter()
for m in data:
    ano = m.get("timestamp", "0000")[:4]
    anos[ano] += 1
print(f"=== Por ano ===")
for ano in sorted(anos.keys()):
    print(f"  {ano}: {anos[ano]} mensagens")
print()

# AMOSTRA: 8 mensagens variadas
print("=" * 70)
print("AMOSTRA DE 8 MENSAGENS (variadas)")
print("=" * 70)

# 3 com texto e anexo
com_ambos = [m for m in data if (m.get("content") or "").strip() and m.get("attachments")][:3]
# 2 so com texto
so_texto = [m for m in data if (m.get("content") or "").strip() and not m.get("attachments")][:2]
# 3 so com anexo
so_anexo = [m for m in data if not (m.get("content") or "").strip() and m.get("attachments")][:3]

amostra = com_ambos + so_texto + so_anexo

for i, m in enumerate(amostra, 1):
    print(f"\n--- {i} ---")
    print(f"Autor:    {m.get('author', {}).get('username')}")
    print(f"Data:     {m.get('timestamp', '')[:19]}")
    texto = (m.get("content") or "").strip()
    if texto:
        print(f"Texto:    {texto[:300]}{'...' if len(texto) > 300 else ''}")
    else:
        print(f"Texto:    (vazio)")
    atts = m.get("attachments", [])
    if atts:
        print(f"Anexos:   {len(atts)}")
        for a in atts[:3]:
            print(f"          - {a.get('filename')} ({a.get('content_type', 'tipo?')})")
