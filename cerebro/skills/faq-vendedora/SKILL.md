---
name: faq-vendedora
description: Escreve FAQ de página de venda focada em derrubar objeções de compra (não institucional) quando o agente precisa transformar dúvidas em motivos pra comprar.
metadata:
  pinguim:
    familia: pagina-vendas
    formato: template
    clones: [dan-kennedy, alex-hormozi, gary-bencivenga]
---

# FAQ Vendedora

## Quando aplicar

Cliente precisa do **bloco de FAQ no fim da página de venda**. FAQ vendedora é diferente de FAQ institucional — cada pergunta antecipa objeção e a transforma em argumento de venda.

Sinais:
- Cliente pediu "FAQ" pra página
- Auditoria identificou que página tem objeções não respondidas
- Página com taxa de conversão abaixo do esperado e objeções na pesquisa de cliente

NÃO use quando:
- FAQ é de produto institucional (sobre login, suporte, política) — não é trabalho de copywriter
- Página é low-ticket curtíssima e não comporta FAQ

## Receita

FAQ vendedora tem 5-8 perguntas. **Cada pergunta segue padrão:** objeção real do cliente disfarçada de pergunta + resposta que vira argumento.

### Mapeando objeções

Pegar do dossiê Persona (`objecoes_compra` no JSONB) + pesquisa real (Voice of Customer). Categorias canônicas:

1. **Objeção de preço** — "tá caro / não tenho dinheiro agora"
2. **Objeção de tempo** — "não vou conseguir aplicar / tenho pouco tempo"
3. **Objeção de capacidade** — "vai funcionar pra MIM mesmo se eu não tenho X?"
4. **Objeção de timing** — "deixa eu pensar / depois eu vejo"
5. **Objeção de ceticismo** — "será que isso funciona mesmo?"
6. **Objeção de comparação** — "qual a diferença pro produto Y?"

### Estrutura de cada FAQ

**Pergunta** (na voz da Persona — vocabulário literal dela)
↓
**Resposta** (3 movimentos):
1. Valida objeção sem corrigir ("Faz sentido pensar isso")
2. Vira o argumento ("Justamente por isso o método foi feito assim...")
3. Inclui mini-prova ("Aliás, X dos nossos alunos começaram nessa exata situação")

### Ordem das FAQs

Pergunta sobre **timing/ceticismo** primeiro (mata as mais quentes) → **capacidade** (calibra qualificação) → **preço** (último, depois de tudo justificado).

## O que NÃO fazer

- FAQ institucional ("Como acesso?", "Tem aplicativo?"). Aborrece, não vende. Vai pro suporte/onboarding, não na página.
- Pergunta "soft" inventada ("E se eu quiser saber mais sobre o método?"). FAQ não é placeholder — cada pergunta tem que doer.
- Resposta defensiva. "Não, isso NÃO é caro porque..." → ERRADO. Vira: "Faz sentido sentir isso. E aqui está o que costuma acontecer..."
- Mais de 8 FAQs. Cansa, leitor abandona. Se tem 12 objeções, escolhe as 8 maiores.
- FAQ idêntica entre páginas de produtos diferentes. Persona muda, objeção muda.

## Clones a invocar

- **Dan Kennedy** — Magnetic Marketing tem capítulo inteiro sobre derrubar objeções
- **Alex Hormozi** — $100M Offers tem framework de objeção (Money/Time/Skepticism/Risk/Identity)
- **Gary Bencivenga** — voz analítica que valida objeção sem soar marketing

## Exemplo aplicado

**Pedido:** "FAQ pra página do Elo"

**Persona Elo objeções (do dossiê):**
- "Será que funciona pra quem ainda não tem nicho definido?"
- "Não tenho equipamento, vou conseguir mesmo assim?"
- "Tá caro pra quem nem ganha do criador ainda"
- "Já tentei outros cursos, por que esse vai ser diferente?"

**Saída esperada (6 FAQs ordenadas):**

```
1. "Já tentei outros cursos de Instagram e não funcionou. Por que esse 
   vai ser diferente?"
   → Valida ("Faz sentido a desconfiança — a maioria ensina técnica de 
   plataforma, não método de criador") + vira ("o Elo trabalha com os 3 
   pilares: posicionamento ANTES de produção, produção ANTES de 
   monetização — e essa ordem é o que destrava") + prova ("é por isso 
   que 247 alunos cruzaram primeira venda nos primeiros 90 dias")

2. "Funciona pra quem ainda não definiu nicho?"
   → Valida + vira ("Justamente — Módulo 1 inteiro é descoberta de 
   nicho, não pré-requisito") + prova

3. "Preciso de equipamento profissional?"
   → Valida + vira ("Bônus #2 ensina lo-fi com celular") + prova
   
4. "Quanto tempo por dia preciso dedicar?"
   → ...
   
5. "E se eu não conseguir resultado?"
   → Garantia tripla
   
6. "Tá caro pra quem ainda não fatura como criador"
   → ÚLTIMA — depois de tudo justificado. Calcula custo/dia + comparação 
   com o que aluno já gasta em outros cursos sem método
```
