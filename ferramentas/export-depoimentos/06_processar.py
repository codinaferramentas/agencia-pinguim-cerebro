"""Processa cada depoimento limpo:
1. Se tem imagem -> Vision le + extrai estrutura (aluno, produto, conteudo, tipo)
2. Se tem audio -> Whisper transcreve, classifica como texto
3. Se so texto -> classifica direto
4. Salva em pinguim.cerebro_fontes (cerebro do produto) + pinguim.provas_sociais

Resiliente: cada item ja processado fica em progresso.json para retomada.
"""
import os
import sys
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

SAIDA = Path(__file__).parent
PROGRESSO = SAIDA / "progresso.json"
RELATORIO = SAIDA / "relatorio_final.json"

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
ACCESS_TOKEN = env["SUPABASE_ACCESS_TOKEN"]
PROJECT_REF = env["SUPABASE_PROJECT_REF"]
SUPABASE_URL = env["SUPABASE_URL"]

# --- mapa de produtos (slug ou nome aceito -> cerebro_id, produto_id, nome canonico) ---
CEREBROS = {
    "elo":               {"cerebro_id": "0e3da8b0-b099-41c0-9172-24468585839e", "produto_id": "523d66a3-2234-4ca5-8ca6-f8f8bf3326f6", "nome": "Elo"},
    "ciclo":             {"cerebro_id": "0e3da8b0-b099-41c0-9172-24468585839e", "produto_id": "523d66a3-2234-4ca5-8ca6-f8f8bf3326f6", "nome": "Elo"},
    "proalt":            {"cerebro_id": "864e6f53-ce6e-4710-901c-72ba09128260", "produto_id": "83e7531c-3fda-4ea0-81ee-49882445df63", "nome": "Proalt"},
    "lyra":              {"cerebro_id": "9fdb8120-f1fb-41e7-bc88-fd2877322bf5", "produto_id": "4eff954a-868c-47fd-9856-201fef6eeb2e", "nome": "Lyra"},
    "lira":              {"cerebro_id": "9fdb8120-f1fb-41e7-bc88-fd2877322bf5", "produto_id": "4eff954a-868c-47fd-9856-201fef6eeb2e", "nome": "Lyra"},
    "taurus":            {"cerebro_id": "d4f98167-14fc-4765-b3ca-46aff31dd51c", "produto_id": "1b97c4bc-3002-400c-b183-3f3a32220097", "nome": "Taurus"},
    "orion":             {"cerebro_id": "fd2f2024-ee1a-4dd3-8141-03a12e5b50fd", "produto_id": "458d91f5-c580-4f68-9f5a-ee4127e5c84b", "nome": "Orion"},
    "low ticket":        {"cerebro_id": "5865c026-d3ab-42b7-88c1-b0bce2ba7cdd", "produto_id": "037c20d6-4d0c-484d-a35c-52d9f459a5eb", "nome": "Low Ticket Desafio"},
    "low-ticket":        {"cerebro_id": "5865c026-d3ab-42b7-88c1-b0bce2ba7cdd", "produto_id": "037c20d6-4d0c-484d-a35c-52d9f459a5eb", "nome": "Low Ticket Desafio"},
    "lo-fi":             {"cerebro_id": "c26d3a7d-a7be-442e-81f7-07b5d657fdac", "produto_id": "052094fa-48bb-4fbf-b1f4-c9ede907f158", "nome": "Lo-fi Desafio"},
    "lofi":              {"cerebro_id": "c26d3a7d-a7be-442e-81f7-07b5d657fdac", "produto_id": "052094fa-48bb-4fbf-b1f4-c9ede907f158", "nome": "Lo-fi Desafio"},
    "desafio":           {"cerebro_id": "c26d3a7d-a7be-442e-81f7-07b5d657fdac", "produto_id": "052094fa-48bb-4fbf-b1f4-c9ede907f158", "nome": "Lo-fi Desafio"},
    "analise de perfil": {"cerebro_id": "f6ac2246-b296-421a-9b5f-92983c2668af", "produto_id": "e9913c27-2c4c-4ea6-946e-218cc9ee4200", "nome": "Analise de Perfil"},
    "analise-de-perfil": {"cerebro_id": "f6ac2246-b296-421a-9b5f-92983c2668af", "produto_id": "e9913c27-2c4c-4ea6-946e-218cc9ee4200", "nome": "Analise de Perfil"},
    "análise de perfil": {"cerebro_id": "f6ac2246-b296-421a-9b5f-92983c2668af", "produto_id": "e9913c27-2c4c-4ea6-946e-218cc9ee4200", "nome": "Analise de Perfil"},
    "mentoria express":  {"cerebro_id": "3dbb0e26-0318-4cc3-9042-512a3f60e061", "produto_id": "f169520f-ad6e-4325-8163-83568c889570", "nome": "Mentoria Express"},
    "mentoria-express":  {"cerebro_id": "3dbb0e26-0318-4cc3-9042-512a3f60e061", "produto_id": "f169520f-ad6e-4325-8163-83568c889570", "nome": "Mentoria Express"},
}

