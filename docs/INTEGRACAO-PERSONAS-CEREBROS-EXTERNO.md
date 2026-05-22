# Integração externa — Personas + Cérebros do Pinguim

> **Para quem é este doc:** projeto externo (gerador de criativos / roteiros) que vai **consumir** persona e Cérebro de cada produto Pinguim diretamente do Supabase.
> **Modo:** somente leitura. O projeto externo NÃO escreve, NÃO altera, só consulta.
> **Versão:** 2026-05-20

---

## 1. Visão geral — como o Mission Control vê isso

No Mission Control (lado do Pinguim) existem duas telas que tu vais replicar:

- **Tela Cérebros** → lista de produtos com seus respectivos Cérebros (corpus de conhecimento: aulas, depoimentos, páginas, objeções, etc).
- **Tela Personas** → 1 persona por Cérebro, com 11 blocos estruturados (identidade, rotina, dores, objeções, vocabulário, etc).

Cada **produto** tem **1 Cérebro** (relação 1:1). Cada **Cérebro** tem **0 ou 1 persona** (a versão mais recente). Persona é versionada: cada regeração vira `versao++` na linha e o estado anterior vai para `personas_snapshots`.

Hoje (2026-05-20) **6 produtos têm persona pronta**: `proalt`, `elo`, `tuarus`, `lyra`, `mentoria-express`, `desafio-de-conte-do-lo-fi`. Os outros 4 produtos `interno` ainda estão sem persona (gera quando o time pedir).

---

## 2. Credenciais Supabase

```env
SUPABASE_URL=https://wmelierxzpjamiofeemh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtZWxpZXJ4enBqYW1pb2ZlZW1oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzIzNjkzNCwiZXhwIjoyMDg4ODEyOTM0fQ.XwM9JHYdbf9sd9VUobR8TJ5uRbnDnViMA-M3AbRFBG0
```

**Importante sobre a chave:**

- Use **SERVICE_ROLE_KEY** (não a anon). A anon não enxerga `personas`, `cerebros`, `cerebro_fontes` nem `produtos` por causa do RLS — só vê a `vw_cerebros_catalogo`. Pra ter acesso completo de leitura precisa do service role.
- **Essa chave é sensível**: bypassa RLS e abre acesso TOTAL ao banco inclusive ao schema `public` da Dolphin. Mantém ela **só no backend** do teu projeto externo, **nunca no frontend** e **nunca commitada em repo público**.
- Cliente externo deve **apenas SELECT**. Não fazer INSERT/UPDATE/DELETE nas tabelas do Pinguim — todo o ciclo de vida (gerar persona, regenerar, salvar snapshot) é feito pelo Mission Control. Se gravar à toa, quebra a fonte da verdade.
- Schema correto: tudo vive em `pinguim` (não `public`). Setar `db: { schema: 'pinguim' }` no client.

### Setup recomendado (Node.js)

```js
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: 'pinguim' } }
);
```

---

## 3. Modelo de dados (só o que tu precisa)

### 3.1 `produtos`

Catálogo mestre. **Filtrar por `categoria = 'interno'`** — esses são os produtos reais da Pinguim (Proalt, Elo, Taurus, etc). Os 104 produtos com `categoria = 'clone'` são clones externos (Pedro Sobral, Hormozi, Halbert) — não usar para gerar criativo Pinguim. Os com `categoria = 'metodologia'` também não.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid | PK |
| `slug` | text | identificador legível (`proalt`, `elo`, ...) — **use este pra apresentar e referenciar** |
| `nome` | text | nome de exibição |
| `emoji` | text | ícone |
| `icone_url` | text | URL de logo (pode ser null) |
| `descricao` | text | descrição curta |
| `categoria` | text | `interno` \| `clone` \| `metodologia` |
| `subcategoria` | text | granularidade interna |
| `status` | enum | `ativo` \| `em_construcao` \| `rascunho` \| `arquivado` |

### 3.2 `cerebros`

1:1 com `produtos`.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid | PK — referenciada por `personas.cerebro_id` e `cerebro_fontes.cerebro_id` |
| `produto_id` | uuid | FK → `produtos.id` (UNIQUE) |
| `mapa_md` | text | "MAPA" do Cérebro em markdown (resumo curado pelo time) |
| `ultima_alimentacao` | timestamptz | última vez que entrou fonte |

### 3.3 `personas` — **fonte canônica**

1 linha por Cérebro. Quando regenera, o `versao` incrementa e a linha é UPDATEada (a versão anterior vai pra `personas_snapshots`).

