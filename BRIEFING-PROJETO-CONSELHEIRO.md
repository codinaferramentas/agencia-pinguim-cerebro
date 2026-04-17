# Briefing — Projeto Conselheiro

> Arquivo de contexto pra iniciar o projeto "Conselheiro" numa pasta separada.
> Copia esse arquivo pra pasta nova e no novo chat fala: "Lê esse arquivo e vamos começar".

---

## QUEM SOU E COMO TRABALHO

**André Codina** — sócio da Dolphin (agência de IA). Trabalho com implementação de agentes de IA para negócios digitais usando OpenClaw.

**Como trabalho:**
- Prefiro comunicação direta, sem enrolação
- Português brasileiro
- Não gosto de promessas que não vou cumprir
- Não gosto de gordura em prazos
- Valorizo estrutura replicável (tudo que faço pra mim precisa virar produto)
- Prefiro "1 agente por dia" como unidade de prazo, não detalhar em horas
- Tom das apresentações: sempre evolução/oportunidade, nunca atacar equipe
- Trabalho em Windows (VS Code), não tenho Mac
- Uso: OpenAI (GPT-5) como LLM — Anthropic foi descartado por custo

**Modo de orientação:**
Sou novo no OpenClaw — o Conselheiro deve me **guiar ativamente** nas decisões técnicas e operacionais, explicando as opções de forma clara quando eu perguntar. Ele me orienta como um mentor técnico, não espera que eu já saiba tudo. Com o tempo, conforme eu aprendo, o nível de detalhe vai se ajustando naturalmente.

---

## O QUE É O PROJETO CONSELHEIRO

### Objetivo
Criar um **agente pessoal completo** chamado **Conselheiro** — meu braço direito. Ele me acompanha em TUDO: propostas pra clientes, briefings de projetos aprovados, copies, roteiros, pesquisas, decisões técnicas, dúvidas do dia a dia.

### O que ele faz (3 modos de atuação)

#### MODO 1 — Descoberta (cliente novo, precisa de proposta)

Eu: *"Cliente de clínica de estética quer usar tecnologia"*

Conselheiro:
- Pesquisa o nicho
- Consulta squads internos
- Propõe 3-4 soluções possíveis
- Gera PDF com a proposta
- Me entrega pronto pra reunião

#### MODO 2 — Execução (proposta aprovada, vira projeto)

Eu: *"O cliente aprovou a proposta 2. Gera o briefing pra começar o projeto"*

Conselheiro:
- Pega a proposta aprovada
- Expande em um **arquivo MD de briefing completo**
- Inclui: estrutura de agentes, squads necessários, ferramentas, integrações, fases
- Me entrega o arquivo
- Eu levo pra uma pasta nova e começo a implementação lá

Esse é o "ponto de partida" — dentro do novo projeto do cliente, eu vou aprofundando cada coisa.

#### MODO 3 — Assistente Pessoal (dia a dia, qualquer coisa)

Eu: *"Preciso de uma copy de oferta pra X"*
Eu: *"Faz um roteiro de 60s sobre Y"*
Eu: *"Alguém me falou de uma tecnologia Z, pesquisa e me explica"*
Eu: *"Dá pra entregar PPT pro cliente?"*
Eu: *"Me ajuda a pensar numa estratégia pra fechar o cliente A"*
Eu: *"Aprende copy como Gary Halbert"*

Conselheiro:
- Entende o que eu preciso
- Aciona o especialista interno certo (copy, roteiro, pesquisa, estratégia)
- Me responde direto ou me entrega o material pronto
- Aprende com minha reação e vai ficando mais preciso

### Exemplo real — resposta inteligente com alternativas

> Eu: "Cliente perguntou se a gente entrega PPT pronto. Dá?"
>
> Conselheiro: "OpenClaw não gera PPT nativamente, mas tem alternativas que atendem:
>
> 1. **Página web (URL)** — relatório visual com gráficos, compartilhável e exportável como PDF
> 2. **PDF formatado** — layout de apresentação pronto
> 3. **Markdown → HTML → PPT** — via ferramentas tipo Marp
>
> Recomendo opção 1 — mais prática, atualiza sempre, visualmente funciona como apresentação. Quer que eu elabore a proposta com esse formato?"

