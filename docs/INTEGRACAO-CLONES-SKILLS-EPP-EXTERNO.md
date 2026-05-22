# Integração externa — Clones, Skills, EPP e geração de variações de anúncio

> **Companheiro de:** [INTEGRACAO-PERSONAS-CEREBROS-EXTERNO.md](INTEGRACAO-PERSONAS-CEREBROS-EXTERNO.md)
> **Para quem:** projeto externo que lê anúncios de concorrente e gera variações usando Clones (mestres de copy) + Skills (frameworks/receitas) do Pinguim.
> **Versão:** 2026-05-22 — endpoints LIVE em produção, testados.

---

## TL;DR — como esse doc se encaixa

O outro doc já te ensinou a buscar **produto + persona + Cérebro**. Falta o resto da mesa: **Clones (quem fala)**, **Skills (como faz)** e **EPP (como o agente aprende com seu feedback)**.

**A arquitetura que vamos seguir, em uma frase:**
> Seu projeto **não escolhe skill, não consulta Cérebro, não gera copy**. Seu projeto **passa parâmetros** (`produto`, `persona`, `clone(s)`, `briefing`) pra um **Agente Pinguim** que faz tudo isso e devolve o output. Você só dá **feedback** depois.

Isso resolve:
1. Banco vivo no Pinguim — quando entra skill nova ou clone novo, seu projeto não precisa deploy.
2. EPP centralizado — agente aprende **aqui**, com toda a base de execuções, não só com seu projeto.
3. Auditoria, custo, kill-switch — tudo no lado Pinguim, sob nosso controle.
4. Seu projeto fica burro de propósito: 1 chamada, recebe resposta, propaga feedback. Acabou.

---

## 1. Clones — quem são, como filtrar

**Clones são pessoas reais clonadas como fontes de voz e método.** Vivem na tabela `pinguim.produtos` com `categoria = 'clone'` (104 clones hoje). Cada clone tem um Cérebro próprio com material da pessoa (livros, palestras, entrevistas).

### 1.1 Filtrar clones por área (chave seletora)

Use **`produtos.subcategoria`**. Distribuição real hoje:

| Subcategoria | Qtd | Quando aparece pro usuário |
|---|---|---|
| `copy` | 24 | **SIM** — geração de copy/anúncio/roteiro |
| `storytelling` | 12 | **SIM** — quando o briefing pede narrativa, VSL, evento |
| `traffic-masters` | 8 | **SIM** — quando o briefing é anúncio de tráfego pago |
| `design` | 8 | **TALVEZ** — se o output incluir descrição visual/criativo |
| `advisory-board` | 10 | **NÃO** — Munger, Brené Brown, Sivers (decisão estratégica, não copy) |
| `deep-research` | 10 | **NÃO** — pesquisa |
| `cybersecurity` | 6 | **NÃO** |
| `data` | 6 | **NÃO** |
| `finops` | 4 | **NÃO** — financeiro |
| `translate` | 7 | **NÃO** — usado internamente |
| `legal` | 3 | **NÃO** |
| `socio_pinguim` | 3 | **NÃO** — clones internos (Micha, Pedro, Luiz) |

**Para o teu projeto (gerar variação de anúncio) o filtro de exibição é:**
```sql
WHERE categoria = 'clone'
  AND subcategoria IN ('copy', 'storytelling', 'traffic-masters')
  AND status = 'ativo'
```

Isso dá **~44 clones relevantes**. Os outros 60 não aparecem na tela de escolha do usuário.

### 1.2 Query padrão pra listar clones disponíveis

```js
const { data: clones } = await sb
  .from('produtos')
  .select('id, slug, nome, emoji, icone_url, descricao, subcategoria')
  .eq('categoria', 'clone')
  .in('subcategoria', ['copy', 'storytelling', 'traffic-masters'])
  .neq('status', 'arquivado')
  .order('subcategoria')
  .order('nome');
```

Resultado vem agrupável por `subcategoria` na UI — "Copywriters", "Storytellers", "Tráfego".

### 1.3 Clones de copy implementados como agentes (em produção)

São 9 que JÁ têm `pinguim.agentes` populado com SOUL/SYSTEM-PROMPT e podem ser invocados pelo Agente Gerador (item 4):

`copy-chief`, `alex-hormozi`, `eugene-schwartz`, `gary-halbert`, `gary-bencivenga`, `dan-kennedy`, `russell-brunson`, `john-carlton`, `jon-benson`.

