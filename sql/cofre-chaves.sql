-- =====================================================================
-- Cofre de chaves Pinguim OS — gestao manual (fonte canonica de verdade)
-- =====================================================================
-- Pra que serve: o Andre (e cliente Pinguim OS no futuro) cadastra aqui
-- todas as chaves que existem no projeto deles (Vercel/Cloudflare/AWS/etc).
-- O painel mostra mascarado; valor cheio so via service_role.
--
-- Por que nao usar Vercel API direto: plano Hobby nao retorna env vars
-- via REST API. Solucao: cofre proprio, agnostico de provedor.

create table if not exists pinguim.cofre_chaves (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                    -- ex: OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY
  provedor text not null,                -- 'OpenAI' | 'Anthropic' | 'Supabase' | 'Vercel' | 'Stripe' | 'Outro'
  escopo text not null default 'secret', -- 'public' | 'secret' | 'admin'
  onde_vive text not null,               -- 'vercel-env' | 'supabase-secret' | 'github-secret' | '.env.local' | 'outro'
  valor_completo text,                   -- valor real (criptografado por RLS — so service_role acessa)
  ultimos_4 text,                        -- ultimos 4 chars pra mostrar no painel mascarado
  descricao text,
  criado_em_provedor timestamptz,        -- quando foi criada no provedor (info do dono)
  ultima_rotacao timestamptz,            -- quando foi rotacionada pela ultima vez
  ativo boolean not null default true,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists cofre_chaves_nome_idx on pinguim.cofre_chaves(nome);
create index if not exists cofre_chaves_provedor_idx on pinguim.cofre_chaves(provedor) where ativo = true;
create index if not exists cofre_chaves_rotacao_idx on pinguim.cofre_chaves(ultima_rotacao) where ativo = true;

-- RLS: usuario autenticado le META (sem valor_completo); so service_role le tudo
alter table pinguim.cofre_chaves enable row level security;

drop policy if exists cofre_chaves_select on pinguim.cofre_chaves;
create policy cofre_chaves_select on pinguim.cofre_chaves
  for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists cofre_chaves_insert on pinguim.cofre_chaves;
create policy cofre_chaves_insert on pinguim.cofre_chaves
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists cofre_chaves_update on pinguim.cofre_chaves;
create policy cofre_chaves_update on pinguim.cofre_chaves
  for update using (auth.role() = 'authenticated' or auth.role() = 'service_role')
            with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists cofre_chaves_delete on pinguim.cofre_chaves;
create policy cofre_chaves_delete on pinguim.cofre_chaves
  for delete using (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- View pra o painel: NUNCA expoe valor_completo, so meta + ultimos_4
create or replace view pinguim.vw_cofre_chaves as
select
  id,
  nome,
  provedor,
  escopo,
  onde_vive,
  ultimos_4,
  descricao,
  criado_em_provedor,
  ultima_rotacao,
  ativo,
  observacoes,
  case
    when ultima_rotacao is null then null
    else extract(day from now() - ultima_rotacao)::integer
  end as dias_desde_ultima_rotacao,
  criado_em,
  atualizado_em
from pinguim.cofre_chaves;

-- Trigger pra atualizar ultimos_4 + atualizado_em automaticamente
create or replace function pinguim.fn_cofre_chaves_atualizar()
returns trigger language plpgsql as $$
begin
  if new.valor_completo is not null and length(new.valor_completo) >= 4 then
    new.ultimos_4 := right(new.valor_completo, 4);
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_cofre_chaves_atualizar on pinguim.cofre_chaves;
create trigger trg_cofre_chaves_atualizar
  before insert or update on pinguim.cofre_chaves
  for each row execute function pinguim.fn_cofre_chaves_atualizar();
