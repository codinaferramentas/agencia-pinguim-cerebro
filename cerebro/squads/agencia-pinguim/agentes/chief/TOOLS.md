# TOOLS.md — Chief

> Ferramentas (tools/APIs) que o Chief pode chamar.
> Cada tool tem: nome, propósito, input, output, autenticação, restrições.

## Tools internas (Edge Functions Pinguim OS)

### 1. `buscar-cerebro`
- **Propósito:** RAG semântico sobre fontes do Cérebro (depoimentos, aulas, metodologias).
- **Input:** `{ cerebro_slug, query, top_k? }`
- **Output:** `{ chunks: [{ texto, fonte, score }] }`
- **Auth:** JWT (validação no Edge).
- **Quando usar:** sempre que o caso menciona um produto ou tema específico do Pinguim.

### 2. `buscar-agente-relevante` (Bloco 3 — a implementar)
- **Propósito:** RAG sobre `pinguim.agentes.capabilities` — encontra os Workers mais relevantes pro briefing.
- **Input:** `{ caso_descricao, top_k?: 8 }`
- **Output:** `{ agentes: [{ slug, nome, capabilities, score }] }`
- **Auth:** JWT.
- **Quando usar:** sempre que for montar squad. Antes de propor plano.

### 3. `delegar-worker` (Bloco 3 — a implementar)
- **Propósito:** chama o Worker com briefing inline + recebe entregável.
- **Input:** `{ worker_slug, briefing, contexto_cliente_id, parent_entregavel_id? }`
- **Output:** `{ entregavel_id, conteudo_estruturado, nota_de_dissenso? }`
- **Auth:** JWT + verificação que worker está `status='em_producao'` e `kill_switch=false`.
- **Quando usar:** depois de plano aprovado pelo cliente.
- **Restrição:** chamadas paralelas limitadas a 4 simultâneas (evita estouro de rate limit OpenAI).

### 4. `versionar-entregavel`
- **Propósito:** salva nova versão de um entregável com vínculo ao anterior.
- **Input:** `{ cliente_id, agente_que_fez, tipo, titulo, conteudo, parent_id? }`
- **Output:** `{ entregavel_id, versao }`
- **Auth:** JWT + RLS por tenant.

### 5. `registrar-dissenso`
- **Propósito:** loga evento de dissenso Worker × Chief.
- **Input:** `{ caso_id, worker_id, briefing_original, aprendizado_conflitante, recomendacao_worker, decisao_chief }`
- **Output:** `{ dissenso_id }`

### 6. `atualizar-perfil-cliente`
- **Propósito:** adiciona/atualiza linha em `aprendizados_cliente_agente` (Tier 2).
- **Input:** `{ cliente_id, aprendizado_md, contexto_origem }`
- **Output:** `{ versao_atualizada }`

### 7. `montar-card-plano`
- **Propósito:** gera estrutura JSON do Card de Plano da Missão pro painel.
- **Input:** `{ diagnostico, squad: [{slug, papel}], proximos_passos, justificativa_curta }`
- **Output:** `{ card_id, render_url }`
- **UI:** painel renderiza card com botão Aprovar/Ajustar.

## Tools externas (APIs de mundo)

### 8. `openai-chat`
- **Propósito:** chamar LLM (gpt-5 padrão, fallback gpt-4o).
- **Input:** `{ messages, model?, temperature?, max_tokens? }`
- **Output:** `{ content, tokens_in, tokens_out }`
- **Auth:** chave do cofre via RPC `get_chave('OPENAI_API_KEY')`.
- **Restrição:** custo por execução logado em `pinguim.execucoes`. Se ultrapassar `limite_execucoes_dia`, kill switch ativa.

### 9. `cofre-get-chave`
- **Propósito:** busca chave de API no cofre (canônico).
- **Input:** `{ nome_chave }`
- **Output:** `{ valor }` (mascarado em logs)
- **Auth:** SERVICE_ROLE_KEY apenas.
- **Restrição:** Chief NUNCA expõe valor de chave em output ao cliente.

## Padrão de chamada

Toda tool é chamada via **OpenAI tool-calling estruturado** (formato `tools[]` na API). System prompt do Chief lista nome + descrição + schema. LLM decide qual chamar e quando.

## Allowlist (Squad Cyber)

Toda tool tem entrada explícita em `pinguim.tools_allowlist` com:
- `agente_id` (Chief)
- `tool_nome`
- `permitido` (bool)
- `limite_chamadas_dia`
- `auditoria` (bool — toda chamada loga em `pinguim.tool_invocacoes`)

Chief só pode chamar tools que estão na allowlist dele. Worker tem allowlist própria (Copywriter pode chamar `buscar-cerebro` mas não pode chamar `delegar-worker` — não delega).

## Modelos LLM

- **Padrão:** `openai:gpt-5` — raciocínio estratégico.
- **Fallback:** `openai:o3` — quando gpt-5 falha por timeout/rate limit.
- **Não usado pelo Chief:** `gpt-4o-mini` (Workers podem usar; Chief precisa do melhor).

Configuração via `pinguim.agentes.modelo` + `modelo_fallback`. Trocar pra `anthropic:claude-opus-4-7` é rotação de chave no cofre, sem deploy.

## Observações de segurança

- Chief NUNCA executa tool sem JWT válido (Squad Cyber).
- Toda tool externa (OpenAI, Anthropic, Apify, etc) passa pela cofre — Chief nunca lê env var direto.
- Auditoria em `pinguim.tool_invocacoes` é obrigatória.
- Princípio do menor privilégio: Chief tem **só** as tools listadas. Pra ganhar tool nova, precisa update no AGENT-CARD + revisão Squad Cyber.
