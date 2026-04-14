# Plano de Trabalho — Agência Pinguim

> O que fazer, em que ordem, o que depende de quê.

---

## STATUS ATUAL

| Item | Status | Quem resolve |
|------|--------|-------------|
| API Key Anthropic | **Pendente — pedir pros sócios** | Pedro/Micha/Luiz (cartão) |
| Servidor (Hostinger/Hetzner) | **Pendente — pedir pro Pedro** | Pedro |
| Organograma | **Recebido** (print do Luiz) | ✅ |
| Material do Elo (aulas) | **Pendente — Micha vai disponibilizar no Drive** | Micha |
| Repositório GitHub | **A criar** | Codina |
| Estrutura do cérebro | **A criar** | Codina |
| Instalar OpenClaw local | **A fazer** | Codina |

---

## O QUE PODEMOS FAZER JÁ (sem servidor, sem API key)

### Bloco 1 — Estrutura (pode fazer agora)

- [ ] Criar repositório no GitHub (privado, organização agencia-pinguim)
- [ ] Montar estrutura completa do cérebro (pastas + templates)
- [ ] Criar arquivos base de TODOS os agentes (SOUL, AGENTS, IDENTITY, TOOLS) com base no organograma do Luiz
- [ ] Documentar o framework de implementação (já feito: FRAMEWORK-IMPLEMENTACAO.md)
- [ ] Criar permissionamento (quem acessa o quê)

### Bloco 2 — Conteúdo do Elo (quando Micha disponibilizar)

- [ ] Transcrever aulas do Elo (se forem vídeos, extrair transcrição)
- [ ] Analisar material do Desafio LoFi (estrutura, copies, fluxo)
- [ ] Analisar página atual do desafio (se tiver link)
- [ ] Montar contexto do Elo pro agente estrategista
- [ ] Montar FAQ base pro agente de suporte Elo

### Bloco 3 — Precisa da API Key

- [ ] Instalar OpenClaw e rodar primeiro teste
- [ ] Testar primeiro agente localmente
- [ ] Validar que o fluxo funciona (mandar mensagem → agente responde)
- [ ] Conectar canais (Discord primeiro, depois Telegram/WhatsApp)

### Bloco 4 — Precisa do servidor

- [ ] Configurar servidor (Hostinger ou Hetzner)
- [ ] Deploy do OpenClaw no servidor
- [ ] Conectar canais definitivos (24/7)
- [ ] Agentes no ar pra equipe usar

---

## ORGANOGRAMA DE AGENTES — BASEADO NO QUE O LUIZ ENVIOU

### Orchestration (1 agente)
| Agente | Função | Nome sugerido |
|--------|--------|---------------|
| **chief** | Orquestrador principal — recebe tudo e direciona | Pinguim |

### Core — Departamentos (8 agentes)
| Agente | Função |
|--------|--------|
| **comercial** | Vendas, upsell, pipeline |
| **financeiro** | DRE, fluxo de caixa, margens |
| **juridico** | Contratos, compliance |
| **tributario** | Impostos, planejamento fiscal |
| **cs** | Customer Success |
| **produtos** | Gestão de produtos/cursos |
| **dados** | Dados e analytics |
| **rh** | Recursos humanos |

### Marketing — Especialistas (8 agentes)
| Agente | Função |
|--------|--------|
| **estrategista** | Estratégia de marketing |
| **copy** | Copywriting |
| **designer** | Design gráfico/visual |
| **social-media** | Redes sociais |
| **trafego** | Tráfego pago |
| **video** | Produção de vídeo |
| **automacoes** | Automação de marketing |
| **gestor-projetos** | Gestão de projetos |

### YouTube (1 agente)
| Agente | Função |
|--------|--------|
| **youtube** | Canal YouTube |

### Agentes Pessoais (4)
| Agente |
|--------|
| Pedro |
| Micha |
| Luiz |
| Codina |

