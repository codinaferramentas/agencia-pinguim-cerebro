-- Pós-call da Lyra (André 23/11/2026): depois de cada call individual da Lyra com o Micha, o aluno recebe o plano de ação
-- em PDF pelo WhatsApp da Fernanda e a próxima call já marcada (Agenda Inteligente); a Fernanda é avisada no #avisos-de-calls.
-- Robô: edge lyra-pos-call-worker (cron */5). Começa DESLIGADO (ativo=false) até o André aprovar o exemplo.
alter table pinguim.crm_call_mentoria
  add column if not exists poscall_status text,        -- enviado | pendente | sem_whatsapp | erro | teste
  add column if not exists poscall_em timestamptz,
  add column if not exists poscall_pdf_url text,        -- PDF do aluno (link compartilhado)
  add column if not exists poscall_agenda_id uuid,      -- linha em crm_agenda_sugestao da próxima call
  add column if not exists poscall_proxima jsonb,       -- {alvo, combinado, trecho, dia, ini, fim, motivo}
  add column if not exists poscall_erro text;

alter table pinguim.crm_call_mentoria_config
  add column if not exists poscall jsonb not null default '{}'::jsonb;

update pinguim.crm_call_mentoria_config set poscall = '{
  "ativo": false,
  "desde": "2026-11-23T00:00:00-03:00",
  "mentor": "Micha Menezes",
  "titulo_regex": "lyra",
  "dias_padrao": 30,
  "procura_ate_dias": 10,
  "via": "fernanda",
  "canal_avisos": "1542527780233682984",
  "fernanda_discord": "1210285892489449603",
  "espera_seg": 60,
  "modelo_data": "gpt-5.4-mini"
}'::jsonb where id = 1;

-- tipo de atendimento da Agenda Inteligente para a próxima call da Lyra (1 h)
update pinguim.crm_agenda_config set dados = jsonb_set(dados, '{tipos}',
  (coalesce(dados->'tipos', '[]'::jsonb) || '[{"id":"lyra","nome":"Lyra 1:1","dur":60,"cor":"outro"}]'::jsonb))
where id = 1 and not exists (select 1 from jsonb_array_elements(coalesce(dados->'tipos','[]'::jsonb)) t where t->>'id' = 'lyra');
