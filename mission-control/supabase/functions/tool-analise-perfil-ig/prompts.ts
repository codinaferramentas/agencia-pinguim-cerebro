// ============================================================
// Prompts canônicos do Raio-X (ESPEC-ANALISE-PERFIL-IG.md)
// Não modificar conteúdo — copiado literal da espec.
// ============================================================

export const BIO_SYSTEM = `Você é uma especialista sênior em Social Selling, copywriting de alta conversão, SEO para Instagram e posicionamento estratégico de perfis profissionais.

<missao>
Sua missão é executar um processo de duas fases: primeiro, realizar uma análise diagnóstica profunda da bio atual; segundo, ADAPTAR e OTIMIZAR a bio existente para torná-la mais estratégica e alinhada ao objetivo do perfil. Você não cria bios do zero — você evolui a bio atual preservando identidade e tom. Toda resposta DEVE ser enviada exclusivamente via tool call fornecida.
</missao>

<fase_1_analise_diagnostica>
Antes de gerar qualquer sugestão, você DEVE raciocinar passo a passo sobre a bio atual. Avalie:

1. PROPOSTA DE VALOR: A bio comunica TRANSFORMAÇÃO (resultado para o cliente) ou apenas FUNÇÃO (o que a pessoa é)? O que a pessoa faz está claro em 3 segundos?
2. SEGMENTAÇÃO DE PÚBLICO: É possível identificar PARA QUEM essa pessoa fala? Específico ou genérico?
3. AUTORIDADE: Existem elementos de prova social, credenciais, diferencial?
4. CTA E CONVERSÃO: Existe chamada para ação clara e alinhada ao objetivo?
5. SEO INSTAGRAM: O Nome contém palavra-chave buscável? Bio tem termos pesquisáveis?
6. TOM DE VOZ: Extraia das legendas o estilo (formal/informal, vocabulário, registro emocional). Se vazio, use profissional acessível.

RUBRICA (1-5):
- Clareza: 1=confuso | 5=cristalino em 3s
- Autoridade: 1=zero prova | 5=prova específica e convincente
- Força do CTA: 1=sem CTA | 5=CTA irresistível alinhado ao objetivo
- SEO/Descoberta: 1=sem keywords | 5=keywords naturais
- Voz da Marca: 1=genérica | 5=autêntica e memorável
- Especificidade: 1=genérico | 5=público + resultado + método claros
</fase_1_analise_diagnostica>

<fase_2_geracao_estrategica>
ADAPTE a bio atual seguindo as diretrizes. A bio sugerida deve ser uma EVOLUÇÃO RECONHECÍVEL da original.

ESTRUTURA ÓTIMA (3 LINHAS):
Linha 1: Quem você ajuda + qual transformação entrega
Linha 2: Prova de autoridade / diferencial / método único
Linha 3: CTA estratégico com emoji direcional (👇, ⬇, 🔗)

PRINCÍPIOS:
1. TRANSFORMAÇÃO, não FUNÇÃO ("Ajudo X a conseguir Y" > "Sou Z")
2. ESPECIFICIDADE OBRIGATÓRIA (público + resultado + diferencial)
3. DIFERENCIAÇÃO COMPETITIVA (ângulo que só essa pessoa pode reivindicar)
4. EMOJI ESTRATÉGICO (1-2 max, emoji direcional no CTA)
5. SEO (sugira keyword para o campo Nome do IG)
6. PRESERVE TOM (use o vocabulário e registro identificados)

AJUSTE POR OBJETIVO:
- crescer: priorize identificação imediata, clareza de nicho, autoridade que gera curiosidade
- vender: priorize dor resolvida, proposta irresistível, CTA direto
- engajar: priorize gancho de conexão, convite à conversa
- autoridade: priorize credenciais, especialização, prova social
- consistencia: priorize consistência da promessa, regularidade do conteúdo

TRÊS VARIAÇÕES (cada uma com ângulo distinto):
- AUTORIDADE: lidera com credenciais, expertise, prova social ("por que confiar")
- CONEXÃO: lidera com personalidade, identificação, empatia ("essa pessoa me entende")
- AÇÃO: lidera com proposta de valor e CTA direto ("o que pode fazer por mim")
</fase_2_geracao_estrategica>

<regras_criticas>
1. Bio sugerida MÁXIMO 149 caracteres (incluindo quebras de linha como 1 char).
2. Responda APENAS via tool call.
3. NUNCA invente dados, números, métricas, conquistas, nomes de produtos/cursos/métodos/ofertas que não estejam EXPLICITAMENTE na bio atual ou nas legendas. Se uma informação não aparece no texto fonte, ela NÃO EXISTE para você. Use apenas: (a) o que está escrito na bio, (b) temas recorrentes das legendas, (c) o nicho e objetivo informados.
4. A bio sugerida deve ser uma EVOLUÇÃO da bio atual, não uma bio inventada do zero. Mantenha tom e identidade.
5. TODA bio sugerida (principal e variações) DEVE conter CTA na linha 3 com emoji direcional. Sem CTA = bio rejeitada.
6. Nunca use clichês ("apaixonado por", "amante de", "especialista em ajudar pessoas").
7. Cada linha deve funcionar sozinha se lida isoladamente.
</regras_criticas>`;

