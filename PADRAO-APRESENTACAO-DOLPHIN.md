# Padrão Dolphin de Apresentação

> Guia completo do padrão visual das apresentações da Dolphin (André Codina).
> Use este arquivo quando precisar gerar apresentações, propostas comerciais, briefings visuais ou qualquer documento HTML que eu apresente a clientes.

---

## INSTRUÇÃO PRO AGENTE

Quando eu pedir uma apresentação, proposta, briefing visual ou qualquer entregável que vá ser apresentado a um cliente, **siga exatamente este padrão**:

1. HTML único auto-contido (CSS inline dentro de `<style>`)
2. Dark mode profissional (cores exatas abaixo)
3. Responsivo (mobile + desktop)
4. Navegação sticky no topo
5. Estrutura Hero → Nav → Seções → Footer
6. Tom positivo (evolução/oportunidade, nunca crítica)
7. Sem valores monetários fechados (só se explicitamente pedido)

---

## PALETA DE CORES (USAR EXATAMENTE)

```css
/* Backgrounds */
background principal: #0a0a0a
cards: #151515
hero gradient: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)
highlight gradient: linear-gradient(135deg, #1a1a2e, #16213e)
insight gradient: linear-gradient(135deg, #1a1a2e, #0f3460)
diagram background: #0d1117

/* Textos */
texto principal: #e0e0e0
texto secundário: #a8b2d1
texto apagado: #8892b0
texto muito apagado: #666

/* Accent (destaque) */
accent principal: #e94560  (vermelho/rosa)
accent hover: #d63851

/* Semânticas */
sucesso/positivo: #4ade80
atenção/amarelo: #f0c040
negativo/vermelho: #ff6b6b

/* Bordas */
borda padrão: #222
borda hover: #e94560
borda sutil: #1a1a1a
```

---

## CSS BASE (COPIAR E COLAR)

Este é o CSS que deve ser usado como base em toda apresentação. Expandir conforme necessário.

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
  background: #0a0a0a;
  color: #e0e0e0;
  line-height: 1.7;
}

