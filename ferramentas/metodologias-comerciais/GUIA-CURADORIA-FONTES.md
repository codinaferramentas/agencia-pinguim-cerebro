# Guia de Curadoria — Reforço dos Cérebros de Metodologia

**Objetivo:** Cada Cérebro de metodologia hoje tem 2 fontes (princípios + execução). Isso dá fundamento conceitual mas não basta pra alimentar um agente SDR/Closer real. Precisamos sair de **2 fontes** pra **7-12 fontes por metodologia**, adicionando material prático.

**Quem cura:** André Codina, Luiz, Micha (qualquer um do time comercial). Eu ajudo na estruturação final, vocês validam o conteúdo.

**Como usar este guia:** Pra cada metodologia, este documento lista (a) os tipos de fonte que faltam, (b) onde buscar cada uma, (c) que checklist a fonte precisa atender pra ser aceita no Cérebro.

---

## Decisão arquitetural

Cada Cérebro de Metodologia mantém nome canônico (SPIN, MEDDIC, etc) — reconhecimento de mercado = credibilidade. Não agrupar nem renomear.

**Princípio importante:** este guia NÃO determina qual metodologia usar pra cada produto. Essa decisão é de quem vai construir o agente comercial (Luiz + time), e pode rotacionar via A/B test rotativo. A biblioteca de metodologias precisa estar **disponível e completa** — uso é decisão posterior.

**Diferença Cérebro de Produto x Cérebro de Metodologia (importante explicar pra diretoria):**

- **Cérebro Interno de Produto** (`lo-fi-desafio`, `proalt`, `taurus`, etc) responde **O QUE é o produto** — aulas, depoimentos, página de venda, garantia oficial. Tem fatos sobre aquele produto específico.
- **Cérebro de Metodologia** (`low-ticket-digital`, `spin-selling`, etc) responde **COMO vender** — frameworks, scripts genéricos, gatilhos. Não tem fato algum sobre nenhum produto, é técnica pura.

Agente comercial usa **os dois juntos**. Quando aluno hesita em comprar qualquer produto, agente consulta:
1. Cérebro do produto → fatos, depoimentos reais, ângulo oficial
2. Cérebro de metodologia (a que estiver ativada pro contexto) → técnica de venda

Resposta = fato do produto + técnica de venda. Sem um, chuta. Sem o outro, fala genérico.

---

## Tipos de fonte que vamos adicionar (vale pras 5 metodologias)

| Arquivo | Tamanho | Por que importa |
|---|---|---|
| `<nome>-scripts.md` | ~5KB | Frases prontas pra cada fase. Agente vai usar literal. |
| `<nome>-exemplos-dialogo.md` | ~6KB | Conversa B2B típica completa, do gancho ao fechamento. |
| `<nome>-objecoes-respostas.md` | ~5KB | Top 10 objeções comuns + resposta no estilo da metodologia. |
| `<nome>-casos-famosos.md` | ~3KB | Quem usa, em que indústria, com que resultado. Dá credibilidade. |
| `<nome>-anti-padroes.md` | ~3KB | Erros comuns. Agente precisa saber o que NÃO fazer. |
| `<nome>-quando-usar.md` | ~2KB | Em que cenário essa metodologia é melhor que as outras. |

**Total novo por metodologia:** ~24KB (vs 10KB atual). **Total dos 5 Cérebros:** ~120KB de conteúdo novo curado.

---

# 1. SPIN Selling (Neil Rackham)

## Estado atual

✅ `spin-selling-principios.md` (77 linhas) — fundamento dos 4 tipos de pergunta  
✅ `spin-selling-execucao.md` (108 linhas) — como aplicar passo a passo

## Fontes recomendadas pra curadoria

### 📜 spin-selling-scripts.md

**O que precisa ter:** 8-10 perguntas canônicas pra cada fase (S, P, I, N), com slot pra adaptar (`{produto}`, `{cargo do prospect}`, `{indústria}`).

**Onde buscar:**
- **Livro "SPIN Selling" (Neil Rackham, 1988)** — capítulos 4 a 7 têm dezenas de exemplos transcritos de calls reais. **Edição em PT-BR existe** (Editora M.Books).
- **Livro "SPIN Selling Fieldbook"** (mesmo autor, 1996) — companion com workbook + scripts práticos
- **HubSpot Academy: "SPIN Selling Course"** — gratuito, tem scripts adaptados pra mercado SaaS
- **Canal Huthwaite International (YouTube)** — empresa que Rackham fundou, tem vídeos com role-plays

