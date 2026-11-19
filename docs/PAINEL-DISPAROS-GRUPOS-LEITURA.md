# Disparos em grupo de WhatsApp: guia de leitura para o painel do CRM

> **Para quem é este arquivo:** o chat que está montando o painel de gestão dos robôs no CRM.
> **Resumo:** todos os dados do robô de avisos em grupo ficam no **mesmo banco Supabase que o painel já usa**. O acesso é **só leitura**: o painel nunca escreve nessas tabelas. **Como mostrar na tela (abas, gráficos, drill-down) é decisão sua.** Aqui está só o que existe e como ler.

---

## 1. O que o robô faz (contexto em 30 segundos)

- O time programa os avisos dos encontros de mentoria no **Trello** (quadro "Agenda Pinguim"). Cada card tem o horário, os grupos de destino e a mensagem (copy).
- O robô (`alertas-grupos-worker`, Edge Function no Supabase) roda **a cada 1 minuto**. Na hora de cada card, ele confere se o encontro está na agenda e envia a mensagem nos grupos de WhatsApp pela Evolution API.
- **Dona do disparo:** a Fernanda Lisboa cuida dos produtos do Micha (ELO, Lyra) e a Ingrid Nascimento dos produtos do Pedro (ProAlt, Taurus LT, Taurus Master, Orion). Cada uma dispara pelo próprio número. Se o número de uma cair, sai pelo da outra (fallback).
- Listas do quadro:
  - **Segunda, Terça, Quarta, Quinta, Sexta:** avisos recorrentes. Só saem se o encontro estiver na agenda.
  - **Avulso:** aviso pontual. Não confere agenda e vai pra Concluidos depois de enviado.
  - **Reserva:** pausado de propósito. Nunca dispara.
  - **🔁 Enviar Agora:** reenvio manual imediato.
  - **Concluidos**, **Modelos e Regras** e **Aguardando retorno:** não disparam.
