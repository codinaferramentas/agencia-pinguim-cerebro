# Dúvidas Técnicas — Respostas Práticas

> Este arquivo é só pra você. NÃO entra na apresentação.

---

## 0. O que é SOUL.md, AGENTS.md, etc? (Anatomia do agente)

Cada agente tem uma pastinha com arquivos que definem quem ele é. Pensa como o "RH" de um funcionário:

| Arquivo | O que é | Analogia |
|---------|---------|----------|
| **SOUL.md** | Personalidade, tom, valores, o que NUNCA fazer | A **índole** — como pensa e se comunica |
| **AGENTS.md** | Regras operacionais, permissões, fluxos | O **manual de procedimentos** |
| **IDENTITY.md** | Nome, emoji, escopo | O **crachá** |
| **TOOLS.md** | Ferramentas conectadas (Calendar, Supabase) | A **lista de acessos** |

Exemplo prático da pasta do bot de suporte:
```
agentes/bot-suporte/
├── SOUL.md       ← "Sou direto, empático, nunca invento resposta"
├── AGENTS.md     ← "Posso ler FAQ, NÃO posso acessar vendas"
├── IDENTITY.md   ← "Me chamo Pingu 🐧"
└── TOOLS.md      ← "Acesso ao Telegram e base de FAQ"
```

O **SOUL.md é o arquivo mais importante** — é onde o agente ganha personalidade. Sem ele, é genérico. Com ele, vira especialista.

Os outros arquivos dão suporte: dizem o que ele pode acessar (AGENTS.md), como se identifica (IDENTITY.md), e quais ferramentas usa (TOOLS.md).

---

## 1. Como o agente sabe a agenda do Pedro? Precisa de acesso?

**Sim, precisa conectar.** O OpenClaw se conecta ao Google Calendar (ou Outlook) via API. Na configuração, você gera um token de acesso e coloca no `.env` do agente.

Na prática:
- O agente usa uma **skill de calendário** que faz `GET` na API do Google Calendar
- Puxa os eventos do dia e formata como mensagem
- Isso roda como **cron** (ex: todo dia 7h) ou sob demanda ("me mostra minha agenda")

Cada sócio daria permissão ao seu agente pessoal para ler sua agenda. É como quando você conecta um app no Google e ele pede "permitir acesso ao calendário?".

---

## 2. O cron é interno do OpenClaw? Como roda?

**Sim, é nativo do OpenClaw.** Não precisa de Supabase nem nada externo.

Comando pra criar:
```bash
openclaw cron create --name "bom-dia-pedro" --schedule "0 7 * * *"
```

Isso diz: "todo dia às 7h, execute este prompt/skill". O OpenClaw tem um daemon (processo rodando em background) que dispara os crons no horário certo.

É exatamente como o cron do Linux ou os scheduled functions do Supabase, mas integrado no OpenClaw. Você configura uma vez e ele roda sozinho.

Exemplos de crons comuns:
- `0 7 * * *` — todo dia às 7h
- `0 8 * * 1` — toda segunda às 8h
- `0 21 * * *` — todo dia às 21h (resumo do dia)
- `0 0 1 * *` — todo dia 1 do mês (relatório mensal)

---

## 3. Funciona no Windows? Você não tem Mac.

**Sim, funciona no Windows.** O OpenClaw roda em qualquer sistema: Mac, Windows, Linux.

No Windows, você instala via npm (que você já tem instalado):
```bash
npm i -g openclaw
openclaw onboard
```

O `openclaw onboard` é um wizard interativo que guia você na configuração (API keys, canais, etc.).

Alternativa: rodar num servidor cloud (VPS Linux) por R$25-50/mês e acessar remotamente. Assim fica rodando 24/7 sem precisar deixar seu PC ligado.

---

## 4. Como é o desenvolvimento? Qual a dinâmica de trabalho?

O fluxo seria assim:

### Criando um agente novo:
```
1. Você cria uma pasta no cérebro: cerebro/agentes/nome-do-agente/
2. Cria o SOUL.md (personalidade, tom, regras)
3. Cria o AGENTS.md (permissões, o que pode/não pode acessar)
4. Cria o IDENTITY.md (nome, emoji, escopo)
5. Configura no OpenClaw qual canal ele escuta
6. Testa, ajusta, itera
```

### Onde desenvolve?
- **VS Code** — sim, é aqui mesmo. Os arquivos são markdown (.md). Você edita como qualquer outro arquivo.
- **Claude Code** (eu!) — você me pede e eu crio/edito os arquivos pra você
- **O próprio agente** — quando já tiver um assistente rodando, você pede pra ele criar novos agentes

### Dinâmica com o GitHub:
```
Você edita arquivos (VS Code ou me pede) 
    → git push pro GitHub 
    → O OpenClaw faz git pull e lê as mudanças
    → Agente já funciona com o novo comportamento
```

É como atualizar um software: você muda o código (no caso, os .md), faz deploy (push), e o agente já se comporta diferente.

### Você pode me pedir e eu faço:
- Criar novos agentes (SOUL.md, AGENTS.md, etc.)
- Criar skills (rotinas automatizadas)
- Configurar crons
- Ajustar permissões
- Tudo isso dentro do VS Code, como estamos fazendo agora

---

## 5. O Pedro pode fazer/melhorar o agente dele sozinho?

**Sim e não — depende do nível.**

### O que o Pedro pode fazer sozinho (sem código):
- **Conversar com o agente** e ele aprende — "a partir de agora, me manda relatórios mais curtos"
- O agente registra isso automaticamente como preferência
- Pedir pro agente: "adicione essa regra: nunca me interrompa antes das 9h"

### O que precisa de alguém técnico (você):
- Criar o agente do zero (SOUL.md, AGENTS.md, configuração)
- Conectar ferramentas novas (API do Google, Hotmart, etc.)
- Criar skills complexas (que acessam banco, geram relatórios)

### Podemos criar uma tela?
Sim, é possível criar uma interface web simples onde o sócio preenche perguntas ("como você gosta de receber relatórios?", "quais suas prioridades?") e isso gera/atualiza o arquivo do agente. Mas isso seria um desenvolvimento extra — não vem pronto no OpenClaw.

**Na prática, o mais eficiente:** Você cria o agente base pro sócio, e ele vai refinando pela conversa natural do dia a dia. "Não gostei desse formato" → agente aprende. "Prefiro bullet points" → agente aprende.

---

## 6. Agente pode entrar no Supabase e liberar acesso?

**Sim, isso é uma skill.** Funciona assim:

```
Cenário: aluno pede no WhatsApp "não consigo acessar o sistema"

Fluxo:
1. Equipe vai no Discord: "@assistente libera acesso pro aluno João Silva, email joao@email.com"
2. Agente executa a skill "liberar-acesso":
   a. Conecta no Supabase via API (usando o service key configurado)
   b. Busca o usuário pelo email
   c. Verifica status (bloqueado? senha expirada? sem cadastro?)
   d. Executa a ação (reset senha, ativa conta, etc.)
   e. Responde: "Acesso liberado pro João Silva. Enviei email de reset de senha."
3. Se precisar verificar na Hotmart: agente chama outra skill
   a. Consulta API da Hotmart com o email do aluno
   b. Verifica se tem compra ativa
   c. Se sim → libera. Se não → responde "aluno sem compra ativa, não liberado"
```

### O que precisa pra isso funcionar:
- **API key do Supabase** configurada no `.env` do agente
- **API key da Hotmart** (eles oferecem API para consultar compras)
- **Uma skill** escrita em markdown que descreve o passo a passo
- **Um script Python** (dentro da skill) que faz as chamadas de API

Isso é um dos casos de uso mais poderosos e que **economiza muito tempo da equipe**.

---

## 7. Tudo é arquivo MD? Não precisa de banco de dados?