**Critério de aceite:**
- Cada pergunta marcada com qual letra (S/P/I/N) ela serve
- Mínimo 2 perguntas adaptadas pra **infoproduto / mentoria / curso** (universo Pinguim)
- Sem chavões ("vamos lá!", "imagina comigo") — perguntas reais que fazem sentido em call

### 💬 spin-selling-exemplos-dialogo.md

**O que precisa ter:** 3 diálogos completos (de 30-60 turnos cada), do gancho ao fechamento, mostrando SPIN aplicado.

**Cenários sugeridos pra Pinguim:**
1. SDR ligando pra dono de PME que considera contratar coach de vendas
2. Closer fechando aluno do desafio low-ticket pro programa high-ticket
3. Vendedor reativando aluno antigo de programa anterior

**Onde buscar:**
- Livro de Rackham tem 5+ transcrições reais (capítulos 8-10)
- **Caso famoso: a venda da Xerox pra Procter & Gamble** documentada por Rackham em palestras
- Pedir pro Luiz (sócio) **gravar uma call simulada** de venda do programa Elo aplicando SPIN — é o melhor material possível, autêntico, vocabulário Pinguim

**Critério de aceite:**
- Cada turno do vendedor marcado com tipo de pergunta SPIN
- Pelo menos 1 dos 3 diálogos é de venda real Pinguim (não traduzido)
- Termina com next-step concreto (não venda mágica)

### 🛡 spin-selling-objecoes-respostas.md

**O que precisa ter:** Top 10 objeções clássicas em venda B2B, com a resposta seguindo a abordagem SPIN (sempre voltar pra perguntas de Implicação ou Necessidade-de-Solução).

**Objeções a cobrir (mínimo):**
1. "Não tenho orçamento"
2. "Preciso pensar / falar com sócio"
3. "Já tenho fornecedor / faço internamente"
4. "Não é prioridade agora"
5. "Está caro"
6. "Como sei que vai funcionar?"
7. "Já tentei algo parecido e não deu certo"
8. "Me manda por email"
9. "Não conheço a empresa de vocês"
10. "Vou esperar fim do trimestre"

**Onde buscar:**
- Capítulo 9 do livro "SPIN Selling Fieldbook"
- **Cris Voss em "Never Split the Difference"** tem padrão de resposta de objeção que combina bem com SPIN — vale referência cruzada
- **Time comercial da Pinguim** — pegar as objeções que aparecem REAIS no funil. Conversar com Luiz e revisar gravações de calls

**Critério de aceite:**
- Resposta em até 3 frases (agente vai ler em 5 segundos)
- Pelo menos 1 pergunta de Implicação ou Necessidade-de-Solução em cada resposta
- Tom não defensivo, não combativo

### 🌟 spin-selling-casos-famosos.md

**O que precisa ter:** 3-5 casos reais de empresas que adotaram SPIN com resultado documentado.

**Onde buscar:**
- Pesquisa original da Huthwaite (35.000 calls) — está na introdução do livro
- **Xerox** (caso fundador, anos 80)
- **IBM Global Services** (adotou SPIN nos anos 90)
- Cases B2B SaaS modernos: HubSpot, Salesforce blog
- Procurar em **Harvard Business Review** "SPIN selling" pra cases acadêmicos

**Critério de aceite:**
- Empresa, indústria, ano, resultado quantificado
- Sem cases inventados — só verificáveis

### ⚠️ spin-selling-anti-padroes.md

**O que precisa ter:** 5-7 erros comuns + por que falham + como corrigir.

**Já tem material:** o próprio livro de Rackham capítulo 11 tem "common mistakes". Listar:
- Pular Implicação direto pra apresentação
- Fazer perguntas de Situação que poderiam ter sido pesquisadas
- Confundir SPIN com interrogatório (lista de perguntas)
- Usar Implicação cedo demais (cliente ainda não admitiu Problema)
- Apresentar feature em vez de Necessidade-de-Solução
- Tentar fechar antes do cliente verbalizar valor

**Onde buscar:**
- Livro de Rackham capítulo 11
- Time comercial Pinguim — quais erros os SDRs cometem hoje? Pegar o **gravar** de calls que falharam.

**Critério de aceite:**
- Cada erro com exemplo concreto (não abstrato)
- Diagnóstico ("se você está fazendo X, é sinal de que…")

### 🎯 spin-selling-quando-usar.md

**O que precisa ter:** Comparação direta SPIN vs Sandler, Challenger, MEDDIC. Em que cenário cada uma vence.

**SPIN vence quando:**
- Ciclo de venda longo (semanas a meses)
- Ticket médio-alto (>R$ 5K/mês)
- Cliente B2B com múltiplos decisores
- Produto consultivo, customizado
- Fase de descoberta é rica

