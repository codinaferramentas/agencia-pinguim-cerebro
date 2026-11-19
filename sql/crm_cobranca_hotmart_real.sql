-- Cobrança: a dívida conferida na própria Hotmart (André 19/11/2026, caso Beatriz Lustosa).
-- O robô (cobranca-worker) confere cada caso na API de assinaturas da Hotmart e guarda aqui o resultado.
-- Só é cobrado o que a Hotmart confirmar: assinatura viva com parcela vencida. O número daqui vale em todas as telas.
alter table pinguim.crm_cobranca
  add column if not exists hot_status text,          -- confirmada | cancelada | encerrada | sem_divida | nao_achou | erro
  add column if not exists hot_parcelas int,         -- parcelas vencidas na Hotmart (cada parcela conta uma vez)
  add column if not exists hot_valor numeric(12,2),  -- soma das parcelas vencidas
  add column if not exists hot_parcela numeric(12,2),-- valor de cada parcela (null se forem diferentes)
  add column if not exists hot_venc date,            -- vencimento estimado da parcela vencida mais antiga
  add column if not exists hot_motivo text,          -- explicação curta para a tela
  add column if not exists hot_em timestamptz,       -- quando foi conferido
  add column if not exists hot_assinatura jsonb;     -- assinaturas vistas na Hotmart [{conta, code, id, produto, status, vencidas, valor}]