### O cérebro = arquivos MD
Sim, o cérebro é 100% arquivos de texto (markdown). Isso é proposital:
- A IA lê texto melhor que banco de dados
- Não precisa de infraestrutura
- Qualquer um pode editar
- Git versiona tudo automaticamente

### Quando precisa de banco?
Para **dados estruturados e em volume**, usa banco sim:
- Vendas, leads, tickets → podem ficar em CSV (simples) ou Supabase (robusto)
- O agente **consulta** esses dados quando precisa (via skill com script Python)
- O cérebro guarda o **contexto** (quem somos, como fazemos), não os dados brutos

### Na prática pra Pinguim:
```
Cérebro (GitHub, arquivos MD):
  - Quem é a empresa, como funciona cada área
  - Regras de negócio, decisões, lições
  - Configuração dos agentes
  - Skills e rotinas

Dados (Supabase, que vocês já usam):
  - Alunos, acessos, compras
  - Métricas, logs

O agente lê o cérebro pra saber O QUE fazer
O agente consulta o Supabase pra saber COM O QUE trabalhar
```

Não precisa criar nada novo — vocês já têm Supabase. O agente aprende a consultar ele.

---

## 8. Como funciona a atualização/aprendizado contínuo?

O agente fica mais inteligente de 3 formas:

### Automática (sem esforço humano):
1. **Toda interação** → o agente salva no cérebro o que aprendeu
2. **Todo cron** → resultados são salvos, padrões são identificados
3. **Consolidação de memória** → cron diário às 21h que organiza o que aprendeu no dia

### Pela conversa (esforço mínimo):
4. **Feedback direto** → "faz diferente na próxima" → agente registra
5. **Decisões** → "decidimos fazer X" → agente grava em decisions.md
6. **Correções** → "isso tá errado" → agente grava como lição

### Manual (quando quiser):
7. **Editar arquivos** → atualizar contexto, adicionar regras, mudar skills
8. **Criar novas skills** → empacotar tarefas repetitivas
9. **Ajustar SOUL.md** → mudar personalidade, tom, prioridades

---

## 9. Melhoria é em tempo real ou só quando o cron rodar?

**Em tempo real.** Quando o sócio fala "aprenda isso" ou "mude aquilo", o agente atualiza na hora, na conversa. Não precisa esperar cron nenhum.

Crons são só pra tarefas agendadas (relatório todo dia 8h, sync meia-noite). A evolução do agente é instantânea.

Exemplo:
```
Pedro: "Quero que você aprenda a fazer análise SWOT"
Agente (na hora): "Entendido. Adicionei. Quer que eu faça uma agora?"
Pedro: "Sim, faz da Pinguim"
Agente (2 min depois): [entrega a análise SWOT completa]
```

---

## 10. Onde entra o clone de mente na estrutura do agente?

Entra no **SOUL.md**. É o arquivo que define personalidade + referências mentais.

```
agentes/michel/
├── SOUL.md         ← Personalidade + MENTES CLONADAS ficam aqui
│                      "Quando escrever copy, pense como Gary Halbert"
│                      "Para análise de funis, use framework do Brunson"
```

Se a mente clonada for muito detalhada (com frameworks, exemplos, regras), o agente pode criar um arquivo dedicado:
```
agentes/michel/
├── SOUL.md
└── referencias/
    ├── gary-halbert.md      ← Frameworks de copy
    └── russell-brunson.md   ← Frameworks de funis
```

O sócio não precisa saber disso — ele fala pelo WhatsApp "clone a mente do Halbert" e o agente organiza internamente.

---

## 11. Precisa de chip/número pra WhatsApp? Como funciona?

O OpenClaw se conecta nativamente ao WhatsApp via QR Code (igual WhatsApp Web). **Não precisa de Evolution API** — menos sistemas intermediários, melhor.

### Bot de Suporte (obrigatório)
**Precisa de 1 chip dedicado** (~R$15/mês). Recomendo chip novo separado do número atual de suporte para evitar conflito bot vs. humano.

### Agentes Pessoais dos Sócios (4 opções)