**Regra do Conselheiro:** nunca dizer só "não dá". Sempre propor alternativas viáveis.

### A visão
Eu quero poder estar **em qualquer lugar** (rua, evento, WhatsApp) e:
1. Mandar uma mensagem tipo: "clínica de estética" ou "mentor de mídia quer gerenciar clientes"
2. Em minutos, receber um PDF completo com:
   - Análise do nicho
   - 3-4 propostas de produto (SDR, squad, micro SaaS, time de marketing, etc.)
   - Estrutura de cada proposta
   - Ferramentas sugeridas
   - Estimativa de complexidade
3. Chegar preparado na reunião

Depois, quando o cliente aprovar:
1. Eu peço pro Conselheiro: "gera o arquivo MD de implementação da proposta X"
2. Recebo um arquivo MD completo
3. Abro projeto novo no VS Code
4. Outro agente lê esse arquivo e implementa

---

## ARQUITETURA DO CONSELHEIRO

### Camadas

```
┌────────────────────────────────────────────────────┐
│              MEU ASSISTENTE PESSOAL                 │
│  (ponto de contato — Telegram ou WhatsApp)         │
│  Recebe: "clínica de estética"                     │
│  Aciona: Conselheiro                                │
└──────────────────────┬─────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────┐
│                  CONSELHEIRO                        │
│        (meta-agente, orquestrador principal)       │
│  • Entende o briefing do nicho                     │
│  • Consulta squads internas                        │
│  • Monta propostas                                 │
│  • Gera PDF                                        │
│  • Quando aprovado, gera MD de implementação       │
└──────────────────────┬─────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────┐
│             SQUADS INTERNAS DO CONSELHEIRO         │
│                                                    │
│  GOVERNANÇA (sempre ativos em todo fluxo):         │
│  • Crítico / Revisor (valida antes de entregar)    │
│  • Guardião de Viabilidade (corta o que não dá)    │
│  • Meta-Agente (cria novos agentes sob demanda)    │
│                                                    │
│  DESCOBERTA (cliente novo → proposta):             │
│  • Pesquisador de Nicho                            │
│  • Estrategista de Produto                         │
│  • Arquiteto de Solução                            │
│  • Copywriter de Proposta                          │
│                                                    │
│  EXECUÇÃO (proposta aprovada → briefing MD):       │
│  • Arquiteto de Projeto                            │
│  • Gerador de Briefing MD                          │
│                                                    │
│  ASSISTENTE PESSOAL (dia a dia, qualquer coisa):  │
│  • Consultor Técnico (OpenClaw, decisões)          │
│  • Solucionador Criativo (alternativas viáveis)    │
│  • Pesquisador (tecnologias, tendências, mercado)  │
│  • Guardião da Memória (meu clone, preferências)   │
│                                                    │
│  ESPECIALISTAS (acionados sob demanda):            │
│  • Copy (qualquer copy que eu pedir)               │
│  • Roteirista (reels, vídeos, VSL)                 │
│  • Estrategista (funis, ofertas, campanhas)        │
│  • Designer (direção de design, briefings)         │
│  • Analista (dados, métricas, relatórios)          │
│                                                    │
│  CLONES DE REFERÊNCIAS (mentes que admiro):        │
│  • Hormozi (ofertas)                               │
│  • Brunson (funis)                                 │
│  • Halbert / Bencivenga (copy)                     │
│  • Naval (leverage, estratégia)                    │
│  • Rackham (SPIN vendas)                           │
│  + outros que eu for adicionando                   │
│                                                    │
│  EXÉRCITO EXPANSÍVEL:                              │
│  O Meta-Agente cria novos agentes conforme eu      │
│  preciso. Hoje são X agentes. Amanhã 200. O squad  │
│  cresce comigo — não tem limite.                   │
└────────────────────────────────────────────────────┘
```

### O fluxo completo

