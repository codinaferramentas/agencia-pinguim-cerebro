"""Limpa lista de mensagens (remove ruido) e gera dataset pronto pra processar.
Tambem extrai audio dos videos via ffmpeg.
"""
import sys
import json
import subprocess
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

SAIDA = Path(__file__).parent
ANEXOS = SAIDA / "anexos"
data = json.loads((SAIDA / "depoimentos.json").read_text(encoding="utf-8"))
uploads_map = json.loads((SAIDA / "uploads_map.json").read_text(encoding="utf-8"))

# --- regras de descarte ---
COMENTARIOS_RUIDO = {
    "delicia", "top", "topp", "show", "lindo", "linda", "demais",
    "sensacional", "que massa", "massa", "incrivel", "uau", "lacrou",
    "amei", "amo", "kkk", "kkkk", "rsrs", "❤️", "🔥", "👏", "🚀",
}


def eh_ruido(msg):
    texto = (msg.get("content") or "").strip()
    tem_anexo = bool(msg.get("attachments"))
    if tem_anexo:
        return False  # tem anexo = nunca e ruido
    if not texto:
        return True
    # texto curto sem anexo
    texto_low = texto.lower().strip(".!?,;:")
    if len(texto) < 30:
        if texto_low in COMENTARIOS_RUIDO:
            return True
        # so emoji?
        if all(not c.isalnum() for c in texto):
            return True
        # so 1-2 palavras curtas
        palavras = texto_low.split()
        if len(palavras) <= 2 and all(len(p) < 10 for p in palavras):
            return True
    return False


limpas = []
descartadas = []
for m in data:
    if eh_ruido(m):
        descartadas.append(m)
    else:
        limpas.append(m)

print(f"Total original:   {len(data)}")
print(f"Descartadas:      {len(descartadas)}  (comentarios curtos sem anexo)")
print(f"Sobraram:         {len(limpas)}  (vao para processamento)\n")

# --- extrair audio dos videos ---
videos_dir = SAIDA / "audios_extraidos"
videos_dir.mkdir(exist_ok=True)

videos_processados = 0
videos_falha = 0
for m in limpas:
    for att in m.get("attachments", []):
        nome = att.get("filename", "")
        ext = nome.rsplit(".", 1)[-1].lower() if "." in nome else ""
        if ext in ("mp4", "mov", "webm"):
            origem = ANEXOS / f"{m['id']}_{nome}"
            if not origem.exists():
                continue
            destino = videos_dir / f"{m['id']}_{nome}.mp3"
            if destino.exists():
                videos_processados += 1
                continue
            try:
                # ffmpeg extrai audio
                subprocess.run(
                    ["ffmpeg", "-y", "-i", str(origem), "-vn", "-acodec", "libmp3lame",
                     "-ab", "128k", str(destino)],
                    capture_output=True, check=True, timeout=120,
                )
                print(f"  audio extraido: {nome}")
                videos_processados += 1
            except FileNotFoundError:
                print(f"  ERRO: ffmpeg nao instalado. Pulando videos.")
                videos_falha += 1
                break
            except subprocess.CalledProcessError as e:
                print(f"  ERRO ffmpeg em {nome}: {e.stderr[:200].decode(errors='replace')}")
                videos_falha += 1

print(f"\nVideos com audio extraido: {videos_processados}")
print(f"Videos com falha:          {videos_falha}")

# --- enriquece cada mensagem com URL publica do anexo ---
for m in limpas:
    for att in m.get("attachments", []):
        nome_local = f"{m['id']}_{att.get('filename', '')}"
        upload = uploads_map.get(nome_local)
        if upload:
            att["_public_url"] = upload["public_url"]
            att["_mime_real"] = upload["mime"]
        # se tem audio extraido (de video), aponta tambem
        ext = nome_local.rsplit(".", 1)[-1].lower() if "." in nome_local else ""
        if ext in ("mp4", "mov", "webm"):
            audio_local = videos_dir / f"{nome_local}.mp3"
            if audio_local.exists():
                att["_audio_extraido_local"] = str(audio_local)

# salva
LIMPAS_OUT = SAIDA / "depoimentos_limpos.json"
LIMPAS_OUT.write_text(json.dumps(limpas, ensure_ascii=False, indent=2), encoding="utf-8")
DESCART_OUT = SAIDA / "descartadas.json"
DESCART_OUT.write_text(json.dumps(descartadas, ensure_ascii=False, indent=2), encoding="utf-8")

# --- estatisticas finais ---
com_texto = sum(1 for m in limpas if (m.get("content") or "").strip())
com_anexo = sum(1 for m in limpas if m.get("attachments"))
so_texto = sum(1 for m in limpas if (m.get("content") or "").strip() and not m.get("attachments"))
so_anexo = sum(1 for m in limpas if m.get("attachments") and not (m.get("content") or "").strip())
ambos = sum(1 for m in limpas if m.get("attachments") and (m.get("content") or "").strip())

# por tipo de anexo
tipos = {"imagem": 0, "audio": 0, "video": 0}
for m in limpas:
    for att in m.get("attachments", []):
        ext = (att.get("filename", "").rsplit(".", 1)[-1] or "").lower()
        if ext in ("png", "jpg", "jpeg", "gif", "webp"):
            tipos["imagem"] += 1
        elif ext in ("ogg", "mp3", "wav", "m4a", "opus"):
            tipos["audio"] += 1
        elif ext in ("mp4", "mov", "webm"):
            tipos["video"] += 1

print(f"\n=== Dataset pronto pra processar ===")
print(f"Total:       {len(limpas)}")
print(f"  So texto:  {so_texto}")
print(f"  So anexo:  {so_anexo}")
print(f"  Ambos:     {ambos}")
print(f"\nAnexos por tipo:")
for k, v in tipos.items():
    print(f"  {k}: {v}")
print(f"\nArquivo: {LIMPAS_OUT}")