| Opção | Como funciona | Custo | Recomendação |
|-------|---------------|-------|--------------|
| **A) Discord** | Canal privado (#pedro-pessoal) | R$0 | **Recomendado** — já usam, zero risco |
| **B) Telegram** | Bot criado em 2 min via @BotFather | R$0 | **Recomendado** — zero custo, app no celular |
| **C) WhatsApp chip** | 1 chip por sócio, salva como "Meu Assistente" | ~R$15/chip/mês | Bom se quiserem WA — funciona bem |
| **D) WhatsApp do sócio** | OpenClaw conecta no WA do próprio sócio | R$0 | **NÃO recomendado** — intercepta TODAS as msgs, risco de banimento |

### O que precisa comprar:
- 1 chip pro Bot de Suporte (obrigatório): ~R$15/mês
- 0 a 3 chips pros agentes pessoais (só se escolherem opção C): R$0-45/mês

---

## 12. Como o sócio pede nova habilidade e o agente sabe se precisa de ajuda técnica?

O agente tem consciência dos seus limites pelo TOOLS.md (lista de ferramentas que tem acesso).

**Se a habilidade é "mental" (não precisa de ferramenta nova):**
- Sócio: "Aprenda análise SWOT" → agente faz na hora
- Sócio: "Clone a mente do Halbert" → agente atualiza SOUL.md na hora

**Se precisa de ferramenta que não tem acesso:**
- Sócio: "Puxa dados da Hotmart"
- Agente: "Pra acessar a Hotmart, preciso que o time técnico configure o acesso. Quer que eu crie a solicitação?"

O agente sabe o que tem no TOOLS.md. Se a ferramenta não está lá, ele avisa que precisa de configuração técnica. Não trava, não dá erro — informa de forma clara o que falta.

---

---

## 13. Como é o processo completo: do VS Code → DigitalOcean → WhatsApp/Telegram/Discord?

Não é complexo. Pensa em 3 etapas: **desenvolver, subir, conectar.**

### Etapa 1 — Desenvolver (VS Code, na sua máquina)

Aqui é onde você trabalha no dia a dia. Tudo é arquivo de texto.

```
No VS Code você:
├── Cria os arquivos do cérebro (contexto, áreas, métricas)
├── Cria os agentes (SOUL.md, AGENTS.md, IDENTITY.md, TOOLS.md)
├── Cria as skills (receitas de tarefas)
├── Configura as rotinas (crons)
├── Testa localmente (o OpenClaw roda no seu PC pra testar)
└── Faz git push pro GitHub quando tá pronto
```

Pra testar local:
```bash
npm i -g openclaw
openclaw onboard          # wizard de configuração
openclaw start            # roda o agente no seu PC
```

O agente já funciona no seu PC. Você testa, ajusta, testa de novo. Quando tá bom, sobe pro servidor.

### Etapa 2 — Subir pro DigitalOcean (servidor 24/7)

O DigitalOcean é um servidor remoto que fica ligado 24h. É como um PC na nuvem.

```
Criar o servidor (1 vez só, ~10 minutos):
1. Cria uma conta no DigitalOcean (digitalocean.com)
2. Cria um "Droplet" (é o nome do servidor deles)
   - Escolhe: Ubuntu, 2GB RAM, $12/mês
3. Acessa via terminal (SSH)
4. Instala o OpenClaw no servidor:
   npm i -g openclaw
5. Clona o repositório do GitHub:
   git clone https://github.com/agencia-pinguim/cerebro.git
6. Configura a API key da Anthropic:
   export ANTHROPIC_API_KEY="sk-ant-..."
7. Inicia o OpenClaw:
   openclaw start --daemon    (roda em background, 24/7)
```

Depois de configurado, pra atualizar é só:
```bash
# No seu VS Code, faz as mudanças e:
git push

# No servidor (ou automaticamente via cron):
git pull    # puxa as mudanças
# O OpenClaw já lê os novos arquivos
```

Ou seja: **você edita no VS Code, faz push, e o servidor atualiza**. Não precisa entrar no servidor toda vez.