Os outros 15 clones de `copy` estão como produtos catalogados mas ainda não viraram agentes executáveis. **No teu UI mostre todos os 24 — o Agente Gerador decide se delega pra mestre implementado ou aplica o método via Copy Chief.**

### 1.4 Regra de UX (importante)

O usuário pode escolher:
- **1 clone** → o Agente Gerador chama esse clone, faz 1 variação.
- **N clones** → o Agente Gerador chama os N em paralelo, retorna N variações distintas.
- **Squad** → o Agente Gerador chama o `copy-chief`, ele monta time interno (até 2-3 mestres), consolida em **1 saída única** com voz coerente.

Esses 3 modos viram parâmetro na chamada (item 4.2).

---

## 2. Skills — o que são e por que tu NÃO escolhe

**Skills são frameworks/receitas reutilizáveis** — "como aplicar Value Equation de Hormozi", "como escrever bullets de fascinação", "anatomia de página low-ticket", etc. Hoje tem 55 skills na tabela `pinguim.skills`.

### 2.1 Por que skill NÃO sobe pra UI do teu projeto

A intuição inicial seria "deixa o usuário escolher skill também". **Mas isso quebra a arquitetura.** 3 razões:

1. **Banco vivo:** toda semana sobe skill nova. Se o usuário escolhe da lista, ele nunca usa o que entrou ontem.
2. **Escolher skill exige contexto que o usuário não tem:** "qual skill aplicar pra um hook de tráfego frio no nível 2 de Schwartz?" — isso é decisão de agente.
3. **Skill se combina:** raramente uma só. O Agente Gerador empilha 3-5 skills relevantes (`hook-pain-point` + `schwartz-5-stages` + `voice-of-customer` + `tom-de-marca` + `stop-slop-de-aiify`). Você não vai pedir 5 cliques pro usuário.

**Quem escolhe skill: o Agente Gerador.** Cada execução ele lê a tabela `skills` viva, filtra pelas que combinam com o briefing recebido, aplica.

### 2.2 Como o Agente Gerador filtra skill (referência — você não precisa implementar)

Campos de filtro na tabela `skills`:

| Campo | Tipo | Exemplos |
|---|---|---|
| `area` | text | `copywriting`, `pagina-vendas`, `vsl`, `oferta`, `storytelling`, `conteudo`, `edicao`, `meta`, `persona`, `rag` |
| `familia` | text | similar a area (legacy) — `advisory`, `pagina-vendas`, `copywriting`, ... |
| `formato` | text | `framework`, `template`, `playbook`, `auditoria`, `framework-decisao`, `checklist`, `pipeline-completo`, `tool-helper` |
| `quando_usar` | text livre | gatilho semântico — "quando o agente precisa fixar atenção nos primeiros 3 segundos" |
| `clones` | jsonb (array) | clones recomendados — `["gary-halbert","david-ogilvy"]` |
| `prioridade` | int | ordem de preferência quando várias skills servem |
| `universal` | bool | se `true`, vale em qualquer contexto |

**Lógica do Agente Gerador (já implementada do nosso lado):**
1. Recebe briefing → classifica intenção (`gerar_anuncio` | `escrever_pagina` | `roteiro_vsl` | etc).
2. Filtra `skills` por `area` compatível + `clones` overlap com clones escolhidos pelo usuário.
3. Ordena por `prioridade desc`.
4. Aplica top 5-8 skills no system_prompt.

Você não vê isso — só vê o output já com tudo aplicado.

### 2.3 Quando você PRECISA listar skills pro usuário (caso raro)

Só em UI de debug / "ver bastidores": "que skills foram usadas nesse output?". Aí você lê do retorno do Agente Gerador (item 4.3 — vem no `metadata.skills_aplicadas`).

---

## 3. EPP — como o agente aprende com feedback

**EPP = Evolução Pessoal Permanente.** É o sistema de memória individual de cada agente Pinguim. Cada agente tem 3 camadas:

### 3.1 As 3 camadas (do lado Pinguim — referência)

| Camada | O que é | Onde mora |
|---|---|---|
| **Camada 0 — DNA** | system_prompt + missão + entrada + saída esperada. Estático. | `pinguim.agentes` (campos `system_prompt`, `missao`, etc) |
| **Camada 1 — Verifier** | Auto-checagem ANTES de entregar (ex: skill `verificar-adequacao`). | Aplicado em runtime, não persistido |
| **Camada 2 — Memória individual** | Aprendizados destilados de feedback humano. Carregados em TODA execução. | `pinguim.aprendizados_agente` (geral) + `pinguim.aprendizados_cliente_agente` (por cliente) |