| Coluna | Tipo | Conteúdo |
|---|---|---|
| `id` | uuid | PK |
| `cerebro_id` | uuid | FK → `cerebros.id` |
| `versao` | int | v1, v2, v3... (Proalt já está em v12, Elo v9) |
| `gerado_em` | timestamptz | primeira geração |
| `atualizado_em` | timestamptz | última edição/regeração |
| `modelo` | text | LLM usado (`gpt-4o-mini`, etc) |
| `fontes_usadas` | int | quantos chunks alimentaram a geração |
| `campos_editados` | jsonb (array) | blocos editados manualmente — não devem ser sobrescritos em regenerações futuras |
| **Bloco 1 — Identidade** | | |
| `identidade` | jsonb (objeto) | `{nome_ficticio, idade, profissao, momento_de_vida}` |
| **Bloco 2 — Rotina** | | |
| `rotina` | jsonb (objeto) | `{como_e_o_dia, desafios_diarios}` |
| **Bloco 3 — Nível de consciência (Schwartz)** | | |
| `nivel_consciencia` | jsonb (objeto) | `{nivel: 'unaware'|'problem-aware'|'solution-aware'|'product-aware'|'most-aware', justificativa}` |
| **Bloco 4 — Jobs to be Done** | | |
| `jobs_to_be_done` | jsonb (objeto) | `{funcional, emocional, social}` |
| **Bloco 5 — Vozes da cabeça** | | |
| `vozes_cabeca` | jsonb (array de strings) | 10 frases em 1ª pessoa do pensamento silencioso |
| **Bloco 6 — Desejos reais** | | |
| `desejos_reais` | jsonb (array de strings) | 10 desejos reprimidos/adiados |
| **Bloco 7 — Crenças limitantes** | | |
| `crencas_limitantes` | jsonb (array de strings) | 10 crenças que travam |
| **Bloco 8 — Dores latentes** | | |
| `dores_latentes` | jsonb (array de strings) | 10 frustrações do dia a dia |
| **Bloco 9 — Objeções de compra** | | |
| `objecoes_compra` | jsonb (array de strings) | 5-10 objeções comuns |
| **Bloco 10 — Vocabulário** | | |
| `vocabulario` | jsonb (array de objetos) | `[{palavra, por_que_usa}, ...]` — **gold para copy/roteiro** |
| **Bloco 11 — Onde vive** | | |
| `onde_vive` | jsonb (objeto) | `{podcasts_canais, comunidades, influenciadores, ...}` |
| **Legados (versão antiga, podem estar null nas novas)** | | |
| `quem_e` | text | resumo (compat v1) |
| `dor_principal` | text | (compat v1) |
| `gatilhos_compra` | text | (compat v1) |
| `objecoes` | text | (compat v1) |
| `linguagem` | text | (compat v1) |

### 3.4 `personas_snapshots`

Histórico imutável de versões antigas. Útil pra A/B test de criativo entre versões da persona.

| Coluna | Tipo |
|---|---|
| `id` | uuid PK |
| `persona_id` | uuid FK → `personas.id` |
| `cerebro_id` | uuid |
| `versao` | int — versão congelada |
| `snapshot` | jsonb — cópia completa da persona naquele momento (todos os blocos) |
| `motivo` | text — `regenerar` \| `editar` \| `antes_de_restaurar` |
| `fontes_usadas` | int |
| `modelo` | text |
| `criado_em` | timestamptz |

### 3.5 `cerebro_fontes` — o "corpus" do Cérebro

Cada peça que alimenta o Cérebro: aula, depoimento, página de vendas, objeção, sacada, post de venda, etc.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `cerebro_id` | uuid FK | |
| `tipo` | text | `aula` \| `pagina_venda` \| `depoimento` \| `objecao` \| `sacada` \| `mensagem` \| (livre) |
| `titulo` | text | |
| `conteudo_md` | text | **conteúdo cheio em markdown** — é o que tu lê pra alimentar o roteiro |
| `origem` | text | `upload` \| `lote` \| `discord` \| `whatsapp` \| `expert` \| ... |
| `autor` | text | quem produziu |
| `url` | text | link original (se houver) |
| `metadata` | jsonb | dados extras por tipo |
| `ingest_status` | enum | **filtrar sempre por `'ok'`** — outros valores são pendente/quarentena/erro |
| `criado_em` / `atualizado_em` | timestamptz | |

### 3.6 `cerebro_fontes_chunks` — busca semântica (RAG)

Cada fonte é fatiada em chunks de ~500 tokens com embedding `text-embedding-3-small` (1536 dim). Tu **provavelmente não vai usar isso diretamente** — usa a RPC `buscar_chunks_semantico` (3.8) que retorna chunk + similaridade direto.

### 3.7 View pronta: `vw_cerebros_catalogo`

A mesma que o Mission Control usa pra listar Cérebros. Já vem com contagens.

