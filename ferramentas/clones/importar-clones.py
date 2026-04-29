"""
Importa clones existentes em disco pra pinguim.produtos + pinguim.cerebros.

Categorias importadas:
- 3 socios da Pinguim (Luiz, Micha, Pedro) — subcategoria=socio_pinguim
- 25 copywriters em cerebro/squads/copy/agentes — subcategoria=externo_copy
- 13 storytellers em cerebro/squads/storytelling/agentes — subcategoria=externo_storytelling

Cada clone vira:
1. row em pinguim.produtos (categoria=clone, subcategoria=...)
2. row em pinguim.cerebros (1:1 com produto)
3. row em pinguim.cerebro_fontes com SOUL.md como conteudo (status=ok)

Idempotente: se ja existe (slug), atualiza.

Uso:
  cd c:/Squad
  python ferramentas/clones/importar-clones.py
"""

import os
import re
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / '.env.local'

# --- Carrega env ---
def load_env(file):
    env = {}
    if not file.exists():
        print(f"[ERRO] .env.local nao encontrado em {file}")
        sys.exit(1)
    for line in file.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        v = v.strip().strip('"').strip("'")
        env[k.strip()] = v
    return env

env = load_env(ENV_FILE)
SUPABASE_URL = env.get('SUPABASE_URL', '')
SERVICE_KEY = env.get('SUPABASE_SERVICE_ROLE_KEY', '') or env.get('SUPABASE_SERVICE_KEY', '')

if not SUPABASE_URL or not SERVICE_KEY:
    print("[ERRO] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao definidos no .env.local")
    sys.exit(1)

REST = f"{SUPABASE_URL.rstrip('/')}/rest/v1"

def req(method, path, body=None, params=None):
    url = f"{REST}/{path}"
    if params:
        from urllib.parse import urlencode
        url += '?' + urlencode(params)
    headers = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Accept-Profile': 'pinguim',
        'Content-Profile': 'pinguim',
        'Prefer': 'return=representation',
    }
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req_obj = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req_obj, timeout=30) as resp:
            text = resp.read().decode('utf-8')
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        body_err = e.read().decode('utf-8') if e.fp else ''
        print(f"[HTTPError {e.code}] {method} {path}: {body_err}")
        raise

# --- Helpers de parsing ---
def parse_identity(md_path):
    """Le IDENTITY.md e extrai nome + emoji"""
    if not md_path.exists():
        return None, None
    text = md_path.read_text(encoding='utf-8')
    nome = None
    emoji = None
    m = re.search(r'\*\*Nome:\*\*\s*(.+)', text)
    if m:
        nome = m.group(1).strip()
    m = re.search(r'\*\*Emoji:\*\*\s*(.+)', text)
    if m:
        emoji = m.group(1).strip()
    return nome, emoji

def parse_descricao(soul_path):
    """Extrai os primeiros paragrafos uteis do SOUL.md como descricao curta"""
    if not soul_path.exists():
        return None
    text = soul_path.read_text(encoding='utf-8')
    # Pula titulo, vai pro primeiro paragrafo de conteudo apos "## 1." ou similar
    m = re.search(r'## 1\.\s*[^\n]*\n+(.+?)(?=\n##|\Z)', text, re.DOTALL)
    if m:
        first = m.group(1).strip().split('\n\n')[0]
        # Limita a 280 chars pra ficar como descricao curta
        if len(first) > 280:
            first = first[:277].rsplit(' ', 1)[0] + '...'
        return first
    # Fallback: primeiras 280 chars do conteudo
    plain = re.sub(r'^#.*$', '', text, flags=re.MULTILINE).strip()
    return plain[:280] if plain else None

def slugify(s):
    s = s.lower()
    s = re.sub(r'[^a-z0-9-]+', '-', s)
    s = re.sub(r'-+', '-', s).strip('-')
    return s