**Em runtime:**
1. Antes de executar → agente lê `aprendizados_agente` + `aprendizados_cliente_agente` daquele cliente.
2. Injeta como bloco `[APRENDIZADOS]` no system_prompt.
3. Executa.
4. Output volta pro humano.
5. Humano dá feedback (👍 / 👎 / ✏️ edição) → destila em 1 linha → `INSERT` em `aprendizados_cliente_agente` (ou promove pra geral se virou padrão entre clientes).

Versão é incremental por agente. Hoje o agente Pinguim tá em v9 de aprendizados.

### 3.2 ONDE seu feedback deve viver — resposta direta

Tu perguntou: "o feedback fica no meu projeto ou volta pra cá?". **Resposta: depende do tipo. Separa em 2 fluxos.**

#### Fluxo A — Feedback de output (👍/👎/edição da copy gerada)
**Fica NO TEU PROJETO.**

Por quê:
- É feedback **conversacional** ("essa copy ficou boa pra esse anúncio específico").
- Alimenta o **EPP do teu agente** (que aprende a fazer briefings melhores pro Pinguim).
- Não tem valor genérico pro Pinguim — não dá pra promover "esse hook funcionou" sem contexto do anúncio inteiro.

Estrutura sugerida na tua base:
```sql
-- No SEU Supabase, não no nosso:
create table sua_app.variacoes_anuncio (
  id uuid primary key,
  anuncio_original text,
  produto_slug text,         -- referência ao Pinguim
  clone_slugs text[],         -- referência ao Pinguim
  output_md text,             -- o que o Agente Gerador devolveu
  feedback text,              -- 'positivo' | 'negativo' | 'editado'
  feedback_comentario text,
  edicao_final text,          -- se foi editado
  execucao_id uuid,           -- ID que o Agente Gerador retornou (pra rastrear lá no Pinguim)
  criado_em timestamptz
);
```

#### Fluxo B — Insight de skill ou método (raro)
**Volta pro Pinguim.**

Quando: você (ou seu agente) percebe um **padrão sólido** que não é específico do output, mas do método. Exemplos:
- "Toda vez que usa `hook-numero-especifico` em ticket baixo (R$ 47-97), conversão cai." → vira aprendizado de skill.
- "Clone Hormozi em mercado brasileiro precisa de tradução cultural além da skill `portuguesar-br`." → vira aprendizado de clone.

Como mandar: **endpoint dedicado** (item 5 abaixo). Não é INSERT direto no banco — o teu projeto **NÃO tem permissão de escrita no Pinguim** (RLS bloqueia a anon, e service-role tu não vai usar pra escrever).

Frequência esperada: **muito baixa**. 1-3 vezes por semana, no máximo. Se cada thumbs-down virasse insight pro Pinguim, vira ruído.

**Regra de bolso:** só promove pra Pinguim se você consegue formular como **regra reutilizável que vale pra qualquer produto/persona**. Se a regra depende do produto X ou da persona Y, fica no teu lado.

---

## 4. Agente Gerador — o "ponto único de chamada"

Em vez do teu projeto montar prompt, escolher skill, juntar clone — ele faz **1 chamada** pro Agente Gerador (que vive no Pinguim) e recebe a copy pronta.

### 4.1 O que o Agente Gerador faz internamente

```
[teu projeto envia briefing]
    ↓
Agente Gerador recebe { produto_slug, persona_id?, clone_slugs[], anuncio_referencia, briefing, modo }
    ↓
1. Busca persona (já que tem produto_slug) → buscar-persona skill
2. Busca chunks relevantes do Cérebro → buscar-cerebro skill
3. Carrega SOUL/método dos clones escolhidos → buscar-clone skill (por cada slug)
4. Filtra skills compatíveis (area + clones overlap)
5. Decide modo:
   - 1 clone     → invoca aquele clone diretamente
   - N clones    → invoca os N em paralelo, retorna N outputs
   - "consenso"  → invoca copy-chief que monta time interno e consolida 1 saída
6. Aplica EPP (carrega aprendizados_agente do gerador)
7. Gera output
8. Loga execução em pinguim.agente_execucoes (custo, tokens, latência)
9. Retorna { execucao_id, outputs[], metadata }
    ↓
[teu projeto recebe, mostra ao usuário, coleta feedback]
```

### 4.2 Endpoint em produção (LIVE)

#### `POST /functions/v1/gerar-variacao-anuncio`

