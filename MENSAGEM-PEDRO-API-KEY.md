# Mensagem pro Pedro

---

Pedro, preciso alinhar dois pontos pra gente começar a rodar o squad de agentes da Pinguim:

## 1. Servidor

Preciso de um servidor pra manter o OpenClaw rodando 24/7. Opções que a comunidade mais usa:

- **Hostinger** (~R$35/mês) — tem 1-click pro OpenClaw, mais prático
- **Hetzner** (~R$20-37/mês) — melhor custo-benefício, 4 vCPUs, 8GB RAM

Qual você prefere? Se já tiver algo rodando que dê pra reaproveitar, também funciona. Pra desenvolver e testar eu rodo local, o servidor é só pro deploy final.

## 2. API Key da Anthropic (exclusiva pro projeto)

Precisa ser uma chave separada só pro squad da Pinguim — pra controlar custo e não misturar com outros projetos.

Sobre os modelos, a ideia é otimizar por tipo de tarefa:

| Modelo | Custo (input/output por 1M tokens) | Onde usar |
|--------|-------------------------------------|-----------|
| **Sonnet 4.6** | US$3 / US$15 | Agentes pessoais, estrategistas, orquestrador — tarefas que exigem raciocínio |
| **Haiku 4.5** | US$1 / US$5 | Suporte ao aluno, roteador, tarefas simples e de alto volume — respostas curtas e rápidas |

A gente não precisa do Opus (US$5 / US$25) pra esse projeto. Sonnet resolve o grosso e Haiku pega o volume. Com **prompt caching** (90% de economia em leituras repetidas) e **batch API** (50% desconto pra processamentos que podem esperar), dá pra otimizar bastante.

Na conta: billing pay-as-you-go, e se quiser colocar um **spending limit** mensal pra controlar, melhor ainda.

Me manda a chave quando tiver (`sk-ant-api03-...`) que eu já começo a testar.

---
