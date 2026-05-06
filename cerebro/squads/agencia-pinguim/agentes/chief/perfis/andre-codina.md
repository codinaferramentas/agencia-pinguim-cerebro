# perfis/andre-codina.md — Memória do Chief sobre André Codina

> **Quem é:** André Codina, **sócio da Dolphin** (NÃO sócio da Pinguim — memória `project_estrutura_societaria.md`). Parceiro de dev do projeto Pinguim OS.
> **Tier 2.** Específico desse solicitante.
> Lido pelo Chief sempre que solicitante atual = André Codina.

> ⚠️ **Tratamento:** André NÃO é sócio Pinguim. Não incluir em listas de "sócios" / "decisões societárias Pinguim". Ele é parceiro técnico/estratégico.

---

## Estilo de aprovação

- **Quer ver alternativas + trade-offs** antes de decidir, principalmente em decisão arquitetural (memória `feedback_decisao_arquitetural_exige_conselho.md`).
- **Reverte decisões** quando percebe que conselho não cobriu uma dimensão (ex: 2026-05-05 reverteu recomendação dos especialistas em memória).
- **Aprovações curtas:** "vai" / "ok" / "manda" — quando aprovado, é direto.
- **Pede contexto antes de tomar decisão técnica** quando termo é desconhecido (memória dessa sessão: pediu tradução de "worker", "artefato", "retenção").
- **Confirma autorização** pra ações de risco (commit, push, mudança em prod).

## Vocabulário e tom

- Português BR informal.
- Pensa em **escala** e **vendabilidade** (memória `feedback_escalar_como_produto.md`).
- Compara constantemente com OpenClaw (modelo de referência declarado).
- Usa "cara", "tipo assim", "entendeu?".
- Quando pede tradução, diz "tá muito técnico, eu não consigo te responder".

## Padrões observados

- **Toda decisão arquitetural relevante exige conselho de conselheiros** (memória `feedback_decisao_arquitetural_exige_conselho.md`). Sem isso, ele segura.
- **Memória individual nos agentes é DNA**, não opcional (memória `project_memoria_individual_dna_agente.md`). Reverteu conselho oposto.
- **Brand Pinguim só preto e branco** (memória `feedback_brand_pinguim_nao_inventar.md`). Nunca aplicar cor sem autorização.
- **Sempre commit + push depois de bloco entregue** (memórias `feedback_sempre_salvar_e_commitar.md` + `feedback_sempre_push_apos_commit.md`). Pede autorização na hora.
- **Sempre checar memória antes de propor** (memória `feedback_sempre_checar_memoria.md`).
- **Não usar termo MVP** (memória `feedback_nao_usar_mvp.md`) — usar "versão de hoje" / "versão atual".
- **Não apresentar framework externo como novidade** sem checar se já existe na memória Pinguim (memória `feedback_nao_apresentar_externo_como_novidade.md`).
- **Em brainstorm aberto, organizar não criticar** (memória `feedback_nao_criticar_brainstorm.md`).
- **Não fazer band-aid** — toda solução escala (memória `feedback_nao_band_aid.md`).
- **Toda mudança atualiza documentação** (memória `feedback_docs_atualiza_com_sistema.md`).
- **Plano sequencial fixo** (memória `feedback_plano_sequencial_fixo.md`) — não mudar de direção a cada 5 min.

## Áreas de domínio

- Construção do Pinguim OS (todo o sistema atual).
- Stack: Supabase Edge Functions Deno + painel HTML/JS vanilla.
- Brand identity Pinguim (autoridade pra aplicar cor).
- Decisões arquiteturais transversais.

## O que evitar com ele

- **Não tomar decisão arquitetural relevante sozinho** (memória dura).
- **Não usar jargão sem traduzir** quando o tema é novo pra ele.
- **Não apresentar conselho sem voz autêntica** dos conselheiros.
- **Não aplicar cor no brand Pinguim** sem autorização explícita.
- **Não pular pesquisa + conselho** mesmo se "tem certeza".

## Lições anti-repetição (Lei 0)

- **2026-05-04:** Tomei decisão solo sobre memória conversacional ("Caso aberto" + "Perfil do solicitante"). André pegou. Princípio: **decisão arquitetural relevante = pesquisa + conselho + alternativas, sempre**.
- **2026-05-05:** Apresentei perguntas técnicas a leigo ("retenção?", "worker é o quê?"). André pegou. Princípio: **traduzir termos antes de perguntar, sempre. "Worker" → "agente especialista". "Artefato" → "entregável".**
- **2026-05-05:** Conselho geral recomendou "comece simples, complete depois" pra memória individual. Princípio que eu deveria ter visto antes: **EPP é DNA — implementa agora, não depois. Esperar dor real é band-aid arquitetural quando a dor é certeza estatística.**

---

## Histórico relevante

- **Liderou pivô 2026-05-04** (construir todos os agentes do ecossistema antes de habilitar Solução).
- **Reverteu conselho 2026-05-05** sobre memória — puxou pra B FULL ATIVO desde v1.
- **Definiu padrão "{Cliente} OS"** — Mission Control virou Pinguim OS, replicável (memória `project_nome_pinguim_os.md`).

---

*Banco-fonte: `pinguim.aprendizados_cliente_agente WHERE agente_id=<chief_id> AND cliente_id=<andre_codina_id>`. Este MD é espelho.*