URL completa: `https://wmelierxzpjamiofeemh.supabase.co/functions/v1/gerar-variacao-anuncio`

Headers:
```
Content-Type: application/json
Authorization: Bearer pgmext_9pLQaR5RWGaDAnyIQRZGQBDbzNzNcjzA-vTxgen-0mw
```

> O token acima é dedicado ao projeto **Pinguim Ads Monitor** (gerador de variações de anúncio a partir de concorrente). Armazenado no cofre Pinguim em `pinguim.cofre_chaves` → linha `TOKEN_PROJETO_EXTERNO_CRIATIVOS`. Autoriza chamar os 3 endpoints: `gerar-variacao-anuncio`, `consultar-geracao`, `feedback-externo`. **Sem expiração automática** — só revoga se você sinalizar (vazou, fim do projeto, etc).

Body:
```json
{
  "produto_slug": "proalt",
  "anuncio_referencia": "<texto/transcrição do anúncio do concorrente>",
  "clone_slugs": ["gary-halbert", "alex-hormozi"],
  "modo": "paralelo",
  "briefing": "Quero variação pra meu produto. Mantém o gancho de objeção mas adapta pro nicho de mentoria de lançamento. Tom: provocativo, mas sem palavrão.",
  "formato_alvo": "anuncio_meta",
  "metadata_externa": {
    "projeto_id": "<seu uuid interno pra rastrear>",
    "usuario_id": "<id do usuário no teu sistema>"
  }
}
```

Campos:
- `produto_slug` (obrigatório) — slug de `produtos.categoria='interno'`
- `anuncio_referencia` (obrigatório) — anúncio do concorrente que serviu de inspiração
- `clone_slugs` (obrigatório, 1+) — slugs de `produtos.categoria='clone'`, subcategoria em (`copy`, `storytelling`, `traffic-masters`)
- `modo` (obrigatório) — `"unico"` | `"paralelo"` | `"consenso"`
  - `unico` → 1 clone, 1 variação
  - `paralelo` → N clones, N variações independentes
  - `consenso` → N clones, 1 variação consolidada pelo copy-chief
- `briefing` (obrigatório) — o que o usuário pediu, em linguagem natural
- `formato_alvo` (opcional, default `anuncio_meta`) — `anuncio_meta`, `anuncio_google`, `reels_script`, `email`, `pagina_venda_curta`
- `metadata_externa` (opcional) — qualquer coisa que você queira logar do teu lado e receber de volta

**O endpoint é assíncrono.** Retorna 202 imediatamente com o `geracao_id`. Você faz polling no segundo endpoint até concluir.

Resposta imediata (202 Accepted):
```json
{
  "geracao_id": "1a1fc9b9-5126-4ce6-b523-f7c86f41bfcd",
  "status": "processando",
  "polling_url": "/functions/v1/consultar-geracao?id=1a1fc9b9-5126-4ce6-b523-f7c86f41bfcd",
  "estimativa_segundos": 10,
  "persona_versao_usada": 12
}
```

Polling: `GET /functions/v1/consultar-geracao?id=<geracao_id>` (mesma autenticação Bearer).

Enquanto processa:
```json
{
  "geracao_id": "1a1fc9b9-...",
  "status": "processando",
  "decorrido_segundos": 4,
  "polling_url": "/functions/v1/consultar-geracao?id=1a1fc9b9-..."
}
```

Quando termina (200):
```json
{
  "geracao_id": "1a1fc9b9-...",
  "status": "concluido",
  "modo": "unico",
  "produto_slug": "proalt",
  "clone_slugs": ["alex-hormozi"],
  "outputs": [
    {
      "clone_slug": "alex-hormozi",
      "copy_md": "# A Razão Pela Qual Suas Vendas Não Voam\n\n**Não é sobre tráfego, é sobre oferta.**\n\n...",
      "raciocinio": "Voz Hormozi com framing Value Equation implícito",
      "skills_aplicadas": [],
      "entregavel_id": "a42462a6-b2ab-4bdd-8363-17ad15406c96"
    }
  ],
  "persona_versao_usada": 12,
  "modelo": "openai:gpt-4o",
  "custo_usd": 0.008495,
  "duracao_segundos": 6,
  "tokens_in": 1542,
  "tokens_out": 464
}
```

**Polling recomendado:** a cada 3-4 segundos. Modo `unico` termina em ~6-10s, `paralelo` (3 clones) em ~16s, `consenso` em ~30-45s.

