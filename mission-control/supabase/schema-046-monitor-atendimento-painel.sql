-- ========================================================================
-- schema-046-monitor-atendimento-painel.sql
-- ========================================================================
-- Painel CS v2 (feedback Andre 09/11/2026):
--   · código por solicitação (A-0412) pra referenciar no Discord
--   · horário de atendimento seg-sex 9h-18h BRT: tempo de resposta conta só
--     horas úteis; solicitação fora do horário é marcada (🌙)
--   · SLA: pendente há mais de sla_min úteis → alerta no #painel-cs (cron
--     10 min) e 🔴 no painel da manhã
--   · canal genérico: grupo hoje, número privado (fase 2) depois
-- ========================================================================

-- ---------- config ----------
alter table pinguim.monitor_atendimento_config
  add column if not exists dias_uteis int[] not null default '{1,2,3,4,5}',  -- isodow (1=seg)
  add column if not exists hora_ini int not null default 9,
  add column if not exists hora_fim int not null default 18,
  add column if not exists sla_min int not null default 120,
  add column if not exists alerta_sla_ativo boolean not null default true,
  add column if not exists sla_desde timestamptz not null default now();     -- não alerta backlog antigo
comment on column pinguim.monitor_atendimento_config.sla_min is
  'Minutos ÚTEIS sem resposta de ADM até virar 🔴 e gerar alerta no canal.';

-- ---------- atendimentos ----------
create sequence if not exists pinguim.monitor_atendimentos_numero_seq;
alter table pinguim.monitor_atendimentos
  add column if not exists numero int,
  add column if not exists canal_tipo text not null default 'grupo' check (canal_tipo in ('grupo','privado')),
  add column if not exists fora_horario boolean not null default false,
  add column if not exists tempo_util_seg int,
  add column if not exists alerta_sla_em timestamptz;

-- numera o que já existe em ordem cronológica, depois liga a sequence
do $$
begin
  if exists (select 1 from pinguim.monitor_atendimentos where numero is null) then
    with o as (select id, row_number() over (order by perguntado_em) n
               from pinguim.monitor_atendimentos where numero is null)
    update pinguim.monitor_atendimentos a
       set numero = o.n + coalesce((select max(numero) from pinguim.monitor_atendimentos), 0)
      from o where a.id = o.id;
  end if;
  perform setval('pinguim.monitor_atendimentos_numero_seq',
                 greatest(coalesce((select max(numero) from pinguim.monitor_atendimentos), 0), 1));
end $$;
alter table pinguim.monitor_atendimentos
  alter column numero set default nextval('pinguim.monitor_atendimentos_numero_seq');
create unique index if not exists idx_monitor_atend_numero on pinguim.monitor_atendimentos (numero);

-- ---------- horas úteis (BRT, conforme config) ----------
create or replace function pinguim.monitor_segundos_uteis(p_ini timestamptz, p_fim timestamptz)
returns int language plpgsql stable as $$
declare
  c record; d date; s numeric := 0;
  a timestamp; b timestamp; li timestamp; lf timestamp;
begin
  if p_ini is null or p_fim is null or p_fim <= p_ini then return 0; end if;
  select dias_uteis, hora_ini, hora_fim into c from pinguim.monitor_atendimento_config where id = 1;
  a := p_ini at time zone 'America/Sao_Paulo';
  b := p_fim at time zone 'America/Sao_Paulo';
  d := a::date;
  while d <= b::date loop
    if extract(isodow from d)::int = any(c.dias_uteis) then
      li := greatest(a, d + make_interval(hours => c.hora_ini));
      lf := least(b, d + make_interval(hours => c.hora_fim));
      if lf > li then s := s + extract(epoch from lf - li); end if;
    end if;
    d := d + 1;
  end loop;
  return s::int;
end $$;

create or replace function pinguim.monitor_fora_horario(p_ts timestamptz)
returns boolean language sql stable as $$
  select not (extract(isodow from (p_ts at time zone 'America/Sao_Paulo'))::int = any(c.dias_uteis)
              and extract(hour from (p_ts at time zone 'America/Sao_Paulo'))::int >= c.hora_ini
              and extract(hour from (p_ts at time zone 'America/Sao_Paulo'))::int <  c.hora_fim)
  from pinguim.monitor_atendimento_config c where c.id = 1
$$;

-- trigger: marca fora do horário na abertura e calcula tempo útil ao responder
create or replace function pinguim.monitor_atendimento_tempos()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.fora_horario := coalesce(pinguim.monitor_fora_horario(new.perguntado_em), false);
  end if;
  if new.respondido_em is not null and (tg_op = 'INSERT' or old.respondido_em is distinct from new.respondido_em) then
    new.tempo_util_seg := pinguim.monitor_segundos_uteis(new.perguntado_em, new.respondido_em);
  end if;
  return new;
end $$;
drop trigger if exists trg_monitor_atendimento_tempos on pinguim.monitor_atendimentos;
create trigger trg_monitor_atendimento_tempos
  before insert or update on pinguim.monitor_atendimentos
  for each row execute function pinguim.monitor_atendimento_tempos();

-- recalcula o histórico
update pinguim.monitor_atendimentos set
  fora_horario = coalesce(pinguim.monitor_fora_horario(perguntado_em), false),
  tempo_util_seg = case when respondido_em is null then null
                        else pinguim.monitor_segundos_uteis(perguntado_em, respondido_em) end;

-- ---------- cron do alerta de SLA (10 em 10 min, mesma edge do resumo) ----------
create or replace function pinguim.disparar_monitor_sla()
returns bigint language plpgsql security definer
set search_path to 'pinguim', 'vault', 'pg_catalog', 'pg_temp' as $$
declare request_id bigint; service_key text;
begin
  select decrypted_secret into service_key from vault.decrypted_secrets where name = 'pinguim_service_role_key' limit 1;
  if service_key is null then return 0; end if;
  select net.http_post(
    url := 'https://wmelierxzpjamiofeemh.supabase.co/functions/v1/monitor-atendimento-resumo',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body := '{"modo":"sla"}'::jsonb,
    timeout_milliseconds := 60000) into request_id;
  return request_id;
end $$;
revoke all on function pinguim.disparar_monitor_sla() from public, anon, authenticated;

-- 09/11: 2 checkpoints/dia útil 11h e 15h BRT (era */10 — bola de neve)
select cron.schedule('monitor-atendimento-sla', '0 14,18 * * 1-5', $$select pinguim.disparar_monitor_sla()$$);
