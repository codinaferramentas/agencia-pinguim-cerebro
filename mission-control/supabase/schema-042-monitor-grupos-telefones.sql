-- ========================================================================
-- schema-042-monitor-grupos-telefones.sql
-- ========================================================================
-- O WhatsApp passou a identificar membros de grupo por LID (id interno,
-- ex. 260554711167228@lid) em vez do número. O consultor não faz nada com
-- LID — o alerta precisa do NÚMERO real (e do nome do ADM respondido).
-- O /group/participants da Evolution entrega o de-para: {id: @lid,
-- phoneNumber: 55...@s.whatsapp.net, admin, name}.
--
-- Este schema guarda o mapa completo de participantes no cache do grupo
-- (mesmo refresh 6h dos admins) + o telefone resolvido em cada mensagem.
-- ========================================================================

-- mapa completo lid -> {tel, nome, adm} (não só admins)
alter table pinguim.monitor_grupos
  add column if not exists participantes jsonb not null default '{}';

comment on column pinguim.monitor_grupos.participantes is
  'Mapa jid/lid -> {tel, nome, adm}. Cache do /group/participants (refresh lazy 6h junto com admins). Usado pra mostrar número real no alerta.';

-- telefone resolvido do remetente (consulta futura sem depender do cache)
alter table pinguim.monitor_grupos_mensagens
  add column if not exists remetente_telefone text;
