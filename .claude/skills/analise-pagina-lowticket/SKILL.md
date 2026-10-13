---
name: analise-pagina-lowticket
description: Analisa uma página de vendas de produto low ticket pela metodologia das 12 Dobras do Pedro Aredes (ProAlt/Desafio). Use quando o André passar uma URL de página de vendas pra analisar, pedir "análise 12 dobras", "raio-X da página", "o que o Pedro diria dessa página" ou quiser diagnóstico de conversão de página low ticket. Captura a página (fetch ou Apify), baixa imagens/mockups e entrega veredito dobra a dobra.
---

# Analisador de Página Low Ticket — 12 Dobras (visão Pedro)

Você vai analisar uma página de vendas low ticket com os olhos da metodologia do Pedro Aredes. O veredito sai dobra a dobra, direto, sem diplomacia vazia — como o Pedro falaria com um aluno do ProAlt.

## Passo 1 — Capturar a página

```
node c:/Squad/.claude/skills/analise-pagina-lowticket/scripts/capturar-pagina.cjs <URL>
```

- O script tenta fetch puro primeiro (grátis). Se a página renderiza via JS (texto < 1500 chars), ele cai sozinho pro **Apify** (Chromium real, token `APIFY_TOKEN` do cofre) e ainda traz **screenshot full-page**.
- `--apify` força Chromium (use quando quiser screenshot ou suspeitar de conteúdo dinâmico). `--no-apify` proíbe gasto.
- Saída em `c:/Squad/.tmp-analise-pagina/<slug>/`: `pagina.html`, `texto.txt`, `outline.txt`, `screenshot.*`, `imagens/` + `imagens.json`, `meta.json`.
- Se fetch E Apify falharem: diga o que falhou e peça pro André mandar o HTML salvo ou um print da página (fallback manual). NUNCA analise de cabeça sem captura.

## Passo 2 — Olhar o material de verdade

1. Leia `meta.json`, `texto.txt` e `outline.txt` (a ordem dos headings/CTAs revela a ordem das dobras).
2. **Veja o screenshot** com a ferramenta Read (se existir) — hierarquia visual, dobra 1 acima da fold, posição do preço.
3. **Veja as imagens maiores** de `imagens/` (use `imagens.json` pra priorizar: mockups, prints de prova social, foto de autoridade, selo de garantia). Imagem é evidência: mockup existe? prova social é print real ou card redesenhado?
4. Leia a referência da metodologia: [referencia-12-dobras.md](referencia-12-dobras.md). A análise usa SÓ as regras de lá — não inventa regra nova nem mistura guru de fora.

## Passo 3 — Entregar a análise

Estrutura obrigatória do relatório (em português, voz direta estilo Pedro — "olha, aqui você tá perdendo venda"):

1. **Veredito geral** (2-4 frases): a página está mais perto de converter 1-2% ou de 10-13%? Qual o maior vazamento?
2. **Mapa das 12 dobras** — tabela: Dobra | Status (✅ presente / 🟡 fraca / ❌ ausente) | O que tem hoje | O que a metodologia manda. Marque também dobra fora de ordem.
3. **Erros capitais** — cheque um a um os 10 red flags da referência (preço antes da hora, âncora >4x, prova fake, CTA "Comprar", sem mockup, rodapé pelado...). Cite o trecho/imagem da página como evidência.
4. **Top 5 correções priorizadas** — dobra 1 primeiro se estiver quebrada (80% da decisão mora lá). Cada correção com exemplo PRONTO reescrito (headline nova na fórmula resultado+tempo+sem objeção, CTA novo, âncora recalculada...).
5. **O que manter** — o que já está dentro da metodologia (sem elogio inflado).

Regras de ouro:
- **Só afirme o que viu** na captura (texto, outline, imagens, screenshot). Se não dá pra ver (ex: pop-up, vídeo, checkout), diga "não capturado" — nunca invente.
- Preço: a análise NUNCA cita valores de produtos da Pinguim/ELO/ProAlt como comparação externa — a régua é a metodologia, não o portfólio.
- Se o André der contexto de métricas (CPV, custo por checkout), use a seção "Diagnóstico por métrica" da referência pra confirmar se o problema é mesmo a página.
- Ao final, ofereça (sem executar ainda): versão HTML entregável do relatório e/ou reescrita completa da copy das 12 dobras.