| Coluna | Conteúdo |
|---|---|
| `cerebro_id`, `produto_id`, `slug`, `nome`, `emoji`, `icone_url`, `descricao`, `categoria`, `subcategoria`, `status` | identidade |
| `ultima_alimentacao` | timestamptz |
| `total_fontes` | int — fontes com `ingest_status='ok'` |
| `fontes_ultima_semana` | int |
| `preenchimento_pct` | int — % de completude do Cérebro |

### 3.8 RPC: busca semântica de chunks

```sql
pinguim.buscar_chunks_semantico(
  query_embedding extensions.vector(1536),
  target_cerebro_id uuid,
  top_k integer default 8,
  min_similarity numeric default 0.5
)
```

Retorna: `chunk_id, fonte_id, tipo, titulo, conteudo, similarity`.

Uso típico: tu gera embedding da intenção do criativo (ex: "abrir uma copy provocativa sobre travas internas do vendedor low ticket"), passa pro RPC com o `cerebro_id` do produto-alvo, e recebe os 8 trechos mais relevantes do Cérebro. Embedding tem que ser gerado com `text-embedding-3-small` da OpenAI (mesma família do que vetorizou o Cérebro) — qualquer outro modelo NÃO vai ter compatibilidade dimensional/semântica.

---

## 4. Receitas prontas (replicar a tela do Mission Control)

### 4.1 Listar produtos que o usuário pode escolher

A primeira tela do teu projeto: "de qual produto você quer gerar criativo?".

```js
const { data: produtos } = await sb
  .from('vw_cerebros_catalogo')
  .select('slug, nome, emoji, icone_url, descricao, status, total_fontes, preenchimento_pct')
  .eq('categoria', 'interno')
  .neq('status', 'arquivado')
  .order('nome');
```

> **Filtro obrigatório:** `categoria = 'interno'`. Os 104 produtos `clone` (Halbert, Hormozi, Sobral, etc) são para o squad de copy do Pinguim usar como referência interna — não são produtos comercializáveis.

### 4.2 Verificar se o produto escolhido tem persona pronta

```js
const slug = 'proalt'; // o que o usuário escolheu

const { data: prod } = await sb
  .from('produtos')
  .select('id')
  .eq('slug', slug)
  .single();

const { data: cerebro } = await sb
  .from('cerebros')
  .select('id')
  .eq('produto_id', prod.id)
  .single();

const { data: persona } = await sb
  .from('personas')
  .select('*')
  .eq('cerebro_id', cerebro.id)
  .maybeSingle();

if (!persona) {
  // produto ainda não tem persona — avisar usuário e oferecer outro
}
```

### 4.3 Função "fetchPersonaCompleta(slug)" — versão consolidada

```js
async function fetchPersonaCompleta(slug) {
  const { data: prod } = await sb.from('produtos').select('id').eq('slug', slug).single();
  if (!prod) return null;

  const { data: cer } = await sb.from('cerebros').select('id, mapa_md').eq('produto_id', prod.id).single();
  if (!cer) return null;

  const { data: persona } = await sb
    .from('personas')
    .select('*')
    .eq('cerebro_id', cer.id)
    .maybeSingle();

  return { produto: prod, cerebro: cer, persona };
}
```

### 4.4 Buscar trechos relevantes do Cérebro para um briefing

Cenário: usuário quer "um anúncio sobre o medo de não dar conta de fazer um lançamento sozinho". Tu precisa **dos trechos certos** do Cérebro, não dele inteiro.

```js
// 1) Embedding da intenção (OpenAI)
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const briefing = 'medo de não dar conta de fazer um lançamento sozinho, low ticket';
const emb = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: briefing,
});

// 2) Busca chunks mais relevantes do Cérebro Proalt
const { data: trechos } = await sb.rpc('buscar_chunks_semantico', {
  query_embedding: emb.data[0].embedding,
  target_cerebro_id: cerebroId,
  top_k: 8,
  min_similarity: 0.5,
});

// trechos: [{ chunk_id, fonte_id, tipo, titulo, conteudo, similarity }, ...]
```

### 4.5 Buscar fontes brutas por tipo (depoimentos, objeções, etc)

Se quiser exemplos crus sem semântica:

```js
const { data: depoimentos } = await sb
  .from('cerebro_fontes')
  .select('titulo, conteudo_md, autor, url, criado_em')
  .eq('cerebro_id', cerebroId)
  .eq('tipo', 'depoimento')
  .eq('ingest_status', 'ok')
  .order('criado_em', { ascending: false })
  .limit(20);
```

Tipos comuns: `aula`, `pagina_venda`, `depoimento`, `objecao`, `sacada`, `mensagem`. (Lista é aberta — depende do que o time alimentou.)

### 4.6 Histórico de personas (para experimentar versões antigas)

