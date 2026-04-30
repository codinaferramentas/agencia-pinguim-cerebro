"""Roda o processador em 3 mensagens-amostra antes do batch grande."""
import json
import sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")

# importa do 06
sys.path.insert(0, str(Path(__file__).parent))
import importlib.util
spec = importlib.util.spec_from_file_location("proc", Path(__file__).parent / "06_processar.py")
mod = importlib.util.module_from_spec(spec)

# nao quero rodar o loop principal — monkey-patch
SAIDA = Path(__file__).parent
data = json.loads((SAIDA / "depoimentos_limpos.json").read_text(encoding="utf-8"))

# pega 3 amostras: 1 com texto+imagem, 1 so anexo, 1 so texto
amostras = []
for m in data:
    txt = (m.get("content") or "").strip()
    has = bool(m.get("attachments"))
    if txt and has and len(amostras) == 0:
        amostras.append(("TEXTO+IMAGEM", m))
    elif not txt and has and len(amostras) == 1:
        amostras.append(("SO ANEXO", m))
    elif txt and not has and len(amostras) == 2:
        amostras.append(("SO TEXTO", m))
    if len(amostras) == 3:
        break

# carrega so as funcoes (sem rodar o __main__)
src = (Path(__file__).parent / "06_processar.py").read_text(encoding="utf-8")
# remove o loop final
src_sem_main = src.split("# --- loop principal ---")[0]
exec(src_sem_main, mod.__dict__)

print(f"Testando com {len(amostras)} amostras\n")
for tipo, msg in amostras:
    print(f"=== [{tipo}] msg {msg['id']} ===")
    print(f"  Postado por: {msg.get('author', {}).get('username')}")
    print(f"  Texto: {(msg.get('content') or '(vazio)')[:100]}")
    print(f"  Anexos: {len(msg.get('attachments', []))}")
    try:
        estrutura, usage, transcricoes = mod.extrair_estrutura(msg)
        print(f"  --> Aluno:    {estrutura.get('aluno')}")
        print(f"  --> Produto:  {estrutura.get('produto')} (confianca: {estrutura.get('produto_confianca')})")
        print(f"  --> Tipo:     {estrutura.get('tipo_prova')}")
        print(f"  --> Nicho:    {estrutura.get('nicho')}")
        print(f"  --> Valor:    {estrutura.get('valor_mencionado')}")
        print(f"  --> Resumo:   {estrutura.get('resumo_uma_linha')}")
        print(f"  --> Conteudo: {(estrutura.get('conteudo_transcrito') or '')[:200]}...")
        print(f"  --> Tokens:   in={usage.get('prompt_tokens')} out={usage.get('completion_tokens')}")

        ok = mod.salvar_no_banco(msg, estrutura, transcricoes)
        print(f"  --> Salvo: {ok}")
    except Exception as e:
        print(f"  ERRO: {type(e).__name__}: {e}")
    print()
