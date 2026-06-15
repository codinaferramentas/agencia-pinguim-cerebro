// ========================================================================
// Edge Function: agente-executar
// ========================================================================
// Loader genérico pra qualquer Worker do Pinguim OS (Copywriter, Designer,
// Verifier, etc). Não é o Chief — esse é chief-orquestrar.
//
// Recebe:
//   {
//     agente_slug, tenant_id, cliente_id, caso_id,
//     briefing,                  // o que o Chief mandou pro Worker
//     entregavel_origem_id?,     // se for revisão, ID da v1 que vai ser ajustada
//     parent_id?,                // ID do entregável anterior (pra versão chain)
//     contexto_extra?            // contexto adicional do Chief
//   }
//
// Retorna:
//   {
//     entregavel_id,
//     conteudo_estruturado,
//     nota_de_dissenso?  // se Worker detectou contradição com APRENDIZADOS
//   }
//
// Workers nascem stateless POR EXECUÇÃO, mas leem própria memória individual:
// - APRENDIZADOS.md (Tier 1 — geral)
// - perfis/<solicitante>.md (Tier 2 — específico desse cliente)
//
// Isso é o EPP individual ATIVO desde v1 (decisão 2026-05-05).
// ========================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  sb,
  carregarAgente,
  carregarMemoriaIndividual,
  montarSystemPrompt,
  chamarLLM,
  logarExecucao,
  logarCustoFinOps,
  calcularCustoUSD,
} from '../_shared/agente.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function requireAuth(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') || '';
  const headerJwt = auth.replace('Bearer ', '');
  if (!headerJwt) return false;
  if (headerJwt === SUPABASE_SERVICE_ROLE_KEY) return true;
  if (headerJwt.startsWith('eyJ')) {
    try {
      const adminClient = createClient(SUPABASE_URL, headerJwt, { auth: { persistSession: false } });
      const { error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (!error) return true;
    } catch (_) {}
  }
  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sbAnon.auth.getUser(headerJwt);
  return !error && !!data?.user;
}