Resposta de erro síncrono (4xx no POST):
```json
{
  "erro": "Produto 'xyz' nao encontrado",
  "codigo": "PRODUTO_NAO_ENCONTRADO"
}
```

Erro assíncrono (depois de iniciar, falha durante geração — vem no polling):
```json
{
  "geracao_id": "...",
  "status": "falhou",
  "erro_codigo": "EXECUCAO_FALHOU",
  "erro_mensagem": "agente-executar [unico:xyz] retornou 500: ...",
  "duracao_segundos": 3
}
```

Códigos de erro principais:
- `UNAUTHORIZED` — token inválido/ausente
- `INPUT_INVALID` — campo obrigatório faltando ou inválido
- `PRODUTO_NAO_ENCONTRADO` — slug não existe em `produtos`
- `PRODUTO_NAO_INTERNO` — passou clone como produto_slug
- `CEREBRO_INEXISTENTE` — produto não tem cérebro
- `PERSONA_INEXISTENTE` — produto não tem persona gerada ainda
- `CLONE_NAO_DISPONIVEL` — slug de clone não existe
- `CLONE_FORA_ESCOPO` — clone existe mas é finanças/jurídico/etc, não copy/storytelling/traffic
- `CLONE_SEM_AGENTE` — clone catalogado mas ainda não implementado como agente executável (use modo `consenso`)
- `EXECUCAO_FALHOU` — erro assíncrono durante geração (LLM, timeout, etc)
- `RATE_LIMIT` — apenas no endpoint de feedback (10/dia)

### 4.3 Tempo de resposta esperado

- `unico` → 5-12s
- `paralelo` (2-3 clones) → 8-15s (paralelo no servidor)
- `consenso` → 20-40s (Chief + mestres + consolidação)

Sugiro o teu projeto mostrar tela de loading com mensagem "Hormozi e Halbert estão escrevendo..." (vai vir um ticker no `metadata.progresso` em versão futura via SSE).

### 4.4 Antes de chamar (validações no teu lado)

```js
// 1) Listar produtos pra usuário
const { data: produtos } = await sb.from('vw_cerebros_catalogo')
  .select('slug, nome').eq('categoria','interno').neq('status','arquivado');

// 2) Verificar se produto tem persona
const { data: prod } = await sb.from('produtos').select('id').eq('slug', produtoEscolhido).single();
const { data: cer } = await sb.from('cerebros').select('id').eq('produto_id', prod.id).single();
const { data: persona } = await sb.from('personas').select('versao').eq('cerebro_id', cer.id).maybeSingle();
if (!persona) return alert('Esse produto ainda não tem persona. Escolhe outro.');

// 3) Listar clones do nicho copy/storytelling/traffic
const { data: clones } = await sb.from('produtos')
  .select('slug, nome, subcategoria')
  .eq('categoria','clone')
  .in('subcategoria',['copy','storytelling','traffic-masters'])
  .order('subcategoria').order('nome');

// 4) Usuário escolhe clone(s) + modo + escreve briefing → chama endpoint
```

---

## 5. Endpoint de feedback (volta pro Pinguim — raro)

#### `POST /api/feedback-externo`

Quando usar: **só pra insight de skill/método** (Fluxo B do item 3.2). Para feedback de output (👍/👎/edição), grava no TEU banco.

```json
{
  "execucao_id": "uuid-que-veio-do-gerar-variacao",
  "tipo": "skill_insight" | "clone_insight" | "anatomia_insight",
  "alvo_slug": "hook-numero-especifico",
  "observacao": "Em ticket baixo (R$47-97), número específico parece soar artificial e reduz conversão. Sugestão: usar número arredondado com decimal (ex: R$1.847 → 'quase 2 mil') ao invés de número exato.",
  "evidencias": [
    { "execucao_id": "uuid", "output_resumo": "...", "feedback_humano": "negativo" },
    { "execucao_id": "uuid", "output_resumo": "...", "feedback_humano": "negativo" }
  ],
  "origem": "projeto-externo-criativos",
  "autor": "<id do usuário no teu sistema>"
}
```

Resposta:
```json
{
  "registrado": true,
  "aprendizado_id": "uuid",
  "destino": "fila_review_pinguim",
  "nota": "Insight registrado. Será revisado pelo time Pinguim em 24-72h. Se aprovado, vira aprendizado na tabela aprendizados_agente do agente afetado e passa a alimentar todas execuções futuras."
}
```

**Rate limit:** 10 chamadas/dia por projeto externo. Se você sentir necessidade de mais, é sinal que tá mandando ruído (volta pro Fluxo A do teu lado).

