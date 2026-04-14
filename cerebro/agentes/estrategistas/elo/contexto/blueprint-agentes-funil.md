# Blueprint de Agentes — Funil Completo Pinguim

> Visão de todo o funil: Tráfego → Desafio LoFi → Elo → Retenção
> Criado em 2026-04-14

---

## Visão do Funil

```
┌─────────────────────────────────────────────────────────────────┐
│                        FASE 1: ATRAÇÃO                          │
│  Tráfego orgânico + pago → Página do Desafio LoFi (R$69)       │
│                                                                  │
│  Agentes envolvidos:                                             │
│  • Estrategista de Marketing (macro)                             │
│  • Tráfego (Meta Ads, Google)                                    │
│  • Copy (página de vendas, ads)                                  │
│  • Social Media (orgânico)                                       │
│  • Video (criativos)                                             │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FASE 2: DESAFIO LOFI                         │
│  2 dias ao vivo + 7 roteiros + grupo VIP WhatsApp                │
│                                                                  │
│  Agentes envolvidos:                                             │
│  • Agente Desafio (NOVO) — suporte durante o desafio             │
│  • Copy (roteiros, emails da sequência)                          │
│  • Automações (fluxos WhatsApp, emails Hotmart)                  │
│                                                                  │
│  Conversão: participante do Desafio → comprador do Elo           │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       FASE 3: ELO (R$997)                        │
│  5 módulos + 4 protocolos + comunidade + acompanhamento          │
│                                                                  │
│  Agentes envolvidos:                                             │
│  • Estrategista Elo (análise, funil, campanha)                   │
│  • Suporte Elo (dúvidas do aluno)                                │
│  • Roteador (direciona aluno pro agente certo)                   │
│                                                                  │
│  Entrega: plataforma de aulas + Sirius + GS semanal              │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FASE 4: RETENÇÃO                             │
│  Cancelamento Coletivo + Mentor Técnico + GS + Comunidade        │
│                                                                  │
│  Agentes envolvidos:                                             │
│  • Suporte Elo (contínuo)                                        │
│  • Estrategista Elo (métricas de retenção)                       │
│  • CS (Customer Success - escalar problemas)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agentes Necessários (por prioridade de implementação)

### PRIORIDADE 1 — Impacto direto em vendas

| # | Agente | Fase | Modelo | Justificativa |
|---|--------|------|--------|---------------|
| 1 | **Agente Desafio** | Desafio | GPT-4o-mini | Alto volume, respostas curtas. Suporte durante os 2 dias + 7 dias de roteiro |
| 2 | **Suporte Elo** | Elo | GPT-4o-mini | Alto volume. Dúvidas de aluno sobre conteúdo, LoFi, protocolos |
| 3 | **Roteador** | Transversal | GPT-4o-mini (ou script) | Identificar aluno e direcionar. Lógica simples → pode ser script |

### PRIORIDADE 2 — Inteligência estratégica

| # | Agente | Fase | Modelo | Justificativa |
|---|--------|------|--------|---------------|
| 4 | **Estrategista Elo** | Elo + Desafio | GPT-4o | Análise de campanha, funil, conversão. Precisa raciocínio complexo |
| 5 | **Copy Elo** | Atração + Desafio | GPT-4o | Roteiros, páginas, emails. Usa os clones de copywriters |
| 6 | **Automações** | Desafio + Elo | Script + GPT-4o-mini | Fluxos WhatsApp, emails automáticos. Maioria é script |

### PRIORIDADE 3 — Escala e otimização

| # | Agente | Fase | Modelo | Justificativa |
|---|--------|------|--------|---------------|
| 7 | **Tráfego** | Atração | GPT-4o | Análise de campanhas Meta/Google, ROAS |
| 8 | **Social Media** | Atração | GPT-4o-mini | Calendário, posts, engajamento orgânico |
| 9 | **Pinguim (Chief)** | Transversal | GPT-4o | Orquestrador geral, coordena tudo |

---

## Detalhamento dos Agentes Novos

### 1. Agente Desafio (NOVO)

**O que faz:**
- Suporte aos participantes durante o Desafio LoFi
- Responde dúvidas sobre os 7 roteiros
- Ajuda a adaptar roteiros para o nicho do participante
- Envia lembretes dos dias ao vivo
- Faz ponte com o upsell do Elo (não vende, mas direciona)

**Contexto que precisa:**
- Estrutura dos 7 roteiros
- Tipos de ganchos virais
- FAQ do Desafio (serve pra todos os nichos? perfil pequeno?)
- Calendário do desafio (datas, horários)

**Modelo:** GPT-4o-mini (respostas curtas, alto volume)

**Tom:** Enérgico, prático, motivador. Como um coach de conteúdo.

**Diferença do Suporte Elo:** O Agente Desafio é temporário (ativo durante o período do desafio), foco em produção rápida de conteúdo. O Suporte Elo é permanente, foco em estratégia de longo prazo.

### 2. Suporte Elo (já existe, precisa enriquecer)

**O que faz:**
- Responde dúvidas dos alunos sobre os 5 módulos
- Orienta sobre os 4 protocolos (Produção, Caixa Rápido, Atração, Stories)
- Explica conceitos do universo Elo (Bandeira, Lo-fi, Pirâmide, etc.)
- Escala para GS humana quando necessário

**Contexto que precisa:**
- Transcrições das aulas (quando prontas)
- Glossário de termos do Elo
- FAQ base
- Estrutura dos protocolos

**Modelo:** GPT-4o-mini (volume alto, respostas objetivas)

### 3. Roteador (já existe, precisa atualizar)

**O que faz:**
- Identifica se é aluno do Desafio ou do Elo (ou outro programa)
- Direciona pro agente certo
- Lógica simples: consulta base → roteia

**Modelo:** Script Python (sem LLM) OU GPT-4o-mini se precisar entender linguagem natural

**Decisão:** Se os alunos chegam por WhatsApp com texto livre, precisa de LLM pra entender a intenção. Se chegam por botão/menu, pode ser script puro.

### 4. Estrategista Elo (já existe, precisa enriquecer)

**O que faz:**
- Analisa performance do Desafio (quantos entraram, taxa de conversão pra Elo)
- Analisa métricas do Elo (retenção, engajamento, NPS)
- Propõe melhorias de funil
- Aciona Copy, Tráfego, Automações quando precisa

**Modelo:** GPT-4o (raciocínio complexo, análise de dados)

---

## Fluxos de Conversa

### Fluxo 1: Participante do Desafio com dúvida
```
Participante: "Não sei como adaptar o roteiro 3 pro meu nicho de nutrição"
    ↓
