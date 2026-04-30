# AGENT-CARD.md — Persona Pinguim

## Missão
Transformar as fontes de um Cérebro em uma persona viva, em primeira pessoa, que agentes downstream possam usar como bússola de copy, suporte e estratégia.

## Entrada
- `cerebro_id` (uuid, obrigatório) — qual Cérebro vai alimentar a persona.
- `motivo` (string, opcional) — "geracao_inicial", "regeracao_manual", "pos_upload_lote", "pos_upload_avulso".
- `retrieval_k` (int, default 20) — quantos chunks consultar no Cérebro.

## Saída esperada
JSON estruturado via function calling:

```json
{
  "dados_basicos": {
    "nome_ficticio": "string",
    "idade": "string",
    "profissao": "string",
    "momento_de_vida": "string"
  },
  "rotina": {
    "como_e_o_dia": "string",
    "desafios_diarios": "string"
  },
  "vozes_cabeca": ["Eu...", "...10 itens, primeira pessoa"],
  "desejos_reprimidos": ["Eu queria...", "...10 itens"],
  "crencas_limitantes": ["Eu não...", "...10 itens"],
  "dores_latentes": ["Eu me sinto...", "...10 itens"],
  "objecoes_compra": ["string", "...5 a 10 itens"],
  "palavras_utilizadas": [
    { "palavra": "string", "justificativa": "string" },
    "...10 itens"
  ],
  "nivel_consciencia": "unaware|problem-aware|solution-aware|product-aware|most-aware",
  "chunks_fundamentais": ["uuid", "..."]
}
```

## Limites
- Não gera persona para cérebro vazio — retorna erro "cérebro sem fontes suficientes" se total_fontes < 3.
- Não sobrescreve versão anterior — sempre cria nova linha em `pinguim.personas` com `versao = max(versao)+1`.
- Não edita fontes, não cria fontes, não deleta nada.
- Não roda em loop autônomo. Sempre disparado por ação humana ou evento explícito de upload.
- Se `OPENAI_API_KEY` está ausente ou falha 3x seguidas, aborta e registra erro em `agente_execucoes.error`.

## Handoff
- **Quando termina:** notifica a tela da Persona (via query do frontend) que há versão nova.
- **Quando trava:** marca `agente_execucoes.status='erro'` com mensagem, usuário vê toast na UI.
- **Quem consome a saída:** tela Persona no painel, e no futuro agentes de copy/carrossel/suporte que vão fazer SELECT direto na tabela.

## Critério de qualidade
- 100% dos itens de vozes/desejos/crenças/dores começam com "Eu" (validação no próprio prompt + no backend antes de salvar).
- Dados básicos refletem amostragem real do Cérebro (nome fictício brasileiro, idade coerente com linguagem).
- Rastreabilidade: `chunks_fundamentais` lista ao menos 5 UUIDs de chunks reais do Cérebro.
- Linguagem brasileira real — sem "você" formalizado, sem tradução de expressão estrangeira.

## Métrica de sucesso
- **Principal:** % de blocos aprovados sem edição humana (meta inicial ≥ 60%, madura ≥ 80%).
- **Custo por geração:** < US$ 0.01 (com gpt-4o-mini + 20 chunks).
- **Latência:** < 15 segundos da chamada ao retorno.
- **Evolução (EPP):** taxa de aprovação da versão N+1 deve ser ≥ versão N.
