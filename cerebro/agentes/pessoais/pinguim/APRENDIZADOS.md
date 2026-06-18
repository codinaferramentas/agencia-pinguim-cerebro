# APRENDIZADOS.md — Atendente Pinguim

Memória individual agregada do Atendente. Lida em TODA execução (parte do prompt). Cresce com o uso — Verifier (Camada 1 EPP) e feedback humano (Camada 3 EPP, V2.7+) alimentam aqui automaticamente quando algo diverge do esperado.

## Como funciona

Cada entry segue o formato:

```
## YYYY-MM-DD — <regra ou aprendizado em uma linha>

**Origem:** <o que aconteceu — ex: "Verifier reprovou copy do Elo por inventar R$ 1.012.852" ou "Feedback humano 👎 do Micha em VSL Lo-fi">
**Lição:** <regra geral pra próximas execuções>
**Aplicação:** <onde isso afeta o agente — ex: "Antes de citar número específico, conferir se veio do briefing">
```

Entries mais recentes ficam no topo. Após 6 meses sem reforço, podem ser arquivados.

## Aprendizados ativos

## 2026-06-18 — Nome do arquivo NUNCA é critério pra validar produto/cérebro

**Origem:** Andre subiu uma aula com título "CICLO CANCELAMENTO COLETIVO" no cérebro do Elo. Agente quase questionou ("essa aula é do Elo mesmo? o título diz CICLO"). Andre cravou: "se eu estou subindo na fonte X, não importa o nome do arquivo".

**Lição:** Quando o sócio decide subir uma fonte (aula, transcrição, página, anúncio, depoimento) no cérebro X, **o cérebro X é a verdade**. O nome do arquivo, título, ou metadado interno não pode ser usado pra contestar a decisão dele. Razões: aulas antigas têm naming convention legado, produtos passaram por renaming (CICLO→Elo, Pro Alt→ProAlt), arquivo de uma masterclass pode ser reaproveitado em N produtos.

**Aplicação prática:**
- Confirmar ingestão de aulas/fontes via botão/manual: NUNCA perguntar "tem certeza que é do produto X? o nome diz Y". Só confirmar quando deu certo.
- Distribuir depoimentos via motor central: aí SIM o título "Nome - Produto" é critério (única fonte de roteamento que temos). Mas isso é depoimento Discord, contexto diferente.
- Erros visuais (extensão errada, arquivo corrompido) são OK questionar. Mas nome contendo palavra "errada" NÃO É.
- Princípio mais amplo: confiar nas decisões manuais explícitas do sócio acima de heurísticas baseadas em metadado.



**Origem:** V2.14 F4 tinha tabela `relatorios_config` + RPCs `criar/desativar_relatorio` mas o cron agendado no `pg_cron` falhava silenciosamente há 3 dias (chamava Edge `gerar-relatorio` que não existe). Andre pediu cron real funcional na sessão 2026-05-12 noite.

**Lição:** Agora cron funciona: `pg_cron → RPC pinguim.enfileirar_job_relatorio(uuid) → INSERT em pinguim.jobs (status=aprovado, tipo='cron-relatorio') → worker no server-cli local pega via jobs.pegarProximoJob, executa via lib/cron-relatorios.executarJobCronRelatorio → gera entregavel versionado (parent_id encadeia v1, v2, v3...) → manda WhatsApp com link público + 3-4 insights → atualiza relatorios_config.ultima_execucao/ultimo_status/ultimo_entregavel_id`.

**Aplicação prática — quando sócio pedir agendamento no chat (WhatsApp/Discord/chat web):**

1. **Listar agendamentos do sócio:**
   ```
   GET /api/agendamentos/listar?cliente_id=<cid>&ativos=1
   ```
   Resposta natural (REGRA -1, bullet, sem template): *"Você tem hoje N relatórios ativos: 1) Executivo diário todo dia 8h BRT; 2) ..."*

2. **Criar agendamento novo** (quando sócio fala "quero receber X todo dia Y horas"):
   Usar RPC já existente:
   ```sql
   SELECT * FROM pinguim.criar_relatorio(
     p_cliente_id := '<cid_socio>',
     p_slug := '<slug-unico>',
     p_nome := '<nome humano>',
     p_descricao := '<o que e>',
     p_modulos := ARRAY['financeiro','triagem-emails','agenda','discord'],
     p_cron_expr := '<cron UTC — converter de BRT! 8h BRT = 0 11 * * *>',
     p_cron_descricao := '<descricao humana em PT-BR>',
     p_whatsapp_numero := '<numero do socio>'
   );
   ```
   ⚠ **Cron expression precisa ser UTC** — converter BRT pra UTC adicionando +3h (8h BRT = 11h UTC).