```
1. Eu (via Telegram/WhatsApp):
   "Tem um cara que tem clínica de estética, quer tecnologia"

2. Assistente pessoal → aciona Conselheiro

3. Conselheiro orquestra:
   a) Pesquisador de Nicho: pesquisa mercado de estética, dores comuns
   b) Estrategista de Produto: propõe 3-4 soluções
      - Ex: squad de atendimento + SDR + micro SaaS de agenda
   c) Arquiteto de Solução: desenha cada proposta (agentes, integrações, custo)
   d) Copywriter de Proposta: formata tudo em PDF

4. Me devolve: PDF de 10-20 páginas com tudo estruturado

5. Eu apresento pro cliente

6. Cliente aprova a proposta 2 (squad de atendimento)

7. Eu peço: "gera o MD de implementação da proposta 2"

8. Conselheiro → Gerador de Implementação cria o arquivo MD

9. Eu abro pasta nova no VS Code, falo pro novo agente:
   "Lê esse MD e implementa"

10. Novo agente monta o squad do cliente
```

---

## REQUISITOS TÉCNICOS

### Infraestrutura
- **Servidor:** Hostinger (~R$35/mês) — planejado
- **LLM:** OpenAI (GPT-5 / GPT-5 Mini)
- **Plataforma:** OpenClaw
- **Canais:** Telegram (principal), Discord (secundário), WhatsApp (opcional)
- **Repositório:** GitHub privado

### Por que OpenClaw
Porque eu quero **aprender OpenClaw usando em algo real pra mim**. Não sei mexer ainda. Esse projeto é meu playground de aprendizado + ferramenta real de trabalho.

---

## O QUE O AGENTE PRECISA SABER PRA ME AJUDAR A MONTAR O CONSELHEIRO

### 1. Estrutura de cérebro (já uso em outros projetos)

Padrão:
```
cerebro/
├── MAPA.md                    ← navegação geral
├── empresa/                   ← contexto do negócio (Dolphin)
│   ├── contexto/
│   │   ├── geral.md
│   │   ├── people.md
│   │   ├── metricas.md
│   │   ├── decisions.md
│   │   └── lessons.md
│   ├── skills/
│   └── rotinas/
├── squads/                    ← as squads internas
│   ├── pesquisa-nicho/
│   ├── estrategia-produto/
│   ├── arquitetura-solucao/
│   ├── copywriting-proposta/
│   └── gerador-implementacao/
├── agentes/                   ← agentes individuais
│   ├── assistente-pessoal/
│   ├── conselheiro/
│   └── [outros conforme necessário]
├── templates/                 ← templates reutilizáveis
│   ├── proposta-pdf.md
│   ├── implementacao-md.md
│   └── [outros]
└── seguranca/
    └── permissoes.md
```

### 2. Estrutura de cada agente

Cada agente tem 4 arquivos:
- **SOUL.md** — personalidade, tom, valores, o que NUNCA fazer
- **AGENTS.md** — regras operacionais, escopo de acesso, skills
- **IDENTITY.md** — nome, emoji, escopo
- **TOOLS.md** — ferramentas conectadas

### 3. Framework de criação (Coletar → Criar → Conectar → Entregar → Evoluir)

Todo agente passa pelos 5 passos. Estimativa: 1 agente por dia (primeira vez).

### 4. Capacidades do OpenClaw que importam aqui

- Busca na web (pesquisa de nicho)
- Geração de PDFs
- Escrita de arquivos MD
- Memória persistente (aprende com cada projeto)
- Multi-canal (Telegram + Discord + WhatsApp com mesma memória)
- Crons (rotinas automáticas)

---

## O QUE PRECISO DO AGENTE (NO NOVO CHAT)

Quero que o agente no novo projeto:

1. **Leia esse arquivo** e entenda a visão completa
2. **Me confirme o entendimento** antes de sair fazendo
3. **Proponha a estrutura** de pastas do cérebro do Conselheiro
4. **Me ajude a criar os agentes** um por um, começando pelo orquestrador (o próprio Conselheiro)
5. **Crie os squads internos** (Pesquisador de Nicho, Estrategista, Arquiteto, Copywriter, Gerador de Implementação)
6. **Documente tudo** enquanto faz — esse projeto vai ser meu case pessoal
7. **Configure pra Hostinger** — servidor que vou usar

Ordem de prioridade:
1. Estrutura base do cérebro
2. Agente Assistente Pessoal (ponto de contato)
3. Agente Conselheiro (orquestrador)
4. Squad Pesquisador de Nicho (primeira funcionalidade)
5. Squad Estrategista de Produto
6. Squad Arquiteto de Solução
7. Squad Copywriter de Proposta
8. Squad Gerador de Implementação
9. Templates de PDF e MD
10. Configuração de canais (Telegram primeiro)

