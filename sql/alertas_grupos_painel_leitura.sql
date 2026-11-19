-- Painel de leitura dos disparos em grupo (Andre 19/11).
-- O robô alertas-grupos-worker alimenta; o painel do CRM só LÊ.

-- 1) copy enviada em cada disparo (a partir de 19/11; antes disso fica null)
alter table pinguim.disparos_grupos_whatsapp add column if not exists mensagem text;

-- 2) foto do quadro do Trello (programação), atualizada pelo robô a cada 5 min
create table if not exists pinguim.alertas_grupos_cards (
  card_id        text primary key,
  nome           text not null,
  lista          text not null,          -- Segunda..Sexta, Avulso, Reserva, 🔁 Enviar Agora, Concluidos...
  hora           text,                   -- HH:MM do disparo
  dia_semana     text,                   -- dia citado no DISPARO (Segunda...), se houver
  data_explicita text,                   -- DD/MM (cards avulsos com data)
  grupos         text[] not null default '{}',  -- nomes dos grupos de destino
  links_desconhecidos int not null default 0,   -- links de grupo que o robô não conhece
  dona           text,                   -- 'Ingrid Nascimento' | 'Fernanda Lisboa'
  mensagem       text,                   -- copy como sai no WhatsApp
  problema       text,                   -- defeito que impede o disparo (null = ok)
  url            text,                   -- link do card no Trello
  atualizado_em  timestamptz not null default now(),
  removido_em    timestamptz             -- card arquivado/apagado do quadro
);
alter table pinguim.alertas_grupos_cards enable row level security;
comment on table pinguim.alertas_grupos_cards is 'Foto do quadro Trello "Agenda Pinguim" (programação dos avisos em grupo). Atualizada pelo alertas-grupos-worker a cada 5 min. Só leitura pro painel.';

-- 3) o que NÃO saiu e por quê (1 linha por card por dia, último motivo)
create table if not exists pinguim.alertas_grupos_pulos (
  id         bigserial primary key,
  data_ref   date not null,
  card_id    text not null,
  card_nome  text not null,
  lista      text not null,
  horario    text,
  motivo     text not null,
  registrado_em timestamptz not null default now(),
  unique (data_ref, card_id)
);
alter table pinguim.alertas_grupos_pulos enable row level security;
comment on table pinguim.alertas_grupos_pulos is 'Cards que estavam no horário e NÃO dispararam (sem agenda, sem MENSAGEM, freio...). Registrado pelo alertas-grupos-worker.';

-- 4) visão pronta pro painel: cada envio com a dona do grupo
create or replace view pinguim.vw_painel_disparos_grupos as
select d.id, d.data_ref, d.horario_previsto, d.enviado_em, d.tipo, d.status, d.erro, d.tentativas,
       d.card_id, d.card_nome, d.grupo_nome, d.grupo_jid, d.instancia_usada,
       coalesce(d.responsavel, case when g.instancia_override = 'EVOLUTION_INSTANCE_ELO_FERNANDA' then 'Fernanda Lisboa' else 'Ingrid Nascimento' end) as dona,
       d.agenda_confirmada, d.modo, d.mensagem
from pinguim.disparos_grupos_whatsapp d
left join pinguim.grupos_whatsapp_alertas g on g.jid_evolution = d.grupo_jid;
comment on view pinguim.vw_painel_disparos_grupos is 'Disparos em grupo (1 linha por card x grupo x dia) com a dona. Só leitura.';

alter view pinguim.vw_painel_disparos_grupos set (security_invoker = true);
revoke all on pinguim.vw_painel_disparos_grupos, pinguim.alertas_grupos_cards, pinguim.alertas_grupos_pulos from anon, authenticated;
