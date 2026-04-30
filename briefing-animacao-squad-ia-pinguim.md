# Briefing — Substituir barras de progresso por animação de Squad de IA

> **Objetivo:** Transformar modais/barras de progresso genéricas em animações visuais de um "escritório virtual" onde agentes de IA (representados como personagens pixel art) executam a tarefa em tempo real. O usuário vê o que está acontecendo por trás, não só uma barra subindo.
>
> **Para o Claude Code que receber este documento:** Você tem acesso ao código do projeto. Este briefing descreve a ideia e o padrão visual. Use sua análise do código real pra decidir ONDE e COMO integrar — não siga cegamente. A ideia é clara, a implementação deve ser adaptada ao sistema.

---

## Contexto — Por que fazer isso

### O sistema hoje
O sistema tem várias ações assíncronas importantes (cada uma leva de 10 a 60 segundos):
- **Gerar/atualizar Persona** (lê o Cérebro → gera persona)
- **Gerar Copy de produto** (lê o Cérebro → gera copy)
- **Analisar Tráfego** (lê dados de performance → gera insights)
- **Outras rotinas que o Claude Code deve identificar no código**

Cada uma dessas ações hoje abre um **modal com barra de progresso** tipo "Atualizando persona... 40%".

### O problema
Barra de progresso é **genérica, muda, sem personalidade**. Não mostra o valor do que está acontecendo. O usuário espera passivo.

### A solução
Substituir a barra de progresso por uma **animação visual em tempo real** onde:
1. Um ou mais "agentes" (personagens pixel art) caminham pelo escritório virtual
2. Vão até o "Cérebro" (departamento/sala específica) buscar os dados
3. Levam até a mesa do agente correto (Persona, Copy, Tráfego, etc.)
4. O agente senta, trabalha, entrega o resultado
5. Um **log lateral em tempo real** mostra o que cada agente tá fazendo em texto

### Por que isso é melhor
- **Perceived performance:** a tarefa demora o mesmo tempo, mas o usuário vê valor sendo criado
- **Educação:** o cliente/aluno entende o que acontece por trás (somos uma agência com método, não uma caixa preta)
- **Diferencial de marketing:** é memorável, compartilhável, vira Stories
- **Nada muda tecnicamente:** a animação roda em paralelo com a chamada real da API. Se a API terminar antes, a animação acelera o último passo. Se a API demorar mais, a animação entra em loop de "processando".

---

## O padrão visual a ser replicado

### Arquivo de referência
Existe um arquivo HTML funcional que implementa essa animação completa:

- **Arquivo:** `demo-squad-agentes-pixel-v3.html` (pode ser solicitado ao cliente, é um único HTML standalone)
- **Stack:** HTML + Canvas 2D + JavaScript puro, **zero dependências externas**, zero assets externos (tudo desenhado em código)
- **Tamanho:** ~40KB

### O que o arquivo de referência contém (e deve ser replicado)

1. **Escritório top-down** com 6 cômodos separados:
   - Marketing · Copy & Conteúdo · Design
   - RH & Gestão · Revisão & QA · Sala do Cliente
   - Cada um com cor de destaque, piso diferente (madeira, carpete, cerâmica, grama), mobília detalhada (mesas, cadeiras, sofás, plantas, quadros, estantes, bebedouro, impressora)

2. **6 personagens com nome próprio** (Finn, Byte, Aurora, Zezinho, Dipsy, Aranha), cada um com:
   - Cor de camisa única
   - Posição de "casa" (sala onde trabalha)
   - Mesa designada
   - Animações: andar (4 direções), sentar, trabalhar (digitando), segurar papel, beber água, pensar

3. **Mecânica de entregas (handoffs)**:
   - Personagem A caminha até a sala do B
   - Entrega o "papel" (sprite de documento que voa com arco entre eles)
   - B recebe, senta na cadeira, trabalha
   - Balões de fala curtos ("Pega!", "Deixa comigo!", "Entregue!")

