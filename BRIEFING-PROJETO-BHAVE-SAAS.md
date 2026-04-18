# Briefing — Projeto SaaS para Agência BHAVE

> **Cliente:** Agência BHAVE (atende múltiplos experts, começando por Érika Linhares).
> **Objetivo do arquivo:** Contexto completo pra gerar a **apresentação comercial visual** (HTML/PDF estilizado) que vou apresentar ao cliente.
> **Como usar:** Copiar esse arquivo + o PDF do relatório BHAVE pra pasta nova. Abrir novo chat e falar: "Lê o BRIEFING-PROJETO-BHAVE-SAAS.md e o PDF do relatório BHAVE. Gera uma apresentação comercial visual (HTML no padrão que já uso — dark mode, profissional) com tudo que está proposto aqui. Sem valores — o preço fica pra reunião."

---

## CONTEXTO DO CLIENTE

### Quem é
- **Agência BHAVE** — agência de marketing que atende experts (infoprodutores)
- São 2 sócias na operação
- Primeiro expert do portfólio: **Érika Linhares** — mentora/palestrante na área de liderança positiva, vende cursos online + palestras corporativas + workshops + mentoria

### O que elas fazem hoje (processo manual)
Toda terça-feira à tarde, entregam um **relatório de marketing** para cada expert, contendo:
- Vendas do curso (Hotmart)
- Seguidores (Instagram, TikTok, LinkedIn, YouTube)
- Palestras/workshops fechados, aceitos, recusados, aguardando
- Conteúdos impulsionados (Meta Ads)
- Leads por categoria (curso, mentoria, palestra, podcast)
- Highlights da semana (melhores posts, com imagens, impressões, alcance, gatilhos)

### Dor principal
- Relatório demora **mais de 1 dia por expert** pra montar manualmente
- Se o expert pede fora da terça (quinta-feira por ex.), não tem
- Multi-cliente: cada expert cadastrado = mais tempo manual
- Dados vêm de vários lugares: Hotmart, ManyChat (migrando pra Clint), Instagram, planilhas manuais

### O que elas querem
1. **Automatizar** a geração do relatório (diário, semanal, sob demanda)
2. **Escalar** pra atender múltiplos experts sem aumentar esforço proporcional
3. **Entregar mais** que só relatório — gerar conteúdo também (roteiros de Reels, carrosséis, análise de performance)
4. **Dash interno** pra elas navegarem pelos dados dinamicamente

---

## ANÁLISE DO PDF DO RELATÓRIO BHAVE (página por página)

Esta é a estrutura do relatório que elas entregam hoje. O SaaS deve ser capaz de gerar **exatamente** no mesmo formato visual, com dados automáticos.

### Página 1 — Capa
- "Marketing Results" + mês/ano
- Logo da agência (BHAVE) + logo do expert (Érika)
- Estático, só personalização visual

### Página 2 — Overview do mês
Cards com números-chave. Cada card tem indicação da origem do dado:
| Card | Dado | Origem |
|------|------|--------|
| Seguidores Instagram | +71.405 | Instagram API |
| Liderança Positiva (curso) | 453 vendas | Hotmart |
| O Novo Líder (curso) | 63 vendas | Hotmart |
| Palestras/workshops vendidos | 16 | Manual (vira Clint) |
| Palestras/workshops em fechamento | 1 | Manual (vira Clint) |
| Vendas Liderança Positiva | R$ 262.549,95 + comissão | Hotmart |
| Vendas O Novo Líder | R$ 59.118,99 + comissão | Hotmart |
| Valor Parcial Serviços Highticket | R$ 426.300 | Manual (vira Clint) |
| Valor total em vendas | R$ 747.969,94 | Soma |
| Saldo disponível Hotmart | R$ 53.391,92 | Hotmart |
| Status investimento tráfego pago | R$ 19.025,86 | Meta |

### Página 3 — Realizado vs Meta
3 tabelas lado a lado:
- **Liderança Positiva** — meta vs realizado (jan, fev, mar) — Hotmart
- **Palestras** — meta vs realizado (jan, fev, mar) — Manual
- **Seguidores** — meta vs realizado + total acumulado (6 meses + projeção de 1 milhão) — Instagram

### Página 4 — Valor em Vendas (últimos 6 meses)
- Tabela com mês + valor
- Gráfico de barras duplas (curso Hotmart + high ticket manual)
- Origem: Hotmart + manual (vira Clint)

