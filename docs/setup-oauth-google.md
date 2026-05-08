# Setup OAuth Google (V2.12 Fase 0)

Pré-requisitos pra conectar o Atendente Pinguim ao Google Drive + Calendar dos sócios.

## Passo a passo (1ª vez — feito uma única vez por toda a equipe)

### 1. Criar projeto OAuth no Google Cloud Console

1. Acesse https://console.cloud.google.com
2. Crie um projeto novo: **"Pinguim OS"**
3. No menu lateral: **APIs e Serviços** → **Biblioteca**
4. Habilite as APIs:
   - **Google Drive API**
   - **Google Calendar API**
5. **APIs e Serviços** → **Tela de permissão OAuth**:
   - Tipo de usuário: **Externo** (até virar Workspace)
   - Nome do app: `Pinguim OS`
   - Email de suporte: `contato@agenciapinguim.com`
   - Domínio: deixar vazio (ou `agenciapinguim.com` quando produção)
   - Escopos sensíveis: adicionar
     - `auth/drive.readonly`
     - `auth/calendar.readonly`
   - Usuários de teste: adicionar emails dos 4 sócios (Luiz, Micha, Pedro, Codina)
6. **APIs e Serviços** → **Credenciais** → **Criar credenciais** → **ID do cliente OAuth 2.0**:
   - Tipo de aplicativo: **Aplicativo da Web**
   - Nome: `Pinguim OS - server-cli local`
   - URIs de redirecionamento autorizados:
     - `http://localhost:3737/oauth/google/callback`
     - (Quando produção, adicionar URL real)
7. Salve. **Copie o Client ID e o Client Secret** que aparecem.

### 2. Cadastrar credenciais no cofre Pinguim

As 2 chaves devem entrar como **chaves de sistema** (sem cliente_id). SQL via Edge Function ou painel `/seguranca`:

```sql
INSERT INTO pinguim.cofre_chaves (nome, provedor, escopo, onde_vive, valor_completo, ultimos_4, descricao, criado_em_provedor, ativo)
VALUES
  ('GOOGLE_OAUTH_CLIENT_ID',
   'Google',
   'oauth',
   'cofre',
   '<COLE_CLIENT_ID_AQUI>',
   '<ULTIMOS_4>',
   'OAuth Client ID Google Cloud — projeto Pinguim OS',
   now(),
   true),
  ('GOOGLE_OAUTH_CLIENT_SECRET',
   'Google',
   'oauth',
   'cofre',
   '<COLE_CLIENT_SECRET_AQUI>',
   '<ULTIMOS_4>',
   'OAuth Client Secret Google Cloud',
   now(),
   true);
```

### 3. Verificar

```bash
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT nome, provedor, ativo FROM pinguim.cofre_chaves WHERE provedor='\''Google'\'' ORDER BY nome;"}'
```

Esperado: 2 linhas com `nome=GOOGLE_OAUTH_CLIENT_ID/SECRET, ativo=true`.

## Passo a passo (cada sócio que conecta)

1. Sobe o server: `node server-cli/index.js`
2. Abre http://localhost:3737/conectar-google
3. Clica em **"Conectar Google"**
4. Faz login no Google (com a conta que tem Drive/Calendar da Pinguim)
5. Aceita os escopos `drive.readonly + calendar.readonly`
6. É redirecionado de volta com mensagem **"✓ Conectado"**

Refresh token fica gravado em `pinguim.cofre_chaves` com `cliente_id=<uuid do sócio>`.

## Como o Atendente usa depois

```bash
# Atendente roda script shell (futuro):
bash server-cli/scripts/buscar-drive.sh "copy do Elo"
```

Internamente:
1. Server-cli chama `oauthGoogle.obterAccessTokenAtivo({cliente_id})`
2. `db.lerChavePorCliente('GOOGLE_OAUTH_REFRESH', cliente_id)` lê refresh do cofre
3. POST em `oauth2.googleapis.com/token` troca refresh → access (cacheado em RAM ~50min)
4. GET em `www.googleapis.com/drive/v3/files?q=...` com Bearer token
5. Retorna lista de arquivos com `id, name, webViewLink, modifiedTime`

## Troubleshooting

**"GOOGLE_OAUTH_CLIENT_ID nao cadastrado"** — falta passo 2.

**"Google nao devolveu refresh_token"** — falta `prompt=consent` ou `access_type=offline` na URL de autorização. O `oauth-google.js` já faz, mas se Google identificar que esse usuário já autorizou antes, não devolve refresh. Solução: revogar acesso em https://myaccount.google.com/permissions e tentar de novo.

**"redirect_uri_mismatch"** — URL de callback no Google Console não bate com a do server. Conferir que adicionou `http://localhost:3737/oauth/google/callback` exato (com `:3737`).

**Token expira após 1h** — esperado. Refresh token (que vive 6 meses ou mais) renova automaticamente. Se refresh expira, sócio reconecta em `/conectar-google`.

## Revogação

- **Sócio remove sozinho:** https://myaccount.google.com/permissions → Pinguim OS → Remover acesso
- **Painel revoga (futuro V2.12 Fase X):** botão "Revogar" em `/conectar-google` chama `db.revogarOAuthToken()` que faz `UPDATE cofre_chaves SET ativo=false`. Não invalida no Google — sócio precisa revogar lá também.

## Princípios reforçados

- `feedback_principio_squad_cyber_obrigatorio.md` — escopo mínimo (read-only). Write virá em fase posterior com confirmação.
- `feedback_metodo_acima_de_ferramenta.md` — Drive é ferramenta. Quando trocarmos pra OneDrive/Dropbox, troca o adapter, não a squad.
- `project_cofre_fonte_canonica.md` — refresh tokens vivem no cofre canônico (com `cliente_id` por sócio). Padrão único de armazenamento de credenciais.