---

## EXEMPLO DE FLUXO COMPLETO COM CRÍTICA INTERNA

### Situação: André pede uma proposta

```
André (áudio no Telegram):
"Cliente de clínica de estética, quer usar tecnologia pra crescer"

CONSELHEIRO (entende o pedido):
1. Aciona Pesquisador de Nicho → pesquisa mercado estético
2. Aciona Estrategista de Produto → propõe 3 soluções
3. Aciona Arquiteto de Solução → desenha estrutura técnica
4. Aciona Clone Hormozi → empacota ofertas
5. Aciona Copywriter → escreve o PDF

TIME PRODUZ a proposta:
"Proposta 1: Squad de atendimento IA que agenda consultas
 direto no CRM do cliente e processa pagamentos"

CRÍTICO REVISA:
"Isso soa bom, mas 'agenda direto no CRM' precisa verificar"

GUARDIÃO DE VIABILIDADE REVISA:
"ALERTA: 'processar pagamentos' é complexo, exige integração
com gateway — não é só OpenClaw. Ou tira isso, ou propõe
como fase 2 com custo extra."

TIME REFAZ com base nos alertas:
"Proposta 1: Squad de atendimento IA que qualifica lead,
agenda consulta (integração com Google Calendar),
e registra no CRM via API."

CRÍTICO + GUARDIÃO APROVAM

CONSELHEIRO entrega o PDF final ao André.
```

**Nada sai sem passar pela crítica interna.** É isso que garante qualidade.

---

## SOBRE PROGRAMADOR NO TIME INTERNO (decisão)

Pergunta: *"Preciso de programador dentro do Conselheiro?"*

Resposta: **Não no Conselheiro principal.** Motivo:
- O Conselheiro é estratégico — propõe soluções
- Quando a solução é aprovada, ele gera o MD de briefing
- Esse MD é levado pra uma pasta nova (projeto do cliente)
- Lá sim o agente construtor implementa com programador

**No Conselheiro, ter:**
- Arquiteto de Solução (desenha o que precisa ser construído)
- Gerador de Briefing MD (documenta pra quem vai implementar)

**No projeto do cliente (fora do Conselheiro), ter:**
- Construtor / Programador (implementa de verdade)

Separar mantém o Conselheiro enxuto e estratégico.

---

## EXEMPLOS CONCRETOS QUE QUERO CONSEGUIR

### Exemplo 1 — Clínica de estética

```
Eu (Telegram): "Cliente novo: dono de clínica de estética. 
Quer usar tecnologia pra melhorar o negócio. Reunião amanhã."

Assistente pessoal: "Acionando Conselheiro..."

[5-10 minutos depois]

Conselheiro: "PDF pronto. Resumo:

Análise do mercado de estética:
- 3 dores principais identificadas
- 2 concorrentes usando IA

3 propostas pra você apresentar:
1. Squad de Atendimento + Agenda (R$ 20K)
2. Micro SaaS de Gestão de Clientes (R$ 35K)
3. Implementação Total — 6 meses (R$ 45K)

PDF completo anexo: proposta-clinica-estetica-2026-04-18.pdf"
```

### Exemplo 2 — Aprovação e implementação

```
Eu: "O cliente aprovou a proposta 1 — Squad de Atendimento"

Conselheiro: "Ótimo! Gerando arquivo de implementação..."

[Gera: implementacao-squad-atendimento-cliente-estetica.md]

Conselheiro: "Arquivo pronto. Agora você pode:
1. Criar pasta no VS Code: c:\Clientes\Estetica-Cliente-X\
2. Copiar o arquivo pra lá
3. Abrir novo chat e dizer: 'Lê esse MD e implementa'

Posso preparar a pasta pra você?"
```

---

## MEU SEGUNDO CÉREBRO (o que o Conselheiro precisa saber sobre mim)

### Meus produtos atuais (Dolphin)
1. **Imersão Agentes IA** — R$5K (R$3K pra alunos) — 8 semanas de ensino
2. **Squad sob Demanda** — ~R$20K — 1 squad pronto em 15 dias
3. **Implementação Total** — R$45-50K — empresa inteira em 12 meses

