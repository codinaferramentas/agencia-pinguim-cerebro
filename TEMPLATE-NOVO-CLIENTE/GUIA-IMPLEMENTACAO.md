# GUIA DE IMPLEMENTACAO — Novo Cliente

> Passo a passo pro Andre (ou qualquer dev da Dolphin) aplicar este template num cliente novo.
> Baseado no que funcionou com a Agencia Pinguim.

---

## Antes de comecar

### O que voce precisa do cliente

**Essencial pra comecar:**
- [ ] Briefing do negocio (o que fazem, quem vende pra quem)
- [ ] Lista de produtos/servicos com preco e funil
- [ ] Organograma basico (quem e socio, quem e funcionario, quem faz o que)
- [ ] Ferramentas usadas (Hotmart? Meta Ads? WhatsApp? CRM?)

**Essencial pra ativar (Fase 4):**
- [ ] Servidor (Hostinger, Hetzner, AWS — cliente providencia)
- [ ] Autorizacao de APIs (Hotmart Developer, Meta Business Manager, Google Cloud)
- [ ] Decisao de canais (Discord? Telegram? WhatsApp?)

**Pode vir depois:**
- [ ] Material detalhado dos produtos (aulas, PDFs, paginas de venda)
- [ ] Dashboards e metricas atuais
- [ ] Perfil de cada socio (pra personalizar agente pessoal)

---

## Fase 1 — Estrutura (1-2 dias)

### Passo 1: Criar repositorio GitHub
```bash
# Local
cd /caminho/pra/projetos-dolphin
cp -r TEMPLATE-NOVO-CLIENTE cliente-nome-aqui
cd cliente-nome-aqui

# GitHub
gh repo create dolphin/cliente-nome-aqui --private
git init && git add . && git commit -m "Setup inicial"
git push -u origin master
```

### Passo 2: Preencher contexto da empresa
Abra `cerebro/empresa/contexto/` e preencha cada arquivo:
- `geral.md` — O que a empresa faz, produtos, ferramentas, canais
- `people.md` — Equipe, socios, organograma
- `metricas.md` — KPIs principais (mensais, anuais, por produto)
- `decisions.md` — Decisoes estrategicas registradas
- `lessons.md` — Aprendizados ao longo do tempo

### Passo 3: Decidir squads necessarias
Analise o modelo de negocio do cliente e escolha quais squads criar:

**Perguntas-chave pra decidir:**
1. O cliente faz lancamentos pagos (desafios, masterclasses)? → Squad Lancamento Pago
2. Tem produto low ticket perpetuo (R$27-97 rodando sempre)? → Squad Low Ticket
3. Vende mentoria/consultoria por closer humano? → Squad High Ticket
4. Tem alunos que precisam de suporte? → Suporte aos Alunos
5. Precisa de operacao interna (CS, comercial, financeiro)? → Squad Agencia

**Nao criar squads que o cliente nao precisa.** Melhor comecar enxuto.

### Passo 4: Copiar e adaptar squads escolhidas
```bash
# Exemplo: cliente vai ter Squad Lancamento Pago
cp -r cerebro/squads/exemplo-mini-agencia cerebro/squads/lancamento-pago
# Renomear agentes, preencher MAPA.md com contexto do cliente
```

---

## Fase 2 — Alimentar (1 agente/dia)

Pra cada agente criado:

1. Abrir `IDENTITY.md` — preencher nome, emoji, escopo (1 linha)
2. Abrir `SOUL.md` — preencher personalidade, como opera, tom, limites
3. Abrir `TOOLS.md` — listar ferramentas essenciais e ideais
4. Abrir `AGENTS.md` — listar quem esse agente aciona

**Nao crie system prompt ainda** — isso e Fase 3.

---

## Fase 3 — System Prompts (3-5 agentes/dia)

Pra cada agente:

1. Abrir `SYSTEM-PROMPT.md` (o arquivo ja existe como template)
2. Escrever prompt completo no formato OpenAI:
   - Contexto do negocio
   - O que o agente faz
   - Como opera (passos)
   - Regras (SEMPRE / NUNCA)
   - Tom de voz
   - Coordenacao (quem aciona, o que entrega)