---

## 6. Tabelas/views que VOCÊ pode ler (anon-safe? não — use service role)

Mesma regra do doc anterior (Personas/Cérebros): RLS bloqueia anon em quase tudo. Use **SUPABASE_SERVICE_ROLE_KEY no backend** (nunca frontend).

| Objeto | Use pra | Acesso |
|---|---|---|
| `vw_cerebros_catalogo` | Listar produtos pra escolha | anon OK |
| `produtos` (categoria='clone') | Listar clones por subcategoria | service-role |
| `personas` | Ver versão atual da persona do produto escolhido | service-role |
| `cerebros` | Pegar `cerebro_id` pelo produto | service-role |
| `agentes` (filtrar `status='em_producao'`) | Saber quais clones estão "executáveis" como agente. **Não tem `produto_id`** — liga por `slug` (sem prefixo `clone-`). Veja seção 6.1 abaixo. | service-role |
| `skills` (read) | Pra debug/transparência ("que skills foram usadas") | service-role (mas a info vem direto no retorno do endpoint, prefere isso) |
| `agente_execucoes` | NÃO leia direto. Pega `execucao_id` do retorno e referencia no teu banco. | — |

**Não escreva em nenhuma tabela do schema `pinguim`.** Toda escrita acontece via os 2 endpoints (`gerar-variacao-anuncio` e `feedback-externo`).

### 6.1 Como cruzar `produtos` (catálogo de clone) com `agentes` (executável)

São tabelas separadas. **Não existe `produto_id` em `agentes`.** A ligação é só por `slug`:

| Onde | Slug exemplo | Pra que serve |
|---|---|---|
| `produtos.slug` (categoria='clone') | `clone-alex-hormozi` | Catálogo/exibição na UI |
| `agentes.slug` | `alex-hormozi` | Identificador do executor (use **este** no body do endpoint) |

```js
// Lista clones de copy/storytelling/traffic/design + sinaliza quais têm agente em producao
const [{ data: clones }, { data: agentes }] = await Promise.all([
  sb.from('produtos').select('slug, nome, emoji, subcategoria, descricao')
    .eq('categoria', 'clone')
    .in('subcategoria', ['copy','storytelling','traffic-masters','design'])
    .order('subcategoria').order('nome'),
  sb.from('agentes').select('slug')
    .eq('status', 'em_producao'),
]);
const executaveis = new Set(agentes.map(a => a.slug));
const lista = clones.map(c => ({
  produto_slug: c.slug,                         // 'clone-alex-hormozi' (exibir)
  agente_slug: c.slug.replace(/^clone-/, ''),   // 'alex-hormozi' (ENVIAR no body)
  nome: c.nome,
  squad: c.subcategoria,
  tem_agente: executaveis.has(c.slug.replace(/^clone-/, '')),
}));
```

### 6.2 Formato do `clone_slugs[]` no body do endpoint

**Recomendado: sem prefixo `clone-`** — igual aos exemplos do doc (`["alex-hormozi","david-ogilvy"]`).

A Edge Function aceita ambos os formatos (normaliza removendo `clone-`), então enviar `["clone-alex-hormozi"]` também funciona. Mas envia sem prefixo pra ficar consistente com logs/auditoria.

### 6.3 Status atual dos agentes (2026-05-22)

Hoje a Edge Function só aceita `status='em_producao'` (era `em_teste` OU `em_producao`, mudou pra status virar proteção real). Snapshot do banco:

| status | quantidade |
|---|---|
| `em_producao` | 108 |
| `em_criacao` | 1 |
| `pausado` | 3 |

**101 dos 104 clones catalogados** têm agente em produção. Os 3 que faltam são os sócios (`clone-luiz`, `clone-micha`, `clone-pedro`) — propositalmente fora pra evitar gerar voz dos sócios sem revisão.

Pra esses 3, no UI: ou esconde da lista, ou força modo `consenso` (Copy Chief aplica o método via skill, sem invocar agente direto).

---

## 7. Quickstart — código de referência (testado em produção)