**SPIN não é a melhor quando:**
- Venda transacional curta (<1 hora)
- Produto commodity sem diferenciação consultiva
- Mercado super-saturado onde diferenciação vem de provocação (aí Challenger é melhor)

**Onde buscar:**
- Síntese eu posso fazer com base nas 5 metodologias que já temos no Cérebro
- Validação: time comercial Pinguim — qual metodologia eles **acham** que se encaixa melhor em cada produto da empresa?

---

# 2. Sandler Selling System (David Sandler)

## Estado atual

✅ `sandler-selling-principios.md` (90 linhas)  
✅ `sandler-selling-execucao.md` (89 linhas)

## Fontes recomendadas

### 📜 sandler-selling-scripts.md

**Conteúdo crítico:**
- **Up-front contracts** — frases canônicas pra estabelecer combinado de início de call
- **Pain Funnel** — 8 perguntas em sequência pra escavar dor
- **Reversing** — perguntas pra rebater pergunta do cliente
- **Negative reverse selling** — frases que invertem a pressão (clássico Sandler)

**Onde buscar:**
- Livro "You Can't Teach a Kid to Ride a Bike at a Seminar" (David Sandler, 1995) — fundador
- **Sandler Training (sandler.com)** — tem PDF gratuito "Sandler Submarine" e guia do Pain Funnel
- **Canal Sandler Worldwide (YouTube)** — role-plays oficiais
- Livro "The Sandler Rules" (David Mattson) — 49 regras, cada uma com script

**Critério de aceite:** mesmas regras do SPIN

### 💬 sandler-selling-exemplos-dialogo.md

**Cenário diferenciador Sandler:** mostrar **upfront contract** sendo negociado e **negative reverse selling** sendo aplicado. São as duas mecânicas mais distintivas.

**Onde buscar:**
- Sandler Training tem video library com role-plays (paga, mas trial grátis)
- **Sócios Pinguim**: Luiz é fã de Sandler? Confirmar. Se sim, gravação dele aplicando

### 🛡 sandler-selling-objecoes-respostas.md

**Diferencial Sandler:** muitas objeções são "respondidas" virando reversing (pergunta de volta). Lista de 10 objeções comuns + como reverter cada.

**Onde buscar:**
- Capítulo "Bonding & Rapport" do livro de Sandler
- The Sandler Rules — várias regras (especialmente 7, 16, 22, 31) tratam de objeção

### 🌟 sandler-selling-casos-famosos.md

**Empresas conhecidas que usam Sandler:** Salesforce (treinamento interno), Oracle, Office Depot.

**Onde buscar:**
- Site Sandler.com → seção "Case Studies"
- Forbes / HBR pesquisar "Sandler Sales"

### ⚠️ sandler-selling-anti-padroes.md

- Confundir Sandler com técnicas agressivas (não é — é o oposto)
- Aplicar negative reverse selling cedo demais
- Pular bonding & rapport (1ª etapa) e ir direto pra qualificação
- Não estabelecer upfront contract → call vira "consultoria grátis"

### 🎯 sandler-selling-quando-usar.md

**Sandler vence quando:**
- Vendedor está sendo "usado" pelo prospect (consultoria grátis)
- Mercado tem muito tire-kicker (curioso sem intenção)
- Você precisa qualificar agressivamente cedo

**Sandler não é melhor quando:**
- Venda muito curta (não dá tempo de aplicar Pain Funnel completo)
- Cultura do prospect é direta (Sandler tem tom psicológico que pode soar manipulador)

---

# 3. Challenger Sale (Matthew Dixon, Brent Adamson)

## Estado atual

✅ `challenger-sale-principios.md` (104 linhas)  
✅ `challenger-sale-execucao.md` (110 linhas)

## Fontes recomendadas

### 📜 challenger-sale-scripts.md

**Conteúdo crítico:**
- **Reframe statements** — frases que reformulam o problema do cliente de ângulo novo
- **Provocação construtiva** — como discordar do cliente sem perder a venda
- **Insight delivery** — como apresentar dado que o cliente não esperava
- **Constructive tension** — como manter desconforto produtivo

**Onde buscar:**
- Livro "The Challenger Sale" (Dixon & Adamson, 2011) — pesquisa CEB com 6.000+ vendedores B2B
- Livro "The Challenger Customer" (continuação, 2015) — foco em B2B complexo
- **Site challengerinc.com** (empresa fundada pelos autores) — recursos gratuitos
- **Gartner Research** (CEB foi adquirida pela Gartner) — relatórios

### 💬 challenger-sale-exemplos-dialogo.md