- Uma **conferência** roda a cada 30 min, das 7h às 18h30 nos dias úteis. Ela avisa a dona no Discord (#avisos-de-calls) quando:
  - tem card sem encontro na agenda;
  - tem encontro sem card;
  - tem card com defeito.

---

## 2. Acesso

| Item | Valor |
|---|---|
| Projeto Supabase | `wmelierxzpjamiofeemh` (Pinguim Squads), o mesmo banco do painel |
| Schema | **`pinguim`** (nada aqui fica em `public`) |
| Como ler | Pelo **servidor** do painel, com a mesma credencial de serviço que ele já usa para as outras tabelas do schema `pinguim` (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` do `.env` do painel). Com supabase-js: `createClient(url, key, { db: { schema: 'pinguim' } })`. |
| Navegador | **Não** ler direto do navegador. As tabelas têm RLS ligado e o acesso `anon`/`authenticated` foi retirado das tabelas novas. Se o painel precisar ler pelo navegador com o login do usuário, peça ao Codina uma política de leitura ou uma função RPC específica. |
| Escrita | **Proibida.** O robô é o único que grava nessas tabelas. |

Nenhuma chave é copiada neste arquivo de propósito. Use as que o painel já tem.

---

## 3. As fontes de dados

### 3.1 `pinguim.vw_painel_disparos_grupos`: o que foi enviado (ou tentou)
É a **visão principal**, com histórico desde 25/08/2026. **1 linha = 1 card × 1 grupo × 1 dia.**

| Coluna | O que é |
|---|---|
| `data_ref` | Dia do disparo (data de Brasília) |
| `horario_previsto` | Horário programado no card, `HH:MM` (texto) |
| `enviado_em` | Momento real do envio (timestamptz) |
| `tipo` | `automatico` (no horário) ou `manual` (lista 🔁 Enviar Agora) |
| `status` | `enviado` ou `erro`. `enviando` aparece só por segundos, durante o envio. |
| `erro`, `tentativas` | Mensagem de erro da Evolution e número de tentativas (no máximo 2) |
| `card_id`, `card_nome` | Card do Trello que originou o disparo (liga com `alertas_grupos_cards.card_id`) |
| `grupo_nome`, `grupo_jid` | Grupo de destino |
| `instancia_usada` | Número que enviou: `Ingrid Nascimento` ou `Fernanda Lisboa`. Com `(fallback)` no fim, saiu pelo número da outra. `null` nos registros antigos. |
| `dona` | Dona do grupo (Ingrid ou Fernanda) |
| `agenda_confirmada` | O encontro estava na agenda no momento do envio |
| `modo` | `producao` ou `teste` (ago/2026, antes de ir ao ar). **Filtre `modo = 'producao'`.** |
| `mensagem` | **A copy enviada**, já no formato do WhatsApp (`*negrito*`). Preenchida a partir de **19/11/2026**; antes disso é `null`, e dá pra mostrar a copy atual do card via `card_id`. |

### 3.2 `pinguim.alertas_grupos_cards`: a programação (foto do Trello)
O robô copia **o quadro inteiro** aqui a **cada 5 minutos**, então o painel não precisa acessar o Trello. **1 linha = 1 card.**

| Coluna | O que é |
|---|---|
| `card_id` | ID do card no Trello (chave) |
| `nome` | Título do card (ex.: `09:00\|ELO\|Análise de Conteúdo com Fernanda Lisboa!`) |
| `lista` | Lista atual (Segunda..Sexta, Avulso, Reserva, 🔁 Enviar Agora, Concluidos, ...) |
| `hora` | Horário do disparo, `HH:MM` |
| `dia_semana`, `data_explicita` | Dia citado no card e data `DD/MM`, quando houver (avulsos) |
| `grupos` | Nomes dos grupos de destino (array) |
| `links_desconhecidos` | Quantos links de grupo o robô não reconhece (> 0 indica problema) |
| `dona` | Ingrid Nascimento / Fernanda Lisboa |
| `mensagem` | Copy como sai no WhatsApp |
| `problema` | Defeito que **impede** o disparo: `sem link de grupo no PÚBLICO`, `link de grupo não cadastrado no robô`, `sem o título MENSAGEM`, `sem horário`. `null` = card ok. |
| `url` | Link do card no Trello (pra botão "abrir no Trello") |
| `atualizado_em` | Última vez que o robô leu o card |
| `removido_em` | Preenchido quando o card some do quadro (arquivado/apagado). **Filtre `removido_em is null`** para o quadro atual. |

### 3.3 `pinguim.alertas_grupos_pulos`: o que NÃO saiu e por quê
Grava os cards que **chegaram no horário e não dispararam** (a partir de 19/11/2026). **1 linha = 1 card × 1 dia**, sempre com o último motivo.

| Coluna | O que é |
|---|---|
| `data_ref`, `card_id`, `card_nome`, `lista`, `horario` | Qual card e quando |
| `motivo` | Texto do motivo. Exemplos: `nenhum evento HOJE na agenda com título parecido com o do card` · `sem MENSAGEM` · `sem link de grupo no PÚBLICO` · `nenhum link cadastrado no de-para` · `🛑 FREIO: a MESMA mensagem já foi...` (bloqueio anti-repetição) · `horário ... é anterior à reconexão da Evolution` |
| `registrado_em` | Quando o robô registrou |

Um card pode aparecer aqui e **depois** em `vw_painel_disparos_grupos` no mesmo dia. Isso acontece quando alguém corrige o card dentro da janela (até 55 min depois do horário) e ele sai. Para saber o resultado final, confira se existe envio pro mesmo `card_id` + `data_ref`.

### 3.4 `pinguim.alertas_conferencia_enviados`: alertas que o time recebeu
Cada pendência avisada no Discord (#avisos-de-calls), **1 vez por dia**.

| Coluna | O que é |
|---|---|
| `data_ref`, `enviado_em` | Dia e hora do alerta |
| `tipo` | `card_sem_agenda` · `agenda_sem_card` · `card_com_defeito` |
| `dona` | `Ingrid` ou `Fernanda` (quem foi marcada) |
| `item` | Nome do encontro/card |
| `chave` | Identificador interno (ignorar) |

### 3.5 `pinguim.grupos_whatsapp_alertas`: os grupos (cadastro)
10 grupos ativos. Use `nome`, `ativo` e `instancia_override` (`EVOLUTION_INSTANCE_ELO_FERNANDA` = dona Fernanda; `EVOLUTION_INSTANCE_ALERTAS_GRUPOS` = dona Ingrid). **Não exibir** `link_convite` nem `jid_evolution` publicamente.

---

## 4. Consultas prontas (exemplos, use como quiser)

```sql
-- Resumo por dia (últimos 30 dias)
select data_ref,
       count(*) filter (where status = 'enviado') as enviados,
       count(*) filter (where status = 'erro')    as erros,
       count(*) filter (where tipo = 'manual')    as manuais,
       count(distinct card_id)                    as cards,
       count(distinct grupo_nome)                 as grupos
from pinguim.vw_painel_disparos_grupos
where modo = 'producao' and data_ref >= current_date - 30
group by data_ref order by data_ref desc;

-- Detalhe de um dia (drill-down), com a copy
select horario_previsto, enviado_em, card_nome, grupo_nome, dona, instancia_usada, status, erro, mensagem
from pinguim.vw_painel_disparos_grupos
where modo = 'producao' and data_ref = '2026-11-19'
order by horario_previsto, grupo_nome;

-- Programação de hoje (o que ainda vai sair), por lista do dia + Avulso
select hora, nome, lista, grupos, dona, problema, url
from pinguim.alertas_grupos_cards
where removido_em is null
  and (lista = (array['','Segunda','Terça','Quarta','Quinta','Sexta',''])[extract(dow from now() at time zone 'America/Sao_Paulo')::int + 1]
       or lista = 'Avulso')
order by hora;

-- Cards com defeito agora (não vão disparar)
select lista, hora, nome, dona, problema, url
from pinguim.alertas_grupos_cards
where removido_em is null and problema is not null
  and lista not in ('Concluidos', 'Modelos e Regras', 'Aguardando retorno');

-- O que não saiu hoje e por quê (excluindo os que saíram depois de corrigidos)
select p.horario, p.card_nome, p.lista, p.motivo
from pinguim.alertas_grupos_pulos p
where p.data_ref = (now() at time zone 'America/Sao_Paulo')::date
  and not exists (select 1 from pinguim.disparos_grupos_whatsapp d
                  where d.card_id = p.card_id and d.data_ref = p.data_ref and d.status = 'enviado')
order by p.horario;

-- Por grupo / por dona (período)
select grupo_nome, dona, count(*) filter (where status='enviado') enviados, count(*) filter (where status='erro') erros
from pinguim.vw_painel_disparos_grupos
where modo = 'producao' and data_ref >= current_date - 7
group by 1, 2 order by 3 desc;
```

---

## 5. Frequência de atualização

| Fonte | Atualiza |
|---|---|
| `vw_painel_disparos_grupos` | Na hora do envio (robô roda a cada 1 min) |
| `alertas_grupos_pulos` | Na hora (a cada 1 min, dentro da janela do card) |
| `alertas_grupos_cards` | A cada 5 min |
| `alertas_conferencia_enviados` | A cada 30 min, das 7h às 18h30, nos dias úteis |

Fim de semana não tem disparo.

## 6. Cuidados

- Datas: `data_ref` já é o dia de **Brasília**. `enviado_em`, `registrado_em` e `atualizado_em` são timestamptz (UTC); converta com `at time zone 'America/Sao_Paulo'`.
- Um mesmo aviso que vai pra 2 grupos gera **2 linhas** (uma por grupo). Para contar "avisos", use `count(distinct card_id)` por dia.
- `instancia_usada` com `(fallback)` = o número da dona estava fora e saiu pelo outro. Vale destacar no painel.
- Não há dados de leitura/visualização das mensagens no WhatsApp, só o envio.
- Dúvida sobre regra de negócio ou dado faltando: pedir ao Codina (o robô é mantido em outro chat).
