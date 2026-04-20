# Template — Card do Agente

> Todo agente do Mission Control tem um `AGENT-CARD.md` ao lado do SOUL.md existente.
> Este é o arquivo que o painel lê para exibir o agente nas telas Squads e Evolução.
> O SOUL continua sendo a personalidade; este card é o contrato operacional.

---

## Campos obrigatórios

### nome
Nome curto do agente. Ex: `Consultor Hotmart`.

### squad
Mini-squad ao qual pertence. Ex: `suporte-operacional`.

### status
Um de: `planejado` | `em_criacao` | `em_teste` | `em_producao` | `pausado`.

### modelo
Modelo LLM recomendado. Ex: `gpt-4o-mini` (tarefa simples), `gpt-4o` (raciocínio), `claude-sonnet-4-6` (texto longo).

### modelo_fallback
Modelo alternativo em caso de falha/custo. Pode ser vazio.

---

## Os 7 campos do contrato

### 1. missão
O que este agente resolve no mundo, em uma frase.
Ex: *"Confirmar se um aluno específico tem acesso liberado a um produto específico no sistema interno da Pinguim."*

### 2. entrada
O que o agente precisa receber pra operar.
Ex: *"CPF ou e-mail do aluno + nome do produto + canal de origem do pedido."*

### 3. saída_esperada
Formato exato do output.
Ex: *"JSON com { aluno_id, produto_id, tem_acesso: bool, data_expiracao: string|null, observacoes: string }."*

### 4. limites
O que o agente NÃO faz (escala pro humano).
Ex: *"Não cadastra acesso novo. Não responde ao aluno. Não confirma pagamento — isso é do Consultor Hotmart."*

### 5. handoff
Pra quem o agente passa quando termina ou trava.
Ex: *"Para Propositor quando confirmar ausência de acesso. Para humano se Supabase retornar erro ou aluno não existir."*

### 6. critério_qualidade
Como saber se o output está bom.
Ex: *"Responde em < 3 segundos. JSON válido. Nunca inventa acesso — se incerto, marca observacoes=ambiguo e passa pra humano."*

### 7. métrica_sucesso
O número que prova que o agente funciona.
Ex: *"Taxa de resposta correta ≥ 98% medida contra 50 casos de eval do squad suporte-operacional."*

---

## Campos operacionais

### canais
Onde o agente é acionado. Array com 1+ de: `discord` | `telegram` | `whatsapp` | `painel`.

### ferramentas
Lista de APIs/tools que o agente usa. Ex: `["hotmart-api-read", "supabase-pinguim-read"]`.

### limite_execucoes_dia
Número máximo de execuções autônomas por dia. Kill switch pausa se bater o limite ou se tiver 3 retrabalhos seguidos.

### custo_estimado_exec
Custo médio em USD por execução. Usado pra reportar na aba Qualidade.

---

## Exemplo mínimo preenchido

```markdown
nome: Consultor Hotmart
squad: suporte-operacional
status: planejado
modelo: gpt-4o-mini
modelo_fallback: gpt-4o

missão: Confirmar compra de um aluno específico em um produto específico na Hotmart.
entrada: CPF ou e-mail do aluno + nome do produto.
saída_esperada: JSON { comprou: bool, data_compra: string|null, produto_variacao: string|null }.
limites: Não acessa Supabase interno. Não cadastra nada. Só leitura na Hotmart.
handoff: Para Consultor Supabase Pinguim quando compra confirmada. Para humano se Hotmart API falhar 3x.
critério_qualidade: Responde em <5s. Nunca inventa compra. Se aluno não achado, diz "não_encontrado" e escala.
métrica_sucesso: 99% de acerto em 100 casos de eval.

canais: [discord, telegram]
ferramentas: [hotmart-api-read]
limite_execucoes_dia: 200
custo_estimado_exec: 0.002
```