**Cenários Pinguim aplicáveis:**
1. Reframe: "você acha que precisa de mais tráfego — na verdade, seu funil de conversão é o gargalo"
2. Provocação construtiva: "deixa eu discordar — o que você está chamando de prioridade não vai gerar resultado"

### 🛡 challenger-sale-objecoes-respostas.md

**Distintivo Challenger:** muitas objeções são oportunidade de **reframe**. Top 10 com resposta no estilo provocador-construtivo.

### 🌟 challenger-sale-casos-famosos.md

- Pesquisa CEB original (6.000 vendedores, 90 empresas)
- Adoção pela **Cisco**, **Xerox**, **Oracle** documentada nos livros
- Cases B2B SaaS modernos

### ⚠️ challenger-sale-anti-padroes.md

- Confundir Challenger com vendedor agressivo / argumentador
- Provocar sem ter dado/insight pra sustentar (vira só atrito)
- Aplicar Challenger em mercado super-relacional (Brasil PMEs muitas vezes)
- Pular fase de Teach (insight) e ir direto pra Tailor (customizar)

### 🎯 challenger-sale-quando-usar.md

**Challenger vence quando:**
- Mercado saturado, diferenciação é difícil
- Cliente "sabe o que quer" (mas está errado)
- Vendedor tem domínio técnico forte do problema do cliente

**Não é melhor quando:**
- Cultura do cliente é hierárquica e relacional (Brasil tradicional)
- Vendedor não tem credibilidade técnica pra provocar

---

# 4. Tactical Empathy (Chris Voss — Never Split the Difference)

## Estado atual

✅ `tactical-empathy-voss-principios.md` (132 linhas)  
✅ `tactical-empathy-voss-execucao.md` (139 linhas)

## Fontes recomendadas

### 📜 tactical-empathy-voss-scripts.md

**Conteúdo crítico:**
- **Mirroring** — repetir 1-3 últimas palavras do prospect (com entonação ascendente)
- **Labeling** — frases-rótulo que nomeiam emoção ("parece que você está frustrado com…")
- **Calibrated questions** — perguntas começando com "como" e "o que" (nunca "por quê")
- **The "No"-oriented question** — "você acha um péssimo momento pra falar?" (gera "não" produtivo)
- **The Late-Night DJ voice** — descrição de tom

**Onde buscar:**
- Livro "Never Split the Difference" (Chris Voss, 2016) — capítulos 2 a 6 têm dezenas de scripts
- **MasterClass do Chris Voss** — paga, mas tem trechos free no YouTube
- **Black Swan Group (blackswanltd.com)** — empresa de Voss, blog gratuito + workshops
- **Negotiation Mastery (Voss + Harvard Business Review)** — artigos pagos

### 💬 tactical-empathy-voss-exemplos-dialogo.md

**Voss tem material rico:** o livro tem 10+ casos reais (sequestros, negociações empresariais). Pegar 3 e adaptar pra contexto Pinguim:
1. Aluno indeciso pedindo desconto — aplicar mirroring + labeling
2. Recuperação de aluno que pediu reembolso — calibrated questions
3. Negociação de upgrade ProAlt → high-ticket — "no"-oriented question

### 🛡 tactical-empathy-voss-objecoes-respostas.md

**Forte de Voss:** ele é especialista em "tirar o não" e converter resistência em colaboração.

Top 10 objeções comuns de venda B2B + resposta no estilo Voss (sempre começando com label da emoção, depois calibrated question).

### 🌟 tactical-empathy-voss-casos-famosos.md

- Negociação de sequestros do FBI (background do Voss)
- Aplicação corporativa: Black Swan Group consultou empresas como **Goldman Sachs**, **Microsoft**, **Disney**
- Cases no livro: refém em Manila, sequestro no Equador, negociação de salário pessoal

### ⚠️ tactical-empathy-voss-anti-padroes.md

- Mirroring virando papagaio robótico
- Labeling com tom de psicólogo de divã
- Usar "como você se sente?" — Voss diz que isso destrói credibilidade. Sempre **labeling** ("parece que…")
- "Por quê?" — Voss bane essa pergunta (soa acusatória). Use "como" / "o que".

### 🎯 tactical-empathy-voss-quando-usar.md

**Voss vence quando:**
- Cliente está emocional / na defensiva
- Negociação travada por desconfiança
- Preço sendo questionado (mirror + labeling neutralizam)

**Não é melhor quando:**
- Cliente racional 100% (Voss pode soar manipulador)
- Cultura corporativa muito formal (excesso de empathy técnica destoa)

---

# 5. MEDDIC (Jack Napoli)

## Estado atual

✅ `meddic-principios.md` (121 linhas)  
✅ `meddic-execucao.md` (171 linhas) — esta é a maior, já está mais robusta