```js
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,                  // https://wmelierxzpjamiofeemh.supabase.co
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: 'pinguim' } }
);

const PINGUIM_API = 'https://wmelierxzpjamiofeemh.supabase.co/functions/v1';
const PINGUIM_TOKEN = process.env.PINGUIM_API_TOKEN; // pgmext_YVIO4kwe97hE2vpsIUG_...

// ============ PASSO 1: tela de escolha ============

async function listarProdutos() {
  const { data } = await sb.from('vw_cerebros_catalogo')
    .select('slug, nome, emoji, descricao, total_fontes')
    .eq('categoria', 'interno')
    .neq('status', 'arquivado')
    .order('nome');
  return data;
}

async function listarClonesCriativos() {
  const { data } = await sb.from('produtos')
    .select('slug, nome, emoji, descricao, subcategoria')
    .eq('categoria', 'clone')
    .in('subcategoria', ['copy', 'storytelling', 'traffic-masters'])
    .neq('status', 'arquivado')
    .order('subcategoria').order('nome');
  return data;
}

// ============ PASSO 2: gerar variação (assíncrono + polling) ============

async function gerarVariacao({ produtoSlug, anuncioReferencia, cloneSlugs, modo, briefing }) {
  // 2.1: dispara
  const res = await fetch(`${PINGUIM_API}/gerar-variacao-anuncio`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PINGUIM_TOKEN}`,
    },
    body: JSON.stringify({
      produto_slug: produtoSlug,
      anuncio_referencia: anuncioReferencia,
      clone_slugs: cloneSlugs,
      modo,
      briefing,
      formato_alvo: 'anuncio_meta',
      metadata_externa: { projeto_id: 'criativos-app', usuario_id: 'u123' },
    }),
  });
  if (!res.ok) throw new Error((await res.json()).erro);
  const { geracao_id } = await res.json();

  // 2.2: polling até concluir
  const MAX_TENTATIVAS = 20; // 20 * 3s = 60s max
  for (let i = 0; i < MAX_TENTATIVAS; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const r2 = await fetch(`${PINGUIM_API}/consultar-geracao?id=${geracao_id}`, {
      headers: { 'Authorization': `Bearer ${PINGUIM_TOKEN}` },
    });
    const data = await r2.json();
    if (data.status === 'concluido') return data;
    if (data.status === 'falhou') throw new Error(`${data.erro_codigo}: ${data.erro_mensagem}`);
  }
  throw new Error('Timeout — geração não concluiu em 60s');
}

// ============ PASSO 3: salvar no SEU banco com feedback ============

async function salvarOutput(resultado, anuncioOriginal, produtoSlug, cloneSlugs) {
  await suaDb.from('variacoes_anuncio').insert({
    anuncio_original: anuncioOriginal,
    produto_slug: produtoSlug,
    clone_slugs: cloneSlugs,
    outputs: resultado.outputs,
    execucao_id_pinguim: resultado.execucao_id,
    custo_usd: resultado.custo_usd,
    persona_versao: resultado.persona_versao_usada,
    feedback: null,
    criado_em: new Date(),
  });
}

// ============ PASSO 4: feedback do usuário (TEU BANCO) ============

async function registrarFeedback(variacaoId, feedback, comentario, edicao) {
  await suaDb.from('variacoes_anuncio').update({
    feedback,
    feedback_comentario: comentario,
    edicao_final: edicao,
  }).eq('id', variacaoId);
}

// ============ PASSO 5 (raro): insight pro Pinguim ============

async function reportarInsightSkill(geracaoId, skillSlug, observacao, evidencias) {
  const res = await fetch(`${PINGUIM_API}/feedback-externo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PINGUIM_TOKEN}`,
    },
    body: JSON.stringify({
      geracao_id: geracaoId,
      tipo: 'skill_insight',
      alvo_slug: skillSlug,
      observacao,
      evidencias,
      autor_externo: 'andre',
    }),
  });
  return res.json();
}
```

### Testar agora via curl

```bash
TOKEN='pgmext_9pLQaR5RWGaDAnyIQRZGQBDbzNzNcjzA-vTxgen-0mw'
BASE='https://wmelierxzpjamiofeemh.supabase.co/functions/v1'

# Dispara variacao
curl -X POST "$BASE/gerar-variacao-anuncio" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "produto_slug":"proalt",
    "anuncio_referencia":"Voce acha que sabe vender online mas suas vendas nao decolam. O segredo dos top sellers nao eh trafego eh oferta.",
    "clone_slugs":["alex-hormozi"],
    "modo":"unico",
    "briefing":"Variacao Hormozi para Meta, empreendedores BR, cursos low ticket."
  }'

# Resposta: {"geracao_id":"...","status":"processando",...}