4. **Painel lateral com**:
   - Status bar (o que está acontecendo agora)
   - Contadores (tarefas em andamento / concluídas / total de agentes)
   - Lista de agentes com estado visual (idle, trabalhando, concluído)
   - **Log de atividade** em tempo real, com cores diferentes por tipo (info, working, handoff, done, final)

5. **Output final** — card verde no fim mostrando o resultado entregue

---

## Como adaptar pro cenário "Atualizar Persona"

### Roteiro da animação (exemplo)

Quando o usuário clica em "Atualizar Persona", em vez do modal com barra:

```
1. Modal abre, mostra o escritório
2. Byte (agente de coleta) sai da sala de Marketing
3. Byte caminha até a sala "Cérebro" (novo cômodo)
4. Byte "lê" os dados (anima na frente de uma estante de livros/arquivos)
5. Byte caminha até a mesa da Aurora (agente de Persona)
6. Entrega o "papel" (os dados do cérebro)
7. Aurora senta, anima digitando (tempo proporcional ao tempo real da API)
8. Aurora se levanta com o papel "Persona Pronta"
9. Aurora caminha até a frente (em direção ao usuário)
10. Balão de fala: "Tá pronta sua persona atualizada!"
11. Modal fecha / mostra a nova persona
```

### Roteiros pra outras ações

O Claude Code deve **identificar as rotinas existentes no projeto** e criar um roteiro análogo pra cada:

| Rotina existente | Agente responsável (sugestão) | Fluxo sugerido |
|---|---|---|
| Atualizar Persona | Aurora | Cérebro → Aurora → entrega |
| Gerar Copy | Byte | Cérebro → Byte → entrega |
| Analisar Tráfego | Dipsy | Cérebro + dados → Dipsy → entrega |
| Criar Roteiro completo | Fluxo dos 6 agentes | Como no arquivo v3 original |
| Subir novo material no Cérebro | Finn (gerente) | Recebe upload → leva pro Cérebro → confirma |

**Os nomes dos agentes, cores e papéis podem ser alterados** conforme o contexto do projeto — o importante é o padrão visual/mecânico.

---

## Arquitetura técnica sugerida

### 1. Componente reutilizável `<SquadAnimation />`

Criar um componente (React/Vue/Svelte/qualquer framework que o projeto use) que:
- Recebe como props: `{ roteiro, onComplete, apiCall }`
- Renderiza o canvas com o escritório
- Executa a animação seguindo o `roteiro` passado
- Chama `apiCall` em paralelo — se a API terminar antes, acelera os últimos passos; se demorar mais, entra em loop de "trabalhando"
- Chama `onComplete(result)` quando ambos (animação + API) terminarem

### 2. Estrutura do `roteiro`

```javascript
const roteiroAtualizarPersona = {
  title: 'Atualizando Persona',
  output: (apiResult) => `Nova persona: ${apiResult.personaName}`,
  steps: [
    { agent: 'byte', action: 'walk_to', target: 'cerebro', message: 'Vou buscar os dados...' },
    { agent: 'byte', action: 'pickup', target: 'cerebro_item' },
    { agent: 'byte', action: 'walk_to', target: 'aurora_desk' },
    { agent: 'byte', action: 'handoff', target: 'aurora', message: 'Aurora, atualiza a persona.' },
    { agent: 'aurora', action: 'sit_and_work', duration: 'api_bound' }, // espera a API
    { agent: 'aurora', action: 'stand_up' },
    { agent: 'aurora', action: 'walk_to', target: 'front' },
    { agent: 'aurora', action: 'deliver', message: 'Tá pronta sua persona!' },
  ],
};
```

### 3. Integração com a chamada real da API

```javascript
// Pseudo-código
async function updatePersona() {
  openModal(<SquadAnimation 
    roteiro={roteiroAtualizarPersona}
    apiCall={() => api.post('/personas/update')}
    onComplete={(result) => showNewPersona(result)}
  />);
}
```

### 4. Comportamento quando a API demora mais que a animação
- Último agente (Aurora no exemplo) entra em **loop de "trabalhando"** com pequenas variações de balão ("Quase lá...", "Revisando...", "Finalizando...")
- Quando a API responde, a animação termina o último passo (levantar, entregar)

