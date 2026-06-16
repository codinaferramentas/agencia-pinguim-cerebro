-- ============================================================
-- schema-012-categoria-email-e-google-conexoes.sql
-- ============================================================
-- Ajustes 2026-06-16:
--
-- 1) Adiciona categoria 'email' no catalogo de fontes
-- 2) Limpa cofre_chaves de google-drive e google-gmail
--    (verificacao real eh por conta em pinguim.conexoes_google, nao por chave estatica)
-- 3) Auto-popula categoria email nos 10 cerebros (status sem_coleta)
-- ============================================================

-- 1) Nova categoria 'email'
INSERT INTO pinguim.cerebro_categorias_catalogo (slug, nome, emoji, descricao, tipos_fonte, ordem) VALUES
  ('email', 'Emails', '📧', 'Emails relevantes raspados de caixas Google conectadas (com filtros)', ARRAY[]::text[], 7)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  emoji = EXCLUDED.emoji,
  descricao = EXCLUDED.descricao,
  tipos_fonte = EXCLUDED.tipos_fonte,
  ordem = EXCLUDED.ordem;

-- Reordena pra email ficar entre csv e pesquisas
UPDATE pinguim.cerebro_categorias_catalogo SET ordem = 1  WHERE slug = 'aulas';
UPDATE pinguim.cerebro_categorias_catalogo SET ordem = 2  WHERE slug = 'transcricoes_call';
UPDATE pinguim.cerebro_categorias_catalogo SET ordem = 3  WHERE slug = 'transcricoes_aula_ao_vivo';
UPDATE pinguim.cerebro_categorias_catalogo SET ordem = 4  WHERE slug = 'depoimentos';
UPDATE pinguim.cerebro_categorias_catalogo SET ordem = 5  WHERE slug = 'paginas_venda';
UPDATE pinguim.cerebro_categorias_catalogo SET ordem = 6  WHERE slug = 'csv';
UPDATE pinguim.cerebro_categorias_catalogo SET ordem = 7  WHERE slug = 'email';
UPDATE pinguim.cerebro_categorias_catalogo SET ordem = 8  WHERE slug = 'pesquisas';
UPDATE pinguim.cerebro_categorias_catalogo SET ordem = 9  WHERE slug = 'chat_whatsapp';
UPDATE pinguim.cerebro_categorias_catalogo SET ordem = 10 WHERE slug = 'chat_discord';
UPDATE pinguim.cerebro_categorias_catalogo SET ordem = 99 WHERE slug = 'outros';

-- 2) Limpa cofre_chaves do Google (verificacao real eh por conexoes_google)
UPDATE pinguim.integracoes_catalogo
   SET cofre_chaves = ARRAY[]::text[],
       descricao    = 'Google Drive (ler+editar arquivos). Conectado via OAuth multi-conta — cada caixa autoriza Drive+Gmail+Calendar de uma vez.'
 WHERE slug = 'google-drive';

UPDATE pinguim.integracoes_catalogo
   SET cofre_chaves = ARRAY[]::text[],
       descricao    = 'Gmail (ler+responder+modificar). Conectado via OAuth multi-conta — cada caixa autoriza Drive+Gmail+Calendar de uma vez.'
 WHERE slug = 'google-gmail';

-- 3) Adiciona integracao 'google-calendar' (faltava no catalogo, mesma autorizacao)
INSERT INTO pinguim.integracoes_catalogo (slug, nome, descricao, categoria, emoji, ativa, tipo_dado, exemplo_uso, cobertura_cerebros, cofre_chaves) VALUES
  ('google-calendar', 'Google Calendar', 'Calendar (ler+criar+editar eventos). Conectado via OAuth multi-conta — cada caixa autoriza Drive+Gmail+Calendar de uma vez.', 'docs', '📅', true, 'estruturado', 'Le agenda do sócio + cria/edita eventos', 'por-socio', ARRAY[]::text[])
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  emoji = EXCLUDED.emoji,
  ativa = EXCLUDED.ativa,
  cofre_chaves = EXCLUDED.cofre_chaves;

-- 4) Garante plano de todos os cerebros (inclui categoria email nova)
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT id FROM pinguim.cerebros LOOP
    PERFORM pinguim.cerebro_plano_garantir(c.id);
  END LOOP;
END;
$$;