## Fontes recomendadas

### 📜 meddic-scripts.md

**Conteúdo crítico:**
- **Metrics** — perguntas que extraem número quantificado
- **Economic buyer** — como identificar e perguntas pra chegar nele
- **Decision criteria** / **Decision process** — perguntas pra mapear cada
- **Identify pain** — como achar a dor primária
- **Champion** — perguntas pra qualificar o champion (não confundir com coach)

**Onde buscar:**
- **MEDDIC Academy (meddic.academy)** — Jack Napoli vende cursos, mas tem material gratuito
- Livro "The MEDDIC Formula" (vários autores)
- **PTC, BMC, Parametric Technology** — empresas onde MEDDIC nasceu (anos 90)
- **Gartner / SaaS blogs** — adaptação MEDDIC pra SaaS moderno

### 💬 meddic-exemplos-dialogo.md

**Cenário forte:** vendedor identificando os 6 elementos numa única call de 45 min. Livro do Napoli tem exemplos.

### 🛡 meddic-objecoes-respostas.md

**MEDDIC + objeção:** geralmente a objeção é sintoma de algum dos 6 elementos faltando. Top 10 objeções com diagnóstico ("essa objeção significa que você não validou Economic Buyer").

### 🌟 meddic-casos-famosos.md

- **PTC** (Parametric Technology Corp, anos 90) — onde Napoli criou MEDDIC, multiplicaram revenue 10×
- **Salesforce** — adoção parcial nos anos 2000
- **Snowflake, Datadog, MongoDB** — SaaS modernos que usam MEDDIC ou variantes (MEDDPICC)

### ⚠️ meddic-anti-padroes.md

- Tratar MEDDIC como checklist (perguntar tudo na primeira call) → vira interrogatório
- Confundir Champion com Coach (Champion vende internamente; Coach só passa info)
- Não documentar MEDDIC no CRM → forecast continua chute
- Esquecer "Identify Pain" e ir direto pra "Decision Criteria"

### 🎯 meddic-quando-usar.md

**MEDDIC vence quando:**
- Venda B2B complexa com múltiplos decisores
- Ticket alto (>R$ 50K, idealmente >R$ 100K)
- Ciclo longo (meses)
- Forecast precisa ser confiável

**Não é melhor quando:**
- Ticket baixo (overhead de qualificação não compensa)
- Venda transacional / e-commerce
- Único decisor

---

# Processo de execução proposto

1. **Você (André + time)** revisam este guia e priorizam: qual metodologia atacar primeiro?
2. Pra metodologia escolhida, time vai nas fontes listadas e produz os 6 arquivos `.md` (~24KB de conteúdo)
3. Vocês me devolvem os arquivos
4. Eu valido (formato, tamanho, ausência de plágio direto, alinhamento com vocabulário Pinguim)
5. Eu subo via `ingest-pacote` no Cérebro correspondente
6. Eu rodo 5 perguntas-teste no Playground `buscar-cerebro` pra validar que score subiu de ~50% pra 70%+
7. Repetimos pra próxima metodologia

**Estimativa de esforço de curadoria:** ~4-6 horas por metodologia se 2 pessoas dividem (uma busca scripts/diálogos, outra busca casos/anti-padrões).

**Ordem CONSOLIDADA com André (2026-04-27):**
1. **SPIN primeiro** — ticket médio, base universal pra venda consultiva
2. **CRIAR `low-ticket-digital` do zero** — Pinguim vive de low ticket. Sem isso, agente comercial chuta a técnica nos produtos que mais vendem. **Detalhamento na seção 6.**
3. **MEDDIC** — high ticket (Taurus R$ 36K, Orion R$ 100K, Elo). Pinguim tem produtos high ticket reais — não é teoria.
4. **Sandler, Challenger, Voss** — A/B test e complementos pra situações específicas

---

# 6. Low Ticket Digital (NOVA — Pinguim, baseada em stack canônico do mercado)

## Por que esse Cérebro existe

Pinguim vive de low ticket: Desafios (R$ 47-297), ProAlt LT, Mentoria Express, Análise de Perfil. **O agente comercial vai vender low ticket muito mais do que high ticket.** Não ter metodologia desenhada pra isso = SDR/closer chutando.

E o detalhe: **não existe UMA "metodologia de low ticket" canônica** como SPIN é pro B2B. O que existe é um **stack de frameworks complementares** que juntos formam a metodologia do mercado digital.

## A descoberta da pesquisa (2026-04-27)

**Stack consolidado do mercado low ticket digital:**