### Página 5 — Vendas do curso (dia a dia no mês)
- Gráfico de barras 1-31 com número de vendas por dia
- Origem: Hotmart

### Páginas 6 a 9 — Highlights Vendas e Seguidores (semana 1, 2, 3, 4)
Cada página mostra 3 posts da semana com:
- Screenshot do post (celular)
- Título do conteúdo
- Data + dia da semana
- Impressões, alcance, gatilhos do curso, ganho de seguidores
- Origem: Instagram

### Página 10 — Seguidores Instagram
- Gráfico de barras (crescimento 6 meses)
- Gráfico semanal (mar 1 a mar 4): novos seguidores vs deixaram de seguir
- Gráfico de pizza: total vs novos vs deixaram de seguir
- Número atual: 912.151 seguidores
- Origem: Instagram

### Página 11 — Seguidores TikTok
- Gráfico de barras (6 meses)
- Gráfico semanal
- Total: 195.263 seguidores
- Origem: TikTok (API)

### Página 12 — Seguidores LinkedIn
- Gráfico 6 meses + semanal
- +1.394 no mês
- Total: 27.338 seguidores
- Origem: LinkedIn (API ou entrada manual)

### Página 13 — Seguidores YouTube
- Gráfico 6 meses + semanal
- Total: 13.584 inscritos
- Origem: YouTube API

### Página 14 — Conteúdos impulsionados (Meta Ads)
- Lista de 8 anúncios ativos com: texto do post, cliques, CPC, valor gasto
- Origem: Meta Ads API

### Página 15 — Leads e investimento (6 meses)
- Tabela: mês + valor investido
- Gráfico duplo: valor investido vs leads gerados
- Origem: Meta Ads API

### Página 16 — Leads do mês
- Total: 711 leads
- Gráfico pizza: por categoria (curso, mentoria, palestra, podcast)
- Gráfico barras semanais
- Origem: ManyChat (vai migrar pra Clint)

### Página 17 — Palestras: origem dos leads
- Gráfico pizza: redes sociais vs indicação
- Origem: Clint

### Página 18 — Palestras: overview
- 2 gráficos pizza: status dos leads + status das propostas
- Origem: Clint

### Páginas 19 a 23 — Detalhamento de palestras
- Listas de propostas recusadas, aceitas, aguardando resposta
- Totais do mês
- Origem: Clint (manual hoje)

---

## ARQUITETURA DA SOLUÇÃO PROPOSTA

### Tipo de solução
**SaaS Multi-Tenant** (cada expert cadastrado = um tenant/espaço isolado), com:
- **Frontend web** (Next.js) — painel de controle da agência + dash interno
- **Backend** (Supabase) — banco, auth, storage, realtime
- **Camada de Agentes** (OpenClaw) — orquestrador + squads especializados
- **Canais** (Telegram obrigatório + WhatsApp opcional com chip)

### Visão geral

```
┌─────────────────────────────────────────────────────────┐
│              AGÊNCIA BHAVE (2 sócias)                    │
│                                                          │
│   Painel Web (Next.js)                                   │
│   ┌──────────────────────────────────────────┐          │
│   │  • Gestão de Experts (multi-tenant)      │          │
│   │  • Dashboard interno (filtros dinâmicos) │          │
│   │  • Histórico de apresentações gerada     │          │
│   │  • Editor de apresentação (ajustes)      │          │
│   │  • Configuração de regras de negócio     │          │
│   │  • Cadastro de integrações (APIs, tokens)│          │
│   │  • Biblioteca de conteúdo (roteiros)     │          │
│   └──────────────────────────────────────────┘          │
│                                                          │
│   Agentes via Telegram/WhatsApp:                         │
│   ┌──────────────────────────────────────────┐          │
│   │  • Agente pessoal de cada sócia          │          │
│   │  • Orquestrador (recebe pedido e aciona) │          │
│   │  • Squads: Relatório, Conteúdo, Análise  │          │
│   └──────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│              CÉREBROS DOS EXPERTS                        │
│   Cada expert tem seu próprio cérebro:                   │
│   • Clone (tom de voz, estilo, valores)                  │
│   • Produtos e ofertas                                   │
│   • Metas mensais                                        │
│   • Histórico de conteúdo                                │
│   • Credenciais de integração (Hotmart, Meta, etc.)      │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│              INTEGRAÇÕES EXTERNAS                        │
│   Hotmart · Clint · Meta Ads · Instagram API ·           │
│   TikTok API · YouTube API · LinkedIn API ·              │
│   Google Drive/Sheets · Apify (backup scrapers)          │
└─────────────────────────────────────────────────────────┘
```

