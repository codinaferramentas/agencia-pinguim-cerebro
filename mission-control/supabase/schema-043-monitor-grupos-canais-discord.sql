-- ========================================================================
-- schema-043-monitor-grupos-canais-discord.sql
-- ========================================================================
-- Alertas do monitor deixam de ir por DM e passam pro CANAL do grupo no
-- Discord (servidor Agência Pinguim) — 1 tag por produto, criadas pelo
-- Andre em 02/09/2026. DM do trio (Codina/Ingrid/Fernanda) vira fallback
-- quando o grupo não tem canal ou o post no canal falhar.
--
-- Mapeamento (10 grupos -> 6 canais; produto e AVISOS dividem o canal):
--   ⚠️ AVISOS | ELO não tem canal próprio — apontado provisoriamente pro
--   #cancelamento-elo. Trocar = UPDATE nesta coluna, sem deploy.
-- ========================================================================

alter table pinguim.monitor_grupos
  add column if not exists discord_canal_id text;

comment on column pinguim.monitor_grupos.discord_canal_id is
  'Canal do Discord (Agência Pinguim) que recebe os alertas deste grupo. NULL = DM do trio.';

update pinguim.monitor_grupos set discord_canal_id = c.canal
from (values
  ('120363280109272973@g.us', '1544735427628372060'), -- Mentoria Lyra        -> #mentoria-lyra
  ('120363047914232526@g.us', '1544734833400483881'), -- TAURUS MASTER        -> #taurus-master
  ('120363234409119884@g.us', '1544734833400483881'), -- TAURUS MASTER|AVISOS -> #taurus-master
  ('120363428096569113@g.us', '1544719028705034310'), -- TAURUS LT            -> #taurus-lt
  ('120363410414674397@g.us', '1544719028705034310'), -- TAURUS LT|AVISOS     -> #taurus-lt
  ('120363023412559361@g.us', '1544735941883732048'), -- MASTERMIND ORION     -> #orion-mastermind
  ('120363404699753723@g.us', '1544718622683959326'), -- ProAlt Low Ticket    -> #proalt
  ('120363422978864965@g.us', '1544718622683959326'), -- AVISOS|ProAlt LT     -> #proalt
  ('120363422749349891@g.us', '1544735324784168960'), -- CANCELAMENTO|ELO     -> #cancelamento-elo
  ('120363407812977432@g.us', '1544735324784168960')  -- AVISOS|ELO (provisório) -> #cancelamento-elo
) as c(jid, canal)
where monitor_grupos.jid = c.jid;
