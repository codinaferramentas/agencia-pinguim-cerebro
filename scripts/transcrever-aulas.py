"""
Transcreve todas as aulas do Elo (Ciclo) usando faster-whisper.
Salva as transcrições em markdown no cérebro do projeto.
"""

import os
import sys
import glob
from pathlib import Path

# Fix Windows encoding
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')
os.environ["PYTHONIOENCODING"] = "utf-8"

from faster_whisper import WhisperModel

# Configuração
AULAS_DIR = r"C:\Users\codin\Downloads\aulas-elo\[CICLO] Aulas"
OUTPUT_DIR = r"C:\Squad\cerebro\agentes\estrategistas\elo\contexto\transcricoes"
FFMPEG_PATH = r"C:\Users\codin\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin"

# Adicionar ffmpeg ao PATH
os.environ["PATH"] = FFMPEG_PATH + os.pathsep + os.environ["PATH"]

# Criar pasta de saída
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Mapear nomes amigáveis para arquivos com código Meet
NOMES_MODULOS = {
    "Módulo 1 - A sua jornada da relevância": "mod1",
    "Módulo 2 0 - O mapa do Jogo": "mod2",
    "Módulo 3 - A máquina de conteúdo lo-fi": "mod3",
    "Módulo 4 - Hora de gravar": "mod4",
    "Módulo 5 - Acelerando a atração de seguidores": "mod5",
    "Protocolos": "protocolos",
}

def get_friendly_name(filepath):
    """Gera nome amigável para o arquivo de transcrição."""
    path = Path(filepath)
    parent = path.parent.name
    filename = path.stem

    prefix = NOMES_MODULOS.get(parent, parent.lower().replace(" ", "-"))

    # Se tem nome descritivo, usar ele
    if any(keyword in filename.lower() for keyword in ["aula", "mod"]):
        clean = filename.lower().replace(" ", "-").replace("!", "").replace(",", "")
        return f"{prefix}_{clean}"
    else:
        # Arquivo com código Meet - usar timestamp do nome
        # Ex: "hsz-kfgf-ufh (2025-10-09 10_28 GMT-3)" -> "mod3_aula-live_2025-10-09_10h28"
        if "(" in filename:
            timestamp = filename.split("(")[1].replace(")", "").strip()
            timestamp = timestamp.replace("GMT-3", "").strip()
            timestamp = timestamp.replace(" ", "_").replace("_", "h", 1) if "_" in timestamp else timestamp
            clean_ts = timestamp.replace(":", "h").replace(" ", "_")
            return f"{prefix}_aula-live_{clean_ts}"
        return f"{prefix}_{filename[:15]}"

def transcrever_arquivo(filepath, model):
    """Transcreve um arquivo de vídeo e retorna o texto."""
    print(f"\n{'='*60}")
    print(f"Transcrevendo: {Path(filepath).name}")
    print(f"Tamanho: {os.path.getsize(filepath) / 1024 / 1024:.1f} MB")
    print(f"{'='*60}")

    segments, info = model.transcribe(
        filepath,
        language="pt",
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )

    print(f"Idioma detectado: {info.language} (prob: {info.language_probability:.2f})")
    print(f"Duração: {info.duration:.0f}s ({info.duration/60:.1f} min)")

    full_text = []
    for segment in segments:
        timestamp = f"[{int(segment.start//60):02d}:{int(segment.start%60):02d}]"
        full_text.append(f"{timestamp} {segment.text.strip()}")

    return "\n".join(full_text), info.duration

def main():
    print("Carregando modelo Whisper (base)...")
    print("Primeira execução pode demorar para baixar o modelo (~150MB)")
    model = WhisperModel("base", device="cpu", compute_type="int8")
    print("Modelo carregado!\n")

    # Encontrar todos os vídeos (usar os.walk em vez de glob por causa de [CICLO] no path)
    videos = []
    for root, dirs, files in os.walk(AULAS_DIR):
        for f in files:
            if f.lower().endswith(('.mp4', '.mkv', '.webm')):
                videos.append(os.path.join(root, f))

    videos.sort()

    print(f"Encontrados {len(videos)} vídeos para transcrever:\n")
    for i, v in enumerate(videos, 1):
        size_mb = os.path.getsize(v) / 1024 / 1024
        print(f"  {i:2d}. [{size_mb:6.1f} MB] {Path(v).parent.name}/{Path(v).name}")

    # Transcrever cada vídeo
    total_duration = 0
    for i, video_path in enumerate(videos, 1):
        friendly = get_friendly_name(video_path)
        output_path = os.path.join(OUTPUT_DIR, f"{friendly}.md")

        # Pular se já transcrito
        if os.path.exists(output_path):
            print(f"\n[{i}/{len(videos)}] Já transcrito: {friendly}.md — pulando")
            continue

        print(f"\n[{i}/{len(videos)}] Processando...")

        try:
            text, duration = transcrever_arquivo(video_path, model)
            total_duration += duration

            # Salvar markdown
            parent_name = Path(video_path).parent.name
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(f"# Transcrição: {Path(video_path).stem}\n\n")
                f.write(f"- **Módulo:** {parent_name}\n")
                f.write(f"- **Arquivo:** {Path(video_path).name}\n")
                f.write(f"- **Duração:** {duration/60:.1f} minutos\n")
                f.write(f"- **Modelo:** faster-whisper base (PT-BR)\n\n")
                f.write(f"---\n\n")
                f.write(text)
                f.write(f"\n")

            print(f"Salvo: {output_path}")
            print(f"Progresso: {i}/{len(videos)} ({total_duration/60:.0f} min transcritos)")

        except Exception as e:
            print(f"ERRO ao transcrever {Path(video_path).name}: {e}")
            continue

    print(f"\n{'='*60}")
    print(f"CONCLUÍDO! {len(videos)} vídeos processados")
    print(f"Total transcrito: {total_duration/60:.0f} minutos")
    print(f"Transcrições salvas em: {OUTPUT_DIR}")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
