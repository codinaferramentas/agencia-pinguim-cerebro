# Catálogo de Skills — Pinguim OS

> Fonte canônica de "o que existe / o que falta" no pilar Skills.
> Versão 1 — 2026-05-07. Curador inicial: catálogo derivado de pesquisa profunda
> (Anthropic oficial, repos públicos coreyhaines31/OpenClaudia/boraoztunc/CoppieGPT,
> referências BR Erico Rocha/RD Station/Andrew Silva, mestres vivos).

## Padrão técnico — Agent Skills (spec aberta)

**Spec seguida:** [agentskills.io](https://agentskills.io) — formato originado pela Anthropic em 18-Dez-2025, hoje adotado por 36+ ferramentas (OpenAI Codex, GitHub Copilot, VS Code, Cursor, Gemini CLI, JetBrains Junie, AWS Kiro, Mistral, Snowflake Cortex, Claude Code).

Campos obrigatórios da spec aberta: `name` + `description`. Campo `metadata` é o local oficial para extensões de fornecedor — onde vivem os campos Pinguim-específicos.

## Organização (2 eixos)

**Eixo 1 — Família de conhecimento** (26 famílias — organização visual no painel):

✍️ Copywriting · 🎯 Lançamento/Funil · 💰 Oferta/Precificação · 📹 VSL/Vídeo de Vendas · 🎤 Webinar/Evento · ✉️ Email Marketing · 📢 Anúncios Pagos · 📱 Conteúdo Orgânico · 🛒 Página de Vendas/CRO · 👤 Persona/Pesquisa · 🔍 Pesquisa de Mercado · 🔎 SEO · 🏘 Comunidade/Recorrência · 📞 Vendas/Atendimento · 🎨 Posicionamento/Marca · ✏️ Edição/Polish · 🧲 Lead Magnet · 🤖 Mensageria/Bots · 📊 Análise/Métricas · 🖼 Imagem/Design/Vídeo · 🎬 Storytelling · 🧠 Estratégia/Advisory · 🧠 Meta/Operacional · 🔬 Pesquisa Científica/Evidence-Based · 🌐 Tradução/Localização · ⚖️ Jurídico/Compliance · 🛡 Segurança/Cybersec

**Eixo 2 — Formato** (como a Skill opera):
- `framework` — estrutura nominativa (ex: PASTOR, AIDA, Schwartz 5 stages)
- `playbook` — receita de execução multi-passo (ex: abrir carrinho, montar VSL)
- `auditoria` — analisar artefato existente (ex: homepage audit, copy editing)
- `template` — preencher modelo (ex: bio Instagram, carrossel)
- `tool-helper` — orienta uso de tool técnica (ex: buscar-cerebro)

**Decisões dos conselheiros (Brad Frost / Anthropic Engineering / Rauno) aplicadas:**
- Removido campo `categoria` (universal/por_area/específica) — descoberto pelo grafo de uso, não declarado a priori
- Removido campo `universal` — era redundante com `categoria`
- Renomeado `tipo` → `formato` — separa forma da função
- Renomeado `clones_consultados` → `clones` — mais curto, sem perda de clareza
- Campos Pinguim-específicos vivem em `metadata.pinguim.*` (extensão prevista pela spec)
- `prioridade` (P0/P1/P2) fica fora do frontmatter — vive aqui no catálogo, é decisão editorial

---

## 🧠 META / OPERACIONAL — universal

Toda agente Pinguim usa, independente de área.

| Slug | Descrição | Tipo | Prioridade |
|---|---|---|---|
| `buscar-cerebro` | Como pesquisar conhecimento no Cérebro do produto | tool-helper | ✅ existe |
| `buscar-clone` | Como invocar Clone, quando usar 1 vs múltiplos, como combinar vozes | tool-helper | P0 |
| `buscar-persona` | Como interpretar dossiê 11 blocos da Persona | tool-helper | P0 |
| `buscar-funil` | Como identificar etapa do funil pra o briefing | tool-helper | P0 |
| `buscar-skill` | Meta-skill: como o agente escolhe qual Skill carregar | tool-helper | P0 |
| `aprender-com-feedback` | Receber 👍/👎/✏️ e atualizar APRENDIZADOS.md | playbook | P0 |
| `seguir-anatomia` | Auto-checagem: 7 MDs + 5 fontes vivas + EPP rodando | auditoria | P0 |
| `briefing-cliente` | Como receber pedido humano e formatar briefing pro mestre | playbook | P0 |
| `handoff-doc` | Passar contexto entre agentes/sessões sem perda | playbook | P1 |
| `verificar-adequacao` | Verifier de adequação ao tipo de pedido (sem regra hardcoded) | auditoria | P0 |
| `compressao-contexto` | Resumir longo histórico antes de delegar pra mestre | playbook | P1 |
| `post-mortem` | Aprendizados pós-entrega (custo, latência, feedback) | playbook | P2 |

---

## ✍️ COPYWRITING — frameworks dos mestres (por_area, tipo: framework)

**Princípio:** todos esses já existem como Clone no banco. A Skill aqui só nominaliza
o método e diz quando aplicar — o conteúdo profundo vive no Clone.

### Frameworks clássicos curtos
| Slug | Descrição | Clone associado | Prioridade |
|---|---|---|---|
| `framework-aida` | Attention, Interest, Desire, Action | (genérico) | P0 |
| `framework-pas` | Problem, Agitate, Solution | (genérico) | P0 |
| `framework-pastor` | Problem, Amplify, Story, Transformation, Offer, Response | Ray Edwards | P0 |
| `framework-bab` | Before, After, Bridge | (genérico) | P1 |
| `framework-fab` | Features, Advantages, Benefits | (genérico) | P1 |
| `framework-4ps` | Promise, Picture, Proof, Push | (genérico) | P2 |
| `framework-4us` | Urgent, Unique, Ultra-specific, Useful (headlines) | (genérico) | P1 |
| `framework-storybrand-7` | Character, Problem, Guide, Plan, CTA, Success, Failure | Donald Miller ✅ | P0 |
| `framework-golden-circle` | Why, How, What | Simon Sinek ✅ | P1 |

### Frameworks dos mestres vivos (alta prioridade — Clone existe)
| Slug | Descrição | Clone associado | Prioridade |
|---|---|---|---|
| `schwartz-5-stages` | 5 níveis sofisticação de mercado (Most Aware → Unaware) | Eugene Schwartz ✅ | P0 |
| `schwartz-mass-desire` | Mass Desire + Unique Mechanism + Proof + Proposition + Close | Eugene Schwartz ✅ | P0 |
| `halbert-a-pile` | Personalização → teaser → headline → opening → story → offer | Gary Halbert ✅ | P0 |
| `carlton-simple-writing` | Person, Problem, Promise, Proof, Price, P.S. | John Carlton ✅ | P0 |
| `kennedy-godfather-offer` | Oferta irrecusável + escassez + risk reversal | Dan Kennedy ✅ | P0 |
| `kennedy-message-market-media` | Triângulo Mensagem-Mercado-Mídia | Dan Kennedy ✅ | P1 |
| `kern-4day-cash` | Desire, Proof, Offer, Urgency, Scarcity | Frank Kern ✅ | P0 |
| `bencivenga-persuasion` | Desire + Belief + Exclusivity + Urgency | Gary Bencivenga ✅ | P0 |
| `caples-headline-formula` | News, Self-interest, Curiosity, Quick Solution | Claude Hopkins (próximo) | P1 |
| `ogilvy-headline-promise` | "How to Create Advertising that Sells" | David Ogilvy ✅ | P1 |
| `collier-letter-book` | Interest, Desire, Conviction, Action | Robert Collier ✅ | P1 |
| `bly-copywriter-formula` | Problem→Promise→Solution→Credentials→Benefits→Testimonials→Offer→Risk→CTA→PS | (sem clone) | P2 |
| `belcher-21-step` | 21-Step Sales Letter Perry Belcher | (sem clone) | P2 |
| `sugarman-30-triggers` | Gatilhos psicológicos clássicos | Joe Sugarman ✅ | P1 |
| `makepeace-4-legged-stool` | Promises, Proofs, Benefits, Offers | Clayton Makepeace ✅ | P1 |
| `brunson-hook-story-offer` | Dotcom Secrets — Hook, Story, Offer | Russell Brunson ✅ | P0 |
| `ben-settle-infotainment` | Email diário com personalidade + storytelling | Ben Settle ✅ | P1 |
| `chaperon-autoresponder-madness` | Open loop → serial story → close loop | Andre Chaperon ✅ | P1 |
| `dean-jackson-9-word-email` | Email curto reativador de leads frios | (sem clone) | P2 |
| `lampropoulos-first-100-words` | Empathy + Common Enemy + Solution + Promise + Credibility | Parris Lampropoulos ✅ | P2 |
| `ry-schwartz-conversion-copy` | Conversion copywriting + voz autêntica | Ry Schwartz ✅ | P1 |
| `stefan-georgi-rmbc` | Research + Mechanism + Belief + Close | Stefan Georgi ✅ | P0 |
| `todd-brown-e5` | E5 Method (Big Idea, Promise, Mechanism, Proof, Plan) | Todd Brown ✅ | P0 |
| `jon-benson-vsl` | Roteiro VSL clássico Jon Benson | Jon Benson ✅ | P0 |

---

## 🎯 LANÇAMENTO / FUNIL DE LANÇAMENTO — específica + por_area

**Vocabulário BR central** — esse pacote é **moat do Pinguim** porque os repos gringos
não têm o vocabulário de infoproduto brasileiro.

| Slug | Descrição | Tipo | Prioridade |
|---|---|---|---|
| `formula-de-lancamento` | 6 em 7 dias — Erico Rocha (adaptação BR de Jeff Walker) | playbook | P0 |
| `jeff-walker-product-launch` | Pre-launch / Launch / Post-launch (canônico mundial) | playbook | P0 |
| `cpl-1-oportunidade` | 1º vídeo pré-lançamento: oportunidade de mercado | template | P0 |
| `cpl-2-transformacao` | 2º vídeo: transformação possível + casos | template | P0 |
| `cpl-3-experiencia` | 3º vídeo: método/experiência antes da oferta | template | P0 |
| `lancamento-interno` | Variante BR sem CPLs públicos (lista quente) | playbook | P0 |
| `lancamento-relampago` | 24-72h pra recompra/upsell | playbook | P1 |
| `lancamento-perpetuo-evergreen` | Funil sempre aberto + gatilhos sintéticos | playbook | P0 |
| `abertura-de-carrinho` | Copy de abertura, primeiras 24h | playbook | P0 |
| `fechamento-de-carrinho` | Copy de últimas horas + last call | playbook | P0 |
| `evento-online-3-dias` | Evento gratuito 3 noites com pitch no D3 (formato BR padrão) | playbook | P0 |
| `masterclass-aula-aberta` | Aula aberta/gratuita com pitch suave | template | P1 |
| `launch-post-mortem` | Review do lançamento pra próximo | playbook | P2 |

---

## 💰 OFERTA / PRECIFICAÇÃO — específica

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `hormozi-grand-slam-offer` | Oferta tão boa que sentir burrice recusar — $100M Offers | Alex Hormozi ✅ | P0 |
| `hormozi-value-equation` | Dream Outcome × Likelihood / (Time + Effort) | Alex Hormozi ✅ | P0 |
| `hormozi-100m-leads` | 4 core lead gen activities | Alex Hormozi ✅ | P0 |
| `mecanismo-unico` | UM nomeável da metodologia | Eugene Schwartz ✅ | P0 |
| `stack-de-bonus` | Empilhar bônus pra justificar preço | Russell Brunson ✅ | P0 |
| `risk-reversal-garantia` | Garantia incondicional / dupla / inversão de risco | Dan Kennedy ✅ | P0 |
| `escada-de-valor` | Value ladder: tripwire → core → continuity → high-ticket | Russell Brunson ✅ | P0 |
| `upsell-orderbump` | Order bump na página de checkout | (genérico) | P1 |
| `downsell` | Versão reduzida pra quem recusou oferta principal | (genérico) | P1 |
| `price-anchoring` | Ancoragem de/por, valor cheio vs promo | (genérico) | P1 |
| `pacote-low-ticket` | Estrutura de oferta low-ticket BR (R$ 47-297) | playbook BR | P0 |
| `pacote-high-ticket` | Estrutura high-ticket (R$ 1k-10k+) | playbook BR | P0 |

---

## 📹 VSL / VÍDEO DE VENDAS — específica

| Slug | Descrição | Tipo | Prioridade |
|---|---|---|---|
| `vsl-classico-aida` | VSL com AIDA, 5–20min | template | P0 |
| `vsl-high-ticket-longo` | VSL longo (20+ min) pra ticket alto | template | P0 |
| `mini-vsl` | VSL curto (60–180s) pra leadgen | template | P0 |
| `vsl-problema-solucao-mecanismo` | Problem → Alt Solutions → Why Ours → CTA | template | P0 |
| `vsl-storyselling` | VSL inteira como narrativa de transformação | template | P1 |
| `roteiro-podio` | Estilo "subir no palco" — Brunson Perfect Webinar adaptado | template | P1 |
| `roteiro-vsl-low-ticket` | VSL curtinha pra low-ticket BR | template BR | P0 |

---

## 🎤 WEBINAR / EVENTO — específica

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `brunson-perfect-webinar` | Intro → Conteúdo → Stack & Close | Russell Brunson ✅ | P0 |
| `brunson-3-secrets` | 3 falsas crenças quebradas | Russell Brunson ✅ | P1 |
| `stack-and-close` | Empilhamento + transição pro pitch | Russell Brunson ✅ | P0 |
| `evento-imersao-presencial` | Evento ao vivo + oferta high ticket | playbook | P2 |
| `q-and-a-encerramento` | Q&A pós-pitch derrubando objeções | playbook | P1 |

---

## ✉️ EMAIL MARKETING — específica

| Slug | Descrição | Tipo | Prioridade |
|---|---|---|---|
| `welcome-sequence` | Sequência de boas-vindas pós opt-in | playbook | P0 |
| `pre-lancamento-email` | Sequência alinhada com CPLs | playbook | P0 |
| `abertura-de-carrinho-email` | Emails dia 1–7 carrinho aberto | playbook | P0 |
| `fechamento-de-carrinho-email` | Last call, last 6h, last hour | playbook | P0 |
| `abandono-checkout` | Recuperação de carrinho abandonado | playbook | P0 |
| `reativacao-fria` | 9-word email Dean Jackson + variantes | template | P1 |
| `email-subject-lines` | Gerar e A/B testar subjects | template | P0 |
| `nutrition-edutainment` | Email diário Ben Settle infotainment | playbook | P1 |
| `cold-email-b2b` | Outreach B2B + follow-ups | playbook | P2 |
| `broadcast-promo` | Broadcast pontual de oferta | template | P1 |
| `pitch-pos-lead-magnet` | Sequência que vende após download | playbook | P0 |
| `recorrencia-mensalista` | Email pra membership/clube de assinatura | playbook | P1 |

---

## 📢 ANÚNCIOS PAGOS — por_area

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `meta-ads-copy` | Copy de Facebook/Instagram Ads | Molly Pittman ✅ | P0 |
| `google-ads-copy` | Copy de Search Ads | Kasim Aslam ✅ | P1 |
| `linkedin-ads-b2b` | B2B advertising | (sem clone) | P2 |
| `ad-creative-vencedor` | Iterar criativo em escala — UCOD | Pedro Sobral ✅ | P0 |
| `escalonamento-cbo` | Campaign Budget Optimization Meta | Pedro Sobral ✅ | P0 |
| `abo-vs-cbo` | Estrutura de campanha | Pedro Sobral ✅ | P1 |
| `retargeting-warmup` | Sequência de remarketing por estágio | Tom Breeze ✅ | P0 |
| `lookalike-strategy` | Públicos lookalike por origem | Depesh Mandalia ✅ | P1 |
| `youtube-ads` | YouTube Ads — Tom Breeze | Tom Breeze ✅ | P1 |
| `tiktok-ads` | TikTok Ads creative + targeting | (sem clone) | P1 |
| `paddy-galloway-yt-ads` | YouTube creator-driven ads | Paddy Galloway ✅ | P2 |
| `video-ad-analysis` | Desconstruir criativo concorrente | (genérico) | P1 |
| `nicholas-kusmich-3p-rule` | Patient + Predictable + Profitable | Nicholas Kusmich ✅ | P1 |
| `andrew-booth-creative-strategy` | Creative strategy operacional | Andrew Booth ✅ | P2 |

---

## 📱 CONTEÚDO ORGÂNICO — específica

### Hooks (alta prioridade — todo creator usa)
| Slug | Descrição | Prioridade |
|---|---|---|
| `hook-curiosidade` | Gap de informação, scroll-stopper | P0 |
| `hook-resultado-rapido` | "30 segundos pra X" | P0 |
| `hook-contrarian` | Opinião polêmica que para o feed | P0 |
| `hook-pain-point` | Abrir com dor universal do nicho | P0 |
| `hook-numero-especifico` | "Fiz X em Y dias" | P0 |

### Reels / Shorts / TikTok
| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `reels-3-segundos` | Abertura padrão IG (1.7s decisão) | Alan Nicolas ✅ | P0 |
| `tiktok-04s-rule` | Abertura ainda mais agressiva | (sem clone) | P0 |
| `roteiro-reels-30s` | Hook → insight → prova → CTA | (genérico) | P0 |
| `roteiro-shorts-yt` | Diferenças vs Reels e TikTok | (genérico) | P1 |

### Instagram
| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `carrossel-instagram` | Slides 1–10 com peak final | Wes Kao ✅ | P0 |
| `stories-vendedor` | Sequência stories que abre carrinho | (sem clone) | P0 |
| `bio-instagram` | Bio que converte clique pra link | (genérico) | P1 |
| `legenda-instagram` | Caption longa storyteller | (genérico) | P1 |
| `igtv-aula-aberta` | Vídeo longo IG estilo masterclass | (genérico) | P2 |

### YouTube
| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `youtube-roteiro` | Roteiro vídeo longo | Peter McKinnon ✅ | P0 |
| `youtube-thumbnail` | Estrutura de thumbnail que clica | Peter McKinnon ✅ | P0 |
| `youtube-summarizer` | Extrair takeaways de transcrição | (genérico) | P1 |
| `youtube-analytics` | Performance canal/vídeo | (genérico) | P2 |

### LinkedIn / X / Bluesky
| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `linkedin-authority` | Content pillars + posting rhythm | Wes Kao ✅ | P1 |
| `linkedin-profile-optimizer` | Auditoria + rewrite | (genérico) | P2 |
| `viral-thread-x` | Fios virais X | Dan Koe ✅ | P1 |
| `dan-koe-essay` | Ensaio one-person business | Dan Koe ✅ | P1 |

### Repurposing
| Slug | Descrição | Prioridade |
|---|---|---|
| `content-repurposing` | Atomizar 1 fonte em N formatos | P0 |
| `social-card-generator` | Repurposing por plataforma | P1 |
| `content-calendar` | Plano mensal multi-canal | P0 |
| `lo-fi-content` | Estética lo-fi BR (Micha) | P1 |

---

## 🛒 PÁGINA DE VENDAS / CRO — específica

| Slug | Descrição | Tipo | Prioridade |
|---|---|---|---|
| `anatomia-pagina-vendas-longa` | headline → sub → VSL → bullets → prova → oferta → garantia → FAQ → P.S. | template | P0 |
| `anatomia-pagina-low-ticket` | Curta, oferta dominante, checkout próximo | template BR | P0 |
| `anatomia-pagina-high-ticket` | Longa, prova social robusta, agendamento | template BR | P0 |
| `above-the-fold` | Primeira dobra: promessa + sub + CTA + prova | template | P0 |
| `bullets-fascinacao` | Bullets de fascinação Halbert/Bencivenga | template | P0 |
| `faq-vendedora` | FAQ que mata objeção (não institucional) | template | P0 |
| `garantia-tripla` | Satisfação + condicional + super-garantia | template | P0 |
| `prova-social-mosaico` | Texto + print + vídeo + screenshots | template | P0 |
| `homepage-audit` | Auditoria de homepage | auditoria | P1 |
| `landing-page-saas` | Copy de homepage SaaS | template | P2 |
| `form-cro` | Otimizar formulários de captura | auditoria | P1 |
| `popup-cro` | Popups e modais | auditoria | P2 |
| `signup-flow-cro` | Fluxo de cadastro | auditoria | P2 |
| `paywall-cro` | Paywalls in-app | auditoria | P2 |
| `ab-test-setup` | Design + implementação A/B | playbook | P1 |
| `checkout-cro` | Hotmart/Eduzz/Kiwify checkout BR | auditoria BR | P0 |

---

## 👤 PERSONA / PESQUISA — universal + por_area

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `gerar-persona-11-blocos` | Dossiê 11 blocos (estrutura Pinguim canônica) | (Pinguim) | P0 |
| `voice-of-customer` | Extrair voz de reviews/transcripts | (genérico) | P0 |
| `jobs-to-be-done` | JTBD interview + síntese | (genérico) | P1 |
| `mapa-de-empatia` | Empathy map XPlane | (genérico) | P1 |
| `persona-versionada` | Controle de versão de persona | (Pinguim) | P0 |
| `voice-extractor` | Documentar voz autêntica | (genérico) | P1 |
| `brand-voice-analyzer` | Checagem de consistência | (genérico) | P1 |
| `customer-research-qual` | Pesquisa qualitativa + síntese | (genérico) | P1 |
| `icp-builder` | Definir Ideal Customer Profile B2B | (genérico) | P2 |

---

## 🔍 PESQUISA DE MERCADO / CONCORRENTE — por_area

| Slug | Descrição | Prioridade |
|---|---|---|
| `competitor-profiling` | Perfil de concorrente | P1 |
| `competitor-analysis` | Breakdown estratégico | P1 |
| `swipe-file-organizer` | Organizar swipes de copy | P0 |
| `last-30-days-research` | Tendências Reddit/X/web | P2 |
| `serp-analyzer` | Análise de SERP | P2 |
| `google-reviews-research` | Ratings concorrentes | P2 |

---

## 🔎 SEO — por_area

| Slug | Descrição | Prioridade |
|---|---|---|
| `seo-audit` | Auditoria técnica + on-page | P2 |
| `keyword-research` | Pesquisa de palavras-chave | P2 |
| `seo-content-brief` | Briefing pra copywriter | P2 |
| `programmatic-seo` | Geração em escala via templates | P2 |
| `ai-seo-llm-citations` | Otimizar pra ChatGPT/Perplexity citarem | P1 |
| `schema-markup` | Schema.org structured data | P3 |

---

## 🏘 COMUNIDADE / RECORRÊNCIA — por_area

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `community-marketing` | Construir comunidade pra growth | David Spinks ✅ | P1 |
| `paid-community-onboarding` | Onboarding de comunidade paga | David Spinks ✅ | P1 |
| `paid-community-programming` | Q&As, workshops, prompts diários | (genérico) | P1 |
| `challenge-first-method` | Challenges como porta de entrada | (Pinguim — produtos) | P0 |
| `member-retention` | Retenção de assinatura | Nick Mehta ✅ | P1 |
| `churn-prevention` | Flows de cancelamento + save offers | Nick Mehta ✅ | P1 |
| `customer-renovation` | Copy de renovação anual | (genérico) | P2 |
| `referral-program` | Programa de indicação | Sean Ellis ✅ | P1 |
| `affiliate-marketing` | Programa de afiliados BR (Hotmart/Eduzz) | (genérico BR) | P0 |

---

## 📞 VENDAS / ATENDIMENTO — por_area

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `sales-enablement` | Decks, one-pager, demo script | (genérico) | P1 |
| `objection-handling` | Handler de objeções por tipo (preço, tempo, dúvida, ceticismo) | (genérico) | P0 |
| `call-script-discovery` | Script de discovery call | (genérico) | P1 |
| `call-script-closing` | Script de closing high-ticket | (genérico) | P0 |
| `whatsapp-vendas-br` | Atendimento WhatsApp + objeções texto | (Pinguim BR) | P0 |
| `dm-instagram-vendas` | DM IG que qualifica e fecha | (Pinguim BR) | P0 |
| `case-study-builder` | Estruturar case de sucesso | (genérico) | P1 |
| `testimonial-collector` | Coletar e formatar prova social | (genérico) | P0 |
| `voss-tactical-empathy` | Mirroring, labeling, calibrated questions | (sem clone) | P1 |
| `challenger-sale` | Teach, Tailor, Take Control | (já no banco — metodologia) | P1 |
| `spin-selling` | Situation, Problem, Implication, Need-payoff | (já no banco) | P1 |
| `sandler-selling` | Sandler 7-step | (já no banco) | P1 |
| `meddic` | Metrics, Economic Buyer, Decision Criteria... | (já no banco) | P1 |

---

## 🎨 POSICIONAMENTO / MARCA — por_area

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `positioning-april-dunford` | Obviously Awesome | (sem clone) | P1 |
| `storybrand-clarify-message` | Don Miller 7-step | Donald Miller ✅ | P0 |
| `golden-circle-sinek` | Why → How → What | Simon Sinek ✅ | P1 |
| `brand-voice-doc` | Documento de voz de marca | Marty Neumeier ✅ | P1 |
| `naming-method` | Nomear produto/curso/método | Marty Neumeier ✅ | P1 |
| `brand-positioning-canvas` | Canvas estratégico de posicionamento | Marty Neumeier ✅ | P1 |
| `growth-strategy-aarrr` | AARRR + growth loops | Sean Ellis ✅ | P1 |
| `marketing-psychology-70` | 70+ princípios psicológicos curados | (genérico) | P2 |

---

## ✏️ EDIÇÃO / POLISH — universal

| Slug | Descrição | Tipo | Prioridade |
|---|---|---|---|
| `copy-editing` | Revisão linha-a-linha | auditoria | P0 |
| `stop-slop-de-aiify` | Remover padrões IA, restaurar tom humano | auditoria | P0 |
| `plain-language` | Simplificar pra ensino fundamental | auditoria | P1 |
| `portuguesar-br` | Adaptar copy gringo pro PT-BR | playbook | P0 |
| `regionalizar-br` | Adaptar pra sotaque/região | playbook | P2 |
| `tom-de-marca` | Calibrar pra voz Pinguim/cliente específico | auditoria | P0 |

---

## 🧲 LEAD MAGNET — específica

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `lead-magnet-hormozi-3-tipos` | Reveal / Sample / One-step | Alex Hormozi ✅ | P0 |
| `isca-pdf-checklist` | Checklist downloadable | (genérico) | P0 |
| `isca-quiz` | Quiz que segmenta + entrega resultado | (genérico) | P0 |
| `isca-aula-gratis` | Aula gravada como isca | (genérico) | P0 |
| `isca-mini-curso-email` | Mini-curso 5 dias por email | (genérico) | P0 |
| `free-tool-strategy` | Ferramenta gratuita como aquisição | (genérico) | P1 |
| `newsletter-growth` | Crescimento + monetização | (genérico) | P1 |

---

## 🤖 MENSAGERIA / BOTS — por_area

| Slug | Descrição | Prioridade |
|---|---|---|
| `whatsapp-broadcast-br` | Broadcast list + segmentação Z-API/Evolution | P1 |
| `discord-bot` | Mensagens, embeds, marketing | P2 |
| `telegram-bot` | Posts, polls, media | P2 |
| `slack-bot` | Block Kit messages | P3 |

---

## 📊 ANÁLISE / MÉTRICAS — por_area

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `analytics-tracking` | Setup + audit de tracking | Avinash Kaushik ✅ | P1 |
| `google-analytics-ga4` | GA4 reports + insights | Avinash Kaushik ✅ | P1 |
| `saas-metrics` | ARR, MRR, churn, LTV, CAC | (sem clone) | P2 |
| `funnel-diagnostics` | Onde o funil furou | Sean Ellis ✅ | P1 |
| `revenue-attribution` | Atribuição multi-touch | (sem clone) | P2 |
| `cohort-retention` | Análise de cohort | Peter Fader ✅ | P1 |
| `ltv-by-source` | LTV por canal de origem | Peter Fader ✅ | P1 |
| `kahneman-decision-bias` | Vieses cognitivos em análise | Kahneman ✅ | P2 |

---

## 🖼 IMAGEM / DESIGN / VÍDEO — por_area

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `thumbnail-yt` | Thumbnail vídeo YouTube | Peter McKinnon ✅ | P0 |
| `capa-curso-br` | Capa Hotmart/Eduzz/Kiwify | (Pinguim BR) | P0 |
| `app-store-screenshots` | Screenshots como anúncio | (sem clone) | P3 |
| `ai-image-gen-prompts` | Prompts pra DALL-E/MJ/SD | (genérico) | P1 |
| `design-system-storybook` | Design system + components | Brad Frost ✅ | P2 |
| `logo-design-method` | Método de naming + logo | Marty Neumeier ✅ | P2 |
| `aaron-draplin-merch` | Logo/merch utilitário | Aaron Draplin ✅ | P3 |
| `chris-do-pricing-design` | Pricing + value para designer | Chris Do ✅ | P2 |
| `make-interfaces-feel-better` | Princípios de polish UI | (sem clone) | P2 |

---

## 🎬 STORYTELLING — específica (cruza com copy)

Nossa squad storytelling já está montada (Campbell, Miller, Klaff, Snyder).

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `heros-journey` | Jornada do herói 12 etapas | Joseph Campbell ✅ | P0 |
| `save-the-cat-15-beats` | 15 batidas pra estrutura narrativa | Blake Snyder ✅ | P0 |
| `harmon-story-circle` | 8 passos Dan Harmon | Dan Harmon ✅ | P1 |
| `klaff-pitch-frame` | Status frames + STRONG | Oren Klaff ✅ | P0 |
| `kindra-hall-stories-that-stick` | 4 tipos: value, founder, purpose, customer | Kindra Hall ✅ | P1 |
| `story-of-self-us-now` | Marshall Ganz | Marshall Ganz ✅ | P1 |
| `nancy-duarte-resonate` | Estrutura "what is" vs "what could be" | Nancy Duarte ✅ | P0 |
| `dicks-storyworthy` | Matt Dicks 5-second moment | Matthew Dicks ✅ | P1 |
| `keith-johnstone-status` | Status alto/baixo na narrativa | Keith Johnstone ✅ | P2 |
| `park-howell-abt` | And-But-Therefore framework | Park Howell ✅ | P1 |

---

## 🧠 ESTRATÉGIA / ADVISORY — específica

Squad advisory existe (Dalio, Munger, Naval, Thiel).

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `dalio-principles-decision` | Tomada de decisão com princípios | Ray Dalio ✅ | P1 |
| `munger-mental-models` | Latticework of mental models | Charlie Munger ✅ | P1 |
| `naval-leverage` | Permissionless leverage (code, media, capital) | Naval Ravikant ✅ | P2 |
| `thiel-zero-to-one` | Monopólio + tese contrária | Peter Thiel ✅ | P1 |
| `sivers-direction` | "Hell yeah or no" decisão | Derek Sivers ✅ | P2 |
| `rhoffman-blitzscaling` | Escala antes da eficiência | Reid Hoffman ✅ | P3 |
| `david-deutsch-explanations` | Boa explicação difícil de variar | David Deutsch ✅ | P3 |

---

## 🔬 PESQUISA CIENTÍFICA / EVIDENCE-BASED — squad deep-research

Squad deep-research existe (Kahneman, Klein, Ioannidis, Sackett, Cochrane, Higgins, Booth, Creswell, Forsgren, Gilad).

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `kahneman-system-1-2` | Pensamento rápido vs lento + vieses | Kahneman ✅ | P2 |
| `klein-naturalistic-decision` | Decisão sob pressão e ambiguidade | Gary Klein ✅ | P2 |
| `ioannidis-research-validity` | "Why most published research is false" | John Ioannidis ✅ | P2 |
| `sackett-evidence-based` | Evidence-based decision making | David Sackett ✅ | P2 |
| `cochrane-systematic-review` | Revisão sistemática de evidência | Cochrane ✅ | P3 |
| `higgins-meta-analysis` | Meta-análise quantitativa | Julian Higgins ✅ | P3 |
| `creswell-mixed-methods` | Pesquisa qualitativa + quantitativa | John Creswell ✅ | P2 |
| `booth-systematic-search` | Busca sistemática de fontes | Andrew Booth ✅ | P3 |
| `forsgren-devops-research` | Métricas DORA + research em alta performance | Nicole Forsgren ✅ | P3 |
| `gilad-evidence-guided-product` | Evidence-guided product (ICE/PIE/RICE) | Itamar Gilad ✅ | P2 |

---

## 🌐 TRADUÇÃO / LOCALIZAÇÃO — squad translate

Squad translate existe (Vermeer, Nord, Nida, House, Baker, Pym, Venuti).

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `vermeer-skopos-theory` | Tradução guiada por propósito | Hans Vermeer ✅ | P2 |
| `nord-functionalist-translation` | Tradução funcionalista | Christiane Nord ✅ | P2 |
| `nida-dynamic-equivalence` | Equivalência dinâmica vs formal | Eugene Nida ✅ | P2 |
| `house-translation-quality` | Avaliação de qualidade de tradução | Juliane House ✅ | P3 |
| `baker-narrative-translation` | Tradução como narrativa | Mona Baker ✅ | P3 |
| `pym-translation-cultures` | Tradução e culturas | Anthony Pym ✅ | P3 |
| `venuti-domestication` | Domesticação vs estrangeirização | Lawrence Venuti ✅ | P3 |
| `localizar-curso-online` | Adaptar curso BR pra mercado gringo (ou vice-versa) | (Pinguim) | P1 |
| `transcrever-vsl` | Transcrever + traduzir VSL | (Pinguim) | P2 |

---

## ⚖️ JURÍDICO / COMPLIANCE — squad legal

Squad legal existe (Brad Feld, Ken Adams, Pierpaolo Bottini + 12 operacionais).

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `feld-term-sheet` | Term sheet de venture (cap table, vesting) | Brad Feld ✅ | P3 |
| `ken-adams-contract-drafting` | Contract drafting clear-language | Ken Adams ✅ | P2 |
| `bottini-startup-legal` | Estrutura legal de startup BR | Pierpaolo Bottini ✅ | P2 |
| `termos-de-uso-curso` | Termos de uso pra curso/membership BR | (Pinguim BR) | P1 |
| `politica-de-privacidade-lgpd` | Política privacidade LGPD-compliant | (Pinguim BR) | P1 |
| `contrato-prestacao-servico` | Contrato pra agência/freelancer BR | (Pinguim BR) | P1 |
| `direito-de-imagem` | Cessão de imagem pra depoimento/case | (Pinguim BR) | P2 |
| `propriedade-intelectual-curso` | PI de método/curso/marca | (Pinguim BR) | P2 |
| `compliance-mei-simples-lucro` | Enquadramento tributário BR | (Pinguim BR) | P2 |

---

## 🛡 SEGURANÇA / CYBERSEC — squad cybersecurity

Squad cybersecurity existe (Kim, Weidman, Manico, Sanders, Carey, Santos + ferramentas). Pilar Segurança já implementado no painel.

| Slug | Descrição | Clone | Prioridade |
|---|---|---|---|
| `kim-pentest-methodology` | Metodologia de pentest | Peter Kim ✅ | P2 |
| `weidman-mobile-security` | Segurança mobile | Georgia Weidman ✅ | P3 |
| `manico-owasp-top-10` | OWASP Top 10 + mitigações | Jim Manico ✅ | P1 |
| `sanders-network-monitoring` | Network monitoring + intrusion detection | Chris Sanders ✅ | P3 |
| `carey-tribe-of-hackers` | Threat modeling colaborativo | Marcus Carey ✅ | P3 |
| `santos-cisco-cyber-ops` | Cyber operations defensiva | Omar Santos ✅ | P3 |
| `auditoria-rls-supabase` | Auditoria RLS + policies (Pinguim) | (Pinguim) | P1 |
| `auditoria-edge-function-jwt` | JWT auth em Edge Functions | (Pinguim) | P1 |
| `rotacionamento-chaves-cofre` | Rotação de chaves no cofre Pinguim | (Pinguim) | P2 |

---

## 📐 PRIORIZAÇÃO — o que entra primeiro

### P0 (32 skills — primeira biblioteca essencial)
Todas as skills universais (`buscar-*`, `aprender-com-feedback`, `seguir-anatomia`, `briefing-cliente`, `verificar-adequacao`) +
top frameworks de mestres com Clone existente (`schwartz-5-stages`, `halbert-a-pile`, `hormozi-grand-slam-offer`, `kennedy-godfather-offer`, `kern-4day-cash`, `bencivenga-persuasion`, `brunson-hook-story-offer`, `stefan-georgi-rmbc`, `todd-brown-e5`, `jon-benson-vsl`) +
playbooks BR centrais (`formula-de-lancamento`, `lancamento-interno`, `lancamento-perpetuo-evergreen`, `cpl-1`, `cpl-2`, `cpl-3`, `abertura-de-carrinho`, `fechamento-de-carrinho`, `evento-online-3-dias`, `pacote-low-ticket`, `pacote-high-ticket`, `whatsapp-vendas-br`, `checkout-cro`, `affiliate-marketing`) +
estruturas de página (`anatomia-pagina-vendas-longa`, `anatomia-pagina-low-ticket`, `anatomia-pagina-high-ticket`, `above-the-fold`, `bullets-fascinacao`, `faq-vendedora`, `garantia-tripla`, `prova-social-mosaico`) +
hooks (`hook-curiosidade`, `hook-resultado-rapido`, `hook-contrarian`, `hook-pain-point`, `hook-numero-especifico`) +
storytelling base (`heros-journey`, `save-the-cat-15-beats`, `klaff-pitch-frame`, `nancy-duarte-resonate`) +
copy ops universais (`copy-editing`, `stop-slop-de-aiify`, `portuguesar-br`, `tom-de-marca`) +
persona base (`gerar-persona-11-blocos`, `voice-of-customer`, `persona-versionada`) +
oferta core (`hormozi-value-equation`, `mecanismo-unico`, `stack-de-bonus`, `risk-reversal-garantia`, `escada-de-valor`)

### P1 (≈60 skills — segunda onda)
Frameworks adicionais de copy, anúncios pagos completos, comunidade/recorrência, advisory, métricas básicas.

### P2/P3 (≈50 skills — backlog longo)
SEO técnico, B2B/SaaS, polish de design avançado, storytelling de nicho, mensageria.

---

## 📦 Como cada Skill é estruturada

```
cerebro/skills/<slug>/
└── SKILL.md
```

Estrutura padrão da SKILL.md (YAML frontmatter + corpo) — spec aberta agentskills.io + extensão Pinguim em `metadata.pinguim`:

```markdown
---
name: <slug>
description: <terceira pessoa, 1 frase, max 1024 chars — quando o agente deve carregar esta skill>
metadata:
  pinguim:
    familia: copywriting | lancamento | oferta | vsl | webinar | email | ads | conteudo | pagina-vendas | persona | pesquisa | seo | comunidade | vendas | posicionamento | edicao | lead-magnet | bots | analise | imagem | storytelling | advisory | meta | pesquisa-cientifica | traducao | juridico | seguranca
    formato: framework | playbook | auditoria | template | tool-helper
    clones: [slug-clone-1, slug-clone-2]
---

# <Nome amigável>

## Quando aplicar
<situação concreta>

## Receita
<passos numerados, sem código — só direção pro mestre>

## Clones a invocar
- **<Clone>**: <papel específico nessa skill>
- **<Clone>**: <papel específico nessa skill>

## O que NÃO fazer
<anti-padrões dessa skill específica>

## Exemplo aplicado
<um exemplo curto, real, no universo Pinguim>
```

---

## 📚 Fontes de pesquisa (origem do catálogo)

### Spec técnica
- [agentskills.io](https://agentskills.io) — open standard, originada Anthropic Dez/2025
- [agentskills.io/specification](https://agentskills.io/specification) — frontmatter + estrutura de pastas
- [Anthropic Engineering blog — Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) (Out/2025, atualizado Dez/2025)
- [platform.claude.com/docs/en/agents-and-tools/agent-skills/overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — overview oficial
- [platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — best practices
- [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) — Claude Code skills (extensão da spec)
- [docs.crewai.com/en/guides/agents/crafting-effective-agents](https://docs.crewai.com/en/guides/agents/crafting-effective-agents) — precedente conceitual de separação `tools` (skills) vs `backstory` (clone/voz)

### Repositórios públicos consultados
- `github.com/anthropics/skills` — formato canônico SKILL.md (17 skills oficiais)
- `github.com/coreyhaines31/marketingskills` — 41 marketing skills
- `github.com/OpenClaudia/openclaudia-skills` — 63+ marketing skills
- `github.com/boraoztunc/skills` — copy/SEO/design
- `github.com/alirezarezvani/claude-skills` — 232+ skills multi-domínio
- `github.com/BrianRWagner/ai-marketing-claude-code-skills` — 19 marketing skills
- `github.com/WynterJones/CoppieGPT` — 232 frameworks de copywriting
- Erico Rocha / Fórmula de Lançamento (BR) — vocabulário de lançamento
- HeroSpark / Andrew Silva / Walmar Andrade — CPL e estrutura BR
- RD Station / Marketeer — gatilhos mentais BR
- Hormozi $100M Offers + $100M Leads — oferta e lead gen
- Brunson Dotcom Secrets / Expert Secrets — funil e webinar
- Schwartz Breakthrough Advertising — sofisticação e mecanismo único
- Spec aberta agentskills.io — formato universal a partir de Dez/2025