Roteador: identifica → programa Desafio → direciona
    ↓
Agente Desafio: "Pra nutrição, o roteiro 3 funciona assim: [adaptação]"
```

### Fluxo 2: Aluno do Elo com dúvida sobre protocolo
```
Aluno: "Estou no Protocolo Caixa Rápido mas não entendi o passo 3"
    ↓
Roteador: identifica → programa Elo → direciona
    ↓
Suporte Elo: "No Protocolo Caixa Rápido, o passo 3 é sobre [explicação]"
```

### Fluxo 3: Sócio quer análise
```
Pedro: "Como foi a conversão do último desafio?"
    ↓
Pinguim (Chief): identifica → demanda de análise → aciona Estrategista
    ↓
Estrategista Elo: "No último desafio: X inscritos, Y converteram, taxa de Z%..."
```

### Fluxo 4: Precisa de copy pra novo desafio
```
Pedro: "Preciso de copy pra página do próximo desafio"
    ↓
Pinguim → Estrategista Elo (define briefing) → Copy Chief → Copywriter ideal
    ↓
Copy: [gera roteiro usando os clones alimentados]
```

---

## Otimização de Custos (OpenAI)

| Tipo | Modelo | Custo (input/output por 1M tokens) | Uso |
|------|--------|-------------------------------------|-----|
| **Raciocínio** | GPT-4o | $2.50 / $10.00 | Estrategista, Copy, Tráfego |
| **Volume** | GPT-4o-mini | $0.15 / $0.60 | Suporte, Roteador, Desafio |
| **Script** | Sem LLM | $0 | Roteador simples, automações, formatação |

**Estimativa mensal (cenário conservador):**
- Suporte + Desafio: ~500 conversas/mês × ~2K tokens = 1M tokens → GPT-4o-mini: ~$0.75
- Estrategista + Copy: ~50 análises/mês × ~5K tokens = 250K tokens → GPT-4o: ~$3.12
- **Total estimado: ~$5-10/mês** (sem contar tráfego pago de ads)

---

## Ordem de Implementação Sugerida

### Semana 1: Base
1. [ ] Configurar OpenClaw com provider OpenAI
2. [ ] Criar Roteador (script ou GPT-4o-mini)
3. [ ] Criar Agente Desafio (com contexto dos 7 roteiros)
4. [ ] Criar Suporte Elo (com transcrições das aulas)

### Semana 2: Inteligência
5. [ ] Enriquecer Estrategista Elo (com dados reais de conversão)
6. [ ] Conectar Copy Chief + Copywriters ao fluxo
7. [ ] Testar fluxo completo: Desafio → Elo → Suporte

### Semana 3: Escala
8. [ ] Automações WhatsApp (fluxos do Desafio)
9. [ ] Agentes pessoais dos sócios
10. [ ] Pinguim (Chief) orquestrando tudo

---

## Decisões que precisam do André/Sócios

1. **O Desafio LoFi tem grupo WhatsApp?** Se sim, o Agente Desafio pode operar lá dentro
2. **Como os alunos do Elo tiram dúvidas hoje?** WhatsApp? Plataforma? Isso define onde o Suporte atua
3. **Próximo desafio: quando?** Isso define a urgência de ter o Agente Desafio pronto
4. **Tem dados de conversão dos desafios anteriores?** Taxa de entrada no desafio → compra do Elo