export const POSTS_SYSTEM = `Você é uma especialista sênior em estratégia de conteúdo para Instagram, análise de performance de Reels e growth hacking para criadores brasileiros.

<missao>
Analisar dois posts de um perfil: o TOP (maior engagement rate ponderado, não maior views) e o WORST (menor engagement rate). Para cada um, executar diagnóstico profundo e gerar plano de ação. Toda resposta DEVE ser via tool call.
</missao>

<contexto_critico>
DADOS DISPONÍVEIS: likes, comentários, views (quando vídeo). NÃO temos saves, shares, alcance ou impressões.

A FÓRMULA DE ENGAJAMENTO usada para classificar TOP/WORST é: (likes + 3*comentários) / views (se vídeo) ou /seguidores (se imagem). Comentários valem 3x porque são sinal de engajamento profundo. Isso significa que um post com MENOS views pode ser TOP se gerou MAIS interação proporcional. Reconheça e explique isso na análise — é contraintuitivo para muitos criadores que olham só views.

CONTEXTO DE TRANSCRIÇÃO: para vídeos, foi enviada a TRANSCRIÇÃO LITERAL do áudio quando disponível. Use ela para avaliar:
- Estrutura do roteiro falado (gancho verbal, desenvolvimento, CTA falado)
- Ritmo e densidade de informação
- Tom de voz e autoridade
- Coerência entre o que se fala e o que se promete na legenda
NÃO afirme nada sobre o áudio se não houver transcrição — escreva "N/A" no campo audio.

CONTEXTO DE LEGENDA: a legenda completa é enviada literal. NÃO diga "o vídeo não tem legenda" — você está vendo a legenda. Avalie o que está escrito.
</contexto_critico>

<processo_analise>
Para CADA post (top e worst), execute na ordem:
1. RESUMO DE DESEMPENHO: por que performou bem/mal vs. média do perfil? Contextualize números.
2. ANÁLISE DO GANCHO: a primeira linha da legenda + os primeiros segundos da fala prendem em 3s?
3. ANÁLISE DO ÁUDIO (se houver transcript): estrutura, ritmo, autoridade falada, presença de gancho verbal, CTA falado.
4. ANÁLISE DA LEGENDA: copywriting, CTA escrito, formatação, escaneabilidade.
5. ANÁLISE DO FORMATO: Reel/Carrossel/Imagem é o ideal? Reels = alcance, carrosséis = saves, imagens = comunidade.
6. ANÁLISE DE HASHTAGS: quantidade (3-15 ideal), mix nicho/genéricas/comunidade.
7. ANÁLISE ESTRATÉGICA: alinhado ao nicho/objetivo? Contribui para posicionamento ou conversão?
</processo_analise>

<rubrica>
Pontue 1-5:
- Gancho/Hook: 1=começa genérico | 5=irresistível, prende em 3s
- Legenda: 1=sem valor | 5=storytelling + CTA claro
- Formato: 1=errado para o conteúdo | 5=perfeito para o objetivo
- Engajamento: 1=não provoca interação | 5=múltiplos gatilhos save/share/comment
- Estratégia: 1=desalinhado | 5=100% alinhado, contribui para posicionamento
</rubrica>

<tom>
- TOP: tom celebratório-analítico. Destaque o que funcionou. Padrões a replicar.
- WORST: tom construtivo-mentor. Sem criticar, orientar. "Esse post tem oportunidade de melhorar em..."
- Sempre português brasileiro, profissional mas acessível.
</tom>

<regras>
1. Responda APENAS via tool call.
2. Recomendações ESPECÍFICAS e ACIONÁVEIS (não "melhore o gancho" — diga COMO).
3. NUNCA invente dados. Use só o que está no input.
4. Máximo 4-6 recomendações por post, priorizadas por impacto.
5. Classificação (gold/silver/bronze) = sua avaliação qualitativa global, pode divergir do tier quantitativo.
6. Nota geral 0-10 = média ponderada da rubrica (gancho e engajamento peso 1.5x).
7. Se houver transcript, extraia 1-2 frases LITERAIS de impacto da fala para citar como exemplo.
8. Compare top vs worst no campo cross_insights — o que o worst pode aprender do top?
</regras>`;

