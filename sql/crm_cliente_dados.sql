-- ============================================================
-- Gestão dos dados do cliente (ficha → "Editar dados"), 2026-10-20.
-- A chave do cliente é cliente_id. Emails/telefones/CPF ficam em crm_cliente_identidade (um cliente tem vários).
-- Trocar o email PRINCIPAL não apaga o antigo: ele fica ligado como identidade, pra compras/boletos que ainda
-- chegarem com ele (Hotmart, Principia, sync dos apps) continuarem caindo no mesmo cliente.
-- ============================================================

create or replace function pinguim.crm_cliente_trocar_email(p_cliente uuid, p_novo text)
returns jsonb
language plpgsql
security definer
set search_path to 'pinguim', 'public'
as $fn$
declare
  v_novo text := lower(trim(coalesce(p_novo, '')));
  v_antigo text;
  v_dono uuid;
  v_dono_nome text;
begin
  if v_novo !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('ok', false, 'erro', 'Email inválido.');
  end if;
  select email_canon into v_antigo from crm_cliente where cliente_id = p_cliente for update;
  if not found then return jsonb_build_object('ok', false, 'erro', 'Cliente não encontrado.'); end if;
  if v_antigo = v_novo then return jsonb_build_object('ok', false, 'erro', 'Esse já é o email principal.'); end if;

  -- o email novo não pode ser de OUTRO cliente (aí é caso de juntar cadastros, não de trocar email)
  select i.cliente_id, c.nome into v_dono, v_dono_nome
    from crm_cliente_identidade i join crm_cliente c on c.cliente_id = i.cliente_id
   where i.tipo = 'email' and i.valor = v_novo and i.cliente_id <> p_cliente limit 1;
  if v_dono is null then
    select cliente_id, nome into v_dono, v_dono_nome from crm_cliente where email_canon = v_novo and cliente_id <> p_cliente limit 1;
  end if;
  if v_dono is not null then
    return jsonb_build_object('ok', false, 'erro', format('Esse email já é de outro cadastro (%s). Não dá pra trocar: os dois cadastros precisariam ser juntados.', coalesce(v_dono_nome, 'sem nome')), 'outro_cliente', v_dono);
  end if;

  -- garante que o antigo fica ligado como identidade (histórico) e liga o novo
  if v_antigo is not null then
    insert into crm_cliente_identidade (cliente_id, tipo, valor, confianca, origem)
      values (p_cliente, 'email', v_antigo, 'forte', 'antigo') on conflict (tipo, valor) do nothing;
  end if;
  insert into crm_cliente_identidade (cliente_id, tipo, valor, confianca, origem)
    values (p_cliente, 'email', v_novo, 'forte', 'manual') on conflict (tipo, valor) do nothing;
  update crm_cliente set email_canon = v_novo, atualizado_em = now() where cliente_id = p_cliente;

  return jsonb_build_object('ok', true, 'antigo', v_antigo, 'novo', v_novo);
end;
$fn$;

revoke all on function pinguim.crm_cliente_trocar_email(uuid, text) from public, anon, authenticated;

-- backfill (20/10): email/telefone principal sem identidade
-- registra como identidade o email/telefone principal de quem não tem (só acrescenta; conflito = já é de outro, ignora)
insert into pinguim.crm_cliente_identidade (cliente_id, tipo, valor, confianca, origem)
select c.cliente_id, 'email', c.email_canon, 'forte', 'cadastro' from pinguim.crm_cliente c
where c.email_canon is not null and c.merged_into is null
  and not exists (select 1 from pinguim.crm_cliente_identidade i where i.tipo='email' and i.valor=c.email_canon)
on conflict (tipo, valor) do nothing;
insert into pinguim.crm_cliente_identidade (cliente_id, tipo, valor, confianca, origem)
select c.cliente_id, 'tel', c.tel_canon, 'fraca', 'cadastro' from pinguim.crm_cliente c
where c.tel_canon is not null and length(c.tel_canon) >= 10 and c.merged_into is null
  and not exists (select 1 from pinguim.crm_cliente_identidade i where i.tipo='tel' and i.valor=c.tel_canon)
on conflict (tipo, valor) do nothing;