### Etapa 3 — Conectar os canais (WhatsApp/Telegram/Discord)

Isso é feito durante o `openclaw onboard` ou na configuração depois.

**WhatsApp:**
```
1. No terminal do servidor, roda: openclaw channel add whatsapp
2. Aparece um QR Code no terminal
3. Escaneia com o celular do chip dedicado (igual WhatsApp Web)
4. Pronto — o agente tá escutando naquele número
```

**Telegram:**
```
1. Cria um bot no Telegram via @BotFather (2 minutos)
2. Recebe um token (tipo: 123456:ABC-DEF...)
3. No OpenClaw: openclaw channel add telegram --token "123456:ABC..."
4. Pronto — o agente responde no bot do Telegram
```

**Discord:**
```
1. Cria um bot no Discord Developer Portal (5 minutos)
2. Recebe um token
3. No OpenClaw: openclaw channel add discord --token "..."
4. Adiciona o bot nos canais que ele deve escutar
5. Pronto — o agente responde quando mencionado
```

### Resumo visual do fluxo

```
VS Code (você desenvolve)
    ↓ git push
GitHub (repositório central)
    ↓ git pull (automático ou manual)
DigitalOcean (servidor 24/7 rodando OpenClaw)
    ↓ canais conectados
WhatsApp ← QR Code do chip
Telegram ← Token do @BotFather
Discord  ← Token do bot
```

### Quanto tempo leva pra configurar tudo do zero?

| Etapa | Tempo estimado |
|-------|---------------|
| Instalar OpenClaw local (VS Code) | 10 minutos |
| Criar servidor DigitalOcean | 10 minutos |
| Instalar OpenClaw no servidor | 15 minutos |
| Conectar WhatsApp | 5 minutos |
| Conectar Telegram | 5 minutos |
| Conectar Discord | 10 minutos |
| **Total infraestrutura** | **~1 hora** |

Depois disso, o trabalho é criar o cérebro e os agentes — que é onde entra o tempo real de desenvolvimento.

### É difícil?

Sinceramente: **se você sabe usar terminal e já trabalhou com Supabase/GitHub, não é difícil.** É mais simples que configurar um projeto Next.js com deploy na Vercel, por exemplo. O OpenClaw facilita muito com o wizard `onboard`.

O que pode ser novo: SSH no servidor. Mas é basicamente abrir terminal remoto e rodar comandos. Se travar em algo, eu te guio passo a passo.

---

---

## 14. O agente pode escutar em vários canais ao mesmo tempo?

**Sim.** O OpenClaw permite configurar múltiplos canais pra mesma instância de agente. O agente mantém a **mesma memória** independente de onde veio a mensagem.

```
Luiz fala no Discord → Agente responde (e aprende)
Luiz fala no Telegram → Mesmo agente responde (mesma memória)
```

Não são dois agentes — é um só com duas "portas de entrada". A memória é uma só (o cérebro no GitHub). Então tudo que ele aprende no Discord, ele sabe no Telegram.

Na prática pra Pinguim:
- **Discord** → equipe interna (funciona como workspace)
- **Telegram** → alternativa mobile (mais rápido pelo celular)
- Mesmo agente, mesma memória, dois acessos

---

## 15. A estrutura de marketing tem sub-squads por tipo de produto?

**Sim.** O Luiz explicou que copy de low ticket é diferente de copy de high ticket. Então dentro de marketing:

- **Squad Low Ticket** (Elo, Proalt) → copy, design, tráfego, estratégia específicos
- **Squad High Ticket** (Lira, Taurus, Orion) → copy, design, tráfego, estratégia específicos
- **Squad Desafio Pago** (Desafio LoFi, Desafio Low Ticket) → idem
- **Especialistas transversais** → servem todos (ex: Hormozi pra oferta de qualquer tipo)

O ecossistema completo do Luiz tem 30 squads, 211 agentes, 397 tasks, 75 workflows.

---

*Este documento é seu material de referência pessoal. Atualiza conforme surgir mais dúvidas.*
