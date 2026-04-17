# Briefing — SaaS de Inteligência Comercial com IA

> Arquivo de contexto para novo projeto. Levar para pasta do projeto e iniciar novo chat.

---

## CONTEXTO

### O cliente
- Profissional que dá **treinamento comercial** (vendas)
- Tem audiência própria (mentorados/alunos de vendas)
- Quer uma solução pra ele usar E pra oferecer pros alunos dele
- Reunião agendada — CEO da Dolphin (Codina + sócio) participam

### A oportunidade
- Criar um **SaaS de inteligência comercial com IA**
- O cliente usa pra sua operação de vendas
- E revende/oferece pros alunos dele (modelo SaaS multi-tenant)
- High ticket — valor a negociar na reunião (não colocar preço na proposta)

---

## VISÃO DO PRODUTO

### O que é
Um sistema completo de vendas assistido por IA. O vendedor abre o sistema, e tem um time de agentes trabalhando pra ele: antes da call, durante a call, e depois da call.

### Modelo de negócio
- **Multi-tenant**: cada empresa cadastra seu contexto (produtos, ofertas, público)
- O dono da plataforma (nosso cliente) gerencia todas as contas
- Pode revender pra audiência dele como ferramenta ou como parte da mentoria

---

## FUNCIONALIDADES

### 1. Segundo Cérebro da Empresa (configuração)

Cada empresa cadastrada configura:
- **Produtos e ofertas** — o que vende, preço, bônus, garantia
- **Público-alvo** — quem são os clientes, dores, desejos
- **Tom de voz** — como a empresa se comunica
- **Proposta de valor** — o que diferencia dos concorrentes
- **Objeções comuns** — as mais frequentes e como rebater cada uma
- **Cases e provas sociais** — resultados de clientes anteriores

### 2. Biblioteca de Metodologias de Venda

Metodologias pré-carregadas (cérebros de metodologia):

| Metodologia | Foco |
|-------------|------|
| **SPIN Selling** | Perguntas: Situação, Problema, Implicação, Necessidade |
| **BANT** | Budget, Authority, Need, Timeline |
| **Challenger Sale** | Ensinar, Personalizar, Controlar |
| **Sandler Selling** | Dor, Budget, Decisão |
| **MEDDIC** | Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion |
| **Solution Selling** | Diagnóstico → Solução → Prova |
| **Gap Selling** | Estado Atual → Estado Futuro → Gap |
| **Consultative Selling** | Venda consultiva baseada em confiança |
| **NEAT Selling** | Need, Economic Impact, Access to Authority, Timeline |
| **Value Selling** | Venda baseada em valor, não preço |
| **SNAP Selling** | Simple, iNvaluable, Aligned, Priority |
| **Conceptual Selling** | Entender conceito do cliente antes de vender |
| **RAIN Selling** | Rapport, Aspirations, Afflictions, Impact, New Reality |
| **Inbound Selling** | Identificar, Conectar, Explorar, Aconselhar |
| **Command of the Sale** | Metodologia Force Management |
| **PACES** | Pain, Authority, Consequence, Event, Solution |
| **N.E.A.T.** | Need, Economic Impact, Access, Timeline |
| **Baseline Selling** | Dave Kurlan — estágios progressivos |
| **CustomerCentric Selling** | Empoderar o comprador |
| **Target Account Selling** | Vendas enterprise/ABM |
| **Metodologia própria** | O cliente sobe o material da metodologia dele |

O vendedor escolhe qual metodologia usar (ou o gestor define pra equipe).

### 3. Agentes do Sistema

#### Agente Orquestrador (o assistente principal)
- Ponto de contato do vendedor
- Entende o pedido e direciona pro agente certo
- "O que você quer fazer?" → proposta, email, quebrar objeção, treinar, analisar call

#### Agente SDR (pré-venda)
- Qualifica leads antes de chegar no vendedor
- Faz perguntas de qualificação (BANT, SPIN, etc.)
- Classifica: quente, morno, frio
- Gera briefing pro vendedor antes da call

#### Agente de Apoio em Tempo Real (durante a call)
- Vendedor está na call, recebe pergunta/objeção do cliente
- Cola no sistema (ou manda áudio) e recebe sugestão de resposta em tempo real
- Baseado na metodologia escolhida + cérebro da empresa
- "O cliente falou X, como respondo?" → resposta em segundos

#### Agente Quebrador de Objeções
- Especialista em rebater objeções
- Conhece as objeções comuns do produto (cadastradas no cérebro)
- Vendedor manda a objeção (texto ou áudio) → recebe resposta formatada
- Pode funcionar via WhatsApp: vendedor no Zap com cliente, abre o sistema e pede ajuda

#### Agente Analista de Call (pós-venda)
- Vendedor sobe a transcrição da call (ou grava e sobe o áudio — Whisper transcreve)
- O agente analisa com base na metodologia escolhida
- Dá nota por etapa (situação, problema, implicação, etc.)
- Aponta: onde foi bem, onde pode melhorar, o que faltou perguntar
- Gera relatório em PDF