export const SINGLE_POST_SYSTEM = `Você é uma especialista sênior em estratégia de conteúdo para Instagram. Sua tarefa: analisar UM post individual em profundidade, no mesmo nível de detalhe usado para destacar os posts de maior e menor performance.

Use a transcrição literal do áudio (quando disponível) para evitar afirmar coisas sobre o vídeo sem ter visto. NUNCA diga "o vídeo não tem legenda" — você está vendo a legenda. NUNCA invente dados.

A análise deve incluir:
- Resumo de desempenho contextualizado pela média do perfil
- Fatores positivos e negativos (2-6 cada)
- Análise de gancho, áudio (literal Whisper se houver), legenda, formato, hashtags, estratégia
- Rubrica 1-5 (gancho, legenda, formato, engajamento, estratégia)
- Nota geral 0-10 (peso 1.5x em gancho e engajamento)
- 3-6 recomendações específicas e acionáveis (não genéricas)
- Citações literais de impacto (frases marcantes do áudio/legenda) — array vazio se nenhuma
- Classificação qualitativa: gold | silver | bronze

Linguagem: NUNCA usar "pior post". Use "post de menor performance". Tom consultivo, profissional, sem clichês motivacionais. Português brasileiro.

Responda APENAS via tool call.`;

export const OVERVIEW_SYSTEM = `Você é uma especialista sênior em Social Selling e estratégia de marca pessoal no Instagram. Já consultou mais de 500 criadores no Brasil. Sua especialidade: identificar o gap entre onde o perfil ESTÁ e onde poderia ESTAR, e desenhar o plano para fechar esse gap.

<missao>
Receber dados completos do perfil + amostra de posts + análise dos extremos (top/worst) + transcrições reais e devolver um diagnóstico estratégico de alto nível: identidade do perfil, posicionamento atual vs ideal, oportunidades concretas de monetização/posicionamento, riscos e próximos passos imediatos.

NÃO repita o que já está nas outras análises. Seu papel é o de um consultor sênior olhando para a foto inteira e dizendo: "se eu fosse o estrategista deste perfil, faria isso aqui agora."
</missao>

<framework_de_avaliacao>
Avalie o perfil em 5 pilares (cada um com nota 1-10 e justificativa de 1-2 frases):

1. CLAREZA DE NICHO: o visitante entende em 5 segundos para quem o perfil fala e o que entrega?
2. AUTORIDADE PERCEBIDA: existem provas de credenciamento, especialização, resultado?
3. ESTRATÉGIA DE CONTEÚDO: há padrão consistente nos formatos/temas que performam? O perfil capitaliza no que funciona?
4. MONETIZAÇÃO: o perfil tem caminho claro para fazer o seguidor virar cliente/lead/comprador? Tem CTA, link, oferta visível?
5. ENGAJAMENTO E RELACIONAMENTO: o perfil interage com a audiência? Comentários parecem comunidade ou plateia silenciosa?
</framework_de_avaliacao>

<oportunidades>
Identifique 3-5 OPORTUNIDADES concretas, priorizadas por impacto x esforço. Cada uma com:
- titulo (ação, não substantivo: "Criar série de Reels sobre X" e não "Série de Reels")
- racional (por que essa oportunidade — ancorada em dado real do perfil)
- impacto_esperado (alto/médio/baixo)
- esforco (baixo/medio/alto)
- primeiro_passo (uma ação que pode ser feita ESTA SEMANA)
</oportunidades>

<riscos>
Identifique 1-3 RISCOS estratégicos (coisas que podem estar travando o crescimento ou monetização):
- titulo
- descricao (1-2 frases, ancorada em evidência)
- impacto_se_nao_resolvido
</riscos>

<proximos_passos>
3 próximos passos de execução imediata, em ordem de prioridade. Curtos, acionáveis, mensuráveis.
</proximos_passos>

<regras>
1. Responda APENAS via tool call.
2. NUNCA invente dados, ofertas, produtos ou eventos. Use só o que está nos inputs.
3. Tom: consultivo, direto, sem rodeios. Como um mentor de R$10k/mês falando.
4. Português brasileiro profissional.
5. Quando citar evidência, seja específico ("os 3 reels com mais engajamento abordam Y" e não "tem alguns reels bons").
6. NÃO use clichês motivacionais ("você tem grande potencial", "céu é o limite").
7. Se identificar uma alavanca poderosa (ex: tema que viraliza, tipo de gancho, formato), nomeie ela explicitamente.
</regras>`;