| Camada | Framework | Pra que serve |
|---|---|---|
| Segmentação | Schwartz — 5 Níveis de Consciência | Decidir o ângulo da mensagem |
| Oferta | Hormozi — Grand Slam Offer + Value Equation | Construir oferta irresistível ("MEDDIC do digital") |
| Mensagem | Brunson — Hook, Story, Offer | Estrutura tática de qualquer copy |
| Persuasão | Cialdini — 7 Princípios | Camada psicológica que TODOS os outros usam |
| Funil/Lançamento | PLF / Erico Rocha (Fórmula de Lançamento) | Estratégia de aquisição/lançamento BR |

**Pivot brasileiro importante:** Erico Rocha trouxe o PLF (Jeff Walker) pro Brasil como "Fórmula de Lançamento". Virou **padrão do mercado de infoproduto BR**. Pinguim literalmente vive nesse mercado — esse capítulo é OBRIGATÓRIO.

## Fontes recomendadas (12 arquivos)

### 📜 low-ticket-digital-principios.md (visão geral do stack)

**Conteúdo:** explicar de onde vem cada camada, por que o stack funciona junto, o que diferencia low ticket de high ticket (decisão emocional rápida vs. consultiva longa).

**Onde buscar:**
- Síntese eu posso escrever a partir das outras fontes — esse é o índice mestre

**Critério de aceite:**
- 5-7 páginas (~10KB)
- Diagrama mental claro de como as 5 camadas se compõem
- Exemplos pinguim em cada camada

---

### 📜 low-ticket-digital-execucao.md (como aplicar passo a passo)

**Conteúdo:** workflow de uma venda low ticket end-to-end usando o stack. Do anúncio ao checkout. Onde cada framework entra.

**Onde buscar:**
- Material híbrido: literatura (livros abaixo) + experiência interna Pinguim
- **Erico Rocha tem material gratuito** sobre o ciclo: aquecimento → CPL → carrinho → fechamento

**Critério de aceite:**
- Cobre os 5 momentos: anúncio → captura → nutrição → oferta → fechamento
- Marca explicitamente qual framework está sendo usado em cada momento

---

### 🛠 low-ticket-hormozi-value-equation.md

**Conteúdo:**
- Value Equation: Valor = (Sonho × Probabilidade) ÷ (Tempo + Esforço)
- 4 pilares do Grand Slam Offer
- Como construir oferta irresistível pra Pinguim
- Bonuses, garantias, urgência REAL (não fake)

**Onde buscar:**
- **Livro $100M Offers** (Alex Hormozi, 2021) — Editora Wiser tem edição PT-BR
- **YouTube canal Hormozi** — videos curtos com cada conceito explicado
- **Acquisition.com (acquisition.com)** — recursos gratuitos
- **Resumo SwipeFile / Power Moves** — sínteses estruturadas

**Critério de aceite:**
- Cada pilar com 1 exemplo Pinguim ("o ProAlt LT já tem isso? como melhorar?")
- Inclui pelo menos 1 exemplo de **MAU** offer pra contraste

---

### 🛠 low-ticket-schwartz-5-niveis.md

**Conteúdo:**
- Os 5 níveis: Unaware → Problem Aware → Solution Aware → Product Aware → Most Aware
- Como identificar em qual nível o lead está
- Que tipo de mensagem usar pra cada nível
- Por que abordar Most Aware com mensagem de Unaware queima conversão

**Onde buscar:**
- **Livro Breakthrough Advertising** (Eugene Schwartz, 1966) — clássico mais respeitado de copywriting. Edição original é cara (~US$ 100); existe PDF "compartilhado" online (controverso)
- **swipefile.com → 5 Stages of Awareness** — síntese clara
- **B-PlanNow Schwartz Pyramid Guide** — visualização pedagógica

**Critério de aceite:**
- Para cada nível, 1 exemplo de headline Pinguim
- Tabela "se o lead está no nível X, o ângulo é Y"

---

### 🛠 low-ticket-brunson-hook-story-offer.md

**Conteúdo:**
- Hook: como prender atenção em 1-3 segundos (anúncio, primeiro frame de VSL, primeira linha de email)
- Story: 3 elementos da Story (vilão, transformação, prova)
- Offer: anatomia da oferta no estilo Brunson
- Como compor os 3 numa peça (anúncio, página, sequência de email)

**Onde buscar:**
- **Livros DotCom Secrets, Expert Secrets, Traffic Secrets** (Russell Brunson) — trilogia ClickFunnels. Edições PT-BR existem (Editora Buzz)
- **Blog ClickFunnels** — posts gratuitos sobre Hook, Story, Offer
- **Russell Brunson MasterClass** (paga, mas tem trial)
- **YouTube canal Russell Brunson** — videos gratuitos

