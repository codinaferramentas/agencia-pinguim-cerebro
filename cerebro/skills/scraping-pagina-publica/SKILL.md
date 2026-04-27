---
name: scraping-pagina-publica
description: Use sempre que o agente precisar extrair texto de URL pública —
  página de vendas, blog, artigo, documentação. Faz fetch direto do HTML e
  limpa scripts/nav/footer pra retornar só o conteúdo principal. NÃO funciona
  com SPA pesado (usar fallback Apify) nem com conteúdo logado.
---

# Skill: scraping-pagina-publica

## Quando usar

Use esta skill quando:

- Aluno mandou link de página de venda de concorrente — agente precisa ler pra responder/comparar
- Sócio mandou link de artigo/blog — agente vai extrair o ponto principal
- Precisa raspar página oficial de produto (Hotmart, Eduzz, Kiwify) pra alimentar Cérebro Externo
- Vai resumir documentação técnica (RFC, post oficial de fornecedor, página de produto)

NÃO use quando:

- URL é YouTube/Instagram/TikTok — usar skills específicas (`transcrever-video-youtube`, `extrair-instagram` etc) que já têm lógica de embed/legenda
- Página é SPA pesado (Notion, Linear, app.*, dashboards) — vai retornar erro "texto curto, provável SPA". Usar fallback Apify
- Conteúdo precisa de login (Hotmart aluno, Slack, Discord) — não vai funcionar; pedir login pro humano
- URL é HTTP simples, IP privado ou hostname interno — bloqueado por SSRF

## Como executar

### Passo 1: Validar URL

Antes de chamar a tool:

- Confirma que começa com `http://` ou `https://` (não `file://`, `ftp://`)
- Não é IP privado (`192.168.*`, `10.*`, `127.*`, `localhost`, `*.local`, `*.internal`)
- É domínio público real

### Passo 2: Chamar a tool

```json
{
  "url": "https://exemplo.com/pagina-de-venda",
  "max_chars": 50000
}
```

`max_chars` é opcional (default 50.000). Use menor se você só precisa do começo.

### Passo 3: Avaliar resposta

**Sucesso:**

```json
{
  "ok": true,
  "titulo": "Curso de Tráfego Pago — Mestres do Marketing",
  "descricao": "Aprenda tráfego pago do zero...",
  "texto": "<conteúdo principal limpo>",
  "tamanho_chars": 12345,
  "metodo": "fetch-html-direto",
  "custo_usd": 0,
  "duracao_ms": 1200
}
```

Use `titulo` + `descricao` como cabeçalho. `texto` é o corpo já sem scripts, nav, footer.

**Erro comum** — `Texto muito curto (X chars) — pagina provavelmente e SPA`:

- Significa: a página é um app JavaScript que precisa renderizar pra ter texto. O fetch direto não executa JS.
- Ação: tentar a skill `scraping-pagina-spa` (futura — usa Apify, custa ~R$ 0,15) ou pedir ao humano pra colar o conteúdo manualmente

**Erro `HTTP 403/401/404`**: URL bloqueia bot ou não existe. Não retentar com fetch — pular pra Apify ou desistir.

### Passo 4: Processar texto

O `texto` retornado é texto puro, com pontuação preservada mas:

- Sem tags HTML
- Sem scripts/styles
- Sem navegação/footer/sidebar (heurística)
- Espaços/quebras normalizados

Se o agente vai **citar** trecho da página, sempre referenciar a URL original.

Se o agente vai **alimentar Cérebro** com isso, criar a fonte com:

- `tipo: pagina_venda` (se for landing page comercial)
- `tipo: artigo_externo` (se for blog/RFC/conteúdo)
- `url_origem: <url>` no metadado

## Limites

- **Apenas conteúdo público** — nada de áreas logadas
- **Apenas HTML estático** — SPAs não funcionam, retornam erro 422 explícito
- **Timeout 15s** — páginas muito lentas falham
- **Truncamento em max_chars** (default 50k chars, ~12k palavras) — páginas muito longas vêm com `…(conteudo truncado)`
- **Não bypassa cloudflare/captcha** — se cair em proteção, retorna 403

## Critério de qualidade

Uma execução boa desta skill produz:

1. Título da página correto (não "Página xxx.com" como fallback)
2. Texto com >=300 chars de conteúdo útil (não menu/header)
3. Sem ruído visível (não tem "Aceitar cookies", "Carregando...", "Menu")

Se o texto retornado tem muito ruído, considere registrar aprendizado pra ajustar a heurística (ex: domínio X precisa de seletor específico).

## Métricas que importam

- **Taxa de sucesso**: % com `ok: true` (alvo: 80%+ pra páginas tradicionais; SPAs vão sempre falhar)
- **Latência média**: <3s (alvo)
- **Custo médio**: 0 USD por chamada (skill é gratuita; só Apify tem custo)

## Aprendizados acumulados

_(vazio — skill recém-criada)_

---

**Versão:** v1.0  
**Status:** em construção  
**Padrão:** Anthropic Agent Skills Spec (Dez/2025)  
**Edge Function:** `scraping-pagina-publica` (deployada)
