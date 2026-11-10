-- ========================================================================
-- schema-049-monitor-privado-filtro-ia.sql
-- ========================================================================
-- Filtro de IA no PRIVADO (feedback Andre 10/11/2026, 1º painel das 8h):
-- confirmações de onboarding ("Feito!", "Respondi", "preenchi e seguimos")
-- apareceram como pendência. Agora cada conversa de aluno passa por um
-- classificador (OpenAI gpt-5.4-mini, chave OPENAI_API_KEY do cofre) com a
-- conversa recente como contexto:
--   precisa_resposta = true  → status 'pendente' (entra no painel e no SLA)
--   precisa_resposta = false → status 'descartada' (fica no banco, painel só
--                              mostra a contagem "filtradas")
-- Reclassifica a cada nova msg do aluno enquanto ninguém respondeu.
-- IA fora do ar → 'pendente' (melhor sobrar que sumir pedido).
-- Testado em 11 casos (7 reais de 09/11 + 4 sintéticos): 11/11 certos.
-- ========================================================================

alter table pinguim.monitor_atendimentos drop constraint if exists monitor_atendimentos_status_check;
alter table pinguim.monitor_atendimentos add constraint monitor_atendimentos_status_check
  check (status in ('pendente','respondida','descartada'));

alter table pinguim.monitor_atendimentos
  add column if not exists filtro text check (filtro in ('pedido','sem_pedido','erro')),
  add column if not exists filtro_motivo text,
  add column if not exists resumo text;   -- o pedido em 1 frase (painel do privado)

comment on column pinguim.monitor_atendimentos.filtro is
  'Classificação da IA no privado: pedido | sem_pedido | erro (IA falhou → tratado como pedido).';