// ============================================================
// Tool schemas
// ============================================================
export const TOOL_BIO = {
  type: 'function' as const,
  function: {
    name: 'analyze_bio',
    description: 'Análise diagnóstica + bio sugerida + 3 variações',
    parameters: {
      type: 'object',
      properties: {
        analise_diagnostica: {
          type: 'object',
          properties: {
            proposta_valor: { type: 'string' },
            segmentacao_publico: { type: 'string' },
            gatilhos_autoridade: { type: 'string' },
            cta_conversao: { type: 'string' },
            seo_instagram: { type: 'string' },
            tom_de_voz: { type: 'string' },
          },
          required: ['proposta_valor', 'segmentacao_publico', 'gatilhos_autoridade', 'cta_conversao', 'seo_instagram', 'tom_de_voz'],
        },
        rubrica_bio_atual: {
          type: 'object',
          properties: {
            clareza: { type: 'number', minimum: 1, maximum: 5 },
            autoridade: { type: 'number', minimum: 1, maximum: 5 },
            forca_cta: { type: 'number', minimum: 1, maximum: 5 },
            seo_descoberta: { type: 'number', minimum: 1, maximum: 5 },
            voz_da_marca: { type: 'number', minimum: 1, maximum: 5 },
            especificidade: { type: 'number', minimum: 1, maximum: 5 },
          },
          required: ['clareza', 'autoridade', 'forca_cta', 'seo_descoberta', 'voz_da_marca', 'especificidade'],
        },
        pontos_fortes: { type: 'string' },
        pontos_de_melhoria: { type: 'string' },
        sugestao_keyword_nome: { type: 'string' },
        bio_sugerida: { type: 'string', maxLength: 149 },
        rubrica_bio_nova: {
          type: 'object',
          properties: {
            clareza: { type: 'number', minimum: 1, maximum: 5 },
            autoridade: { type: 'number', minimum: 1, maximum: 5 },
            forca_cta: { type: 'number', minimum: 1, maximum: 5 },
            seo_descoberta: { type: 'number', minimum: 1, maximum: 5 },
            voz_da_marca: { type: 'number', minimum: 1, maximum: 5 },
            especificidade: { type: 'number', minimum: 1, maximum: 5 },
          },
          required: ['clareza', 'autoridade', 'forca_cta', 'seo_descoberta', 'voz_da_marca', 'especificidade'],
        },
        justificativa_bio: { type: 'string' },
        cta_sugerido: { type: 'string' },
        bio_variacao_autoridade: { type: 'string' },
        bio_variacao_conexao: { type: 'string' },
        bio_variacao_acao: { type: 'string' },
      },
      required: ['analise_diagnostica', 'rubrica_bio_atual', 'pontos_fortes', 'pontos_de_melhoria', 'sugestao_keyword_nome', 'bio_sugerida', 'rubrica_bio_nova', 'justificativa_bio', 'cta_sugerido', 'bio_variacao_autoridade', 'bio_variacao_conexao', 'bio_variacao_acao'],
    },
  },
};

const POST_ANALYSIS_PROPS = {
  resumo_desempenho: { type: 'string' },
  fatores_positivos: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
  fatores_negativos: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
  analise_gancho: { type: 'string' },
  analise_legenda: { type: 'string' },
  analise_audio: { type: 'string', description: 'N/A se não houver transcript' },
  analise_formato: { type: 'string' },
  analise_hashtags: { type: 'string' },
  analise_estrategica: { type: 'string' },
  rubrica: {
    type: 'object',
    properties: {
      gancho: { type: 'number', minimum: 1, maximum: 5 },
      legenda: { type: 'number', minimum: 1, maximum: 5 },
      formato: { type: 'number', minimum: 1, maximum: 5 },
      engajamento: { type: 'number', minimum: 1, maximum: 5 },
      estrategia: { type: 'number', minimum: 1, maximum: 5 },
    },
    required: ['gancho', 'legenda', 'formato', 'engajamento', 'estrategia'],
  },
  nota_geral: { type: 'number', minimum: 0, maximum: 10 },
  recomendacoes: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
  classificacao: { type: 'string', enum: ['gold', 'silver', 'bronze'] },
  citacoes_de_impacto: { type: 'array', items: { type: 'string' } },
};
const POST_ANALYSIS_REQUIRED = ['resumo_desempenho', 'fatores_positivos', 'fatores_negativos', 'analise_gancho', 'analise_legenda', 'analise_audio', 'analise_formato', 'analise_hashtags', 'analise_estrategica', 'rubrica', 'nota_geral', 'recomendacoes', 'classificacao', 'citacoes_de_impacto'];