### Agentes de Suporte ao Aluno (4 + roteador)
| Agente | Produto |
|--------|---------|
| Roteador | Identifica aluno e direciona |
| Lira | Mentoria iniciante |
| Taurus | Mentoria escala |
| Proalt | Programa low ticket |
| Elo | Programa conteúdo LoFi |

### Estrategistas por Produto (começando pelo Elo)
| Agente | Produto |
|--------|---------|
| Estrategista Elo | Elo + Desafio LoFi |
| Estrategista Proalt | Proalt + Desafio Low Ticket (depois) |

### Total: ~27 agentes
- 1 orquestrador
- 8 departamentos
- 8 marketing
- 1 YouTube
- 4 pessoais
- 5 suporte (4 + roteador)
- 2 estrategistas (por enquanto)

---

## PRIORIDADE (definida pela diretoria)

**Começar pelo que dá dinheiro:**

1. **Estrategista do Elo** — analisar campanha, melhorar venda
2. **Agentes pessoais dos sócios** — cada um com seu canivete suíço
3. **Agente Pinguim (chief)** — orquestrador interno
4. **Suporte ao aluno (Elo primeiro)** — FAQ, dúvidas
5. **Expandir** — outros departamentos, outros produtos

---

## FLUXO: COMO O ESTRATEGISTA FUNCIONA

```
Sócio fala com agente pessoal dele:
  "Como está a estratégia de venda do Elo?"
        ↓
Agente pessoal aciona Estrategista do Elo
        ↓
Estrategista do Elo:
  - Conhece o produto (aulas transcritas, contexto)
  - Conhece o funil (Desafio LoFi → aulas ao vivo → pitch → venda)
  - Analisa o que tem hoje (página, copies, conversão)
        ↓
Se precisar, aciona especialistas:
  - Copy → pra melhorar headline da página
  - Tráfego → pra analisar campanha do desafio
  - Oferta → pra ajustar empacotamento/preço/bônus
        ↓
Devolve análise completa pro sócio
```

---

## CHECKLIST — O QUE PEDIR PROS SÓCIOS

### Urgente (bloqueia desenvolvimento)
- [ ] **API Key Anthropic** — criar em console.anthropic.com, configurar billing (pay-as-you-go), compartilhar a chave `sk-ant-...`
- [ ] **Material do Elo** — Micha disponibilizar no Google Drive (aulas, copies do desafio, página)

### Importante (não bloqueia, mas precisa em breve)
- [ ] **Servidor** — Pedro definir: Hostinger (mais fácil, ~R$35/mês) ou Hetzner (mais barato, ~R$20/mês)
- [ ] **Clone/perfil de cada sócio** — cada um envia arquivo MD ou faz conversa guiada com o agente
- [ ] **Acesso às ferramentas** — Hotmart (API key), Sirius, Sendflow, Google Calendar

### Pode esperar
- [ ] Material do Proalt (segundo produto)
- [ ] Material da Lira, Taurus, Orion
- [ ] Detalhes de rotina de cada área (levantar quando chegar a vez)

---

## O QUE EU (CODINA) FAÇO AGORA

### Hoje:
1. ✅ Framework de implementação criado
2. ✅ Plano de trabalho criado
3. → Criar repositório no GitHub
4. → Montar estrutura do cérebro com todas as pastas
5. → Criar arquivos base dos 27 agentes (SOUL, AGENTS, IDENTITY, TOOLS)
6. → Mapear o organograma do Luiz na estrutura de pastas

### Quando receber material do Elo:
7. → Transcrever aulas
8. → Analisar página do desafio
9. → Montar contexto pro estrategista

### Quando receber API Key:
10. → Instalar OpenClaw
11. → Testar primeiro agente (agente pessoal do Codina)
12. → Validar fluxo completo
13. → Entregar agentes pessoais pros sócios

### Quando tiver servidor:
14. → Deploy no servidor
15. → Conectar canais (Discord, Telegram, WhatsApp)
16. → Agentes 24/7

---

*Documento vivo — atualizar conforme o trabalho avança.*
