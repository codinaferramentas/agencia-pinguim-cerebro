-- ========================================================================
-- FIX: Grants de DELETE pro anon/authenticated (V0 sem auth real)
-- ========================================================================
-- Causa raiz: fix-grants-anon.sql original só deu SELECT/INSERT/UPDATE.
-- Sem DELETE, o painel chamava sb.from(...).delete() e a API retornava
-- erro silencioso (204 sem efeito), mas o código JS não checava error.
-- Usuário via modal fechar e achava que apagou. Banco ficava intacto.
-- ========================================================================

grant delete on pinguim.cerebro_fontes to anon, authenticated;
grant delete on pinguim.cerebro_fontes_chunks to anon, authenticated;
grant delete on pinguim.ingest_arquivos to anon, authenticated;
grant delete on pinguim.ingest_lotes to anon, authenticated;

-- Default privileges pra tabelas novas (consistência)
alter default privileges in schema pinguim
  grant delete on tables to anon, authenticated;

-- Verificação rápida (opcional — rodar no fim pra conferir)
-- select grantee, table_name, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'pinguim'
--   and grantee in ('anon', 'authenticated')
--   and privilege_type = 'DELETE'
-- order by table_name, grantee;