#### Agente de Propostas
- Com base na call/conversa, gera proposta personalizada
- Usa: dores que o cliente mencionou, soluções apresentadas, objeções levantadas
- Formata: PDF ou texto pronto pra enviar

#### Agente de Follow-up
- Gera mensagens de follow-up (email ou WhatsApp) com base no contexto da conversa
- "Manda um email pro João reforçando os pontos da call de ontem"
- Personalizado com base no que foi discutido

#### Agente Cliente Oculto (treinamento)
- Simula um cliente pra treinar o vendedor
- Perfis de dificuldade:
  - **Fácil** — cliente receptivo, poucas objeções
  - **Médio** — faz perguntas difíceis, compara com concorrência
  - **Difícil** — resiste, questiona tudo, quer desconto
  - **Desafiador** — hostil, pressiona, testa o vendedor
- O vendedor "vende" pro agente
- No final: relatório com nota, pontos fortes, onde melhorar, sugestões

#### Agente Coach de Vendas
- Analisa padrões ao longo do tempo
- "Suas últimas 10 calls mostram que você perde na etapa de implicação"
- Sugere treinos específicos
- Acompanha evolução

### 4. Integrações

| Integração | O que faz |
|-----------|-----------|
| **CRM** (ActiveCampaign, Clinch, Kommo, HubSpot, Pipedrive, Close) | Sincroniza leads, deals, pipeline |
| **WhatsApp** | Vendedor recebe objeção no Zap → manda pro sistema → recebe resposta |
| **Google Meet / Zoom** | Pós-call: sobe transcrição pra análise |
| **Email** | Gera e envia follow-ups |
| **Google Calendar** | Agenda de calls, lembretes |
| **Whisper (áudio → texto)** | Vendedor sobe áudio → sistema transcreve e analisa |

### 5. Gestão de Metas e Comissões (OTE — On-Target Earnings)

O CEO mencionou especificamente o modelo OTE. O sistema gerencia:

- **Metas individuais e por time** — definir meta mensal/trimestral por vendedor
- **Acompanhamento em tempo real** — quanto falta pra bater, projeção com base no ritmo atual
- **Comissões automáticas** — calcula comissão variável com base nas vendas fechadas
- **Modelo OTE** — salário base + variável por meta atingida (configurável por empresa)
- **Alertas proativos** — "Faltam 3 dias pro fechamento do mês. Você está em 72% da meta. Precisa fechar mais R$14K."
- **Relatório de comissão** — PDF mensal com detalhamento: vendas, comissão base, bônus por meta

### 6. Dashboard do Gestor

- Visão geral do time de vendas
- **Painel de metas** — meta vs realizado por vendedor, por time, por período
- Notas das calls por vendedor
- Métricas: taxa de conversão, objeções mais comuns, tempo médio de call, ticket médio
- Ranking de vendedores (por receita, por nota de call, por conversão)
- **Projeção de receita** — baseada no pipeline e ritmo atual
- Insights: "O vendedor X está fraco em fechamento. Sugestão: treinar com cliente oculto nível difícil"
- **Comissões do time** — quanto cada vendedor vai receber no mês

---

## FLUXO DO VENDEDOR (dia a dia)

```
ANTES DA CALL
├── SDR qualificou o lead (quente/morno/frio)
├── Vendedor recebe briefing: quem é, empresa, dor provável
└── Sistema sugere abordagem com base na metodologia

DURANTE A CALL
├── Vendedor abre o painel de apoio
├── Vai anotando pontos-chave (ou cola objeções)
├── Sistema sugere perguntas e respostas em tempo real
└── Se receber áudio no WhatsApp → sobe → sistema responde

DEPOIS DA CALL
├── Sobe transcrição (ou grava e sistema transcreve via Whisper)
├── Sistema analisa com base na metodologia
├── Dá nota por etapa + relatório
├── Gera proposta personalizada se quiser
├── Gera follow-up (email ou WhatsApp)
└── Atualiza CRM automaticamente
```

---

## DIFERENCIAL: CLIENTE OCULTO (treinamento)

```
Vendedor: "Quero treinar pra uma call difícil"

Sistema: "Escolha o perfil do cliente:
  1. Receptivo (fácil)
  2. Questionador (médio)
  3. Resistente (difícil)
  4. Hostil (desafiador)"

Vendedor: "3 — Resistente"

Sistema (como cliente): "Então me conta, o que vocês fazem?
Porque eu já testei 3 ferramentas e nenhuma funcionou..."

[Simulação de venda — 10-15 min]

Sistema: "Sessão encerrada. Seu resultado:

  Rapport: 7/10 — Bom início, mas apressou
  Diagnóstico: 5/10 — Faltou explorar a dor
  Apresentação: 8/10 — Clara e objetiva
  Objeções: 4/10 — Cedeu rápido no preço
  Fechamento: 6/10 — Tentou, mas sem urgência

  Nota geral: 6.0 / 10

  Sugestões:
  • Na etapa de diagnóstico, use a pergunta SPIN de Implicação
  • Quando o cliente pediu desconto, use ancoragem de valor
  • No fechamento, crie urgência com deadline real"
```