# --- Lista de clones a importar ---
def coletar_clones():
    clones = []

    # 1. Socios Pinguim
    base_socios = ROOT / 'cerebro' / 'agentes' / 'pessoais'
    for slug in ['luiz', 'micha', 'pedro']:
        d = base_socios / slug
        if not d.exists():
            print(f"[SKIP] {d} nao existe")
            continue
        nome, emoji = parse_identity(d / 'IDENTITY.md')
        descricao = parse_descricao(d / 'SOUL.md')
        soul = (d / 'SOUL.md').read_text(encoding='utf-8') if (d / 'SOUL.md').exists() else ''
        clones.append({
            'slug': f'clone-{slug}',
            'nome': nome or f'Clone {slug.title()}',
            'emoji': emoji or '👤',
            'descricao': descricao or f'Clone do socio {slug.title()} da Pinguim',
            'subcategoria': 'socio_pinguim',
            'soul_md': soul,
            'origem': str(d.relative_to(ROOT)),
        })

    # 2. Copywriters
    base_copy = ROOT / 'cerebro' / 'squads' / 'copy' / 'agentes'
    if base_copy.exists():
        for d in sorted(base_copy.iterdir()):
            if not d.is_dir():
                continue
            slug_pasta = d.name
            if slug_pasta == 'copy-chief':
                continue  # orquestrador, nao e clone
            nome, emoji = parse_identity(d / 'IDENTITY.md')
            descricao = parse_descricao(d / 'SOUL.md')
            soul = (d / 'SOUL.md').read_text(encoding='utf-8') if (d / 'SOUL.md').exists() else ''
            clones.append({
                'slug': f'clone-{slug_pasta}',
                'nome': nome or slug_pasta.replace('-', ' ').title(),
                'emoji': emoji or '✍️',
                'descricao': descricao or '',
                'subcategoria': 'externo_copy',
                'soul_md': soul,
                'origem': str(d.relative_to(ROOT)),
            })

    # 3. Storytellers
    base_story = ROOT / 'cerebro' / 'squads' / 'storytelling' / 'agentes'
    if base_story.exists():
        for d in sorted(base_story.iterdir()):
            if not d.is_dir():
                continue
            slug_pasta = d.name
            if slug_pasta == 'story-chief':
                continue
            nome, emoji = parse_identity(d / 'IDENTITY.md')
            descricao = parse_descricao(d / 'SOUL.md')
            soul = (d / 'SOUL.md').read_text(encoding='utf-8') if (d / 'SOUL.md').exists() else ''
            clones.append({
                'slug': f'clone-{slug_pasta}',
                'nome': nome or slug_pasta.replace('-', ' ').title(),
                'emoji': emoji or '📖',
                'descricao': descricao or '',
                'subcategoria': 'externo_storytelling',
                'soul_md': soul,
                'origem': str(d.relative_to(ROOT)),
            })

    return clones

# --- Upserts ---
def upsert_produto(clone):
    """Cria ou atualiza produto. Retorna id."""
    existing = req('GET', 'produtos', params={'slug': f'eq.{clone["slug"]}', 'select': 'id'})
    payload = {
        'slug': clone['slug'],
        'nome': clone['nome'],
        'emoji': clone['emoji'],
        'descricao': clone['descricao'][:500] if clone['descricao'] else None,
        'categoria': 'clone',
        'subcategoria': clone['subcategoria'],
        'status': 'ativo',
    }
    if existing:
        produto_id = existing[0]['id']
        # Atualiza
        req('PATCH', 'produtos', body=payload, params={'id': f'eq.{produto_id}'})
        return produto_id, 'atualizado'
    else:
        # Insere
        result = req('POST', 'produtos', body=payload)
        return result[0]['id'], 'criado'

def get_or_create_cerebro(produto_id):
    existing = req('GET', 'cerebros', params={'produto_id': f'eq.{produto_id}', 'select': 'id'})
    if existing:
        return existing[0]['id']
    result = req('POST', 'cerebros', body={'produto_id': produto_id})
    return result[0]['id']

def upsert_fonte_soul(cerebro_id, slug, soul_md):
    """Cria/atualiza a fonte SOUL.md do clone (ingest_status=ok pra ja aparecer no catalogo)."""
    titulo = 'SOUL — voz e metodo'
    existing = req('GET', 'cerebro_fontes', params={
        'cerebro_id': f'eq.{cerebro_id}',
        'titulo': f'eq.{titulo}',
        'select': 'id',
    })
    payload = {
        'cerebro_id': cerebro_id,
        'tipo': 'manifesto',
        'titulo': titulo,
        'autor': slug,
        'origem': 'import-clones',
        'conteudo_md': soul_md,
        'ingest_status': 'ok',
    }
    if existing:
        req('PATCH', 'cerebro_fontes', body=payload, params={'id': f'eq.{existing[0]["id"]}'})
        return 'atualizada'
    else:
        req('POST', 'cerebro_fontes', body=payload)
        return 'criada'

# --- Main ---
def main():
    clones = coletar_clones()
    print(f"\n=== Coletei {len(clones)} clones ===\n")
    for c in clones:
        print(f"  [{c['subcategoria']}] {c['nome']} ({c['slug']}) — {c['origem']}")
    print()

    if '--dry-run' in sys.argv:
        print("[DRY-RUN] Nao vou subir pro banco. Saindo.")
        return

    print("=== Subindo pro banco... ===\n")
    sumario = {'criados': 0, 'atualizados': 0, 'erros': 0, 'fontes_novas': 0, 'fontes_atualizadas': 0}
    for c in clones:
        try:
            pid, acao = upsert_produto(c)
            cid = get_or_create_cerebro(pid)
            if c['soul_md']:
                f_acao = upsert_fonte_soul(cid, c['slug'], c['soul_md'])
                if f_acao == 'criada':
                    sumario['fontes_novas'] += 1
                else:
                    sumario['fontes_atualizadas'] += 1
            sumario['criados' if acao == 'criado' else 'atualizados'] += 1
            print(f"  OK {c['nome']} ({acao})")
        except Exception as e:
            sumario['erros'] += 1
            print(f"  ERRO {c['nome']}: {e}")

    print(f"\n=== Resumo ===")
    print(f"  Produtos criados: {sumario['criados']}")
    print(f"  Produtos atualizados: {sumario['atualizados']}")
    print(f"  Fontes SOUL criadas: {sumario['fontes_novas']}")
    print(f"  Fontes SOUL atualizadas: {sumario['fontes_atualizadas']}")
    print(f"  Erros: {sumario['erros']}")

if __name__ == '__main__':
    main()