### 5. Comportamento quando a API termina antes da animação
- Continua a animação até o fim — **não corta**
- O resultado já tá pronto, só precisa ser revelado no último passo
- Isso ajuda a "vender" o valor da ação (se for muito rápido, parece que não teve trabalho)

---

## Sobre assets visuais

### Versão 1 — tudo desenhado em código (grátis, imediato)
- O arquivo de referência `demo-squad-agentes-pixel-v3.html` já faz isso
- Visual: pixel art simples, mas funcional
- Custo: R$ 0

### Versão 2 — com sprites comprados (qualidade profissional)
Quando quiser subir o nível visual, comprar os packs do LimeZu no itch.io:

- **Modern Office - Revamped** (mobília/cômodos): $2,50 USD — https://limezu.itch.io/modernoffice
- **Modern Interiors** (personagens com 200 penteados, 80 acessórios, animações de andar/sentar/entregar/etc.): $1,50 USD mínimo — https://limezu.itch.io/moderninteriors
- **Bundle completo** (recomendado): $5,00 USD — https://limezu.itch.io/moderninteriors (arrastar slider pra $5)

**Licença oficial:** "YOU CAN: Edit and use the asset in any commercial or non commercial project." Pagamento único, uso ilimitado em múltiplos clientes. Apenas não pode revender os sprites como pack.

Quando os sprites forem comprados:
- Substituir as funções `drawCharacter()`, `drawDesk()`, `drawFurniture()`, etc. por `drawImage()` dos sprites
- Lógica de animação (walking, handoff, sitting) continua igual
- Resultado visual fica **nível produto comercial**

---

## Checklist pro Claude Code do outro projeto

1. [ ] Solicitar ao usuário o arquivo `demo-squad-agentes-pixel-v3.html` como referência (ou buscar no projeto de origem)
2. [ ] Analisar o código do projeto atual e identificar:
   - Quais ações hoje mostram barra de progresso / modal de "carregando"
   - Como as chamadas de API são feitas
   - Qual framework frontend está em uso (React? Vue? puro HTML?)
3. [ ] Criar um componente reutilizável de animação baseado no canvas da v3
4. [ ] Para cada ação identificada, criar um roteiro de animação específico
5. [ ] Integrar a animação substituindo a barra de progresso atual (começar por UMA ação, ex: "Atualizar Persona")
6. [ ] Validar com o usuário ANTES de substituir em todas as ações
7. [ ] Deixar a arquitetura preparada pra trocar sprites desenhados em código por sprites comprados depois (sem reescrever a lógica)

---

## O que NÃO fazer

- ❌ Não substituir TODAS as barras de progresso sem validação — começar com UMA ação
- ❌ Não tentar reinventar o canvas — copiar a lógica do arquivo de referência v3
- ❌ Não tornar a animação bloqueante — ela deve rodar em paralelo à API real
- ❌ Não tornar a animação mais longa que a API — se a API for rápida (< 3s), manter a barra simples. A animação só faz sentido pra ações de 8+ segundos
- ❌ Não remover o log de atividade lateral — é o que o usuário realmente lê enquanto a animação roda

---

## Resumo executivo

**Problema:** Modais com barra de progresso são genéricos e não comunicam valor.

**Solução:** Substituir por animação visual de squad de agentes IA trabalhando em tempo real em um escritório top-down pixel art.

**Referência:** Arquivo `demo-squad-agentes-pixel-v3.html` já funcional (~40KB, HTML/JS puro, zero deps).

**Impacto esperado:** Diferencial de marketing forte + percepção de valor + material para Stories/cases.

**Custo:** R$ 0 na v1 (tudo em código). R$ 26 (único, vitalício) se quiser subir pra sprites profissionais do LimeZu.

**Complexidade:** Média. O motor visual já existe, o trabalho é identificar as ações do sistema e criar os roteiros específicos de cada uma.

---

*Documento gerado em 2026-04-24. Parte do projeto de squad de agentes IA da Agência Pinguim.*