**Ordem sugerida:**
1. Agentes pessoais (dos socios) — primeiro
2. Roteador + Suporte — depois
3. Squads de receita — por ultimo (mais complexas)

---

## Fase 4 — Infraestrutura (2-3 dias, depende do cliente)

### Passo 1: Servidor
- Decisao: Hostinger, Hetzner, AWS (recomendar Hetzner pra custo/beneficio)
- Specs: 4 vCPU, 8GB RAM, 80GB SSD (Ubuntu 22.04 LTS)
- Custo: R$ 50-150/mes

### Passo 2: Instalar OpenClaw
Seguir documentacao oficial do Peter Steinberger.

### Passo 3: Configurar .env
```bash
# Nunca commita esse arquivo!
OPENAI_API_KEY=sk-...
HOTMART_CLIENT_ID=...
HOTMART_CLIENT_SECRET=...
META_ACCESS_TOKEN=...
DISCORD_BOT_TOKEN=...
# etc
```

### Passo 4: Configurar provider
OpenAI como default (GPT-5 full pra agentes criticos, GPT-5 Mini pra operacionais).

### Passo 5: Conectar canais
- Discord: Bot Token + permissoes no servidor do cliente
- Telegram: Bot via @BotFather
- WhatsApp: via Sendflow ou Meta Cloud API

---

## Fase 5 — Deploy (1-2 agentes/dia)

**Ordem sugerida** (do mais simples pro mais complexo):

1. **Orquestrador** (Pinguim, no Pinguim; nome diferente em outros clientes)
   - Sem APIs externas, so Discord
   - Testa roteamento entre agentes

2. **Agentes pessoais** (dos socios)
   - Google Calendar API
   - Hotmart + Meta Ads (leitura)
   - Discord

3. **Suporte aos alunos** (Roteador + Suporte por produto)
   - WhatsApp/Telegram
   - Hotmart API
   - Base de conhecimento do produto

4. **Squads de receita** (na ordem que o cliente quer)
   - Mais complexos — precisam do trabalho dos outros agentes estar maduro

---

## Fase 6 — Evolucao (continuo)

- Cliente da feedback → agente aprende
- Metricas de uso: quais agentes mais chamados, quais mais acertam
- Ajustes de system prompt baseado em erros reais
- Novos agentes sob demanda

---

## Erros que a Pinguim ensinou a evitar

### 1. Nao criar agente de video editor, designer, agendador
OpenClaw nao faz. Humano continua fazendo isso.

### 2. Nao separar agentes por produto
Marketing = especialista na HABILIDADE (copy, trafego, pagina), nao no produto.
Suporte = especialista no PRODUTO.

### 3. Nao prometer prazos em horas
"1 agente/dia", "2-3 dias de infra". Nunca "em 2 horas".

### 4. Nao avancar sem validar com o cliente
Cada fase entregue: pedir feedback do socio antes de seguir.

### 5. Nao misturar squad com expert
Se o cliente tem multiplos experts (tipo Pedro, Micha, Luiz), cada um tem
agente pessoal proprio — mas a squad de marketing e COMUM.

---

## Referencia: case Pinguim

Primeiro cliente a rodar esse framework. Tem:
- 35 squads no cerebro
- 44 system prompts prontos
- 38 clones de copywriters/storytellers alimentados
- 3 mini-agencias operacionais (lancamento, LT, HT)

Repo (privado): github.com/codinaferramentas/agencia-pinguim-cerebro

---

## Comercial

A Dolphin cobra por tamanho do projeto:

| Produto | Preco | Escopo |
|---------|-------|--------|
| Imersao | R$ 5.000 | Cliente aprende a fazer sozinho |
| Squad sob Demanda | R$ 20.000 | Dolphin implementa 1 squad especifica |
| High Ticket | R$ 45-50.000 | Ecossistema completo (como Pinguim) |

**Tempo medio de entrega:**
- Imersao: 2 semanas de aulas + suporte de 30 dias
- Squad sob Demanda: 30-45 dias
- High Ticket: 90-120 dias