### Meus frameworks favoritos
- **Coletar → Criar → Conectar → Entregar → Evoluir** (framework de criação de agentes)
- **Cérebro + Agentes + Skills + Rotinas** (estrutura padrão)
- **Multi-tenant com cérebros por expert** (quando cliente atende múltiplos)

### Minhas referências mentais
- Alex Hormozi — ofertas
- Russell Brunson — funis
- Neil Rackham — SPIN (vendas)
- Jeb Blount — prospecção
- Naval Ravikant — leverage

### O que NÃO fazer
- Prometer o que não consigo cumprir
- Colocar valores específicos em proposta (valor sempre negocia na reunião)
- Atacar equipe do cliente no texto (sempre evolução, nunca acusação)
- Usar "mini agência" (prefiro "squad")
- Ir além da capacidade real do OpenClaw

---

## GOVERNANÇA INTERNA (sempre ativa)

Antes de qualquer entrega, 3 agentes revisam o que vai sair:

### Crítico / Revisor
- Lê o que o time produziu
- Questiona: "isso faz sentido? tá no tom do André? vai funcionar?"
- Aponta inconsistências, exageros, promessas vazias
- Tem direito de **vetar** se estiver ruim — manda voltar pro time refazer

### Guardião de Viabilidade
- Lê toda proposta/solução sugerida
- Checa: "isso é **realmente** implementável com OpenClaw + nosso stack?"
- **Corta promessas que a gente não consegue entregar**
- Exemplo: se alguma squad propõe "integração direta com CRM X que atualiza dados sozinho", o Guardião diz: "CRM X não tem API pública. Alternativa: propor exportação manual + agente que processa o export"
- Essa é a regra central: **só prometer o que a gente consegue cumprir**

### Meta-Agente (cria agentes sob demanda)
- Sou novo no OpenClaw — o Conselheiro precisa ser capaz de **criar novos agentes** quando eu pedir
- Eu falo: *"cria um agente que roda às 8h e me manda alertas de leads novos"*
- Meta-Agente cria:
  - Pasta do agente
  - SOUL.md, AGENTS.md, IDENTITY.md, TOOLS.md
  - Cron configurado
  - Conecta no canal certo
- Antes de ativar, passa pelo Crítico + Guardião de Viabilidade
- Exército expansível: hoje X agentes, amanhã 200. Cresce conforme eu demando.

### Criação de clones novos (mesma lógica)

Eu falo: *"Ouvi falar do fulano, clona a mente dele"*

Meta-Agente:
- Pesquisa sobre a pessoa (frameworks, livros, estilo)
- Cria o clone no cérebro (SOUL.md rico com metodologia dela)
- Registra nas referências
- Disponível pra ser acionado depois

---

## FORMATOS DE ENTRADA (como falo com o Conselheiro)

- **Texto** (Telegram, Discord, WhatsApp) — padrão
- **Áudio** — eu mando áudio no WhatsApp/Telegram, OpenClaw transcreve via Whisper e o Conselheiro entende
- **Arquivo** — posso mandar PDF, MD, imagem (screenshot) pra ele analisar

---

## METODOLOGIA PADRONIZADA (replicável)

Tudo que o Conselheiro faz segue uma metodologia documentada — pra poder replicar pra outros clientes depois:

### Fluxo padrão de resposta

```
1. ENTENDER — o que o André está pedindo? (pode pedir clarificação)
2. ACIONAR — quem do time interno entra nessa? (1 ou vários)
3. PRODUZIR — time trabalha e gera o resultado
4. CRITICAR — Crítico + Guardião de Viabilidade revisam
5. ENTREGAR — resultado final pro André
6. APRENDER — registrar feedback, atualizar cérebro
```

### Regras invioláveis

1. **Nunca prometer o que não consegue entregar**
2. **Nunca "não dá"** — sempre propor alternativa viável
3. **Sempre consultar o cérebro do André** antes de responder (preferências, decisões, lições)
4. **Sempre passar pela crítica interna** antes de entregar
5. **Sempre registrar o que aprendeu** pra ficar melhor na próxima
6. **Proativo, não reativo** — antecipar, sugerir, expandir
7. **Tom do André** — direto, sem enrolação, português BR