// =====================================================
// Tools que orquestradores de squad (ex.: copy-chief) podem usar.
// Quando o agente tem 'delegar-mestre' nas ferramentas, ativamos loop tool-calling.
// =====================================================
const TOOLS_ORQUESTRADOR = [
  {
    type: 'function',
    function: {
      name: 'delegar-mestre',
      description: 'Invoca um mestre da squad pra executar parte do trabalho. Devolve a contribuição estruturada do mestre.',
      parameters: {
        type: 'object',
        properties: {
          mestre_slug: { type: 'string', description: 'slug do mestre (ex.: alex-hormozi, eugene-schwartz, gary-halbert, gary-bencivenga)' },
          briefing: { type: 'string', description: 'briefing claro pro mestre — objetivo, público, parâmetros específicos' },
          parte: { type: 'string', description: 'qual parte do roteiro ele faz (ex.: "gancho", "desenvolvimento", "completo")', default: 'completo' },
        },
        required: ['mestre_slug', 'briefing'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consolidar-roteiro',
      description: 'Consolida as contribuições dos mestres invocados em copy/roteiro final. Use DEPOIS de invocar 1-2 mestres. Termina o trabalho do orquestrador.',
      parameters: {
        type: 'object',
        properties: {
          objetivo: { type: 'string' },
          publico_consciencia: { type: 'string', description: 'nivel de consciencia identificado' },
          mestres_usados: { type: 'array', items: { type: 'string' } },
          justificativa: { type: 'string', description: 'por que esses mestres foram escolhidos' },
          copy_final: {
            type: 'object',
            properties: {
              gancho: { type: 'string' },
              desenvolvimento: { type: 'string' },
              virada: { type: 'string' },
              cta: { type: 'string' },
              metodo_anotado: { type: 'string', description: 'linha final tipo MÉTODO: ...' },
            },
          },
        },
        required: ['objetivo', 'mestres_usados', 'justificativa', 'copy_final'],
      },
    },
  },
];

function ehOrquestrador(agente: any): boolean {
  return Array.isArray(agente.ferramentas) && agente.ferramentas.includes('delegar-mestre');
}

// =====================================================
// CATALOGO GENERICO DE TOOLS
// =====================================================
// Cada entrada: { schema_openai, edge_function_url, builder_input(args, contexto) }
// Quando agente declara `ferramentas: ['consultar-hotmart', ...]`, sistema monta
// definicao OpenAI + sabe invocar Edge Function correspondente.
// =====================================================
const TOOLS_CATALOGO: Record<string, {
  schema: any;
  edge: string;
  buildInput?: (args: any, ctx: any) => any;
}> = {
  'consultar-hotmart': {
    schema: {
      type: 'function',
      function: {
        name: 'consultar_hotmart',
        description: 'Consulta historico completo de compras de um cliente na Hotmart pelo email. Retorna comprador (nome, telefone), produtos comprados com data/status/valor, gasto total, valor reembolsado.',
        parameters: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Email do comprador (obrigatorio)' },
          },
          required: ['email'],
        },
      },
    },
    edge: 'tool-consultar-hotmart',
  },
  'buscar-prova-social': {
    schema: {
      type: 'function',
      function: {
        name: 'buscar_prova_social',
        description: 'Busca depoimentos / provas sociais de alunos de um produto Pinguim. Retorna lista com autor, resumo, tipo (seguidores/faturamento/outro), URL da imagem (Supabase Storage publica), link Discord original. Use sempre que o usuario pedir prova social, depoimento, exemplo de aluno, case de sucesso, antes/depois.',
        parameters: {
          type: 'object',
          properties: {
            produto_slug: { type: 'string', description: 'Slug do produto. Ex: "elo", "proalt", "lyra", "tuarus", "orion", "desafio-de-conte-do-lo-fi"' },
            ordenar_por: { type: 'string', enum: ['seguidores', 'faturamento', 'recentes', 'auto'], description: 'Default "auto" — agente decide pelo produto. Elo = seguidores primeiro. ProAlt/Lyra = faturamento.' },
            id_especifico: { type: 'string', description: 'OPCIONAL — UUID do depoimento. Quando passa, devolve detalhe completo (conteudo_completo) de UM so' },
            filtro_texto: { type: 'string', description: 'OPCIONAL — busca textual no conteudo+resumo+autor (ex: "Natalia", "milhao", "seguidores")' },
            limite: { type: 'number', description: 'Quantos retornar (default 5, max 50)', default: 5 },
            incluir_todos: { type: 'boolean', description: 'Se true, ignora limite e devolve todos' },
          },
          required: ['produto_slug'],
        },
      },
    },
    edge: 'tool-buscar-prova-social',
  },
  'verificar-acesso-membros': {
    schema: {
      type: 'function',
      function: {
        name: 'verificar_acesso_membros',
        description: 'CHAME ESTA TOOL quando o usuario perguntar QUALQUER COISA sobre ACESSO de uma pessoa a area de membros, Club, plataforma. Gatilhos OBRIGATORIOS — ao detectar QUALQUER um destes, chame imediatamente:\n- "tem acesso?" / "ela tem acesso?" / "ele tem acesso?"\n- "quais areas de membros?"\n- "esta ativo no club?"\n- "consegue entrar?"\n- "qual o ultimo acesso?"\n- "ja viu as aulas?" / "ja viu as aulas dele?" / "viu as aulas?"\n- "assistiu?" / "assistiu as aulas?"\n- "esta engajado?"\n- "progresso nas aulas?"\n- "ja entrou?" / "entrou no club?"\nNAO IMPORTA se voce ja consultou compras antes — acesso e DADO DIFERENTE de compra. SEMPRE chame esta tool quando a pergunta for sobre acesso, mesmo que o contexto anterior tenha compras. NUNCA responda "nao tem acesso" sem chamar esta tool primeiro. Diferente de consultar_pessoa que mostra COMPRAS — esta tool mostra ACESSO REAL ativo agora.',
        parameters: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Email do aluno (obrigatorio). Se voce conhece o email da pessoa pelo contexto anterior, USE ele aqui.' },
          },
          required: ['email'],
        },
      },
    },
    edge: 'tool-verificar-acesso-membros',
  },
  'consultar-pessoa': {
    schema: {
      type: 'function',
      function: {
        name: 'consultar_pessoa',
        description: 'CHAME ESTA TOOL quando o usuario quiser CONSULTAR/BUSCAR dados de uma pessoa (compras, cadastro, historico). Gatilhos OBRIGATORIOS:\n- "consulta esse [telefone/email/cpf/nome]"\n- "o que essa pessoa comprou?"\n- "ela ja foi cliente?"\n- "tem cadastro do [X]?"\n- "esse contato comprou alguma coisa?"\nAceita QUALQUER identificador (email, telefone com ou sem mascara, CPF, nome). NUNCA peca outro dado se ja tem 1 valido. Busca em paralelo nas 5 fontes (Hotmart, Clint, ProAlt, Elo, Sirius). IMPORTANTE: esta tool mostra COMPRAS — se o usuario perguntar sobre ACESSO depois, use verificar_acesso_membros (sao dados DIFERENTES).',
        parameters: {
          type: 'object',
          properties: {
            identificador: { type: 'string', description: 'O dado que o usuario forneceu — pode ser email, telefone (com ou sem mascara), CPF, nome completo. Min 3 chars.' },
            fontes: { type: 'array', items: { type: 'string', enum: ['hotmart','clint','proalt','elo','sirius'] }, description: 'OPCIONAL — restringe a busca a fontes especificas. Se omitido, busca em TODAS.' },
            tipo_forcado: { type: 'string', enum: ['email','telefone','cpf','nome'], description: 'OPCIONAL — forca o tipo do identificador. Use SO se a auto-deteccao errar.' },
          },
          required: ['identificador'],
        },
      },
    },
    edge: 'tool-consultar-pessoa',
  },
  'buscar-cerebro': {
    schema: {
      type: 'function',
      function: {
        name: 'buscar_cerebro',
        description: 'Busca semantica no Cerebro de um produto Pinguim (aulas, depoimentos, paginas de venda, sacadas, objecoes). Use pra trazer trechos relevantes do produto pra calibrar copy ou responder factualmente.',
        parameters: {
          type: 'object',
          properties: {
            produto_slug: { type: 'string', description: 'Slug do produto. Valores possiveis: proalt, elo, lyra, tuarus, desafio-de-conte-do-lo-fi, mentoria-express, orion, low-ticket-desafio.' },
            query: { type: 'string', description: 'Pergunta ou termo de busca (min 3 chars). Ex: "prova social", "garantia", "value equation oferta"' },
            top_k: { type: 'number', description: 'Quantidade de chunks (default 8)', default: 8 },
          },
          required: ['produto_slug', 'query'],
        },
      },
    },
    edge: 'tool-buscar-cerebro',
  },
  'analisar-imagem': {
    schema: {
      type: 'function',
      function: {
        name: 'analisar_imagem',
        description: 'Analisa uma imagem que o usuario anexou (print, criativo, screenshot, foto) usando GPT-4o Vision. Voce nao precisa fornecer "imagem_url" — o sistema injeta automaticamente a imagem que o usuario colou/anexou. So forneca "instrucao".',
        parameters: {
          type: 'object',
          properties: {
            imagem_url: { type: 'string', description: 'OPCIONAL — se fornecido, usa essa URL. Senao, sistema usa imagem anexada pelo usuario.' },
            instrucao: { type: 'string', description: 'O que voce quer saber/analisar nessa imagem. Ex: "analisa esse criativo de anuncio e me diz o que tem de bom e ruim"' },
          },
          required: ['instrucao'],
        },
      },
    },
    edge: 'tool-analisar-imagem',
    buildInput: (args: any, ctx: any) => {
      // Injeta imagem do contexto se agente nao forneceu
      return {
        instrucao: args.instrucao,
        imagem_url: args.imagem_url || ctx?.imagemDataUri || null,
      };
    },
  },
  'gerar-html-entregavel': {
    schema: {
      type: 'function',
      function: {
        name: 'gerar_html_entregavel',
        description: 'Salva um HTML como entregavel (proposta, apresentacao, relatorio, email formatado) e retorna URL publica compartilhavel. Use quando o usuario pedir algo visual que ele queira compartilhar ou ver renderizado.',
        parameters: {
          type: 'object',
          properties: {
            titulo: { type: 'string', description: 'Titulo curto do entregavel' },
            html: { type: 'string', description: 'HTML completo (com inline styles). Pode incluir <h1>, <p>, <table>, <img>, etc' },
            tipo: { type: 'string', description: 'Tipo do entregavel (ex: "proposta", "apresentacao", "relatorio")' },
          },
          required: ['titulo', 'html'],
        },
      },
    },
    edge: 'tool-gerar-html-entregavel',
  },
  'buscar-agente-semantico': {
    schema: {
      type: 'function',
      function: {
        name: 'buscar_agente_semantico',
        description: 'Triagem: dado o que o usuario quer fazer, retorna os agentes Pinguim mais relevantes por similaridade semantica. Use sempre que o usuario descrever uma tarefa e voce precisar achar quem faz aquilo.',
        parameters: {
          type: 'object',
          properties: {
            pergunta: { type: 'string', description: 'O que o usuario quer fazer (em PT-BR). Ex: "escrever email de venda", "consultar cadastro de cliente", "criar copy pra anuncio Meta"' },
            top_k: { type: 'number', description: 'Quantos agentes retornar (default 5)', default: 5 },
          },
          required: ['pergunta'],
        },
      },
    },
    edge: 'tool-buscar-agente-semantico',
  },
  'listar-agentes-por-area': {
    schema: {
      type: 'function',
      function: {
        name: 'listar_agentes_por_area',
        description: 'Lista agentes de uma squad/area especifica. Use quando o usuario menciona uma area conhecida (copy, storytelling, traffic, etc) e quer ver opcoes ali dentro.',
        parameters: {
          type: 'object',
          properties: {
            squad_slug: { type: 'string', description: 'Slug da squad. Valores: copy, storytelling, traffic-masters, design, data, advisory-board, deep-research, translate, cybersecurity, finops, legal, squad-creator-pro.' },
            limite: { type: 'number', description: 'Maximo de agentes (default 30)', default: 30 },
          },
          required: [],
        },
      },
    },
    edge: 'tool-listar-agentes-por-area',
  },

  // ================================================================
  // ANALISTA META ADS (V2.15 — analise-de-dados)
  // ================================================================
  'meta-listar-campos': {
    schema: {
      type: 'function',
      function: {
        name: 'meta_listar_campos',
        description: 'Lista o catalogo PT-BR dos campos da Meta Marketing API agrupados em 6 familias (custo, performance, engajamento, video, conversao, breakdowns). Use ANTES de gerar relatorio quando o usuario pediu metricas vagas ("performance", "engajamento", "video") ou quando voce nao tem certeza do nome real do campo. Tambem retorna defaults_por_intencao — mapas prontos de palavra-chave pra conjunto de campos.',
        parameters: {
          type: 'object',
          properties: {
            familia: { type: 'string', enum: ['custo','performance','engajamento','video','conversao','breakdowns'], description: 'OPCIONAL — filtra so uma familia' },
          },
        },
      },
    },
    edge: 'tool-meta-listar-campos',
  },
  'meta-gerar-relatorio': {
    schema: {
      type: 'function',
      function: {
        name: 'meta_gerar_relatorio',
        description: 'Puxa dados Meta Ads DIRETO da Graph API (nao Dashboard) e GRAVA EM ARTEFATO. Devolve SO um resumo curto + `artifact_id`. NAO devolve as matrizes pra voce — elas ficam guardadas no artefato. PROXIMO PASSO OBRIGATORIO: chamar `subir_planilha_drive` passando esse artifact_id pra subir planilha no Drive. NUNCA repita os dados completos na sua resposta — voce nao tem eles, so o resumo. Default escopo = todas contas do BM "Grupo Pinguim".',
        parameters: {
          type: 'object',
          properties: {
            periodo: {
              type: 'object',
              description: 'OBRIGATORIO. Use preset OU inicio+fim.',
              properties: {
                preset: { type: 'string', enum: ['today','yesterday','last_7d','last_30d','this_month','last_month'] },
                inicio: { type: 'string', description: 'YYYY-MM-DD' },
                fim:    { type: 'string', description: 'YYYY-MM-DD' },
              },
            },
            nivel: { type: 'string', enum: ['account','campaign','adset','ad'], description: 'Default: campaign. Use account so pra total geral, adset/ad pra granularidade.' },
            campos: { type: 'array', items: { type: 'string' }, description: 'Lista de campos da Meta API. Default: ["spend"]. Use meta_listar_campos pra ver opcoes. Ex: ["spend","impressions","ctr","actions:purchase","action_values:purchase","purchase_roas"]' },
            agrupamento_temporal: { type: 'string', enum: ['none','daily','monthly'], description: 'Default: monthly. Use daily pra periodos curtos, monthly pra periodos longos, none pra agregar tudo.' },
            agrupar_por_prefixo_produto: { type: 'boolean', description: 'Default false. Se true, extrai prefixo [XXX] do nome da campanha como produto e gera matriz pivot produto x mes. Use SEMPRE quando o usuario falar em "por produto" ou usar nomes de produto Pinguim.' },
            contas: { type: 'array', items: { type: 'string' }, description: 'OPCIONAL — lista de act_XXX. Default: todas do BM Grupo Pinguim.' },
            filtro_status: { type: 'string', enum: ['ACTIVE','PAUSED'], description: 'OPCIONAL — filtra so campanhas ATIVAS ou PAUSADAS.' },
            filtro_nome_contem: { type: 'string', description: 'OPCIONAL — filtra entity.name por substring (case-insensitive). Ex: "365" pra so campanhas do produto 365.' },
            breakdowns: { type: 'array', items: { type: 'string' }, description: 'OPCIONAL — quebras adicionais. Ex: ["age","gender"], ["publisher_platform","platform_position"]' },
          },
          required: ['periodo'],
        },
      },
    },
    edge: 'tool-meta-gerar-relatorio',
    // V2 (Onda 1): injeta cliente_id e agente_id no body pra grava artefato vinculado
    buildInput: (args: any, ctx: any) => ({
      ...args,
      cliente_id: ctx?.cliente_id,
      agente_id: ctx?.agente?.id,
    }),
  },
  // ================================================================
  // ANALISTA HOTMART (V2.15 Onda 2 — Pattern Artifact)
  // ================================================================
  'hotmart-listar-campos': {
    schema: {
      type: 'function',
      function: {
        name: 'hotmart_listar_campos',
        description: 'Lista o catalogo PT-BR dos tipos de relatorio Hotmart disponiveis (vendas, reembolsos, top_compradores, ranking_produtos), os agrupamentos possiveis (produto, dia, mes, status, payment_type) e filtros. Use ANTES de gerar relatorio se voce nao tem certeza do tipo ou agrupamento. Tambem retorna defaults_por_intencao mapeando palavras-chave do usuario pra parametros.',
        parameters: {
          type: 'object',
          properties: {
            tipo_relatorio: { type: 'string', enum: ['vendas','reembolsos','top_compradores','ranking_produtos'], description: 'OPCIONAL — filtra so um tipo' },
          },
        },
      },
    },
    edge: 'tool-hotmart-listar-campos',
  },
  'hotmart-gerar-relatorio': {
    schema: {
      type: 'function',
      function: {
        name: 'hotmart_gerar_relatorio',
        description: 'Tool principal pra puxar dados Hotmart (vendas/reembolsos/top compradores/ranking produtos) do Dashboard externo e GRAVAR EM ARTEFATO. Devolve SO um resumo curto + `artifact_id`. NAO devolve as matrizes pra voce. PROXIMO PASSO OBRIGATORIO: chamar `subir_planilha_drive` passando esse artifact_id pra subir planilha no Drive (pasta sugerida: "Relatorios Pinguim/Hotmart"). REGRAS DURAS aplicadas automaticamente: receita = my_commission (NUNCA price_value), status validos = approved+completed, reembolso filtra por refund_date (nao purchase_date), moeda BRL default.',
        parameters: {
          type: 'object',
          properties: {
            tipo_relatorio: { type: 'string', enum: ['vendas','reembolsos','top_compradores','ranking_produtos'], description: 'Tipo do relatorio. Default: vendas.' },
            periodo: {
              type: 'object',
              description: 'OBRIGATORIO. Use preset OU inicio+fim.',
              properties: {
                preset: { type: 'string', enum: ['today','yesterday','last_7d','last_30d','this_month','last_month','ytd'] },
                inicio: { type: 'string', description: 'YYYY-MM-DD' },
                fim:    { type: 'string', description: 'YYYY-MM-DD' },
              },
            },
            agrupamento: { type: 'string', enum: ['produto','dia','mes','status','payment_type'], description: 'Default: produto. Use mes pra periodo longo (>3 meses), dia pra curto (<60 dias).' },
            moeda: { type: 'string', description: 'Default: BRL. NUNCA misture moedas — passe sempre uma so.' },
            filtro_produto: { type: 'string', description: 'OPCIONAL — filtra produtos por nome (ILIKE). Ex: "Elo", "Lyra".' },
            filtro_payment_type: { type: 'string', description: 'OPCIONAL — uppercase. Ex: "PIX", "CREDIT_CARD".' },
            incluir_order_bump: { type: 'boolean', description: 'Default true. Se false, exclui order bumps.' },
            limite: { type: 'number', description: 'Default 10000, max 50000.' },
          },
          required: ['periodo'],
        },
      },
    },
    edge: 'tool-hotmart-gerar-relatorio',
    buildInput: (args: any, ctx: any) => ({
      ...args,
      cliente_id: ctx?.cliente_id,
      agente_id: ctx?.agente?.id,
    }),
  },

  'subir-planilha-drive': {
    schema: {
      type: 'function',
      function: {
        name: 'subir_planilha_drive',
        description: 'Sobe planilha Google Sheets multi-aba no Drive do socio. SEMPRE cria nova planilha — nao sobrescreve. CASO DE USO PRINCIPAL: depois de chamar uma tool que retornou `artifact_id`, voce SO precisa passar esse artifact_id + pasta_caminho. A planilha eh montada automaticamente do artefato (abas Pivot/Long/Detalhe ja prontas) e o nome eh sugerido com data/hora. Use SEMPRE no fim de relatorios pra entregar planilha em vez de jogar matriz no chat. Pasta padrao analista-meta-ads = "Relatorios Pinguim/Meta Ads".',
        parameters: {
          type: 'object',
          properties: {
            artifact_id: { type: 'string', description: 'PREFERIDO: ID do artefato retornado por outra tool (ex: meta_gerar_relatorio). Quando passado, a planilha eh montada automaticamente com as matrizes ja prontas.' },
            pasta_caminho: { type: 'string', description: 'Caminho da pasta no Drive. Ex: "Relatorios Pinguim/Meta Ads". Cria niveis automaticamente.' },
            nome_planilha: { type: 'string', description: 'OPCIONAL — formato recomendado: "[Fonte] · [Tema curto] · dd/mm HH:MM". Se nao passar, sistema gera automatico do artefato + data/hora atual.' },
            abas: {
              type: 'array',
              description: 'OPCIONAL — uso avancado quando voce ja tem dados na mao (raro). Cada aba precisa de titulo e linhas (matriz com cabecalho na 1a linha). Se passou artifact_id, NAO precisa passar isso.',
              items: {
                type: 'object',
                properties: {
                  titulo: { type: 'string' },
                  linhas: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                },
                required: ['titulo','linhas'],
              },
            },
          },
          required: ['pasta_caminho'],
        },
      },
    },
    edge: 'tool-subir-planilha-drive',
    // Injeta cliente_id do contexto — agente nao precisa passar
    buildInput: (args: any, ctx: any) => ({
      ...args,
      cliente_id: ctx?.cliente_id,
    }),
  },
};