**Critério de aceite:**
- 3 exemplos de Hook por categoria (tráfego frio, morno, quente)
- 1 Story completa (qualquer produto Pinguim) com vilão + transformação + prova
- Diferenciar Brunson de outros ("por que não é só PAS")

---

### 🛠 low-ticket-cialdini-7-gatilhos.md

**Conteúdo:**
- Os 7 princípios: Reciprocidade, Compromisso/Consistência, Prova Social, Autoridade, Afinidade, Escassez, Unidade (a 7ª, de 2016)
- Como cada um se manifesta em low ticket digital
- Diferença entre **gatilho real** (ex: estoque limitado de verdade) e **gatilho fake** (countdown que reseta) — Cialdini condena fake

**Onde buscar:**
- **Livro Influence** (Robert Cialdini, 1984) — clássico. Edição PT-BR "Armas da Persuasão" (Editora Sextante)
- **Livro Pre-Suasion** (Cialdini, 2016) — onde introduz a 7ª (Unidade)
- **Site influenceatwork.com** — recursos gratuitos
- **CXL.com Blog Cialdini** — síntese aplicada a marketing digital

**Critério de aceite:**
- 7 princípios × 2 exemplos cada = 14 exemplos Pinguim
- Seção dedicada a "**escassez ética vs predatória**" — Pinguim NÃO faz fake scarcity

---

### 🛠 low-ticket-erico-rocha-formula-lancamento.md (NÚCLEO BR)

**Conteúdo:**
- O ciclo completo PLF: pré-lançamento (4 CPLs) → carrinho aberto → carrinho fechado
- Os 5 gatilhos do Erico Rocha
- "6 em 7" — fazer 6 dígitos em 7 dias
- Como funciona o calendário editorial de aquecimento
- Adaptações brasileiras vs PLF americano original

**Onde buscar:**
- **Erico Rocha — site oficial ericorocha.com.br** — tem materiais gratuitos
- **Canal Erico Rocha YouTube** — masterclasses gratuitas
- **Livro Fórmula de Lançamento** (Erico — versão atualizada)
- **Jeff Walker — livro Launch** (versão original em inglês)
- **Bruno Picinini blog** — análises do PLF aplicado
- **CONHECIMENTO INTERNO PINGUIM** — Pinguim já fez lançamentos, time tem experiência prática

**Critério de aceite:**
- Calendário típico de lançamento de 14 dias detalhado
- Diferenças PLF americano vs adaptação BR
- Pelo menos 2 cases brasileiros de lançamento bem-sucedido

---

### 📜 low-ticket-scripts.md

**Conteúdo:** scripts canônicos pra cada momento da venda low ticket:
- Hooks de anúncio (vídeo + estático + carrossel)
- Subject lines de email (5 padrões testados)
- Linha de abertura de página de venda
- Frase de transição pro CTA
- Frases pra **objeção de preço** ("é caro" — específico de low ticket: a resposta NUNCA é justificar; é REFRAMING o valor)
- Frases pra **abandono de carrinho** (sequência email/SMS/Whatsapp)

**Onde buscar:**
- **Cashvertising** (Drew Eric Whitman) — 100+ princípios de DR copy aplicada
- **The Boron Letters** (Gary Halbert) — clássico de copy direta
- **Swipe files públicos** (swipefile.com, swiped.co)
- **Time Pinguim** — quais scripts já funcionam HOJE? Pegar do CRM/funil

**Critério de aceite:**
- 30+ scripts no total, organizados por momento
- Cada script com "quando usar" + "quando NÃO usar"
- Mínimo 10 scripts em PT-BR autêntico (não tradução)

---

### 🛡 low-ticket-objecoes-respostas.md

**Top 10 objeções de low ticket digital** (diferentes das de B2B):
1. "É muito caro" (mesmo R$ 47 — em low ticket é comum)
2. "Não tenho tempo agora"
3. "Vou esperar a próxima turma"
4. "Já tentei algo parecido e não deu certo"
5. "Cadê a garantia?"
6. "Como sei que vocês entregam?"
7. "Funciona pro meu nicho?"
8. "Posso fazer sozinho com YouTube grátis"
9. "Preciso pensar / falar com cônjuge"
10. "Tô sem cartão / sem Pix agora"

**Onde buscar:**
- **Hormozi — capítulo 9 do $100M Offers** tem objeções low ticket
- **Russell Brunson — Expert Secrets** tem matriz de objeções
- **Time Pinguim CRM** — objeções REAIS dos alunos do Desafio Lo-fi e ProAlt LT
- **Erico Rocha** tem material sobre quebra de objeção em lançamento