---

## MODELO TÉCNICO SUGERIDO

### Opção: SaaS + OpenClaw

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | Next.js / React (dashboard web) |
| **Backend** | Supabase (banco, auth, realtime) |
| **IA / Agentes** | OpenClaw (orquestração) + GPT (LLM) |
| **Áudio** | Whisper (transcrição) |
| **Integrações** | APIs dos CRMs + WhatsApp + Email |
| **Hosting** | Vercel (frontend) + Hostinger/Hetzner (OpenClaw) |

### Por que SaaS + OpenClaw faz sentido:
- **SaaS** = interface bonita pro vendedor (dashboard, painel durante call, relatórios)
- **OpenClaw** = os agentes por trás (SDR, quebrador de objeção, analista, cliente oculto)
- O vendedor interage pelo dashboard (web) ou pelo WhatsApp/Telegram
- Multi-tenant: cada empresa tem seu espaço isolado

### Alternativa sem SaaS (só OpenClaw):
- Tudo via Telegram/Discord
- Mais simples de construir, menos visual
- Funciona, mas não tem a cara de "produto" que dá pra revender

**Recomendação: SaaS.** Se o cliente quer revender pra audiência, precisa de interface própria. Só OpenClaw via chat não escala como produto.

---

## O QUE A GENTE CONSEGUE IMPLEMENTAR

| Feature | Implementável? | Como |
|---------|---------------|------|
| Segundo cérebro por empresa | SIM | Supabase (banco) + arquivos MD |
| Biblioteca de metodologias | SIM | Pré-carregadas como arquivos no sistema |
| Metodologia custom do cliente | SIM | Upload de material → sistema absorve |
| Apoio em tempo real (texto) | SIM | Vendedor digita → agente responde |
| Apoio via áudio | SIM | Whisper transcreve → agente responde |
| Análise de call | SIM | Sobe transcrição → agente analisa por metodologia |
| Geração de proposta | SIM | Agente gera com base na call |
| Follow-up (email/WA) | SIM | Agente gera texto, envio via integração |
| Cliente oculto | SIM | Agente simula cliente com perfis de dificuldade |
| Dashboard do gestor | SIM | Frontend em Next.js + dados no Supabase |
| Integração CRM | SIM | Via API de cada CRM |
| Nota e ranking de vendedores | SIM | Análise acumulada no banco |
| WhatsApp | SIM | OpenClaw conecta via QR ou API oficial |
| Transcrição automática de call | PARCIAL | Se subir o áudio/vídeo sim. Gravar em tempo real é mais complexo |
| Gestão de metas (OTE) | SIM | Dashboard + banco de dados (Supabase) |
| Cálculo de comissões | SIM | Regras configuráveis por empresa no banco |
| Projeção de receita | SIM | Análise de pipeline + ritmo atual |

---

## CONSELHEIROS SUGERIDOS PRO PROJETO

| Conselheiro | Expertise | Por que |
|-------------|-----------|---------|
| **Jeb Blount** | Fanatical Prospecting, Sales EQ | SDR e prospecção |
| **Neil Rackham** | SPIN Selling | A metodologia mais usada em B2B |
| **Matthew Dixon** | Challenger Sale | Vendas complexas |
| **David Sandler** | Sandler Selling System | Framework completo |
| **Aaron Ross** | Predictable Revenue | SDR e máquina de vendas |
| **Chris Voss** | Never Split the Difference | Negociação e objeções |
| **Grant Cardone** | 10X Rule, Sell or Be Sold | Mindset e closing |
| **Jordan Belfort** | Straight Line System | Persuasão e fechamento |
| **Zig Ziglar** | Secrets of Closing the Sale | Clássico de vendas |
| **Brian Tracy** | Psychology of Selling | Psicologia da venda |
| **Jeffrey Gitomer** | Little Red Book of Selling | Relacionamento |
| **Chet Holmes** | Ultimate Sales Machine | Processo e disciplina |

---

## PRÓXIMOS PASSOS

1. [ ] Reunião com o cliente — apresentar a visão
2. [ ] Validar escopo e prioridades
3. [ ] Definir stack técnica final
4. [ ] Criar novo projeto em pasta separada
5. [ ] Iniciar desenvolvimento

---

## COMO USAR ESTE ARQUIVO

1. Crie pasta do projeto: `c:\NovoProjeto-SaaS-Comercial\`
2. Copie este arquivo pra lá como `BRIEFING.md`
3. Abra novo chat nessa pasta
4. Fale: "Lê o BRIEFING.md e vamos trabalhar nesse projeto"

---

*Briefing gerado em abril/2026 — Dolphin*