---

## TELAS DO PAINEL WEB (sugestão)

### 1. Login
- Auth via Supabase (email/senha + Google)

### 2. Dashboard principal (home)
- Lista de experts cadastrados
- Últimas apresentações geradas
- Alertas (ex: "Apresentação pendente de aprovação")
- Próximos disparos agendados

### 3. Cadastro/Edição de Expert (multi-tenant)
Cada expert tem:
- **Identidade:** nome, foto, marca, slogan
- **Clone:** tom de voz, estilo de escrita, valores, referências
- **Produtos:** lista de produtos vendidos (curso, mentoria, palestra) + preços
- **Metas:** meta mensal por produto
- **Integrações:** credenciais (Hotmart, Meta, Instagram, TikTok, YouTube, LinkedIn, Google Drive, Clint, Apify)
- **Canais de entrega:** WhatsApp do cliente, grupo, Telegram

### 4. Dashboard Interno por Expert (filtros dinâmicos)
- Seleciona expert → vê todas as métricas
- Filtros: período, produto, canal
- Mesma fonte de dados da apresentação, mas navegável
- Gráficos interativos (não estáticos)
- **A apresentação entregue é uma "foto" desse dashboard num momento específico**

### 5. Geração de Apresentação
- Seleciona expert + período
- Preview em HTML (navegável)
- Editor: ajustar números, trocar textos, escolher quais posts entrar nos highlights
- Aprovar → vai pra fila de disparo
- Exportar como PDF

### 6. Histórico de Apresentações
- Todas as apresentações já geradas
- Filtro por expert, data, status (pendente, aprovado, enviado)
- Clique em uma → abre a versão HTML daquela data

### 7. Biblioteca de Conteúdo (squad de conteúdo)
- Roteiros gerados
- Carrosséis
- Análises de performance de posts
- Planos de conteúdo de 7/30 dias
- Clonagem de vídeos (input: URL de Reels → output: roteiro novo similar)

### 8. Regras de Negócio
Por expert, configurar:
- **Atrelamento de vendas ao post:**
  - Janela: [1 dia] ▼ (dropdown: mesmo dia / 1 dia / 2 dias / 3 dias)
  - Tipo de post considerado: [X] Feed [X] Reels [ ] Stories
- **Disparo automático:**
  - Frequência: [Semanal] ▼ (diário, semanal, quinzenal, mensal)
  - Dia/hora: [Terça, 14h] ▼
  - Enviar automaticamente OU precisar aprovação manual
- **Outras regras conforme necessidade**

### 9. Configurações da Agência
- Dados das sócias
- Canal de notificação (Telegram/WhatsApp)
- Plano/assinatura

---

## SISTEMA DE AGENTES

### Arquitetura de agentes

```
┌──────────────────────────────────────┐
│  AGENTES PESSOAIS (por sócia)         │
│  Ponto de contato no Telegram/WhatsApp│
│  • Agente pessoal Sócia 1            │
│  • Agente pessoal Sócia 2            │
└──────────────┬───────────────────────┘
               ↓ aciona
┌──────────────────────────────────────┐
│  ORQUESTRADOR BHAVE                   │
│  Recebe pedido, identifica expert,    │
│  direciona pro squad certo            │
└──────────────┬───────────────────────┘
               ↓ aciona conforme necessidade
┌──────────────────────────────────────┐
│  SQUAD RELATÓRIO                      │
│  • Coletor de Dados (APIs)            │
│  • Analista (processa + calcula)      │
│  • Gerador de Apresentação (HTML/PDF) │
│  • Disparador (WhatsApp/Telegram)     │
├──────────────────────────────────────┤
│  SQUAD CONTEÚDO                       │
│  • Social Media Manager               │
│  • Roteirista (Reels, vídeos)         │
│  • Copywriter (carrosséis, posts)     │
│  • Analista de Performance            │
│  • Pesquisador (tendências via Apify) │
├──────────────────────────────────────┤
│  SQUAD ANÁLISE                        │
│  • Analisador de Instagram            │
│  • Analisador de Funil de Venda       │
│  • Cruzador de Dados (vendas x post)  │
├──────────────────────────────────────┤
│  CLONES POR EXPERT                    │
│  • Clone Érika Linhares               │
│  • Clone Expert 2                     │
│  • Clone Expert N                     │
└──────────────────────────────────────┘
```

