"""Teste v2: roda o processador atualizado em casos especificos pra validar
que (a) Jefferson Silva NAO vai pro Elo, (b) classificacoes corretas continuam funcionando.
"""
import sys, json
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")

SAIDA = Path(__file__).parent
data = json.loads((SAIDA / "depoimentos_limpos.json").read_text(encoding="utf-8"))

# IDs especificos pra testar:
ALVOS = {
    "1164726904541151312": "Jefferson Silva — Mentoria Express (NAO deve virar Elo)",
    "1151117381716938802": "Jefferson Silva concursos — 'aquela mentoria' (NAO deve virar Elo)",
    "1494429854953898015": "Andre Rodrigues - Lyra (DEVE virar Lyra)",
    "1486928478226378784": "Charles Oliveira - ProAlt (DEVE virar Proalt)",
    "1486920005266059314": "Guilhermo - Taurus (DEVE virar Taurus)",
}

# carrega processador
src = (Path(__file__).parent / "06_processar.py").read_text(encoding="utf-8")
src_sem_main = src.split("# --- loop principal ---")[0]
mod = type(sys)('proc')
mod.__dict__["__file__"] = str(Path(__file__).parent / "06_processar.py")
exec(src_sem_main, mod.__dict__)

amostras = []
for m in data:
    if m["id"] in ALVOS:
        amostras.append(m)

# pega tambem 2 do Taurus aleatorios
taurus_count = 0
for m in data:
    if (m.get("content") or "").lower().count("taurus") > 0 and m["id"] not in ALVOS and taurus_count < 2:
        amostras.append(m)
        ALVOS[m["id"]] = "Taurus aleatorio"
        taurus_count += 1

print(f"Testando {len(amostras)} amostras\n")

for m in amostras:
    rotulo = ALVOS.get(m["id"], "?")
    print(f"=== {rotulo} ===")
    print(f"  msg_id: {m['id']}")
    print(f"  texto:  {(m.get('content') or '(vazio)')[:200]}")
    try:
        estrutura, usage, transcricoes = mod.extrair_estrutura(m)
        print(f"  --> Aluno:     {estrutura.get('aluno')}")
        print(f"  --> Produto:   {estrutura.get('produto')} (LLM disse confianca: {estrutura.get('produto_confianca')})")
        print(f"  --> Evidencia: {estrutura.get('produto_evidencia')}")
        print(f"  --> Tipo:      {estrutura.get('tipo_prova')}")

        # auditoria de match literal
        cerebro_info = mod.normalizar_produto(estrutura.get("produto"))
        if cerebro_info:
            ok, motivo = mod.validar_match_literal(
                cerebro_info["nome"],
                m.get("content", ""),
                estrutura.get("conteudo_transcrito") or "",
                estrutura.get("produto_evidencia") or "",
            )
            print(f"  --> AUDITORIA: {'PASSOU' if ok else 'REJEITADO'} ({motivo})")
        else:
            print(f"  --> AUDITORIA: nao aplicavel (produto desconhecido)")
    except Exception as e:
        print(f"  ERRO: {type(e).__name__}: {e}")
    print()
