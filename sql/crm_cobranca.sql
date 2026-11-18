-- ============================================================
-- Gestão de Cobrança (CRM /cobranca) — 18/11/2026
-- ============================================================
-- Parcelas recorrentes em aberto (ProAlt, Taurus, Orion, Lyra, Elo), lidas das compras da Hotmart.
-- Um «caso» = cliente + produto + vencimento da parcela mais antiga em aberto. Enquanto a dívida
-- for a mesma, o caso é o mesmo (o alerta sai uma única vez). Pagou e atrasou de novo = caso novo.
--
--  crm_cobranca_config  → regras da tela (prazos, ritmo, copy) + trava de envio
--  crm_cobranca         → o caso: leitura do dia, etapa manual, alerta, aviso de pausa, fechamento
--  crm_cobranca_evento  → histórico do caso e «Atividade do robô»
--  Notas do aluno       → pinguim.crm_anotacao (tipo 'nota', origem 'cobranca'): aparecem também na ficha.
--
-- O sistema só AVISA sobre pausa de acesso. Não tira acesso de app, de área de membros nem remove de grupo.
-- ============================================================

create table if not exists pinguim.crm_cobranca_config (
  id integer primary key default 1 check (id = 1),
  dados jsonb not null default '{}'::jsonb,
  estado jsonb not null default '{}'::jsonb,   -- { fila_dia, aprovado_dia, aprovado_por }
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
insert into pinguim.crm_cobranca_config (id) values (1) on conflict do nothing;

create table if not exists pinguim.crm_cobranca (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,
  produto_nome text not null,
  venc date not null,
  -- leitura mais recente da Hotmart
  formas text, n_abertas integer, parcela numeric, total numeric, n_pagas integer, ult_pago date, dias integer,
  lido_em timestamptz not null default now(),
  -- etapa posta à mão pela tutora: 'alerta' (avisou por fora), 'negociando', 'pago' (pagou por fora)
  manual text check (manual in ('alerta', 'negociando', 'pago')),
  manual_em timestamptz, manual_por text,
  -- alerta por WhatsApp (uma vez por caso)
  alerta_em timestamptz, alerta_status text, alerta_erro text, alerta_via text, alerta_para text, alerta_texto text, alerta_por text,
  alerta_tentativas integer not null default 0,
  fila_dia date, fila_em timestamptz,
  -- aviso interno de pausa (Discord)
  pausa_em timestamptz, pausa_status text, pausa_erro text,
  -- caso encerrado: 'pago' (a Hotmart confirmou) ou 'saiu' (cancelado, reembolsado ou fora da janela)
  fechado_em timestamptz, fechado_motivo text,
  criado_em timestamptz not null default now(),
  unique (cliente_id, produto_nome, venc)
);
create index if not exists crm_cobranca_abertos on pinguim.crm_cobranca (fechado_em) where fechado_em is null;
create index if not exists crm_cobranca_cliente on pinguim.crm_cobranca (cliente_id);

create table if not exists pinguim.crm_cobranca_evento (
  id bigserial primary key,
  cobranca_id uuid references pinguim.crm_cobranca(id) on delete cascade,
  tipo text not null,          -- leitura | alerta | erro | pausa | movido | pago | config | fila
  texto text not null,
  por text,                    -- 'robô' ou o nome de quem fez
  criado_em timestamptz not null default now()
);
create index if not exists crm_cobranca_evento_caso on pinguim.crm_cobranca_evento (cobranca_id, criado_em);
create index if not exists crm_cobranca_evento_data on pinguim.crm_cobranca_evento (criado_em desc);

alter table pinguim.crm_cobranca_config enable row level security;
alter table pinguim.crm_cobranca enable row level security;
alter table pinguim.crm_cobranca_evento enable row level security;
revoke all on pinguim.crm_cobranca_config, pinguim.crm_cobranca, pinguim.crm_cobranca_evento from anon, authenticated;
grant all on pinguim.crm_cobranca_config, pinguim.crm_cobranca, pinguim.crm_cobranca_evento to service_role;
grant usage, select on sequence pinguim.crm_cobranca_evento_id_seq to service_role;

-- Leitura da dívida: por cliente + produto, os dias com cobrança em aberto depois do último pagamento.
-- Só entra quem já pagou alguma parcela, não cancelou nem pediu reembolso, e está com 1 a 150 dias de atraso.
create or replace view pinguim.crm_cobranca_leitura as
with c as (
  select cliente_id, produto_nome, (data_compra at time zone 'America/Sao_Paulo')::date d, status, payment_type, valor_brl
  from pinguim.crm_compra
  where produto_nome ~* '(proalt|taurus|orion|lyra|elo|express)' and data_compra > now() - interval '15 months' and cliente_id is not null
), dia as (
  select cliente_id, produto_nome, d,
    bool_or(status in ('approved','completed')) pago,
    bool_or(status in ('delayed','billet_printed','waiting_payment','expired')) aberto,
    bool_or(status in ('refunded','canceled','chargeback','dispute')) saiu,
    max(valor_brl) valor, string_agg(distinct payment_type, '+') formas
  from c group by 1,2,3
), r as (
  select *, max(d) filter (where pago) over (partition by cliente_id, produto_nome) ult_pago,
    count(*) filter (where pago) over (partition by cliente_id, produto_nome) n_pagas,
    bool_or(saiu) over (partition by cliente_id, produto_nome) teve_saida
  from dia
), ab as (
  select cliente_id, produto_nome, min(d) venc, count(distinct date_trunc('month', d))::int n_abertas, max(valor) parcela,
    max(n_pagas)::int n_pagas, max(ult_pago) ult_pago, string_agg(distinct formas, '+') formas, bool_or(teve_saida) teve_saida
  from r where aberto and not pago and (ult_pago is null or d > ult_pago) group by 1,2
)
select ab.cliente_id, ab.produto_nome, ab.venc, ab.formas, ab.n_abertas, ab.parcela, ab.n_abertas * ab.parcela total, ab.n_pagas, ab.ult_pago,
       ((now() at time zone 'America/Sao_Paulo')::date - ab.venc) dias
from ab join pinguim.crm_cliente cl on cl.cliente_id = ab.cliente_id and cl.merged_into is null
where not ab.teve_saida and ab.n_pagas > 0 and ((now() at time zone 'America/Sao_Paulo')::date - ab.venc) between 1 and 150;
revoke all on pinguim.crm_cobranca_leitura from anon, authenticated;
grant select on pinguim.crm_cobranca_leitura to service_role;

-- Traz a leitura para a tabela de casos: abre os novos, atualiza os que seguem em aberto e fecha os que saíram.
create or replace function pinguim.crm_cobranca_sincronizar() returns jsonb
language plpgsql security definer set search_path to 'pinguim', 'extensions', 'public' as $$
declare v_abertos int; v_pagos int := 0; v_saiu int := 0; r record;
begin
  perform pg_advisory_xact_lock(hashtext('crm_cobranca_sincronizar'));
  create temp table _cob_l on commit drop as select * from pinguim.crm_cobranca_leitura;

  insert into pinguim.crm_cobranca (cliente_id, produto_nome, venc, formas, n_abertas, parcela, total, n_pagas, ult_pago, dias, lido_em)
  select cliente_id, produto_nome, venc, formas, n_abertas, parcela, total, n_pagas, ult_pago, dias, now() from _cob_l
  on conflict (cliente_id, produto_nome, venc) do update
    set formas = excluded.formas, n_abertas = excluded.n_abertas, parcela = excluded.parcela, total = excluded.total,
        n_pagas = excluded.n_pagas, ult_pago = excluded.ult_pago, dias = excluded.dias, lido_em = now(),
        fechado_em = null, fechado_motivo = null;
  select count(*) into v_abertos from _cob_l;

  for r in
    update pinguim.crm_cobranca c
      set fechado_em = now(),
          fechado_motivo = case when exists (
            select 1 from pinguim.crm_compra k where k.cliente_id = c.cliente_id and k.produto_nome = c.produto_nome
              and k.status in ('approved','completed') and (k.data_compra at time zone 'America/Sao_Paulo')::date >= c.venc) then 'pago' else 'saiu' end
      where c.fechado_em is null
        and not exists (select 1 from _cob_l l where l.cliente_id = c.cliente_id and l.produto_nome = c.produto_nome and l.venc = c.venc)
      returning c.id, c.fechado_motivo, c.total
  loop
    if r.fechado_motivo = 'pago' then
      v_pagos := v_pagos + 1;
      insert into pinguim.crm_cobranca_evento (cobranca_id, tipo, texto, por) values (r.id, 'pago', 'Pagamento confirmado na Hotmart', 'robô');
    else
      v_saiu := v_saiu + 1;
      insert into pinguim.crm_cobranca_evento (cobranca_id, tipo, texto, por) values (r.id, 'saiu', 'Saiu da cobrança: assinatura cancelada, reembolsada ou fora da janela de 150 dias', 'robô');
    end if;
  end loop;
  return jsonb_build_object('abertos', v_abertos, 'pagos', v_pagos, 'saiu', v_saiu);
end;
$$;
revoke all on function pinguim.crm_cobranca_sincronizar() from public, anon, authenticated;
grant execute on function pinguim.crm_cobranca_sincronizar() to service_role;

-- Notas registradas pela tela de cobrança ficam na mesma tabela das notas da ficha (origem 'cobranca').
alter table pinguim.crm_anotacao drop constraint if exists crm_anotacao_origem_check;
alter table pinguim.crm_anotacao add constraint crm_anotacao_origem_check check (origem = any (array['crm', 'painel', 'carga_inicial', 'cobranca']));

-- Robô da cobrança: roda a cada 2 minutos das 8h às 20h59 (Brasília). Com config.envio desligado, só faz a leitura.
select cron.schedule('cobranca-worker', '*/2 11-23 * * *', $$select pinguim.disparar_edge_function('cobranca-worker')$$);
