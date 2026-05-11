-- ============================================================
-- V2.14 D — AJUSTES Discord whitelist
-- ============================================================
-- 1. Remove papel 'cliente' (foi especulativo, não está no roadmap)
-- 2. Cadastra 3 sócios já encontrados no banco (Luiz, Micha) +
--    nota: Pedro/Codina entrarão via fallback automático no servidor Pinguim
-- 3. Servidor Pinguim ID: 1083429941300969574 — fica como configuração
--    do runtime (lib/discord-bot.js lê isso pra fallback de funcionário)
-- ============================================================

BEGIN;

-- 1) Ajusta CHECK constraint pra remover 'cliente'
ALTER TABLE pinguim.discord_autorizados
  DROP CONSTRAINT IF EXISTS discord_autorizados_papel_check;
ALTER TABLE pinguim.discord_autorizados
  ADD CONSTRAINT discord_autorizados_papel_check
  CHECK (papel IN ('socio', 'funcionario'));

-- 2) Cadastra sócios encontrados no banco
INSERT INTO pinguim.discord_autorizados
  (discord_user_id, papel, socio_slug, cliente_id, nome_discord, observacao)
VALUES
  (
    '866755912395915324',
    'socio',
    'luiz',
    (SELECT cliente_id FROM pinguim.socios WHERE slug='luiz' LIMIT 1),
    'Luiz Cota',
    'Sócio fundador estratégico Pinguim — capturado de discord_mensagens 2026-05-11'
  ),
  (
    '1076137318395691078',
    'socio',
    'micha',
    (SELECT cliente_id FROM pinguim.socios WHERE slug='micha' LIMIT 1),
    'michamenezes',
    'Sócio Pinguim — lo-fi/Reels/audiência — capturado de discord_mensagens 2026-05-11'
  )
ON CONFLICT (discord_user_id) DO UPDATE SET
  papel = EXCLUDED.papel,
  socio_slug = EXCLUDED.socio_slug,
  cliente_id = EXCLUDED.cliente_id,
  nome_discord = EXCLUDED.nome_discord,
  observacao = EXCLUDED.observacao,
  ativo = true,
  atualizado_em = now();

COMMIT;

-- Confirma estado final
SELECT discord_user_id, papel, socio_slug, nome_discord, ativo
  FROM pinguim.discord_autorizados
 ORDER BY papel, nome_discord;