# --- carrega progresso ---
progresso = {}
if PROGRESSO.exists():
    progresso = json.loads(PROGRESSO.read_text(encoding="utf-8"))
    print(f"Progresso carregado: {len(progresso)} ja processados\n")


def salvar_progresso():
    PROGRESSO.write_text(json.dumps(progresso, ensure_ascii=False, indent=2), encoding="utf-8")


# --- helpers HTTP ---
def http_post(url, headers, data, timeout=120):
    if isinstance(data, dict):
        data = json.dumps(data).encode("utf-8")
        headers = {**headers, "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def openai_chat(messages, model="gpt-4o-mini", json_mode=True, temperature=0):
    body = {"model": model, "messages": messages, "temperature": temperature}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    res = http_post(
        "https://api.openai.com/v1/chat/completions",
        {"Authorization": f"Bearer {OPENAI_KEY}"},
        body,
    )
    return res["choices"][0]["message"]["content"], res.get("usage", {})


def openai_whisper(audio_path):
    """Multipart upload pro endpoint /audio/transcriptions."""
    boundary = "----PinguimBoundary" + str(int(time.time() * 1000))
    audio_bytes = Path(audio_path).read_bytes()
    nome = Path(audio_path).name

    parts = []
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(b'Content-Disposition: form-data; name="model"\r\n\r\n')
    parts.append(b"whisper-1\r\n")
    parts.append(f"--{boundary}\r\n".encode())
    parts.append(f'Content-Disposition: form-data; name="file"; filename="{nome}"\r\n'.encode())
    parts.append(b"Content-Type: audio/mpeg\r\n\r\n")
    parts.append(audio_bytes)
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    body = b"".join(parts)

    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/transcriptions",
        data=body,
        headers={
            "Authorization": f"Bearer {OPENAI_KEY}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))["text"]


def supabase_query(sql):
    return http_post(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        {"Authorization": f"Bearer {ACCESS_TOKEN}"},
        {"query": sql},
    )


def supabase_insert(table, payload):
    """Insert via PostgREST."""
    headers = {
        "Authorization": f"Bearer {SERVICE_KEY}",
        "apikey": SERVICE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
        "Content-Profile": "pinguim",
    }
    res = http_post(f"{SUPABASE_URL}/rest/v1/{table}", headers, payload)
    return res


# --- prompt principal de extracao ---
PROMPT_EXTRACAO = """Voce analisa depoimentos/provas sociais postados no canal #depoimentos do Discord da Agencia Pinguim.

PRODUTOS DA PINGUIM (lista FECHADA, voce pode atribuir SOMENTE estes):
- elo (tambem aceita "ciclo" como nome antigo)
- proalt (tambem "pro-alt", "pro alt")
- lyra (tambem "lira")
- taurus
- orion
- low ticket (Desafio Low Ticket)
- lo-fi (Desafio Lo-fi)
- analise de perfil
- mentoria express
- desconhecido (use SEMPRE que regra de match abaixo nao bater)

================================================================
REGRA DE OURO — MATCH LITERAL OBRIGATORIO
================================================================
Voce SO PODE atribuir um produto se o NOME LITERAL do produto aparecer:
(a) no texto da mensagem do Discord, OU
(b) escrito DENTRO da imagem (texto visivel no print/captura)

Variacoes aceitas para match (case-insensitive):
- "elo", "ciclo"
- "proalt", "pro-alt", "pro alt"
- "lyra", "lira"
- "taurus", "taurinos", "taurinas"
- "orion"
- "low ticket", "low-ticket", "lowticket", "desafio low ticket"
- "lo-fi", "lofi", "desafio lo-fi", "desafio lofi"
- "analise de perfil", "analise do perfil", "analise de perfil de instagram"
- "mentoria express", "express"

REGRAS DURAS — VIOLAR = ERRO:

1. A palavra "mentoria" SOZINHA NAO E PRODUTO. Se aparecer "mentoria" sem qualificador
   (ex: "fiz uma mentoria", "a mentoria de voces"), o produto e "desconhecido".

2. A palavra "programa" SOZINHA NAO E PRODUTO. Mesmo raciocinio.

3. Se o conteudo mencionar EXPLICITAMENTE "Mentoria Express", e Mentoria Express.
   NAO e Elo, mesmo que voce ache que Elo e mentoria tambem.

4. Se o aluno mencionar MULTIPLOS produtos (ex: "fiz Mentoria Express e depois Elo"),
   escolha o produto que e o FOCO do depoimento. Se nao da pra decidir, "desconhecido".

5. PROIBIDO inferir produto por contexto, nicho do aluno, autor da postagem, ou
   "estilo" de depoimento. SO MATCH LITERAL.

6. PROIBIDO inventar texto. O conteudo_transcrito deve repetir EXATAMENTE o que
   esta escrito no print ou no texto. NUNCA adicione "...com a Mentoria Elo" ou
   similar se isso nao estiver na evidencia.

7. Confianca:
   - "alta" = nome do produto aparece literal (texto OU imagem)
   - "media" = NAO USAR (vira desconhecido)
   - "baixa" = NAO USAR (vira desconhecido)
   So duas opcoes praticas: alta + match, ou desconhecido sem match.

================================================================
TIPOS DE PROVA
================================================================
- faturamento (print de venda/dashboard com numero faturado)
- depoimento_texto (mensagem em texto com elogio/agradecimento)
- conversa_whatsapp (print de conversa de WhatsApp/DM/Instagram)
- case_completo (varios prints + texto contando jornada completa)
- outro

================================================================
SAIDA — JSON com este formato exato
================================================================
{
  "aluno": "Nome do aluno se identificavel, senao null",
  "produto": "elo|proalt|lyra|taurus|orion|low ticket|lo-fi|analise de perfil|mentoria express|desconhecido",
  "produto_confianca": "alta",
  "produto_evidencia": "Frase ou trecho LITERAL onde o nome do produto aparece. Se produto=desconhecido, escreva por que (ex: 'menciona apenas mentoria, sem qualificador').",
  "tipo_prova": "faturamento|depoimento_texto|conversa_whatsapp|case_completo|outro",
  "conteudo_transcrito": "Transcricao FIEL do conteudo. Maximo 2000 chars. NUNCA adicionar interpretacao.",
  "nicho": "Nicho do aluno se mencionado, senao null",
  "valor_mencionado": "Valor em R$ se aparece literal, senao null",
  "resumo_uma_linha": "Quem + o que conseguiu. Se produto for conhecido, pode citar; se desconhecido, NAO mencionar produto inventado."
}

LEMBRE-SE: e MELHOR marcar 'desconhecido' do que arriscar produto errado.
Falso positivo destroi credibilidade. Falso negativo so perde uma oportunidade."""


def extrair_estrutura(msg):
    """Chama Vision/texto pra extrair estrutura do depoimento."""
    texto_msg = (msg.get("content") or "").strip()
    atts = msg.get("attachments", [])

    user_content = []
    user_content.append({
        "type": "text",
        "text": f"Texto da mensagem do Discord:\n```\n{texto_msg or '(vazio)'}\n```\n\nAnalise e retorne o JSON conforme instrucoes."
    })

    # adiciona imagens
    for att in atts:
        url = att.get("_public_url")
        ext = (att.get("filename", "").rsplit(".", 1)[-1] or "").lower()
        if url and ext in ("png", "jpg", "jpeg", "gif", "webp"):
            user_content.append({
                "type": "image_url",
                "image_url": {"url": url, "detail": "auto"},
            })

    # se tem audio (ogg/mp3 ou audio extraido de video), transcreve antes
    transcricoes = []
    for att in atts:
        nome = att.get("filename", "")
        ext = (nome.rsplit(".", 1)[-1] or "").lower()
        audio_local = None
        if ext in ("ogg", "mp3", "wav", "m4a", "opus"):
            cand = SAIDA / "anexos" / f"{msg['id']}_{nome}"
            if cand.exists():
                audio_local = cand
        elif att.get("_audio_extraido_local"):
            audio_local = Path(att["_audio_extraido_local"])

        if audio_local and audio_local.exists():
            try:
                texto_audio = openai_whisper(audio_local)
                transcricoes.append(f"[Transcricao de {nome}]: {texto_audio}")
            except Exception as e:
                transcricoes.append(f"[Erro transcrevendo {nome}: {e}]")

    if transcricoes:
        user_content[0]["text"] += "\n\nTranscricoes de audio anexados:\n" + "\n\n".join(transcricoes)

    # decide modelo: se tem imagem usa gpt-4o (vision), senao mini
    tem_imagem = any(c.get("type") == "image_url" for c in user_content)
    model = "gpt-4o-mini" if tem_imagem else "gpt-4o-mini"  # mini ja faz vision

    messages = [
        {"role": "system", "content": PROMPT_EXTRACAO},
        {"role": "user", "content": user_content},
    ]

    raw, usage = openai_chat(messages, model=model, json_mode=True)
    return json.loads(raw), usage, transcricoes


def normalizar_produto(produto_raw):
    """Mapeia string do LLM pro cerebro+produto."""
    if not produto_raw:
        return None
    p = produto_raw.lower().strip()
    return CEREBROS.get(p)


# variantes literais que devem aparecer no texto/imagem para validar a classificacao
PRODUTO_VARIANTES = {
    "Elo":                  ["elo", "ciclo"],
    "Proalt":               ["proalt", "pro-alt", "pro alt"],
    "Lyra":                 ["lyra", "lira"],
    "Taurus":               ["taurus", "taurinos", "taurinas"],
    "Orion":                ["orion"],
    "Low Ticket Desafio":   ["low ticket", "low-ticket", "lowticket", "desafio low ticket"],
    "Lo-fi Desafio":        ["lo-fi", "lofi", "lo fi", "desafio lo-fi", "desafio lofi"],
    "Analise de Perfil":    ["analise de perfil", "análise de perfil", "analise do perfil", "análise do perfil"],
    "Mentoria Express":     ["mentoria express"],
}


def validar_match_literal(produto_canonico, texto_msg, conteudo_transcrito, evidencia):
    """Confirma que pelo menos UMA variante do produto aparece no material.
    Retorna (ok, motivo).
    """
    if not produto_canonico:
        return False, "produto nao mapeado"
    variantes = PRODUTO_VARIANTES.get(produto_canonico, [])
    if not variantes:
        return False, "sem variantes definidas"

    fontes = " | ".join(filter(None, [
        (texto_msg or "").lower(),
        (conteudo_transcrito or "").lower(),
        (evidencia or "").lower(),
    ]))
    for v in variantes:
        if v in fontes:
            return True, f"match literal: '{v}'"
    return False, f"nenhuma variante {variantes} encontrada"


def salvar_no_banco(msg, estrutura, transcricoes):
    """Insere em cerebro_fontes (se classificou) + provas_sociais (sempre)."""
    cerebro_info = normalizar_produto(estrutura.get("produto"))

    # validacao de match literal — defesa contra hallucination do LLM
    auditoria = {"validado": False, "motivo": "produto desconhecido"}
    if cerebro_info:
        texto_msg = (msg.get("content") or "")
        conteudo = estrutura.get("conteudo_transcrito") or ""
        evidencia = estrutura.get("produto_evidencia") or ""
        ok, motivo = validar_match_literal(cerebro_info["nome"], texto_msg, conteudo, evidencia)
        auditoria = {"validado": ok, "motivo": motivo}
        if not ok:
            # rebaixa pra desconhecido — nao confia no LLM
            print(f"  [AUDIT-FAIL msg {msg['id']}] LLM disse '{cerebro_info['nome']}' mas {motivo}")
            cerebro_info = None
            estrutura["produto_rejeitado_pela_auditoria"] = estrutura.get("produto")
            estrutura["produto"] = "desconhecido"

    # monta conteudo md
    aluno = estrutura.get("aluno") or "Aluno nao identificado"
    conteudo_md = estrutura.get("conteudo_transcrito") or "(sem conteudo)"
    nicho = estrutura.get("nicho")
    valor = estrutura.get("valor_mencionado")
    tipo = estrutura.get("tipo_prova", "outro")

    # primeiro anexo publico (pra mostrar)
    primeiro_anexo = None
    for att in msg.get("attachments", []):
        if att.get("_public_url"):
            primeiro_anexo = att
            break

    titulo = f"Depoimento - {aluno}" + (f" ({nicho})" if nicho else "")

    md_partes = [f"**Aluno:** {aluno}"]
    if cerebro_info:
        md_partes.append(f"**Produto:** {cerebro_info['nome']}")
    if nicho:
        md_partes.append(f"**Nicho:** {nicho}")
    if valor:
        md_partes.append(f"**Valor mencionado:** {valor}")
    md_partes.append(f"**Tipo:** {tipo}")
    md_partes.append(f"**Postado por:** @{msg.get('author', {}).get('username')} em {msg.get('timestamp', '')[:10]}")
    if primeiro_anexo:
        md_partes.append(f"**Anexo:** {primeiro_anexo['_public_url']}")
    md_partes.append("")
    md_partes.append("## Depoimento")
    md_partes.append("")
    md_partes.append(conteudo_md)
    if transcricoes:
        md_partes.append("")
        md_partes.append("## Audio")
        md_partes.append("")
        md_partes.extend(transcricoes)
    if (msg.get("content") or "").strip():
        md_partes.append("")
        md_partes.append("## Texto original do Discord")
        md_partes.append("")
        md_partes.append(msg["content"])

    conteudo_final = "\n".join(md_partes)

    fonte_id = None
    if cerebro_info:
        # insere em cerebro_fontes
        fonte_payload = {
            "cerebro_id": cerebro_info["cerebro_id"],
            "tipo": "depoimento",
            "titulo": titulo,
            "conteudo_md": conteudo_final,
            "origem": "discord",
            "autor": aluno,
            "url": f"https://discord.com/channels/1083429941300969574/1147227247883858041/{msg['id']}",
            "ingest_status": "pendente",
            "metadata": {
                "discord_message_id": msg["id"],
                "discord_postado_por": msg.get("author", {}).get("username"),
                "discord_postado_em": msg.get("timestamp"),
                "anexo_principal_url": primeiro_anexo["_public_url"] if primeiro_anexo else None,
                "tipo_prova": tipo,
                "nicho": nicho,
                "valor_mencionado": valor,
                "produto_confianca": estrutura.get("produto_confianca"),
                "resumo": estrutura.get("resumo_uma_linha"),
            },
        }
        try:
            res = supabase_insert("cerebro_fontes", fonte_payload)
            fonte_id = res[0]["id"] if res else None
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            print(f"  ERRO insert cerebro_fontes: {body[:300]}")

    # sempre insere em provas_sociais
    prova_payload = {
        "produto_id": cerebro_info["produto_id"] if cerebro_info else None,
        "cerebro_id": cerebro_info["cerebro_id"] if cerebro_info else None,
        "fonte_id": fonte_id,
        "aluno": aluno if estrutura.get("aluno") else None,
        "conteudo": conteudo_md,
        "tipo_prova": tipo,
        "nicho": nicho,
        "valor_estimado": valor,
        "anexo_url": primeiro_anexo["_public_url"] if primeiro_anexo else None,
        "anexo_storage_path": f"pinguim-provas-sociais/{msg['id']}_{primeiro_anexo['filename']}" if primeiro_anexo else None,
        "mime_anexo": primeiro_anexo.get("_mime_real") if primeiro_anexo else None,
        "postado_por": msg.get("author", {}).get("username"),
        "postado_em": msg.get("timestamp"),
        "link_discord": f"https://discord.com/channels/1083429941300969574/1147227247883858041/{msg['id']}",
        "mensagem_discord_id": msg["id"],
        "metadata": {
            "produto_raw": estrutura.get("produto"),
            "produto_confianca": estrutura.get("produto_confianca"),
            "produto_evidencia": estrutura.get("produto_evidencia"),
            "produto_rejeitado_pela_auditoria": estrutura.get("produto_rejeitado_pela_auditoria"),
            "auditoria": auditoria,
            "resumo": estrutura.get("resumo_uma_linha"),
            "transcricoes_audio": transcricoes if transcricoes else None,
            "todos_anexos": [a.get("_public_url") for a in msg.get("attachments", []) if a.get("_public_url")],
        },
    }
    try:
        supabase_insert("provas_sociais", prova_payload)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  ERRO insert provas_sociais: {body[:300]}")
        return False

    return True


# --- loop principal ---
data = json.loads((SAIDA / "depoimentos_limpos.json").read_text(encoding="utf-8"))
print(f"Total a processar: {len(data)}\n")

custo_estimado = 0.0
sucesso = 0
falha = 0
desconhecido = 0

por_produto = {}

for i, msg in enumerate(data, 1):
    if msg["id"] in progresso:
        continue
    try:
        estrutura, usage, transcricoes = extrair_estrutura(msg)
        # custo estimado: gpt-4o-mini = $0.15/M input, $0.60/M output
        custo_msg = (usage.get("prompt_tokens", 0) * 0.15 + usage.get("completion_tokens", 0) * 0.60) / 1_000_000
        custo_estimado += custo_msg

        ok = salvar_no_banco(msg, estrutura, transcricoes)
        produto = estrutura.get("produto", "?")
        por_produto[produto] = por_produto.get(produto, 0) + 1

        progresso[msg["id"]] = {
            "ok": ok,
            "produto": produto,
            "aluno": estrutura.get("aluno"),
            "tipo": estrutura.get("tipo_prova"),
            "custo_usd": custo_msg,
        }
        if ok:
            sucesso += 1
        else:
            falha += 1
        if produto == "desconhecido":
            desconhecido += 1
    except Exception as e:
        print(f"  [{i}/{len(data)}] ERRO em {msg['id']}: {type(e).__name__}: {str(e)[:200]}")
        progresso[msg["id"]] = {"ok": False, "erro": str(e)[:300]}
        falha += 1

    if i % 5 == 0:
        salvar_progresso()
        cotacao = 5.0  # USD->BRL aprox
        print(f"  [{i}/{len(data)}]  ok:{sucesso}  falha:{falha}  desc:{desconhecido}  custo:${custo_estimado:.3f} (~R${custo_estimado*cotacao:.2f})")

    time.sleep(0.3)

salvar_progresso()

print(f"\n=== Final ===")
print(f"Processados: {sucesso}")
print(f"Falhas:      {falha}")
print(f"Desconhecido: {desconhecido}")
print(f"Custo USD:   ${custo_estimado:.3f}")
print(f"Custo BRL:   ~R${custo_estimado*5.0:.2f}")
print(f"\nDistribuicao por produto:")
for p, n in sorted(por_produto.items(), key=lambda x: -x[1]):
    print(f"  {p}: {n}")
