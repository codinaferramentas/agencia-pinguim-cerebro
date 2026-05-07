---
name: briefing-cliente
description: Recebe pedido humano em linguagem natural e monta briefing rico (Cérebro + Persona + Funil + Skill + Clones) para passar ao Chief delegar trabalho criativo. Skill universal que TODA agente Pinguim usa antes de delegar tarefa para mestre.
metadata:
  pinguim:
    familia: meta
    formato: playbook
    clones: []
---

# Briefing pro Mestre

## Quando aplicar

**Sempre que o agente vai delegar trabalho criativo pra um Chief ou mestre.** Esta é a Skill que separa "agente que entrega copy genérica" de "agente que entrega copy contextualizada".

Trigger: o agente reconheceu que o pedido é criativo (não conversacional) e vai chamar `delegar-chief` ou similar. Antes de chamar, **roda esta Skill pra montar briefing**.

NÃO use esta skill quando:
- Pedido é conversacional ("oi", "tudo bem?") — responde direto, sem delegar
- Pedido é factual e já tem resposta no Cérebro (use `buscar-cerebro` direto, sem delegar)
- Não há produto identificado (volta ao usuário e pergunta qual produto)

## Receita

O briefing rico tem **6 blocos**. Faltar bloco = mestre inventa contexto = output genérico.

### Bloco 1 — Pedido literal
Reproduz o que o humano pediu, sem reformular ainda. Mestre precisa ver as palavras exatas que o cliente usou.

### Bloco 2 — Produto e Cérebro consultado
- Slug do produto identificado
- Resumo do que o produto é (1-2 frases vindas do Cérebro)
- Trechos relevantes do Cérebro que tocam o pedido (chunks com score ≥ 0.65)
- Se Cérebro tá pobre pra esse pedido: declarar explicitamente "Cérebro tem material operacional, não comercial — atenção, mestre vai precisar trabalhar com pouca matéria-prima"

### Bloco 3 — Persona
- Quem é o comprador desse produto (dossiê 11 blocos resumido em 4-5 linhas)
- Estágio Schwartz dominante (1 a 5)
- Tom de linguagem que essa Persona usa (vocabulário, gírias, formalidade)
- Se Persona não existe pra esse produto: declarar "sem Persona definida — mestre opera com inferência do Cérebro, output será mais genérico"

### Bloco 4 — Funil e etapa
- Slug do funil ativo (se houver)
- Etapa específica em que esse output entra (consciência / consideração / decisão / pós-venda)
- Tráfego de origem (frio Meta, lista quente, orgânico, indicação)
- Se Funil não existe: declarar "sem funil mapeado — mestre assume etapa neutra"

### Bloco 5 — Skill aplicável
- Slug da Skill que cobre esse formato (ex: `anatomia-pagina-vendas-longa`)
- Se nenhuma Skill cobre exatamente: nomeia a mais próxima + declara o gap
- A Skill traz a estrutura. Sem Skill, mestre escolhe sozinho — output inconsistente entre execuções.

### Bloco 6 — Clones a invocar
- Lista de Clones que a Skill referencia + qualquer Clone adicional relevante pelo contexto
- Função de cada Clone na entrega (Halbert no opening, Hormozi na oferta, etc)

### Saída do briefing

Bloco único de texto markdown que o Atendente passa pra `delegar-chief`. O Chief recebe esse briefing inteiro e distribui pros mestres.

## O que NÃO fazer

- **Pular blocos** porque "tá faltando dado". Declarar o gap explicitamente é melhor que esconder. Mestre precisa saber se Persona é inferida vs definida.
- **Reformular o pedido literal** no Bloco 1. Mestre precisa ver as palavras do cliente.
- **Resumir Cérebro com 1 frase genérica** ("é um curso de Instagram"). Traz chunks reais com score, fonte citada.
- **Briefing curto demais.** Briefing rico é melhor que briefing limpo. Mestre pode ignorar contexto irrelevante; não pode inventar contexto que não recebeu.
- **Briefing longo demais.** Cap razoável: 2.500 palavras. Mais que isso, mestre se perde.

## Clones a invocar

Skill universal — não invoca Clone. **Esta Skill SERVE os Clones** preparando o terreno pra eles trabalharem.

## Exemplo aplicado

**Pedido humano:** "copy pra página de venda do Elo"

**Briefing rico que essa Skill produz:**

```markdown
# Briefing — Copy de página de venda Elo

## 1. Pedido literal
"copy pra página de venda do Elo"

## 2. Produto e Cérebro
**Slug:** elo
**Resumo:** programa digital pra criadores iniciantes (0-5k seguidores) 
desenvolverem método de criação de conteúdo e monetização.

**Trechos relevantes (Cérebro Elo, 1561 chunks):**
- "Sistema 3 Pilares Elo: posicionamento, produção, monetização" (Aula 1, score 0.82)
- "247 alunos cruzaram primeira venda nos primeiros 90 dias" (Depoimentos, score 0.78)
- [⚠ ATENÇÃO: Cérebro Elo tem material majoritariamente operacional 
  — comunicados internos, exports de WhatsApp de alunos atuais. 
  Falta página atual, oferta, garantia. Mestre vai trabalhar 
  com matéria-prima limitada.]

## 3. Persona
Criador iniciante 22-32 anos, 0-5k seguidores, trabalha em outra coisa,
sonha "viver de criador" mas trava na primeira postagem.
Vocabulário: gírias de internet, "engajamento", "alcance", 
"travado", "não sei sobre o que postar".
**Estágio Schwartz dominante:** 2 (Problem Aware) se tráfego frio, 
3-4 (Solution/Product Aware) se lista quente.

## 4. Funil e etapa
[⚠ Funil Elo não tem etapas mapeadas no banco — mestre assume etapa 
de decisão se tráfego não for declarado.]
**Tráfego declarado neste pedido:** não declarado. 
Recomendação: pedir ao cliente OU produzir versão dupla 
(Stage 2 pra frio + Stage 4 pra quente).

## 5. Skill aplicável
**anatomia-pagina-vendas-longa** — estrutura completa de página longa.
Tráfego frio + ticket esperado: páginas longa é o formato certo.

## 6. Clones a invocar
- Eugene Schwartz: decide ordem dos blocos pelo nível de consciência
- Gary Halbert: headline + opening story + P.S.
- Gary Bencivenga: bullets de fascinação + bloco de prova
- Alex Hormozi: stack de bônus + Value Equation
- Dan Kennedy: garantia + risk reversal + urgência
- Jon Benson: se a página tiver VSL embedada, roteiro do vídeo
```

**Resultado:** Copy Chief recebe esse briefing e distribui blocos pros mestres com contexto rico. Output não é genérico porque mestre não inventa — recebe briefing.