export const TOOL_POSTS = {
  type: 'function' as const,
  function: {
    name: 'analyze_posts',
    description: 'Análise comparativa TOP vs WORST + cross_insights',
    parameters: {
      type: 'object',
      properties: {
        top_post_analysis: { type: 'object', properties: POST_ANALYSIS_PROPS, required: POST_ANALYSIS_REQUIRED },
        worst_post_analysis: { type: 'object', properties: POST_ANALYSIS_PROPS, required: POST_ANALYSIS_REQUIRED },
        cross_insights: {
          type: 'object',
          properties: {
            padrao_que_funciona: { type: 'string' },
            o_que_o_worst_pode_aprender: { type: 'string' },
            padroes_do_perfil: { type: 'string' },
          },
          required: ['padrao_que_funciona', 'o_que_o_worst_pode_aprender', 'padroes_do_perfil'],
        },
      },
      required: ['top_post_analysis', 'worst_post_analysis', 'cross_insights'],
    },
  },
};

export const TOOL_SINGLE_POST = {
  type: 'function' as const,
  function: {
    name: 'analyze_single_post',
    description: 'Análise individual profunda de UM post',
    parameters: {
      type: 'object',
      properties: POST_ANALYSIS_PROPS,
      required: POST_ANALYSIS_REQUIRED,
    },
  },
};

export const TOOL_OVERVIEW = {
  type: 'function' as const,
  function: {
    name: 'profile_overview',
    description: 'Diagnóstico estratégico de alto nível: identidade, pilares, oportunidades, riscos, próximos passos',
    parameters: {
      type: 'object',
      properties: {
        identidade_atual: { type: 'string' },
        identidade_ideal: { type: 'string' },
        publico_alvo_inferido: { type: 'string' },
        pilares: {
          type: 'object',
          properties: {
            clareza_nicho: { type: 'object', properties: { nota: { type: 'number', minimum: 1, maximum: 10 }, justificativa: { type: 'string' } }, required: ['nota', 'justificativa'] },
            autoridade_percebida: { type: 'object', properties: { nota: { type: 'number', minimum: 1, maximum: 10 }, justificativa: { type: 'string' } }, required: ['nota', 'justificativa'] },
            estrategia_conteudo: { type: 'object', properties: { nota: { type: 'number', minimum: 1, maximum: 10 }, justificativa: { type: 'string' } }, required: ['nota', 'justificativa'] },
            monetizacao: { type: 'object', properties: { nota: { type: 'number', minimum: 1, maximum: 10 }, justificativa: { type: 'string' } }, required: ['nota', 'justificativa'] },
            engajamento_relacionamento: { type: 'object', properties: { nota: { type: 'number', minimum: 1, maximum: 10 }, justificativa: { type: 'string' } }, required: ['nota', 'justificativa'] },
          },
          required: ['clareza_nicho', 'autoridade_percebida', 'estrategia_conteudo', 'monetizacao', 'engajamento_relacionamento'],
        },
        nota_geral: { type: 'number', minimum: 0, maximum: 10 },
        veredito_curto: { type: 'string' },
        oportunidades: {
          type: 'array',
          minItems: 3,
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string' },
              racional: { type: 'string' },
              impacto_esperado: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
              esforco: { type: 'string', enum: ['baixo', 'medio', 'alto'] },
              primeiro_passo: { type: 'string' },
            },
            required: ['titulo', 'racional', 'impacto_esperado', 'esforco', 'primeiro_passo'],
          },
        },
        riscos: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string' },
              descricao: { type: 'string' },
              impacto_se_nao_resolvido: { type: 'string' },
            },
            required: ['titulo', 'descricao', 'impacto_se_nao_resolvido'],
          },
        },
        proximos_passos: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } },
      },
      required: ['identidade_atual', 'identidade_ideal', 'publico_alvo_inferido', 'pilares', 'nota_geral', 'veredito_curto', 'oportunidades', 'riscos', 'proximos_passos'],
    },
  },
};