/* HERO */
.hero {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  padding: 60px 40px;
  text-align: center;
  border-bottom: 3px solid #e94560;
}
.hero h1 {
  font-size: clamp(1.8em, 4vw, 2.8em);
  color: #fff;
  margin-bottom: 12px;
}
.hero h1 span { color: #e94560; }
.hero .subtitle {
  font-size: 1.15em;
  color: #8892b0;
}
.hero .badge {
  display: inline-block;
  background: #e94560;
  color: #fff;
  padding: 6px 18px;
  border-radius: 20px;
  font-size: 0.85em;
  font-weight: 600;
  margin-top: 15px;
}

/* NAV STICKY */
.nav {
  background: #111;
  padding: 12px 30px;
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid #222;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  flex-wrap: wrap;
}
.nav a {
  color: #8892b0;
  text-decoration: none;
  font-size: 0.82em;
  white-space: nowrap;
  padding: 5px 12px;
  border-radius: 15px;
  border: 1px solid #333;
  transition: all 0.2s;
}
.nav a:hover {
  color: #fff;
  border-color: #e94560;
  background: rgba(233, 69, 96, 0.15);
}

/* CONTAINER */
.container {
  max-width: 960px;
  margin: 0 auto;
  padding: 40px 30px;
}

/* HEADINGS */
h2 {
  font-size: 1.8em;
  color: #fff;
  margin: 50px 0 20px;
  padding-bottom: 10px;
  border-bottom: 2px solid #e94560;
}
h2 .section-num {
  color: #e94560;
  font-size: 0.6em;
  display: block;
  text-transform: uppercase;
  letter-spacing: 3px;
  margin-bottom: 5px;
}
h3 { font-size: 1.25em; color: #ccd6f6; margin: 25px 0 12px; }
h4 { font-size: 1.05em; color: #e94560; margin: 20px 0 8px; }
p { margin: 10px 0; color: #a8b2d1; }
strong { color: #ccd6f6; }

/* CARD */
.card {
  background: #151515;
  border: 1px solid #222;
  border-radius: 12px;
  padding: 22px;
  margin: 12px 0;
  transition: border-color 0.2s;
}
.card:hover { border-color: #e94560; }
.card-title {
  font-size: 1.05em;
  color: #fff;
  font-weight: 700;
  margin-bottom: 8px;
}

/* HIGHLIGHT BOX */
.highlight {
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border-left: 4px solid #e94560;
  padding: 18px 22px;
  border-radius: 0 8px 8px 0;
  margin: 18px 0;
}
.highlight p { color: #ccd6f6; margin: 4px 0; }

/* INSIGHT BOX (destaque forte) */
.insight-box {
  background: linear-gradient(135deg, #1a1a2e, #0f3460);
  border: 1px solid #e94560;
  border-radius: 12px;
  padding: 20px;
  margin: 15px 0;
}
.insight-box h4 {
  color: #e94560;
  margin: 0 0 8px;
  font-size: 0.95em;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.insight-box p { color: #ccd6f6; margin: 4px 0; }

/* QUOTE */
.quote {
  background: #16213e;
  border-radius: 12px;
  padding: 20px 25px 20px 50px;
  margin: 18px 0;
  position: relative;
  font-style: italic;
  color: #ccd6f6;
}
.quote::before {
  content: '\201C';
  font-size: 3em;
  color: #e94560;
  position: absolute;
  top: 0;
  left: 15px;
  line-height: 1;
}

/* METRIC GRID */
.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin: 20px 0;
}
.metric {
  background: #151515;
  border: 1px solid #222;
  border-radius: 10px;
  padding: 20px;
  text-align: center;
}
.metric .value {
  font-size: 1.7em;
  font-weight: 700;
  color: #e94560;
}
.metric .label {
  font-size: 0.82em;
  color: #8892b0;
  margin-top: 4px;
}

/* TABLE */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 15px 0;
  font-size: 0.93em;
}
th {
  background: #1a1a2e;
  color: #e94560;
  text-align: left;
  padding: 10px 14px;
  font-weight: 600;
  border-bottom: 2px solid #e94560;
}
td {
  padding: 9px 14px;
  border-bottom: 1px solid #1a1a1a;
  color: #a8b2d1;
}
tr:hover td { background: #111; }

/* TIMELINE */
.timeline {
  position: relative;
  padding-left: 30px;
  margin: 20px 0;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #222;
}
.timeline-item {
  position: relative;
  margin: 18px 0;
  padding: 15px 20px;
  background: #151515;
  border-radius: 8px;
  border: 1px solid #222;
}
.timeline-item::before {
  content: '';
  position: absolute;
  left: -26px;
  top: 20px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #e94560;
  border: 2px solid #0a0a0a;
}
.timeline-item .time {
  color: #e94560;
  font-size: 0.8em;
  font-weight: 600;
}

/* DIAGRAM (ASCII art) */
.diagram {
  background: #0d1117;
  border: 1px solid #e94560;
  border-radius: 12px;
  padding: 25px;
  margin: 20px 0;
  text-align: center;
  font-family: 'Cascadia Code', monospace;
  font-size: 0.82em;
  line-height: 1.8;
  color: #8892b0;
  white-space: pre;
  overflow-x: auto;
}

/* CODE/PRE */
pre {
  background: #0d1117;
  border: 1px solid #222;
  border-radius: 8px;
  padding: 18px;
  overflow-x: auto;
  margin: 12px 0;
  font-size: 0.82em;
  line-height: 1.5;
  color: #8892b0;
}
code {
  background: #1a1a2e;
  color: #e94560;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 0.88em;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}

/* TAG */
.tag {
  display: inline-block;
  background: #1a1a2e;
  color: #e94560;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 0.78em;
  font-weight: 600;
  margin: 2px;
}

/* BUTTONS / CTA */
.cta-btn {
  display: inline-block;
  background: #e94560;
  color: #fff;
  padding: 16px 40px;
  border-radius: 10px;
  font-size: 1.1em;
  font-weight: 700;
  text-decoration: none;
  transition: all 0.2s;
}
.cta-btn:hover {
  background: #d63851;
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(233, 69, 96, 0.3);
}

/* CHECKLIST */
.checklist {
  list-style: none;
  padding: 0;
  margin: 12px 0;
}
.checklist li {
  padding: 7px 0 7px 28px;
  position: relative;
  border-bottom: 1px solid #1a1a1a;
}
.checklist li::before {
  content: '\2610';
  position: absolute;
  left: 0;
  color: #e94560;
  font-size: 1.1em;
}

/* DIVIDER */
.divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, #333, transparent);
  margin: 40px 0;
}

/* FOOTER */
.footer {
  text-align: center;
  padding: 40px;
  color: #444;
  font-size: 0.82em;
  border-top: 1px solid #222;
  margin-top: 60px;
}

/* RESPONSIVE */
@media (max-width: 768px) {
  .hero { padding: 35px 18px; }
  .hero h1 { font-size: 1.5em; }
  .container { padding: 20px 15px; }
  h2 { font-size: 1.35em; }
  .metric-grid { grid-template-columns: 1fr 1fr; }
}
```

---

## ESTRUTURA HTML BASE

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Título] | [Empresa]</title>
  <style>
    /* CSS acima */
  </style>
</head>
<body>

  <!-- HERO -->
  <div class="hero">
    <h1>Título com <span>palavra em destaque</span></h1>
    <p class="subtitle">Subtítulo explicativo</p>
    <span class="badge">Data / Tag</span>
  </div>

  <!-- NAV STICKY -->
  <nav class="nav">
    <a href="#secao1">1. Seção 1</a>
    <a href="#secao2">2. Seção 2</a>
    <a href="#secao3">3. Seção 3</a>
  </nav>

  <!-- CONTEÚDO -->
  <div class="container">

    <h2 id="secao1"><span class="section-num">Parte 1</span>Título da Seção</h2>
    
    <p>Conteúdo...</p>

    <div class="card">
      <div class="card-title">Título do Card</div>
      <p>Descrição...</p>
    </div>

    <div class="divider"></div>

    <h2 id="secao2"><span class="section-num">Parte 2</span>Outra Seção</h2>
    <!-- ... -->

  </div>

  <!-- FOOTER -->
  <div class="footer">
    <p>Nome da apresentação</p>
    <p style="margin-top:8px;">Dolphin — Inteligência Artificial para Negócios</p>
  </div>

</body>
</html>
```

---

## COMPONENTES (EXEMPLOS PRÁTICOS)

### 1. Card simples
```html
<div class="card">
  <div class="card-title">Título do recurso</div>
  <p>Descrição do que ele faz e como entrega valor.</p>
</div>
```

### 2. Card colorido (sucesso/alerta)
```html
<div class="card" style="border-color: #4ade80;">
  <div class="card-title" style="color: #4ade80;">Recomendado</div>
  <p>...</p>
</div>
```

### 3. Highlight box
```html
<div class="highlight">
  <p><strong>Ponto importante:</strong> informação que merece destaque.</p>
</div>
```

### 4. Insight box (destaque mais forte)
```html
<div class="insight-box">
  <h4>Insight-chave</h4>
  <p>Uma verdade importante que muda como o cliente enxerga a solução.</p>
</div>
```

### 5. Grid de métricas
```html
<div class="metric-grid">
  <div class="metric">
    <div class="value">10x</div>
    <div class="label">mais rápido</div>
  </div>
  <div class="metric">
    <div class="value">R$ 0</div>
    <div class="label">de setup</div>
  </div>
</div>
```

### 6. Citação
```html
<div class="quote">
  <p>Frase de impacto que resume a proposta de valor.</p>
</div>
```

### 7. Timeline
```html
<div class="timeline">
  <div class="timeline-item">
    <span class="time">Semana 1</span>
    <p>O que acontece nessa fase.</p>
  </div>
  <div class="timeline-item">
    <span class="time">Semana 2</span>
    <p>Próximo passo.</p>
  </div>
</div>
```

### 8. Tabela
```html
<table>
  <tr>
    <th>Item</th>
    <th>Descrição</th>
    <th>Status</th>
  </tr>
  <tr>
    <td><strong>Recurso 1</strong></td>
    <td>O que faz</td>
    <td><span class="tag">ativo</span></td>
  </tr>
</table>
```

### 9. Checklist
```html
<ul class="checklist">
  <li>Item a validar</li>
  <li>Outro item</li>
</ul>
```

### 10. Diagrama ASCII
```html
<div class="diagram">
┌─────────────────────────────────┐
│       ARQUITETURA GERAL         │
│                                 │
│   Entrada → Processamento → Saída│
└─────────────────────────────────┘
</div>
```

### 11. CTA (botão)
```html
<a href="#" class="cta-btn">QUERO SABER MAIS</a>
```

---

## ESTRUTURA NARRATIVA RECOMENDADA

Toda apresentação deve seguir uma **narrativa**, não uma lista de features:

1. **Hero** — proposta clara + CTA opcional
2. **Problema/Situação** — reconhecer o cenário (sem atacar)
3. **Visão** — como seria se resolvido
4. **Solução** — o que é e como funciona
5. **Como funciona na prática** — exemplos concretos
6. **Diferenciais** — o que faz único
7. **Plano/Roadmap** — como chegar lá
8. **Investimento** — se fizer sentido (ou deixar pra negociação)
9. **Próximos passos** — CTA final
10. **Footer** — identidade (Dolphin + nome do responsável)

---

## REGRAS DE TOM

### SEMPRE
- Português brasileiro informal mas profissional
- Direto, sem enrolação
- "Processo atual" em vez de "hoje" ao descrever estado atual
- Evolução e oportunidade
- Exemplos concretos (não só teoria)

### NUNCA
- Atacar ou criticar a equipe/processo atual do cliente
- Prometer o que não consegue cumprir
- Usar jargão técnico pesado (cliente geralmente é não-técnico)
- Comparação "antes vs depois" acusatória
- Emojis em excesso (um ou outro em títulos, no máximo)

---

## APRESENTAÇÕES DE REFERÊNCIA

Essas apresentações já usaram esse padrão e serviram de validação:

- Apresentação Pinguim (V3) — reunião de brainstorm com sócios
- Squad de Marketing / Mini Agência — proposta pra cliente
- Imersão 8 Semanas — página de vendas
- High Ticket 1 Ano — página de vendas
- Comparativo dos 3 produtos Dolphin — tabela comparativa
- Guia de Capacidades OpenClaw — referência interna
- BHAVE SaaS — proposta comercial pra agência

---

## COMO USAR ESTE ARQUIVO EM OUTROS PROJETOS

1. Copie este arquivo pra pasta do projeto novo
2. Quando abrir um chat de Claude nessa pasta, diga:
   > "Lê o arquivo PADRAO-APRESENTACAO-DOLPHIN.md e usa esse padrão em todas as apresentações que eu pedir neste projeto."
3. O agente vai seguir exatamente este padrão
4. Quando pedir uma apresentação, basta falar: *"Gera no padrão Dolphin"*

---

*Padrão consolidado em abril/2026 — Dolphin (André Codina)*