**Critério de aceite:**
- Resposta em até 3 frases (chatbot/SDR vai usar literal)
- Cada resposta marca qual gatilho Cialdini ou conceito Hormozi está usando
- Mínimo 5 objeções com exemplos REAIS extraídos do funil Pinguim

---

### 🌟 low-ticket-casos-pinguim.md (DEVER DE CASA INTERNO — só time Pinguim)

**Conteúdo:** Material que **SÓ A PINGUIM TEM** — informação que concorrente não consegue copiar de livro:
- Como o Desafio Lo-fi vende: ângulo, ad copy que funciona, sequência de aquecimento, conversão típica
- ProAlt LT: posicionamento, ofertas que funcionaram, taxa de conversão
- Mentoria Express: pra qual público funciona, ângulo de oferta
- Quais lançamentos Pinguim foram melhores e POR QUÊ
- Erros caros do passado: lançamentos que falharam e diagnóstico

**Quem produz:** Luiz, Micha, time comercial. **Não é eu.** Eu não tenho acesso a essa informação.

**Critério de aceite:**
- Sem dados sensíveis de aluno (LGPD)
- Números reais quando possível ("CPA do Desafio Lo-fi gira em R$ X")
- Versionado: marcar data ("estado em 2026-04-XX")

---

### ⚠️ low-ticket-anti-padroes.md

**Erros que matam conversão de low ticket:**
- Tratar low ticket como high ticket (call de 1h pra vender R$ 47)
- Justificar preço (vendedor inseguro vira gasto-defesa do produto)
- Fake scarcity / countdown que reseta — destrói confiança a longo prazo
- VSL com áudio ruim (low ticket vende em volume, qualidade técnica importa)
- Não ter ordem dos bumps (ordem de exposição do oferta principal + bumps)
- Aplicar Pain Funnel do Sandler em low ticket (cliente fecha tab)
- Misturar low e high ticket no mesmo funil de aquecimento sem segmentação
- Esquecer follow-up pós-venda (low ticket vivo de LTV via upsell)

**Onde buscar:**
- **Hormozi tem video específico "Mistakes I See"** no YouTube
- **Time Pinguim** — quais erros já cometeram em lançamentos? Sócios têm essas histórias na cabeça

---

### 🎯 low-ticket-quando-usar.md (vs SPIN/MEDDIC)

**Conteúdo:** Tabela direta de "use isto, não aquilo":

| Cenário | Metodologia |
|---|---|
| Ticket < R$ 1K | low-ticket-digital |
| Ticket R$ 1K-10K, ciclo médio | SPIN |
| Ticket > R$ 10K, B2B complexo | MEDDIC |
| Lançamento orquestrado | low-ticket + PLF |
| Renovação de aluno | SPIN suave + Voss |
| Aluno reclamando / pedindo reembolso | Voss (Tactical Empathy) |

**Critério de aceite:**
- Decisão clara em 5 segundos (agente vai usar como árvore de decisão)
- Sem "depende" — cada cenário aponta uma metodologia primária

---

## Estimativa de esforço pra esse Cérebro

- 11 arquivos eu posso estruturar baseado em fontes públicas: ~6-8h de trabalho meu
- 1 arquivo (`low-ticket-casos-pinguim.md`) é dever de casa interno: ~3-4h do time pra produzir
- Total: 1 sessão minha + 1 reunião do time comercial

**Tamanho-alvo total:** ~200KB de conteúdo curado. **É o maior Cérebro de metodologia da Pinguim**, e propositalmente — é o core do negócio.

---

Toda fonte nova precisa atender:

- [ ] Markdown bem formatado (## h2 pra seções, **bold** pra termos-chave)
- [ ] Cabeçalho YAML opcional, mas se presente, com `metodologia: <nome>` e `tipo: <scripts|dialogo|objecoes|casos|antipadroes|quando_usar>`
- [ ] Sem plágio direto (parafrasear sempre, citar fonte do livro/artigo)
- [ ] Sem chutes ("acho que…") — ou tem fonte verificável, ou é experiência interna Pinguim explicitada
- [ ] Vocabulário traduzido pra contexto Pinguim quando aplicável (substituir "Account Executive" por "closer", "deal" por "venda", etc)
- [ ] Tamanho razoável (3-6KB por arquivo)

Quando subir no Cérebro, taggear `tipo` corretamente:
- `scripts.md` → tipo `aula` (vira material de treinamento)
- `exemplos-dialogo.md` → tipo `aula`
- `objecoes-respostas.md` → tipo `objecao`
- `casos-famosos.md` → tipo `aula`
- `anti-padroes.md` → tipo `sacada`
- `quando-usar.md` → tipo `sacada`