```js
const { data: snapshots } = await sb
  .from('personas_snapshots')
  .select('id, versao, motivo, modelo, fontes_usadas, criado_em')
  .eq('persona_id', personaId)
  .order('versao', { ascending: false });

// Pra carregar uma versão antiga inteira:
const { data: snap } = await sb
  .from('personas_snapshots')
  .select('snapshot')
  .eq('id', snapshotId)
  .single();

// snap.snapshot tem todos os blocos da persona naquela versão
```

---

## 5. Como montar o prompt do criativo (sugestão)

A combinação que funciona bem (e é o padrão que o squad do Pinguim já usa internamente):

```
[CONTEXTO DA PERSONA]
Identidade: {persona.identidade.nome_ficticio}, {persona.identidade.idade}, {persona.identidade.profissao}
Momento de vida: {persona.identidade.momento_de_vida}
Nível de consciência (Schwartz): {persona.nivel_consciencia.nivel}

Dores latentes (use 2-3, não todas):
- {dores_latentes[0]}
- {dores_latentes[1]}
- {dores_latentes[2]}

Voz interna típica:
- "{vozes_cabeca[0]}"
- "{vozes_cabeca[1]}"

Objeção principal a derrubar: {objecoes_compra[0]}

Vocabulário a usar (palavras reais dela):
{vocabulario.map(v => v.palavra).join(', ')}

[CONTEXTO DO PRODUTO — RAG]
{top 5 chunks da rpc buscar_chunks_semantico relevantes ao briefing}

[BRIEFING]
{o que o usuário pediu}

[INSTRUÇÃO]
Escreva um {anúncio | roteiro de vídeo | e-mail} que:
- Fale como {nome_ficticio} fala (use o vocabulário)
- Toque na dor {x} sem mencionar o produto antes da metade
- Derrube a objeção {y} antes do CTA
```

---

## 6. Lista atual de produtos com persona pronta (snapshot 2026-05-20)

| Slug | Nome | Versão persona | Fontes no Cérebro |
|---|---|---|---|
| `proalt` | Proalt | v12 | 102 |
| `tuarus` | Taurus | v2 | 55 |
| `elo` | Elo | v9 | 40 |
| `lyra` | Lyra | v1 | 8 |
| `desafio-de-conte-do-lo-fi` | Lo-fi Desafio | v1 | 2 |
| `mentoria-express` | Mentoria Express | v1 | 1 |

Os 4 produtos `interno` restantes (`365-roteiros-validados`, `analise-de-perfil`, `low-ticket-desafio`, `orion`) ainda **não têm persona** — a query do passo 4.2 vai retornar `null` pra eles. Tratar UI com "Persona em construção, escolha outro produto".

---

## 7. Boas práticas para o projeto externo

- **Cache curto** (1-5 min) das personas — elas mudam pouco (versão nova é evento manual no Mission Control). Reduz hit no banco.
- **Não cachear chunks** semânticos — o Cérebro recebe ingestão diária e ficar com chunk velho leva a copy com referência morta.
- **Logar qual versão da persona foi usada** em cada criativo gerado: salva no teu lado `{persona_id, versao, gerado_em}` junto do output. Quando o Pinguim regenerar a persona, tu sabe qual criativo veio de qual mental model.
- **Não gerar persona** do seu lado — se ela está null, é null. Pedir pro time gerar no Mission Control e voltar. (Se tu chamar a edge function `gerar-persona`, vai disparar custo OpenAI no projeto Pinguim e poluir o histórico.)
- **Erros comuns:** se `db: { schema: 'pinguim' }` não estiver no client, tudo retorna "table not found" porque o default é `public` (schema da Dolphin, totalmente outro app).

---

## 8. Resumo executivo (TL;DR para o dev que vai implementar)

1. Criar client Supabase com SERVICE_ROLE no schema `pinguim`.
2. Tela 1 — listar produtos: `vw_cerebros_catalogo` filtrando `categoria='interno'`.
3. Tela 2 — usuário escolhe produto, tu busca persona: query do passo 4.3.
4. Tela 3 — mostra persona em 11 blocos (identidade, rotina, nivel_consciencia, jobs_to_be_done, vozes_cabeca, desejos_reais, crencas_limitantes, dores_latentes, objecoes_compra, vocabulario, onde_vive).
5. Quando for gerar criativo: monta prompt com persona + faz RAG em `buscar_chunks_semantico` pro Cérebro daquele produto.
6. Nunca escreve no banco. Só lê.

Qualquer dúvida sobre campo específico → todos os blocos estão estruturados e exemplificados na seção 3.3. Se um campo voltar `null`, é porque aquela persona ainda não recebeu esse bloco (acontece nas personas v1 antigas — só `proalt` e `elo` têm os 11 blocos completos hoje).
