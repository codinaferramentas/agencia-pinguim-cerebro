# Próximos Passos — Pós-Reunião 14/04/2026

> Consolidação do que saiu da reunião + o que precisa ser feito agora.

---

## O QUE OS SÓCIOS DEFINIRAM

### 3 princípios do projeto:
1. **Tudo replicável** — vira produto (já estávamos fazendo)
2. **Estrutura de empresa** — não só suporte, mas agentes pra RH, financeiro, jurídico, tributário, comercial
3. **Começar pelo que dá dinheiro** — foco em coisas que ajudam a vender mais e trazer caixa

### Prioridade: Elo primeiro
- Transcrever aulas do Elo pra dar contexto ao agente
- Criar estrategista que analise a campanha de venda do Desafio LoFi
- Evoluir pra ter página de venda do Elo (hoje não tem)
- Depois replicar pro Proalt com o mesmo framework

### Nova estrutura de agentes (visão do Luiz):
- RH
- Financeiro
- Jurídico / Tributário
- Comercial
- Estrategistas por produto (Elo, Proalt)
- Especialistas: copy, páginas de venda, criação de oferta, análise de tráfego pago

> Luiz vai enviar organograma (print) pra estudo

---

## O QUE PRECISA FAZER AGORA

### 1. Chave da API Anthropic (URGENTE — precisa pra desenvolver)

**Passo a passo pra criar:**
1. Acesse: https://console.anthropic.com
2. Crie uma conta (ou faça login se já tiver)
3. Vá em "API Keys" no menu
4. Clique em "+Create Key"
5. Dê um nome (ex: "pinguim-dev")
6. **COPIE E SALVE** — a chave só aparece uma vez
7. Vá em "Plans & Billing" e configure pagamento (cartão de crédito)
8. Escolha "pay-as-you-go" (paga por uso)

**A chave tem este formato:** `sk-ant-api03-...`

**Quem cria?** Quem tiver o cartão de crédito pra colocar no billing. Pode ser um dos sócios ou a empresa. Depois compartilha a chave com você (de forma segura).

**Custo:** Só paga o que usar. Pra desenvolvimento/testes: ~US$5-15 por semana.

### 2. Servidor — Opções (não precisa ser DigitalOcean)

Pesquisei e aqui estão as opções que o pessoal usa com OpenClaw:

| Servidor | Custo/mês | Destaque | Link |
|----------|-----------|----------|------|
| **Hostinger** | ~R$35/mês | 1-click OpenClaw (instala sozinho em minutos). O mais fácil. | hostinger.com |
| **Hetzner** | ~R$20-37/mês | Melhor custo-benefício. 4 vCPUs, 8GB RAM. Favorito da comunidade. | hetzner.com |
| **DigitalOcean** | ~R$30-60/mês | Boa documentação. Segurança forte. | digitalocean.com |
| **Contabo** | ~R$20/mês | Mais RAM por real. Econômico. | contabo.com |

**Recomendação:** Hostinger (se quer o mais fácil — 1-click) ou Hetzner (se quer o melhor custo-benefício).

**Pergunta pro Luiz:** ele falou que viu pessoal usando Hostinger ou Hetzner? Se sim, vai nesse que tem mais comunidade de suporte.

**Pra começar a desenvolver NÃO precisa de servidor.** O OpenClaw roda na sua máquina pra testar. O servidor é só pra ficar 24/7.

### 3. Instalar OpenClaw na sua máquina (pra começar a desenvolver)

```bash
# Instalar
npm i -g openclaw

# Configurar (wizard interativo)
openclaw onboard

# Durante o onboard, ele pede:
# - API key da Anthropic (passo 1 acima)
# - Qual modelo usar (começar com Sonnet 4.6)
# - Canais (pode pular por enquanto, conecta depois)

# Testar se funciona
openclaw start
```

---

## NOVA ESTRUTURA DE AGENTES (rascunho pra evoluir)

### Agentes Pessoais (igual antes)
- Pedro, Micha, Luiz, Codina

### Agente Pinguim (orquestrador interno)
- Igual antes — serve a equipe no Discord

### Agentes de Suporte ao Aluno
- Lira, Taurus, Proalt, Elo (igual antes)

### NOVO: Agentes de Área / Departamento
- **RH** — demandas de pessoas, contratação, clima
- **Financeiro** — relatórios financeiros, projeções
- **Jurídico / Tributário** — consultas, compliance
- **Comercial** — pipeline, conversão, scripts

### NOVO: Agentes Especialistas (sub-agentes)
- **Especialista em Copy** — headlines, páginas de venda, emails
- **Especialista em Páginas de Venda** — estrutura, conversão, análise
- **Especialista em Criação de Oferta** — empacotamento, pricing, bônus
- **Especialista em Tráfego Pago** — análise de campanhas, criativos, métricas

### NOVO: Estrategistas por Produto
- **Estrategista do Elo** — conhece o produto, o desafio LoFi, o funil de venda
- **Estrategista do Proalt** — conhece o produto, o desafio Low Ticket, o funil de venda
- (Futuros: Lira, Taurus, Orion)

### Como funciona o fluxo do Estrategista

```
Luiz (pro agente pessoal dele):
"Como está a estratégia de venda do Elo?"

Agente do Luiz → aciona Estrategista do Elo

Estrategista do Elo:
- Consulta dados de vendas do Desafio LoFi
- Analisa página do desafio
- Verifica conversão
- Aciona Especialista em Copy se precisa melhorar headline
- Aciona Especialista em Oferta se precisa ajustar preço/bônus
- Devolve análise completa pro Luiz
```

### Pergunta aberta: 1 estrategista por produto ou 1 estrategista geral?

**Opção A — 1 por produto:** Cada um conhece profundamente o seu produto. Mais especializado.
**Opção B — 1 geral:** Conhece todos os produtos. Menos agentes, mais simples.

**Minha sugestão:** Começar com 1 por produto (Elo e Proalt). Cada produto tem contexto muito diferente — desafio LoFi é diferente de desafio Low Ticket. Separar dá mais qualidade.

---

## O QUE PRECISA PRA COMEÇAR COM O ELO (prioridade 1)

1. **Transcrição das aulas do Elo** — pra dar contexto ao agente
   - Quantas aulas tem? 
   - Formato: vídeo? Se sim, a gente extrai a transcrição (igual fiz com o YouTube)
   - Onde estão hospedadas?

2. **Material do Desafio LoFi** — o que o Micha fala nos 5 dias + 2 aulas ao vivo
   - Copies usadas
   - Estrutura do desafio
   - Página atual do desafio (link)

3. **Dados de vendas** — pra o estrategista ter contexto
   - Quantos desafios já fizeram?
   - Conversão média (quantos entram no desafio vs. quantos compram Elo)
   - Preço atual do Elo (997?)
   - Existe oferta especial durante o desafio?

4. **Acesso à página do desafio** — pra o agente analisar

---

## PENDÊNCIAS

- [ ] Sócios criarem/compartilharem a API key da Anthropic
- [ ] Luiz enviar o organograma (print)
- [ ] Definir qual servidor (Hostinger ou Hetzner — confirmar com Luiz)
- [ ] Micha compartilhar material do Elo (aulas, desafio, copies)
- [ ] Você: instalar OpenClaw na sua máquina e fazer primeiro teste
- [ ] Corrigir as suposições na apresentação V3 (75 pontos identificados)

---

*Documento vivo — atualizar conforme as coisas avançam.*