function montarToolsDoAgente(agente: any): any[] {
  const ferramentas: string[] = Array.isArray(agente.ferramentas) ? agente.ferramentas : [];
  const tools: any[] = [];
  for (const ferramenta of ferramentas) {
    const entry = TOOLS_CATALOGO[ferramenta];
    if (entry) tools.push(entry.schema);
  }
  return tools;
}

async function invocarTool(toolName: string, args: any, ctx: any): Promise<any> {
  // toolName vem do OpenAI no formato function name (com underscore). Normaliza pra slug do catalogo (com hifen).
  const slug = toolName.replace(/_/g, '-');
  const entry = TOOLS_CATALOGO[slug];
  if (!entry) return { erro: `Tool '${slug}' nao existe no catalogo` };
  const url = `${SUPABASE_URL}/functions/v1/${entry.edge}`;
  const body = entry.buildInput ? entry.buildInput(args, ctx) : args;
  // Debug: payload do service role usado
  try {
    const parts = SUPABASE_SERVICE_ROLE_KEY.split('.');
    if (parts.length === 3) {
      const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - parts[1].length % 4) % 4);
      const pl = JSON.parse(atob(padded));
      console.log('[invocarTool] SERVICE_ROLE_KEY payload role=' + pl.role + ' iss=' + pl.iss);
    }
  } catch (_) {}
  console.log('[invocarTool] -> ' + entry.edge + ' args=' + JSON.stringify(body).slice(0, 200));
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        'x-internal-token': SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    console.log('[invocarTool] <- ' + entry.edge + ' status=' + r.status + ' body=' + txt.slice(0, 300));
    try {
      const j = JSON.parse(txt);
      if (!r.ok) return { erro: j.erro || `HTTP ${r.status}` };
      return j;
    } catch {
      return { erro: `Resposta nao-JSON da tool: ${txt.slice(0, 200)}` };
    }
  } catch (e: any) {
    console.error('[invocarTool] FETCH erro:', e.message);
    return { erro: 'Falha de rede chamando tool: ' + (e.message || 'desconhecido') };
  }
}

