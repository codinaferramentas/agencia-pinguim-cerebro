-- ============================================================
-- schema-011-ajustes-categorias.sql
-- ============================================================
-- Ajustes pos-reuniao 2026-06-16:
--
-- 1) Funde chat_export -> chat_whatsapp (todos chats exportados vieram do WhatsApp)
-- 2) Default de status passa a ser SEMPRE 'sem_coleta', mesmo que ja tenha qtd_atual > 0
--    (carga inicial NAO conta como "rodando" — cerebro foi snapshot estatico)
-- 3) Reset de todos os planos existentes pra sem_coleta
-- ============================================================

-- 1) chat_whatsapp absorve os tipos do chat_export
UPDATE pinguim.cerebro_categorias_catalogo
   SET nome = 'Chat WhatsApp',
       descricao = 'Mensagens raspadas de grupos WhatsApp e exports de conversas',
       tipos_fonte = ARRAY['chat_export']::text[]
 WHERE slug = 'chat_whatsapp';

-- Remove chat_export do catalogo (e migra planos existentes pra chat_whatsapp via tabela primeiro)
-- IMPORTANT: precisa fazer DELETE dos planos pra evitar duplicata
DELETE FROM pinguim.cerebro_plano_categoria WHERE categoria_slug = 'chat_export';
DELETE FROM pinguim.cerebro_categorias_catalogo WHERE slug = 'chat_export';

-- 2) RPC: sempre 'sem_coleta' na 1a populacao (carga inicial NAO eh automacao rodando)
CREATE OR REPLACE FUNCTION pinguim.cerebro_plano_garantir(p_cerebro_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_cat record;
BEGIN
  FOR v_cat IN SELECT slug FROM pinguim.cerebro_categorias_catalogo WHERE ativa = true LOOP
    INSERT INTO pinguim.cerebro_plano_categoria (cerebro_id, categoria_slug, status_automacao)
    VALUES (p_cerebro_id, v_cat.slug, 'sem_coleta')
    ON CONFLICT (cerebro_id, categoria_slug) DO NOTHING;
  END LOOP;
END;
$$;

-- 3) RESET: zera todos os status pra sem_coleta (snapshot, nada rodando ainda)
UPDATE pinguim.cerebro_plano_categoria SET status_automacao = 'sem_coleta', atualizado_em = now();