# Polling
curl "$BASE/consultar-geracao?id=<geracao_id>" -H "Authorization: Bearer $TOKEN"
```

---

## 8. Resumo das decisões arquiteturais (pra ele entender o porquê)

| Decisão | Por quê |
|---|---|
| Skills NÃO aparecem na UI | Banco vivo, decisão exige contexto, skills se combinam (5-8 por output) |
| Clones aparecem filtrados por subcategoria | 60 dos 104 clones não têm a ver com criativo (finanças, jurídico, etc) |
| 1 endpoint único faz tudo (Agente Gerador) | Centraliza EPP, permite agente aprender em toda base, isola complexidade |
| Feedback de output fica no teu projeto | É contextual, não tem valor genérico no Pinguim |
| Insight de skill volta pro Pinguim via endpoint | Quando vira regra reutilizável, alimenta EPP de todos agentes futuros |
| Teu projeto não tem WRITE no Supabase Pinguim | Imutabilidade. Toda escrita passa por endpoint validado. |
| Service-role no backend, nunca no frontend | Service-role bypassa RLS — vaza, vaza tudo |

---

## 9. Status do lado Pinguim — tudo em produção

- ✅ Tabelas `pinguim.geracoes_externas` + `pinguim.feedback_externo` criadas com RLS ativo
- ✅ Agente `gerador-variacao-anuncio` em `pinguim.agentes` (status `em_producao`, modelo `openai:gpt-4o`)
- ✅ Edge Function `gerar-variacao-anuncio` deployada (POST, assíncrono)
- ✅ Edge Function `consultar-geracao` deployada (GET, polling)
- ✅ Edge Function `feedback-externo` deployada (POST, rate-limited)
- ✅ Token `TOKEN_PROJETO_EXTERNO_CRIATIVOS` gravado no cofre Pinguim
- ✅ Smoke test passou: modo `unico` em 6s ($0.0085), modo `paralelo` (3 clones) em 16s

**Status dos clones executáveis hoje (2026-05-22 — atualizado):**

101 dos 104 clones catalogados estão como agente em `pinguim.agentes` com status `em_producao`. Os únicos 3 que faltam são os sócios (`clone-luiz`, `clone-micha`, `clone-pedro`). Cobertura por squad:

- **copy** (24/24), **storytelling** (12/12), **advisory-board** (10/10), **deep-research** (10/10), **design** (8/8), **traffic-masters** (8/8), **translate** (7/7), **cybersecurity** (6/6), **data** (6/6), **finops** (4/4), **legal** (3/3), **squad-creator-pro** (3/3) — todas 100%.
- **socio_pinguim** (0/3) — pulada por decisão consciente.

A Edge Function `gerar-variacao-anuncio` aceita **apenas `status='em_producao'`**. Antes aceitava `em_teste` também, mas isso tornava o status um rótulo sem efeito. Agora status protege contra agente quebrado.

---

## 10. Para o dev do outro projeto — TL;DR de ação

1. Ler doc anterior ([INTEGRACAO-PERSONAS-CEREBROS-EXTERNO.md](INTEGRACAO-PERSONAS-CEREBROS-EXTERNO.md)) primeiro pra entender produto/persona/cérebro.
2. Salvar no `.env` do projeto:
   ```
   SUPABASE_URL=https://wmelierxzpjamiofeemh.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<vem em doc anterior>
   PINGUIM_API=https://wmelierxzpjamiofeemh.supabase.co/functions/v1
   PINGUIM_API_TOKEN=pgmext_9pLQaR5RWGaDAnyIQRZGQBDbzNzNcjzA-vTxgen-0mw
   ```
3. Implementar 2 telas:
   - **Tela A:** escolher produto (lista da view `vw_cerebros_catalogo` filtrando `categoria='interno'`).
   - **Tela B:** escolher 1+ clone (lista de `produtos` filtrando `categoria='clone'` + `subcategoria IN ('copy','storytelling','traffic-masters')`) + modo (único/paralelo/consenso) + colar anúncio referência + escrever briefing.
4. Chamar `POST /functions/v1/gerar-variacao-anuncio`. Receber `geracao_id` em ~100ms.
5. Polling em `GET /functions/v1/consultar-geracao?id=<geracao_id>` a cada 3-4s.
6. Quando `status='concluido'`, exibir `outputs[]` pro usuário, coletar feedback (👍/👎/edição).
7. Persistir feedback no SEU banco (não no Pinguim).
8. Em casos raros (regra reutilizável detectada), chamar `POST /functions/v1/feedback-externo`.
9. NUNCA escrever no schema `pinguim`. NUNCA expor token/service-role no frontend — backend-only.

Qualquer dúvida sobre campo, semântica de skill, ou o agente errar — Andre (Pinguim).
