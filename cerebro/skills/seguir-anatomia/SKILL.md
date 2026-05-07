---
name: seguir-anatomia
description: Auto-checagem do agente de que está rodando com 7 MDs de identidade + 5 fontes vivas + EPP completos antes de executar trabalho criativo. Skill universal de validação.
metadata:
  pinguim:
    familia: meta
    formato: auditoria
    clones: []
---

# Seguir Anatomia

## Quando aplicar

Antes de delegar trabalho criativo. Esta Skill é a "checagem de cinto de segurança" — confirma que o agente tem o que precisa pra entregar bem antes de sair entregando.

## Receita

Checa 4 dimensões. Para cada uma marca ✅ ou ❌. Se algum ❌, agente declara explicitamente o gap no briefing antes de delegar.

### 1. Identidade (7 MDs)
- ✅/❌ IDENTITY.md presente
- ✅/❌ SOUL.md presente e não-vazio
- ✅/❌ AGENTS.md (regras operacionais)
- ✅/❌ TOOLS.md
- ✅/❌ AGENT-CARD.md (7 campos preenchidos)
- ✅/❌ SYSTEM-PROMPT.md gerado
- ✅/❌ APRENDIZADOS.md (existe, mesmo vazio)

### 2. Fontes vivas relevantes ao pedido
- ✅/❌ Cérebro do produto: existe e tem chunks
- ✅/❌ Persona: existe e dossiê preenchido
- ✅/❌ Funil: existe e etapas mapeadas (se relevante)
- ✅/❌ Skill aplicável: identificada e carregada
- ✅/❌ Clones: identificados pela Skill

### 3. EPP rodando
- ✅/❌ Verifier (Camada 1) configurado
- ✅/❌ Reflection loop (Camada 2) com guardrails
- ✅/❌ Feedback humano (Camada 3) com endpoint funcional

### 4. Memória individual
- ✅/❌ APRENDIZADOS.md geral lido nesta execução
- ✅/❌ Perfil-cliente lido (se cliente identificado)

## O que NÃO fazer

- Pular a checagem "porque sempre rodou". Anatomia incompleta é como o problema do "copy genérica do Elo" — cada gap não declarado vira inferência ruim do mestre.
- Marcar ✅ por inferência. Se não verificou, marcou ❌.
- Travar execução por 1 ❌. Skill DECLARA gap, não impede execução. Mestre que recebe briefing com gap declarado decide como compensar.

## Clones a invocar

Skill universal — não invoca Clone.

## Exemplo aplicado

**Pedido:** "copy pra página de venda do Elo"

**Seguir-anatomia retorna ao briefing:**

```
Auto-checagem do Atendente Pinguim:

Identidade (7/7 ✅): completa
EPP (3/3 ✅): rodando

Fontes vivas pro pedido:
✅ Cérebro Elo (1561 chunks) — mas conteúdo majoritariamente operacional
✅ Persona Elo (11/11 blocos)
❌ Funil Elo (0 etapas mapeadas)
✅ Skill anatomia-pagina-vendas-longa carregada
✅ Clones Halbert/Bencivenga/Schwartz/Hormozi/Kennedy/Benson disponíveis

Memória individual:
✅ APRENDIZADOS.md geral lido (3 padrões aplicáveis)
✅ Perfil-cliente Elo lido (5 correções anteriores aplicáveis)

⚠️ GAPS DECLARADOS AO MESTRE:
1. Cérebro Elo é operacional, não comercial — mestre vai trabalhar com 
   matéria-prima limitada
2. Funil Elo não mapeado — mestre produz versão dupla (frio + quente)
```
