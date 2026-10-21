-- 21/10: o crm-sync-vendas grava o código HP só em id_externo; transaction_code ficava vazio em toda compra
-- nova (desde set/26). Sem ele, o botão "Reembolsar na Hotmart" e o bot de cancelamento não acham a venda.
-- Trigger preenche na gravação + backfill só das linhas vazias (não sobrescreve nada).
create or replace function pinguim.crm_compra_preenche_tx() returns trigger language plpgsql as $$
begin
  if new.transaction_code is null and new.origem = 'hotmart' and new.id_externo ~ '^HP' then
    new.transaction_code := new.id_externo;
  end if;
  return new;
end $$;
drop trigger if exists trg_crm_compra_tx on pinguim.crm_compra;
create trigger trg_crm_compra_tx before insert or update on pinguim.crm_compra
  for each row execute function pinguim.crm_compra_preenche_tx();

update pinguim.crm_compra set transaction_code = id_externo
 where transaction_code is null and origem = 'hotmart' and id_externo ~ '^HP';
