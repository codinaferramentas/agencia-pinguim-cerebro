-- ========================================================================
-- schema-048-monitor-privado-so-aluno.sql
-- ========================================================================
-- Privado dos números de CS: só ALUNO vira atendimento (feedback Andre
-- 09/11/2026 — conversa pessoal/de equipe não pode cair no painel).
--
--   equipe       = ADM de qualquer grupo (crm_grupo_presenca.eh_admin) ou um
--                  dos números de atendimento → ignorado (nem grava)
--   aluno        = telefone no CRM (crm_cliente_identidade tipo tel) ou
--                  membro de grupo de alunos (crm_grupo_presenca) — cobre quem
--                  pagou por Pix e só está no grupo
--   desconhecido = resto (amigo, família, fornecedor) → ignorado (nem grava)
--
-- Telefone canônico do CRM = DDD + últimos 8 dígitos (10 dígitos, sem 55).
-- ========================================================================

create or replace function pinguim.monitor_tel_canon(p_tel text)
returns text language sql immutable as $$
  select case when length(d2) >= 10 then left(d2, 2) || right(d2, 8) end
  from (select case when d like '55%' and length(d) in (12, 13) then substr(d, 3) else d end d2
        from (select regexp_replace(coalesce(p_tel, ''), '\D', '', 'g') d) x) y
$$;

create or replace function pinguim.monitor_classificar_contato(p_tel text)
returns text language sql stable as $$
  with t as (select pinguim.monitor_tel_canon(p_tel) canon)
  select case
    when t.canon is null then 'desconhecido'
    when exists (select 1 from pinguim.crm_grupo_presenca g where g.eh_admin and g.telefone = t.canon)
      or exists (select 1 from pinguim.monitor_instancias i where pinguim.monitor_tel_canon(i.telefone) = t.canon)
      then 'equipe'
    when exists (select 1 from pinguim.crm_cliente_identidade c where c.tipo = 'tel' and c.valor = t.canon)
      or exists (select 1 from pinguim.crm_grupo_presenca g where g.telefone = t.canon)
      then 'aluno'
    else 'desconhecido' end
  from t
$$;
comment on function pinguim.monitor_classificar_contato(text) is
  'equipe | aluno | desconhecido — decide se uma conversa privada num número de CS vira atendimento.';
