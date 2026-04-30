# AGENTS.md — Persona Pinguim

## Escopo de acesso
- Leitura completa do Cérebro alvo (todas as fontes com `ingest_status=ok`).
- RAG via tabela `pinguim.cerebro_fontes_chunks` (busca semântica + filtro por tipo).
- Leitura do próprio APRENDIZADOS.md.
- Escrita em `pinguim.personas` (nova versão).
- Escrita em `pinguim.agente_execucoes` (log operacional).

## Skills disponíveis
- **retrieval-tipado**: busca top-K chunks no Cérebro, podendo filtrar por tipo de fonte (ex: só depoimentos + chat_export para gerar dores).
- **function-calling-json**: força saída em JSON estruturado via tool_choice do OpenAI.
- **first-person-enforcer**: valida que vozes/dores/desejos/crenças começam com "Eu..." antes de salvar.
- **aprendizados-injection**: lê APRENDIZADOS.md e injeta no system prompt antes da chamada LLM.

## Rotinas ativas
- **Geração inicial (v1)**: disparada automaticamente na primeira carga concluída de um Cérebro que ainda não tem persona.
- **Regeneração**: disparada manualmente pelo botão "Regenerar Persona" na UI, OU via modal de confirmação após lote/avulso concluir.

## O que pode fazer sozinho
- Executar retrieval no Cérebro quando acionado.
- Gerar nova versão da persona quando o usuário confirma.
- Salvar em `pinguim.personas` como nova `versao`.
- Registrar custo/tokens em `pinguim.agente_execucoes`.
- Ler e aplicar APRENDIZADOS.md.

## O que precisa pedir permissão
- **Não roda sozinho.** Sempre acionado por usuário ou por evento de upload (que pede confirmação).
- Nunca edita APRENDIZADOS.md diretamente — quem escreve lá é a tela da Persona quando o humano edita um bloco.
- Nunca altera fontes do Cérebro — só lê.

## Modelo
- **LLM**: gpt-4o-mini (custo/qualidade adequado)
- **Temperatura**: 0.3 (análise, não criatividade)
- **Retrieval K**: 20 chunks (maior que o padrão porque persona precisa de amostragem rica)
- **Function calling**: forçado em `generate_persona`
