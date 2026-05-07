---
name: gerar-persona-11-blocos
description: Gera dossiê estruturado em 11 blocos sobre quem compra um produto, baseado em Cérebro do produto e pesquisa quando o agente precisa criar Persona nova ou enriquecer Persona pobre. Skill universal Pinguim.
metadata:
  pinguim:
    familia: persona
    formato: playbook
    clones: []
---

# Gerar Persona — 11 Blocos

## Quando aplicar

- Produto novo entrando no Pinguim sem Persona definida
- Auditoria detectou Persona com 3 ou menos blocos preenchidos
- Cliente pediu "monta a Persona do produto X"

A estrutura 11 blocos é **canônica Pinguim** — formalizada em `pinguim.personas` no banco com 11 colunas JSONB.

NÃO use quando:
- Já existe Persona com 11/11 preenchidos (use direto via `buscar-persona`)
- Pedido é só pra "ICP B2B" — usa `icp-builder` (mais simples, B2B-focado)

## Receita

### Os 11 Blocos (estrutura canônica Pinguim)

1. **Identidade** — quem é (idade, gênero, profissão, renda mensal, estado civil, escolaridade)
2. **Rotina** — como vive o dia a dia (horários, rede social favorita, plataforma de consumo)
3. **Nível de consciência (Schwartz)** — Stage 1-5 dominante
4. **Jobs to be done** — o que tenta resolver (frase em primeira pessoa: "eu quero X")
5. **Vozes da cabeça** — diálogos internos típicos ("será que vai dar certo?", "tem gente que conseguiu, né?")
6. **Desejos reais** — o que de fato quer (não o que diz que quer)
7. **Crenças limitantes** — o que ela acredita que trava ("preciso ter X seguidores antes de monetizar")
8. **Dores latentes** — o que sente sem nomear ("se sente atrás dos amigos que estão progredindo")
9. **Objeções de compra** — o que diz pra não comprar ("tá caro pra quem não fatura ainda")
10. **Vocabulário** — gírias, jargões, formalidade, palavras literais
11. **Onde vive** — canais, redes, mídias, comunidades, podcasts, criadores que segue

### Fontes de dados

Pra cada bloco, vir de:
- **Cérebro do produto** — depoimentos, pesquisas com aluno, transcrição de calls comerciais
- **Voice of Customer** — review, comentários no Instagram, mensagens em DM, perguntas em Q&A
- **Pesquisa qualitativa** — entrevistas com 5-10 alunos atuais ou prospects
- **Análise de canais** — onde a Persona conversa (Reddit, Discord, Telegram, IG, Twitter)

### Saída

`pinguim.personas` (linha vinculada ao `cerebro_id`) com 11 JSONBs preenchidos. Cada JSONB tem estrutura interna específica:

```json
{
  "identidade": {
    "idade_min": 22,
    "idade_max": 32,
    "genero": "todos",
    "profissao": "criador iniciante / autônomo de outro nicho",
    "renda_mensal": "3-8k BRL",
    "escolaridade": "ensino médio a superior incompleto"
  }
}
```

Restantes seguem padrão similar — array de strings ou objects com campos.

### Versionamento

Persona é versionada (`pinguim.personas_snapshots` existe). Quando muda, criar snapshot do estado anterior — Pinguim trata Persona como ativo evolutivo, não estático.

## O que NÃO fazer

- Inventar dado. Persona inferida sem fonte = chute. Sempre citar fonte do dado (depoimento X, comentário Y, entrevista Z).
- Persona "ideal" em vez de "real". Marketing tradicional cria Persona aspiracional ("quem queremos atrair"). Pinguim cria Persona real ("quem está comprando hoje").
- Persona genérica replicável. "Mulher 30-50 anos que quer mudar de vida" = lixo. Específico.
- Esquecer **vocabulário literal**. É o bloco mais útil pra copy — palavras exatas que a Persona usa.
- Persona única quando produto tem 2+ públicos distintos. Lyra pode ter Persona A (criador iniciante) e Persona B (criador intermediário). Criar 2 Personas e marcar variante.

## Clones a invocar

Skill universal — não invoca Clone (geração de Persona é trabalho de pesquisa, não voz).

## Exemplo aplicado

**Pedido:** "monta Persona pro ProAlt, hoje só tem 3 blocos preenchidos"

**Briefing:**
- Cérebro ProAlt: 102 fontes, 288 chunks
- Pesquisa existente: ?? (verificar)

**Saída esperada (estrutura, dados ilustrativos):**

```json
{
  "identidade": {
    "idade_min": 28, "idade_max": 42, "genero": "todos",
    "profissao": "profissional CLT mid-career considerando transição",
    "renda_mensal": "8-15k BRL"
  },
  "rotina": {
    "rotina_diaria": "trabalha CLT 9-18, horário livre noite/fim-de-semana",
    "redes_principais": ["Instagram", "LinkedIn"],
    "consumo_conteudo": "podcasts no deslocamento, vídeo longo no YouTube"
  },
  "nivel_consciencia": "3 (Solution Aware) — sabe que info-produto é caminho, compara opções",
  "jobs_to_be_done": [
    "quero parar de trocar tempo por dinheiro",
    "quero criar fonte de renda paralela primeiro, depois sair do CLT"
  ],
  "vozes_cabeca": [
    "será que aguento postar tanto sendo CLT?",
    "tem gente fazendo, eu também consigo",
    "se der errado vou perder dinheiro investido"
  ],
  "desejos_reais": [
    "liberdade de horário",
    "previsibilidade financeira (não quer pular CLT pra incerteza)"
  ],
  "crencas_limitantes": [
    "preciso ter audiência grande pra começar",
    "info-produto é só pra quem já é influencer"
  ],
  "dores_latentes": [
    "sente que está estagnado profissionalmente",
    "vê pares ganhando independência"
  ],
  "objecoes_compra": [
    "tá caro pra investir sem saber se vai dar certo",
    "não tenho tempo pra mais um curso na minha vida"
  ],
  "vocabulario": ["CLT", "renda paralela", "transição", "estagnado", "fonte de renda"],
  "onde_vive": [
    "podcasts: NerdCast, PrimoCast, Os Sócios",
    "criadores que segue: Bruno Perini, Thiago Nigro, Pedro Sobral",
    "comunidades: subreddits de empreendedorismo, grupos LinkedIn"
  ]
}
```

11/11 preenchidos. Cada bloco tem fonte rastreável (depoimento X, post Y, entrevista Z) — não inventado.