function temToolsGenericas(agente: any): boolean {
  const ferramentas: string[] = Array.isArray(agente.ferramentas) ? agente.ferramentas : [];
  return ferramentas.some(f => f in TOOLS_CATALOGO);
}

function formatarConsolidadoMd(card: any): string {
  if (!card) return '';
  const partes: string[] = [];
  if (card.objetivo) partes.push(`**Objetivo:** ${card.objetivo}`);
  if (card.publico_consciencia) partes.push(`**Público (consciência):** ${card.publico_consciencia}`);
  if (Array.isArray(card.mestres_usados)) partes.push(`**Mestres usados:** ${card.mestres_usados.join(', ')}`);
  if (card.justificativa) partes.push(`**Justificativa:** ${card.justificativa}`);
  partes.push('');
  if (card.copy_final) {
    const c = card.copy_final;
    if (c.gancho) partes.push(`### [GANCHO]\n${c.gancho}`);
    if (c.desenvolvimento) partes.push(`### [DESENVOLVIMENTO]\n${c.desenvolvimento}`);
    if (c.virada) partes.push(`### [VIRADA]\n${c.virada}`);
    if (c.cta) partes.push(`### [CTA]\n${c.cta}`);
    if (c.metodo_anotado) partes.push(`\n_${c.metodo_anotado}_`);
  }
  return partes.join('\n\n');
}