### Fluxo de um pedido

**Exemplo 1: Relatório sob demanda**

```
Sócia (Telegram): "Gera o relatório da Érika dos últimos 30 dias"

Agente pessoal → Orquestrador BHAVE

Orquestrador:
  1. Identifica: expert = Érika, período = últimos 30 dias
  2. Aciona Squad Relatório
     a. Coletor de Dados → puxa de Hotmart, Meta Ads, Instagram, etc.
     b. Analista → processa, calcula meta vs realizado, crescimento
     c. Gerador de Apresentação → monta HTML no padrão BHAVE
  3. Salva no Supabase (histórico)
  4. Responde: "Apresentação pronta. Preview: [link]. Aprova pra enviar?"

Sócia: "Ajusta o número de palestras fechadas pra 17"

Orquestrador → Gerador de Apresentação → atualiza → novo preview

Sócia: "Aprovo"

Orquestrador → Disparador → envia PDF pro WhatsApp do expert
```

**Exemplo 2: Geração de conteúdo**

```
Sócia (Telegram): "Preciso de roteiros pra 7 dias de conteúdo da Érika"

Agente pessoal → Orquestrador → Squad Conteúdo

Squad Conteúdo:
  1. Analista de Performance → olha posts que performaram bem nos últimos 30 dias
  2. Pesquisador → pesquisa tendências no nicho de liderança
  3. Social Media Manager → monta plano de 7 dias com temas
  4. Roteirista → cria roteiros de Reels
  5. Copywriter → cria textos de carrossel + legendas
  6. Clone Érika → ajusta tudo pro tom de voz dela

Resultado: PDF com 7 dias de conteúdo pronto

Orquestrador: "PDF com 7 roteiros + 7 carrosséis prontos. Baixa aqui: [link]"
```

**Exemplo 3: Clonagem de vídeo**

```
Sócia: "Essa Reel da [outra criadora] bombou. Gera um roteiro similar pra Érika: [link]"

Squad Conteúdo:
  1. Apify → transcreve o vídeo
  2. Analista → identifica estrutura (gancho, desenvolvimento, CTA)
  3. Roteirista → adapta estrutura pro nicho da Érika
  4. Clone Érika → ajusta ao tom de voz

Resultado: Roteiro novo pronto pra gravação
```

---

## INTEGRAÇÕES NECESSÁRIAS

### Por API oficial (preferencial)
| Integração | O que puxa | Como configurar |
|------------|-----------|-----------------|
| **Hotmart** | Vendas, alunos, comissões, saldo | API key no cadastro do expert |
| **Meta Ads API** | Gastos, impressões, cliques, CPM, leads | OAuth Facebook |
| **Instagram Graph API** | Seguidores, posts, métricas (Business Account) | OAuth Facebook |
| **TikTok Business API** | Seguidores, posts, métricas básicas | OAuth TikTok |
| **YouTube Data API** | Inscritos, vídeos, métricas | OAuth Google |
| **LinkedIn API** | Seguidores (Company Page) | OAuth LinkedIn |
| **Google Drive/Sheets** | Planilhas manuais do expert | OAuth Google |
| **Clint (CRM)** | Leads, propostas, status | API key |

### Por scraping (backup, via Apify)
Quando API não dá conta:
- **TikTok perfil pessoal** — dados mais ricos via Apify
- **LinkedIn perfil pessoal** — via Apify (com risco)
- **Instagram** — análise de Reels de terceiros pra clonagem de conteúdo

### Infraestrutura
| Serviço | Uso | Custo estimado |
|---------|-----|---------------|
| **Supabase** | Banco, auth, storage | Grátis até X usuários, depois ~R$125/mês |
| **Vercel** | Frontend (Next.js) | Grátis pra começar |
| **Hostinger/Hetzner** | OpenClaw rodando 24/7 | ~R$35-50/mês |
| **OpenAI (GPT-5)** | LLM dos agentes | Pay-as-you-go (~R$500-1.500/mês) |
| **Apify** | Scrapers | ~R$50-200/mês |
| **Chip WhatsApp** | Bot de disparo (opcional) | ~R$15/mês |

