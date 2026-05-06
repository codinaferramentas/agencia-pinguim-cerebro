WITH chief AS (SELECT id FROM pinguim.agentes WHERE slug='chief')
INSERT INTO pinguim.aprendizados_cliente_agente (agente_id, cliente_id, tenant_id, conteudo_md, versao)
SELECT chief.id,
       'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
       '00000000-0000-0000-0000-000000000001'::uuid,
       $perfil$# Perfil — André Codina

Sócio da Dolphin. Parceiro de dev do projeto Pinguim OS.

## Estilo de aprovação
- Reverte decisões quando conselho não cobriu uma dimensão.
- Aprovações curtas: vai, ok, manda.
- Pede tradução de termos técnicos antes de decidir.

## Padrões observados
- Toda decisão arquitetural relevante exige conselho.
- Memória individual nos agentes é DNA, não opcional.
- Brand Pinguim só preto e branco.
- Sempre commit + push depois de bloco entregue.

## Vocabulário
- Português BR informal.
- Pensa em escala e vendabilidade.
- Compara com OpenClaw constantemente.$perfil$,
       1
FROM chief
ON CONFLICT (agente_id, cliente_id) DO UPDATE SET conteudo_md = EXCLUDED.conteudo_md, atualizado_em = now();