// =====================================================
// Schema obrigatório de saída pros Workers (R8 — sem blob)
// =====================================================
const SCHEMA_RESPOSTA_WORKER = `
Sua resposta DEVE ser JSON válido com esta estrutura:

{
  "tipo": "<copy|pagina|relatorio|plano|outro>",
  "titulo": "<título curto>",
  "conteudo_estruturado": {
    // estrutura tipada do entregável — siga o que o Chief pediu
    // se for copy: { titulo, subtitulo, paragrafos: [...], cta }
    // se for relatório: { resumo_executivo, secoes: [{ titulo, paragrafos }] }
    // se for plano: { etapas: [{ ordem, descricao, prazo }] }
  },
  "conteudo_md": "<versão markdown legível pro humano>",
  "nota_de_dissenso": null  // OU objeto se detectou contradição com seus APRENDIZADOS:
                            // { briefing_recebido, aprendizado_conflitante, recomendacao }
}

REGRAS:
- conteudo_estruturado é OBRIGATÓRIO (sem blob de texto).
- Se você detectar que o briefing contradiz seu APRENDIZADOS.md ou perfil do solicitante,
  PAUSE a execução: preencha nota_de_dissenso com 3 campos e retorne sem gerar entregável.
  Chief vai decidir.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResp({ error: 'Use POST' }, 405);
  if (!(await requireAuth(req))) return jsonResp({ error: 'Não autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: 'JSON inválido' }, 400); }

  const {
    agente_slug,
    tenant_id,
    cliente_id,
    caso_id,
    solicitante_id,
    briefing,
    entregavel_origem_id,
    parent_id,
    contexto_extra,
  } = body;

  if (!agente_slug || !tenant_id || !cliente_id || !briefing) {
    return jsonResp({ error: 'Faltam: agente_slug, tenant_id, cliente_id, briefing' }, 400);
  }
  if (agente_slug === 'pinguim') {
    return jsonResp({ error: 'Use /atendente-pinguim pro agente principal, não /agente-executar' }, 400);
  }

  const tInicio = Date.now();
  try {
    // 1. Carrega Worker
    const worker = await carregarAgente(agente_slug);

    // 2. Memória individual do Worker
    const { aprendizados, perfilSolicitante, feedbackNegativo } = await carregarMemoriaIndividual(
      worker.id,
      solicitante_id || cliente_id,
    );

    // 2.5. Historico conversacional desse usuario+agente (memoria de chat)
    // Pega as ultimas 6 mensagens (3 turnos completos) por (cliente_id, agente_id).
    //
    // Stale-context shortcut fix (2026-05-26): respostas anteriores do agente sao
    // RESUMIDAS em vez de passar cru. O LLM ve "Consultei X, achei Y" em vez da
    // tabela completa de resultados. Evita que ele "responda de cabeca" no turno
    // seguinte achando que tem dados pra responder sem chamar tool de novo.
    function resumirRespostaAgente(conteudo: string): string {
      const txt = String(conteudo || '').trim();
      if (!txt) return '';
      // Se eh curto, mantem cru (ja eh "resumo" naturalmente)
      if (txt.length < 300) return txt;
      // Extrai entidades-chave do texto (nome, email, telefone) pra preservar contexto
      const emails = [...txt.matchAll(/[\w.+-]+@[\w.-]+\.\w{2,}/g)].map(m => m[0]).slice(0, 2);
      const telefones = [...txt.matchAll(/\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4}/g)].map(m => m[0]).slice(0, 2);
      // Pega primeiras 2 linhas nao vazias (geralmente tem nome da pessoa / produto)
      const linhasIniciais = txt.split('\n').filter(l => l.trim().length > 5).slice(0, 2).join(' | ');
      const entidades = [
        ...emails.map(e => 'email=' + e),
        ...telefones.map(t => 'tel=' + t),
      ].join(', ');
      return `[Resumo do turno anterior — ${linhasIniciais.slice(0, 200)}${entidades ? ' | Entidades: ' + entidades : ''}]`;
    }

    let historicoChat: Array<{ role: string; content: string }> = [];
    if (cliente_id && cliente_id !== '00000000-0000-0000-0000-000000000000') {
      const { data: msgsAnteriores } = await sb()
        .from('conversas')
        .select('papel, conteudo, criado_em')
        .eq('cliente_id', cliente_id)
        .eq('agente_id', worker.id)
        .is('caso_id', null)
        .order('criado_em', { ascending: false })
        .limit(6);
      if (msgsAnteriores && msgsAnteriores.length > 0) {
        historicoChat = msgsAnteriores.reverse().map((m: any) => ({
          role: m.papel === 'humano' ? 'user' : 'assistant',
          content: m.papel === 'humano'
            ? String(m.conteudo || '').slice(0, 4000)
            : resumirRespostaAgente(m.conteudo),
        }));
      }
    }

    // 3. Carrega entregável de origem (se for revisão)
    let entregavelOrigem: any = null;
    if (entregavel_origem_id) {
      const { data } = await sb()
        .from('entregaveis')
        .select('*')
        .eq('id', entregavel_origem_id)
        .maybeSingle();
      entregavelOrigem = data;
    }

    // 4. É orquestrador (tem delegar-mestre nas ferramentas)? Loop tool calling.
    //    Senão, chamada simples e parse de JSON estruturado.
    const orquestrador = ehOrquestrador(worker);

    // 5. Monta system prompt (sem schema rígido pra orquestrador, com schema pro worker simples)
    const systemPrompt = montarSystemPrompt({
      agente: worker,
      aprendizados,
      perfilSolicitante,
      feedbackNegativo,
      solicitanteSlug: null,
      historico: [],
    }) + (orquestrador ? '' : '\n\n' + SCHEMA_RESPOSTA_WORKER);

    // 6. User message
    let userMsg = `## Briefing\n${briefing}`;
    if (entregavelOrigem) {
      userMsg += `\n\n## Entregável de origem (versão ${entregavelOrigem.versao})\nTipo: ${entregavelOrigem.tipo}\nTítulo: ${entregavelOrigem.titulo}\n\n${entregavelOrigem.conteudo_md || JSON.stringify(entregavelOrigem.conteudo_estruturado, null, 2)}`;
    }
    // Trata contexto_extra de forma especial: imagem_data_uri NAO vai no user message
    // (eh gigante, gasta tokens, polui). Fica disponivel pra tool via buildInput.
    let imagemDataUri: string | null = null;
    if (contexto_extra) {
      if (typeof contexto_extra === 'object' && contexto_extra.imagem_data_uri) {
        imagemDataUri = contexto_extra.imagem_data_uri;
        // Avisa no briefing que tem imagem disponivel
        userMsg += `\n\n## Contexto extra\nO usuário anexou uma imagem. Use a ferramenta \`analisar_imagem\` (a imagem sera passada automaticamente — voce so precisa fornecer "instrucao", o sistema injeta "imagem_url" sozinho).`;
        // Remove imagem do contexto_extra antes de stringify (evita poluir)
        const ctxLimpo = { ...contexto_extra };
        delete ctxLimpo.imagem_data_uri;
        if (Object.keys(ctxLimpo).length > 0) {
          userMsg += `\n\nOutro contexto:\n${JSON.stringify(ctxLimpo)}`;
        }
      } else {
        userMsg += `\n\n## Contexto extra\n${typeof contexto_extra === 'string' ? contexto_extra : JSON.stringify(contexto_extra)}`;
      }
    }

    // v0.14.0: se ha imagem E o agente NAO tem capacidade orquestrador (sem analisar_imagem tool),
    // injeta a imagem direto no user message como multi-modal content (igual ChatGPT vision).
    // Esse fluxo eh usado pelo pinguim-analisador-tela: agente nao chama tool, le imagem direto.
    function montarUserContent(): any {
      if (!imagemDataUri) return userMsg;
      // Multi-modal content (formato OpenAI Chat Completions com imagem)
      return [
        { type: 'text', text: userMsg },
        { type: 'image_url', image_url: { url: imagemDataUri, detail: 'high' } },
      ];
    }

    // 7. Loop tool calling se orquestrador, senão chamada simples
    let totalTokensIn = 0, totalTokensOut = 0, totalTokensCached = 0, totalLatenciaMs = 0;
    let modeloUsadoFinal = '';
    let respostaFinal: any = null;
    let consolidadoCard: any = null;
    let mestresInvocados: Array<{ slug: string; output: any; uso: any }> = [];

    // PROTECAO: timeout absoluto + loop detection (ferramenta repetida 3x com mesmo input)
    const TIMEOUT_MS = 120_000;
    const tInicioProtecao = Date.now();
    const historicoToolCalls: string[] = []; // assinaturas (nome+input) das ultimas chamadas
    function detectaLoopFerramentaRepetida(toolCalls: any[]): string | null {
      for (const tc of toolCalls) {
        const assinatura = tc.name + ':' + JSON.stringify(tc.arguments).slice(0, 300);
        historicoToolCalls.push(assinatura);
        // Mantem so as ultimas 6
        if (historicoToolCalls.length > 6) historicoToolCalls.shift();
        // Se essa assinatura aparece 3+ vezes nas ultimas 6: loop
        const ocorrencias = historicoToolCalls.filter(a => a === assinatura).length;
        if (ocorrencias >= 3) return assinatura.slice(0, 120);
      }
      return null;
    }

    if (orquestrador) {
      const llmMessages: any[] = [...historicoChat, { role: 'user', content: montarUserContent() }];
      const MAX_ROUNDS = 6;

      for (let round = 0; round <= MAX_ROUNDS; round++) {
        if (Date.now() - tInicioProtecao > TIMEOUT_MS) {
          console.warn('[agente-executar] TIMEOUT 120s atingido em ' + agente_slug);
          respostaFinal = { conteudo_md: '[Execucao excedeu 120s — interrompida pra evitar custo desnecessario]' };
          break;
        }
        const llmResp = await chamarLLM({
          modelo: worker.modelo || 'openai:gpt-4o',
          systemPrompt,
          messages: llmMessages,
          tools: TOOLS_ORQUESTRADOR,
          temperatura: worker.temperatura ?? 0.5,
          maxTokens: 4096,
        }, `agente-${agente_slug}`);

        totalTokensIn += llmResp.tokensIn;
        totalTokensOut += llmResp.tokensOut;
        totalTokensCached += llmResp.tokensCached;
        totalLatenciaMs += llmResp.latenciaMs;
        modeloUsadoFinal = llmResp.modeloUsado;

        if (!llmResp.toolCalls || llmResp.toolCalls.length === 0) {
          // Sem tool calls — output direto
          respostaFinal = { conteudo_md: llmResp.content };
          break;
        }

        // Loop detection: mesma ferramenta+input chamada 3x nas ultimas 6 chamadas
        const loopDetectado = detectaLoopFerramentaRepetida(llmResp.toolCalls);
        if (loopDetectado) {
          console.warn('[agente-executar] LOOP detectado em ' + agente_slug + ': ' + loopDetectado);
          respostaFinal = { conteudo_md: '[Loop detectado — agente tentou a mesma ferramenta com mesmo input 3 vezes. Execucao interrompida.]' };
          break;
        }

        // Adiciona assistant com tool_calls
        llmMessages.push({
          role: 'assistant',
          content: llmResp.content || null,
          tool_calls: llmResp.toolCalls.map(tc => ({
            id: tc.id, type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        });

        let temConsolidado = false;
        for (const tc of llmResp.toolCalls) {
          if (tc.name === 'consolidar-roteiro') {
            consolidadoCard = tc.arguments;
            temConsolidado = true;
          }
        }

        for (const tc of llmResp.toolCalls) {
          let resultado: any;
          if (tc.name === 'delegar-mestre') {
            // Chamada recursiva ao próprio agente-executar
            const r = await fetch(`${SUPABASE_URL}/functions/v1/agente-executar`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agente_slug: tc.arguments.mestre_slug,
                tenant_id, cliente_id, caso_id,
                solicitante_id,
                briefing: tc.arguments.briefing + (tc.arguments.parte ? `\n\nParte: ${tc.arguments.parte}` : ''),
              }),
            });
            const data = await r.json();
            mestresInvocados.push({ slug: tc.arguments.mestre_slug, output: data, uso: data?.uso });
            resultado = {
              ok: data.ok,
              mestre: tc.arguments.mestre_slug,
              entregavel_id: data.entregavel_id,
              titulo: data.titulo,
              conteudo: data.conteudo_estruturado,
              uso: data.uso,
            };
          } else if (tc.name === 'consolidar-roteiro') {
            resultado = { status: 'card_capturado' };
          } else {
            resultado = { error: `Tool '${tc.name}' não suportada por orquestrador` };
          }
          llmMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(resultado),
          });
        }

        if (temConsolidado) break;
        if (round === MAX_ROUNDS) {
          respostaFinal = { conteudo_md: llmResp.content || '[Limite de rounds]' };
        }
      }

      respostaFinal = {
        tipo: 'orquestracao-copy',
        titulo: consolidadoCard?.objetivo || 'Roteiro consolidado',
        conteudo_estruturado: consolidadoCard || respostaFinal,
        conteudo_md: consolidadoCard ? formatarConsolidadoMd(consolidadoCard) : (respostaFinal?.conteudo_md || ''),
        nota_de_dissenso: null,
      };
    } else if (temToolsGenericas(worker)) {
      // ===========================================
      // AGENTE OPERACIONAL com tools genericas
      // ===========================================
      const toolsDoAgente = montarToolsDoAgente(worker);
      const llmMessages: any[] = [...historicoChat, { role: 'user', content: montarUserContent() }];
      const MAX_ROUNDS_OP = 6;
      const toolsInvocadas: Array<{ name: string; args: any; result: any }> = [];
      let textoFinal = '';
      // System prompt nao usa SCHEMA_RESPOSTA_WORKER (response livre, agente decide formato)
      const sysOp = montarSystemPrompt({
        agente: worker, aprendizados, perfilSolicitante, feedbackNegativo, solicitanteSlug: null, historico: [],
      });

      for (let round = 0; round <= MAX_ROUNDS_OP; round++) {
        if (Date.now() - tInicioProtecao > TIMEOUT_MS) {
          textoFinal = '[Execucao excedeu 120s — interrompida pra evitar custo desnecessario]';
          break;
        }
        const llmResp = await chamarLLM({
          modelo: worker.modelo || 'openai:gpt-4o',
          systemPrompt: sysOp,
          messages: llmMessages,
          tools: toolsDoAgente,
          temperatura: worker.temperatura ?? 0.5,
          maxTokens: 4096,
        }, `agente-${agente_slug}`);

        totalTokensIn += llmResp.tokensIn;
        totalTokensOut += llmResp.tokensOut;
        totalTokensCached += llmResp.tokensCached;
        totalLatenciaMs += llmResp.latenciaMs;
        modeloUsadoFinal = llmResp.modeloUsado;

        if (!llmResp.toolCalls || llmResp.toolCalls.length === 0) {
          textoFinal = llmResp.content || '';
          break;
        }

        // Loop detection
        const loopDetectado = detectaLoopFerramentaRepetida(llmResp.toolCalls);
        if (loopDetectado) {
          textoFinal = '[Loop detectado — agente repetiu mesma tool com mesmo input. Execucao interrompida.]';
          break;
        }

        // Assistant message com tool_calls
        llmMessages.push({
          role: 'assistant',
          content: llmResp.content || null,
          tool_calls: llmResp.toolCalls.map((tc: any) => ({
            id: tc.id, type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        });

        // Invoca cada tool em paralelo
        const resultados = await Promise.all(
          llmResp.toolCalls.map(async (tc: any) => {
            const res = await invocarTool(tc.name, tc.arguments, {
              agente: worker, briefing, contexto_extra, imagemDataUri,
              cliente_id, tenant_id, caso_id, solicitante_id,
            });
            toolsInvocadas.push({ name: tc.name, args: tc.arguments, result: res });
            return { tc, res };
          })
        );

        for (const { tc, res } of resultados) {
          // Sanitize: nao trunca no meio de string (quebra JSON parsing pelo LLM).
          // Limite generoso pra deixar respostas inteiras passarem.
          let conteudo = JSON.stringify(res);
          if (conteudo.length > 24000) {
            // Truncamento seguro: pega so 23900 chars + ' ..."}' (mantem JSON valido)
            conteudo = conteudo.slice(0, 23900) + '"[TRUNCADO]"}';
          }
          llmMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: conteudo,
          });
        }

        if (round === MAX_ROUNDS_OP) {
          textoFinal = llmResp.content || '[Limite de rounds atingido — sem resposta final]';
        }
      }

      respostaFinal = {
        tipo: 'agente-operacional',
        titulo: worker.nome || agente_slug,
        conteudo_estruturado: { tools_invocadas: toolsInvocadas, output: textoFinal },
        conteudo_md: textoFinal,
        nota_de_dissenso: null,
      };
    } else {
      // Worker simples (mestre individual): 1 chamada, JSON estruturado
      const llmResp = await chamarLLM({
        modelo: worker.modelo || 'openai:gpt-4o',
        systemPrompt,
        messages: [...historicoChat, { role: 'user', content: montarUserContent() }],
        temperatura: worker.temperatura ?? 0.6,
        maxTokens: 4096,
      }, `agente-${agente_slug}`);

      totalTokensIn = llmResp.tokensIn;
      totalTokensOut = llmResp.tokensOut;
      totalTokensCached = llmResp.tokensCached;
      totalLatenciaMs = llmResp.latenciaMs;
      modeloUsadoFinal = llmResp.modeloUsado;

      // Wrap pra reuso da lógica de parse abaixo
      var llmResp_legacy = llmResp;
    }

    // 8. Parse: orquestrador e agente operacional ja tem respostaFinal preenchido. Worker simples precisa parsear.
    let respObj: any = null;
    if (orquestrador || (temToolsGenericas(worker) && respostaFinal)) {
      respObj = respostaFinal;
    } else {
      try {
        const txt = llmResp_legacy.content.trim();
        const jsonMatch = txt.match(/```json\s*([\s\S]*?)```/) || txt.match(/(\{[\s\S]*\})/);
        const jsonStr = jsonMatch ? jsonMatch[1] : txt;
        respObj = JSON.parse(jsonStr);
      } catch (e) {
        respObj = {
          tipo: 'erro_parse',
          titulo: 'Worker não retornou JSON estruturado',
          conteudo_estruturado: { raw: llmResp_legacy.content },
          conteudo_md: llmResp_legacy.content,
          nota_de_dissenso: null,
        };
      }
    }

    // 9. Loga execução (consolidado se foi orquestrador)
    await logarExecucao({
      agenteId: worker.id,
      input: { briefing, entregavel_origem_id, contexto_extra },
      output: respObj,
      modelo: modeloUsadoFinal,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      tokensCached: totalTokensCached,
      latenciaMs: totalLatenciaMs,
    });

    // 10. Loga custo FinOps
    const custoUSD = calcularCustoUSD(modeloUsadoFinal, totalTokensIn, totalTokensOut, totalTokensCached);
    await logarCustoFinOps({
      agenteSlug: agente_slug,
      modelo: modeloUsadoFinal,
      custoUSD,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      tokensCached: totalTokensCached,
    });

    // 11. Se Worker pausou em dissenso → não cria entregável, retorna nota
    if (respObj.nota_de_dissenso) {
      return jsonResp({
        ok: true,
        pausou_em_dissenso: true,
        nota_de_dissenso: respObj.nota_de_dissenso,
        worker_id: worker.id,
        worker_slug: agente_slug,
        uso: {
          modelo: modeloUsadoFinal,
          tokens_in: totalTokensIn,
          tokens_out: totalTokensOut,
          tokens_cached: totalTokensCached,
          custo_usd: Number(custoUSD.toFixed(6)),
          latencia_ms: totalLatenciaMs,
        },
      });
    }

    // 11. Cria entregável (versionado se for revisão)
    let proximaVersao = 1;
    if (parent_id) {
      const { data: parent } = await sb()
        .from('entregaveis')
        .select('versao')
        .eq('id', parent_id)
        .maybeSingle();
      proximaVersao = (parent?.versao || 1) + 1;
    }

    const { data: novoEntregavel, error: errEntr } = await sb()
      .from('entregaveis')
      .insert({
        tenant_id,
        cliente_id,
        caso_id: caso_id || null,
        agente_que_fez: worker.id,
        tipo: respObj.tipo || 'outro',
        titulo: respObj.titulo || 'Entregável',
        conteudo_estruturado: respObj.conteudo_estruturado || {},
        conteudo_md: respObj.conteudo_md || null,
        versao: proximaVersao,
        parent_id: parent_id || null,
      })
      .select('id, versao')
      .single();

    if (errEntr) throw new Error(`Erro ao salvar entregável: ${errEntr.message}`);

    // 11.5. Grava turno (pergunta+resposta) em conversas pra memoria conversacional.
    // So grava se nao for placeholder (00000...) — agente-executar interno chama com placeholder, nao queremos poluir thread.
    // CHECK constraint da tabela aceita: 'humano', 'chief', 'sistema', 'worker'
    //   - usuario -> 'humano'
    //   - resposta do agente -> 'worker'
    if (cliente_id && cliente_id !== '00000000-0000-0000-0000-000000000000') {
      const { error: errConv } = await sb().from('conversas').insert([
        {
          tenant_id, cliente_id, agente_id: worker.id, caso_id: caso_id || null,
          papel: 'humano',
          conteudo: String(briefing).slice(0, 4000),
        },
        {
          tenant_id, cliente_id, agente_id: worker.id, worker_id: worker.id, caso_id: caso_id || null,
          papel: 'worker',
          conteudo: String(respObj.conteudo_md || JSON.stringify(respObj.conteudo_estruturado || {})).slice(0, 8000),
        },
      ]);
      if (errConv) console.warn('[agente-executar] falhou gravar conversas:', errConv.message);
    }

    return jsonResp({
      ok: true,
      entregavel_id: novoEntregavel.id,
      versao: novoEntregavel.versao,
      parent_id: parent_id || null,
      conteudo_estruturado: respObj.conteudo_estruturado,
      conteudo_md: respObj.conteudo_md,
      titulo: respObj.titulo,
      tipo: respObj.tipo,
      worker_slug: agente_slug,
      orquestrador,
      mestres_invocados: mestresInvocados.map(m => ({ slug: m.slug, entregavel_id: m.output?.entregavel_id, custo_usd: m.uso?.custo_usd })),
      uso: {
        modelo: modeloUsadoFinal,
        tokens_in: totalTokensIn,
        tokens_out: totalTokensOut,
        tokens_cached: totalTokensCached,
        cache_hit_pct: totalTokensIn > 0 ? Number(((totalTokensCached / totalTokensIn) * 100).toFixed(1)) : 0,
        custo_usd: Number(custoUSD.toFixed(6)),
        latencia_ms: totalLatenciaMs,
        latencia_total_ms: Date.now() - tInicio,
      },
    });
  } catch (e: any) {
    console.error('[agente-executar] erro:', e.message);
    return jsonResp({
      error: 'Erro ao executar agente',
      detalhe: e.message,
      latencia_ms: Date.now() - tInicio,
    }, 500);
  }
});