3. **Editar horário** ("muda meu executivo pras 9h"):
   ```
   POST /api/agendamentos/atualizar
   body: { id: '<id>', campos: { cron_expr: '0 12 * * *', cron_descricao: 'todo dia 9h BRT' } }
   ```
   Endpoint reagenda no pg_cron automaticamente.

4. **Pausar / Reativar / Excluir:**
   ```
   POST /api/agendamentos/pausar      body: { id }
   POST /api/agendamentos/reativar    body: { id }
   POST /api/agendamentos/excluir     body: { id }   ← destrutivo, confirma 1x
   ```

5. **Disparar AGORA** (testar antes de soltar):
   ```
   POST /api/agendamentos/disparar    body: { id }
   ```
   Retorna `job_id`. Worker pega em até 15s, gera entregável, manda WhatsApp.

**Tabela de conversão BRT→UTC pra cron:**
| Sócio diz | cron_expr (UTC) | cron_descricao |
|---|---|---|
| "todo dia 7h" | `0 10 * * *` | todo dia 7h BRT |
| "todo dia 8h" | `0 11 * * *` | todo dia 8h BRT |
| "todo dia 9h" | `0 12 * * *` | todo dia 9h BRT |
| "seg/qua/sex 8h" | `0 11 * * 1,3,5` | seg/qua/sex 8h BRT |
| "2x por dia 8h e 18h" | `0 11,21 * * *` | 8h e 18h BRT |
| "a cada 15min (teste)" | `*/15 * * * *` | a cada 15 minutos |

**Painel visual:**
- Local (server-cli): `http://localhost:3737/agendamentos` — operações destrutivas + disparo manual
- Mission-control (Vercel): aba ⏰ Agendamentos — só leitura

**Anti-padrões:**
- ❌ Inventar slug duplicado (RPC `criar_relatorio` faz UPSERT por `(cliente_id, slug)` — vai sobrescrever silenciosamente)
- ❌ Esquecer de converter BRT pra UTC (cron vai disparar 3h depois do esperado)
- ❌ Excluir sem confirmar com sócio (operação destrutiva, perde histórico)
- ❌ Tentar agendar slug que não tem handler no worker (só `executivo-diario*` implementado hoje — outros slugs viram falha controlada `pulado:slug_sem_handler`)

## 2026-05-10 — Meta default = só Grupo Pinguim (nunca trazer outras BMs sem pedir)

**Origem:** Feedback explícito do Codina após consulta de campanhas ativas. Resposta trouxe contas de Flávia Ferrari, Blusa Rosa, BM da Rafa e contas em francês — sócios só operam Grupo Pinguim no dia a dia.
**Lição:** Quando qualquer sócio perguntar sobre Meta (contas, campanhas, gasto, insights), filtrar resposta pra mostrar APENAS ad accounts do business "Grupo Pinguim". Outras BMs (Flávia Ferrari, Blusa Rosa, BM da Rafa, contas em francês) só aparecem se pedido EXPLÍCITO.
**Aplicação:** Categoria H inteira (H1-H5). Ao listar ad accounts, filtrar por business name. Ao listar campanhas/insights, garantir que o act_XXX pertence ao Grupo Pinguim. Se sócio pedir "todas" ou nomear outra BM, aí inclui.

_(Vazio na criação. EPP V2.7 vai começar a alimentar conforme feedback humano e Verifier acumularem padrões.)_

## Sementes iniciais (princípios já registrados em outras memórias)

Estes não vêm de execução, são da anatomia Pinguim canônica:

- **Briefing pobre = output genérico.** Sempre as 5 fontes vivas, mesmo que algumas declarem gap. Sem exceção.
- **Roteador, não criador.** Pipeline criativo grande SEMPRE delega. Atendente nunca escreve copy/narrativa/conselho direto.
- **Honestidade sobre gap.** Se Cérebro vazio, declarar. Se Persona em construção, declarar. Nunca improvisar.
- **Squad não populada = resposta honesta em <1s.** Não fingir que tenta — declarar pendência e seguir.
- **Pedro Sobral (tráfego, externo) ≠ Pedro Aredes (sócio Pinguim).** Quando popular `traffic-masters`, Pedro Sobral entra como Clone. Pedro Aredes nunca vira Clone — é dono do produto, não fonte consultável.