---

## COMO O CONSELHEIRO REÚNE TIMES INTERNOS

O Conselheiro é quase como um **CEO de uma agência interna**. Quando chega uma demanda, ele:

1. **Entende o pedido** (tarefa simples ou complexa?)
2. **Decide quem aciona** (1 especialista? Vários? Um time?)
3. **Coordena o trabalho** (cada agente faz sua parte)
4. **Consolida o resultado** e me entrega

### Exemplo de "mesa redonda interna":

Eu: *"Preciso de uma proposta pra um cliente de estética"*

Conselheiro internamente reúne:
- Pesquisador de Nicho → pesquisa mercado de estética
- Estrategista de Produto → propõe 3 soluções
- Arquiteto de Solução → desenha estrutura técnica
- Clone do Hormozi → empacota a oferta
- Clone do Brunson → estrutura o funil de venda
- Copywriter → escreve o PDF

**Tudo por trás. Pra mim, é só o Conselheiro respondendo.**

### Exemplo de tarefa simples:

Eu: *"Faz uma copy curta de oferta pro X"*

Conselheiro:
- Aciona Copywriter + Clone do Halbert
- Me entrega 3 opções

### Exemplo de dúvida técnica:

Eu: *"Dá pra integrar OpenClaw com X?"*

Conselheiro:
- Aciona Consultor Técnico
- Se não souber, aciona Pesquisador pra buscar na web
- Me responde com alternativas

**O Conselheiro sempre monta o time certo pra demanda. Eu nunca preciso saber quem ele chamou — só o resultado.**

### Criação de clones novos (aprender novas mentes)

Quando eu falar: *"Aprende a pensar como Gary Halbert"* ou *"Clona a mente do Chris Voss"*

O Conselheiro:
- Cria um novo clone no cérebro
- Popula com frameworks, princípios, estilo da pessoa
- Fica disponível pra acionamento futuro

Com o tempo, o Conselheiro vai ter uma biblioteca de mentes que eu admiro — e sempre que precisar, aciona a mente certa pra cada situação.

---

## COMO O CONSELHEIRO APRENDE COM O TEMPO

O Conselheiro é um agente **evolutivo** — hoje sabe o básico, daqui 10 dias sabe mais, em 6 meses é minha extensão mental.

### O que ele aprende (e onde grava):

**Do trabalho com clientes:**
- Cada projeto vira case no cérebro
- Cada proposta aprovada vira template melhor
- Cada proposta rejeitada vira lição
- Padrões se formam: "clínica de estética geralmente fecha na proposta 2"

**De mim (comigo como pessoa):**
- Meu jeito de trabalhar e comunicar
- Minhas preferências (tom, formato, prazo)
- Referências que eu admiro (pessoas, empresas, frameworks)
- Decisões que tomei (pra não ter que explicar de novo)
- Erros que cometi (pra não repetir)
- Ferramentas que uso no dia a dia
- Meus próprios projetos em andamento

**De conhecimento técnico:**
- Capacidades do OpenClaw que vou descobrindo
- Alternativas criativas que funcionaram
- Integrações que testei
- Limitações que encontrei

### Como ele aprende:

- **Toda conversa é memória** — o que falo fica salvo
- **Correções viram regra** — "da próxima vez, faz assim"
- **Feedback vira padrão** — "gostei desse formato" → usa sempre
- **Cada decisão é registrada** — pra consultar depois
- **Consolidação diária** — rotina automática que organiza aprendizados

### O Conselheiro tem meu clone mental

Igual faço pros sócios da Pinguim, o Conselheiro tem o **clone do Codina** dentro dele. Ele não é genérico — ele pensa, escreve e decide do meu jeito. Com o tempo, responde quase como se fosse eu.

---

## PRIMEIRO PASSO NO NOVO CHAT

Quando abrir o novo chat na pasta do Conselheiro, fala:

> "Lê o BRIEFING-PROJETO-CONSELHEIRO.md. Me confirma o entendimento e vamos começar pelo primeiro passo: criar a estrutura base do cérebro."

---

*Briefing criado em abril/2026 — André Codina / Dolphin*