---

## FLUXO COMPLETO DE GERAÇÃO DE APRESENTAÇÃO

### Etapa 1 — Coleta
- Cron agendado (dia/hora configurável por expert) OU sob demanda via chat
- Coletor de Dados puxa de todas as integrações ativas
- Dados brutos salvos no Supabase

### Etapa 2 — Processamento
- Analista cruza dados:
  - Meta vs Realizado
  - Crescimento vs período anterior
  - Vendas atreladas a post (regra configurável)
  - Highlights (posts com melhor performance)

### Etapa 3 — Geração
- Gerador de Apresentação monta HTML no padrão BHAVE
- Usa template configurável (branding do expert)
- Gera PDF exportável a partir do HTML

### Etapa 4 — Preview e Aprovação
- Notificação na plataforma + Telegram: "Apresentação pronta pra revisão"
- Sócia abre preview
- Pode editar: trocar números, textos, escolher posts dos highlights
- Aprova

### Etapa 5 — Disparo
- Envia via Telegram e/ou WhatsApp pro cliente
- Se a regra é "automático sem aprovação", pula direto pro disparo (configurável)
- Salva no histórico

### Etapa 6 — Histórico
- Todas as apresentações salvas
- Acesso: "última de março", "última semana", por expert, etc.

---

## DASH INTERNO (uso da agência, não pro cliente)

### Propósito
**A apresentação é uma "foto" num momento. O dash é o vídeo ao vivo.**

### Features
- Mesma fonte de dados da apresentação
- Filtros dinâmicos: período (últimos 7/30/90 dias, mês atual, customizado), expert, produto, canal
- Gráficos interativos (hover, drill-down)
- Comparação entre experts
- Comparação entre períodos
- Alertas configuráveis ("se queda de seguidores > 10%, avisa")

### Uso
- Sócia abre pra analisar performance
- Serve de base pra decisões (aumentar investimento, mudar estratégia)
- Se um expert pede dado fora da apresentação, ela consulta ali e responde

---

## REGRAS DE NEGÓCIO IMPORTANTES

### 1. Atrelamento de vendas ao post (configurável)
- Expert posta em t. Vendas em t+1 e t+2 são atribuídas àquele post.
- Janela configurável (1, 2, 3 dias).
- Só considera Feed e Reels (Stories configurável).
- Se tiver múltiplos posts no mesmo dia, divide proporcionalmente (ou mostra cada um).

### 2. Aprovação manual vs automático
- Por expert, configura: "disparar automaticamente" OU "esperar aprovação"
- Default sugerido: esperar aprovação (sócia revisa antes)

### 3. Metas configuráveis
- Por expert, por produto, por mês
- Sistema calcula gap (meta - realizado) e projeção de atingimento

### 4. Múltiplos canais de disparo
- Por expert, cadastra como vai receber (Telegram, WhatsApp, ambos)
- Anexo: PDF da apresentação

### 5. Privacidade multi-tenant
- Cada expert é isolado no banco (Row Level Security do Supabase)
- Sócia só vê dados dos experts que cadastrou
- Experts não veem dados uns dos outros (caso no futuro o expert tenha acesso direto)

---

## APRESENTAÇÃO COMERCIAL QUE QUERO GERAR

### Objetivo
Apresentar essa solução pra agência BHAVE na reunião. Elas precisam olhar e falar: **"era isso que a gente queria"**.

### Tom
- Profissional, moderno, dark mode
- Visual parecido com as outras apresentações que já fiz (padrão Dolphin)
- Sem valores monetários (preço fica pra negociação na reunião)

### Estrutura sugerida da apresentação

1. **Hero** — "Sua operação de marketing multi-expert, automatizada com IA"
2. **O cenário atual** — reconhecer o valor do que elas já fazem + os desafios (sem atacar)
3. **A visão** — como seria se toda essa operação fosse automatizada
4. **A solução em 1 olhar** — SaaS + Agentes IA + Multi-tenant
5. **O painel web** — mockup/descrição das telas principais
6. **Os agentes** — quem trabalha por trás (squads internos)
7. **Geração automática de relatórios** — fluxo visual
8. **Geração de conteúdo (bônus)** — squad de roteiro, carrossel, clonagem de vídeo
9. **Dash interno** — uso pessoal delas
10. **Integrações** — lista das ferramentas que conectamos
11. **Regras de negócio configuráveis** — flexibilidade
12. **Multi-tenant** — como escalar pra N experts
13. **O dia a dia delas (antes vs depois)** — timeline
14. **Roadmap de implementação** — fases (V1 básico, V2 completo)
15. **Próximos passos** — CTA pra discutir na reunião

### O que NÃO colocar
- Valores/preço (fica pra reunião)
- Promessas que não podemos cumprir
- Tecnologias específicas (não poluir com nomes como "Supabase", "Next.js" — elas não precisam saber)
- Crítica à equipe atual delas (tom sempre positivo)

### O que DESTACAR
- Multi-expert desde o dia 1 (escala)
- Apresentação personalizada por expert (tom de voz, clone)
- Agentes IA que aprendem com o tempo
- Dash interno como "vitamina extra"
- Geração de conteúdo como diferencial (vão além do relatório)
- Flexibilidade (regras configuráveis)
- Histórico e auditoria (tudo salvo)

---

## PONTOS A VALIDAR NA REUNIÃO

- Quantos experts atendem hoje? Quantos planejam atender?
- Qual a frequência ideal do relatório? Todo dia? Semanal?
- Quais integrações são prioritárias (tudo ou começar com algumas)?
- Querem dash interno ou só o relatório?
- Querem squad de conteúdo (roteiros, carrosséis) ou só relatório?
- Apify: topam pagar extra pra ter dados mais ricos?
- Telegram + WhatsApp ou só um?
- Quem vai usar o painel web (só as sócias ou quer dar acesso aos experts)?
- Qual budget mensal elas imaginam?
- Quando querem o sistema no ar?

---

## FASES DE IMPLEMENTAÇÃO SUGERIDAS

### V1 — MVP (4-6 semanas)
- Cadastro de experts
- Integração Hotmart + Meta Ads + Instagram
- Geração de apresentação (HTML + PDF)
- Disparo via Telegram
- Aprovação manual antes do envio
- 1 expert funcionando ponta-a-ponta (Érika)

### V2 — Completo (+ 4-6 semanas)
- TikTok, YouTube, LinkedIn
- Google Drive/Sheets (planilhas manuais)
- Clint (CRM)
- Dash interno
- Squad de conteúdo (roteiros, carrosséis)
- Multi-tenant completo

### V3 — Diferencial (+ ongoing)
- Clonagem de vídeo via Apify
- Análise proativa ("seu engajamento caiu, sugiro X")
- Integrações extras conforme necessidade
- Evolução contínua dos clones

---

## ARQUIVOS DE REFERÊNCIA NESTA PASTA

- **BRIEFING-PROJETO-BHAVE-SAAS.md** (este arquivo)
- **MODELO DE FECHAMENTO PARA REUNIAO SEMANAL.pdf** (relatório atual que elas fazem — referência visual)

---

## INSTRUÇÃO FINAL PRO AGENTE QUE VAI EXECUTAR

Agente,

Você vai ler este arquivo + o PDF do relatório BHAVE. Seu trabalho é gerar uma **apresentação comercial visual** (HTML estilizado no padrão dark mode, profissional — igual as apresentações que o André já fez pra outros clientes, como Dolphin, Pinguim, Mini Agência).

Requisitos da apresentação:
- HTML único auto-contido (CSS inline)
- Dark mode (background #0a0a0a, accent #e94560, cards #151515)
- Responsivo (mobile + desktop)
- Navegação sticky no topo
- Seções claras conforme a estrutura sugerida acima
- Sem valores monetários
- Tom: evolução e oportunidade, nunca crítica à equipe atual da BHAVE
- Destacar o que é diferencial (multi-tenant, clones, dash interno, squad de conteúdo)
- Incluir exemplos concretos de uso (fluxo de geração de relatório, conteúdo, etc.)

Pontos de atenção:
- Não prometer o que o OpenClaw não consegue (confirmar viabilidade antes de incluir)
- Não usar termos muito técnicos (elas são da área de marketing, não de tech)
- Pensar no impacto visual — quando elas abrirem, precisam se impressionar

Entregável final: arquivo HTML pronto pra ser aberto no navegador e apresentado na reunião.

Depois de gerar, abre no navegador pra eu validar antes da reunião.

---

*Briefing criado em abril/2026 — Dolphin (André Codina)*
