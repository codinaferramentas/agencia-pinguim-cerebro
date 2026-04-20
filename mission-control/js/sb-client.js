/* Mission Control — Cliente de dados
   - Se SUPABASE_URL + SUPABASE_ANON_KEY estiverem definidos (via window.__ENV__), usa Supabase.
   - Caso contrário, faz fallback pra JSONs locais em data/ (modo offline).
   Tudo que o app precisa passa por este cliente.
*/

const ENV = (typeof window !== 'undefined' && window.__ENV__) || {};
const SUPABASE_URL = ENV.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY || '';

let sb = null;
let mode = 'offline';

if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof window.supabase !== 'undefined') {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });
  mode = 'supabase';
}

export const dataMode = () => mode;

/* ---------- Fallback helpers ---------- */
async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Falha ao carregar ${path}`);
  return res.json();
}

let offlineCache = null;
async function loadOffline() {
  if (offlineCache) return offlineCache;
  const [agentes, tasks, squads, roadmap] = await Promise.all([
    loadJSON('data/agentes.json').catch(() => ({ agentes: [] })),
    loadJSON('data/tasks.json').catch(() => ({ tasks: [], live_feed: [] })),
    loadJSON('data/squads.json').catch(() => ({ squads: [] })),
    loadJSON('data/roadmap.json').catch(() => ({ fases: [], pipeline_evolucao: {}, qualidade: {} })),
  ]);
  offlineCache = { agentes: agentes.agentes, tasks: tasks.tasks, liveFeed: tasks.live_feed, squads: squads.squads, roadmap };
  return offlineCache;
}

/* ---------- API pública ---------- */

export async function fetchCerebrosCatalogo() {
  if (mode === 'supabase') {
    const { data, error } = await sb.from('vw_cerebros_catalogo').select('*').order('nome');
    if (error) throw error;
    return data;
  }
  // Modo offline — placeholder com 6 cérebros fake
  return [
    { slug: 'pinguim', nome: 'Pinguim (Empresa)', emoji: '🐧', descricao: 'Cérebro global da agência.', status: 'ativo', preenchimento_pct: 10, total_pecas: 4, total_aulas: 0, total_paginas: 0, total_objecoes: 1, total_depoimentos: 0, total_sacadas: 3, pecas_ultima_semana: 4, ultima_alimentacao: new Date().toISOString() },
    { slug: 'elo', nome: 'Elo', emoji: '🔗', descricao: 'Programa de aceleração — Desafio LoFi.', status: 'ativo', preenchimento_pct: 42, total_pecas: 21, total_aulas: 21, total_paginas: 0, total_objecoes: 0, total_depoimentos: 0, total_sacadas: 0, pecas_ultima_semana: 21, ultima_alimentacao: new Date().toISOString() },
    { slug: 'proalt', nome: 'ProAlt', emoji: '⚡', descricao: 'Programa Alta Performance — Desafio LT.', status: 'ativo', preenchimento_pct: 18, total_pecas: 9, total_aulas: 4, total_paginas: 1, total_objecoes: 0, total_depoimentos: 0, total_sacadas: 4, pecas_ultima_semana: 9, ultima_alimentacao: new Date().toISOString() },
    { slug: 'taurus', nome: 'Taurus', emoji: '🐂', descricao: 'High ticket — mentoria premium.', status: 'em_construcao', preenchimento_pct: 0, total_pecas: 0, total_aulas: 0, total_paginas: 0, total_objecoes: 0, total_depoimentos: 0, total_sacadas: 0, pecas_ultima_semana: 0, ultima_alimentacao: null },
    { slug: 'lira', nome: 'Lira', emoji: '🎵', descricao: 'High ticket — mentoria premium.', status: 'em_construcao', preenchimento_pct: 0, total_pecas: 0, total_aulas: 0, total_paginas: 0, total_objecoes: 0, total_depoimentos: 0, total_sacadas: 0, pecas_ultima_semana: 0, ultima_alimentacao: null },
    { slug: 'orion', nome: 'Orion', emoji: '✨', descricao: 'High ticket — mentoria premium.', status: 'em_construcao', preenchimento_pct: 0, total_pecas: 0, total_aulas: 0, total_paginas: 0, total_objecoes: 0, total_depoimentos: 0, total_sacadas: 0, pecas_ultima_semana: 0, ultima_alimentacao: null },
  ];
}

export async function fetchCerebroPecas(cerebroSlug) {
  if (mode === 'supabase') {
    const { data: produto } = await sb.from('produtos').select('id').eq('slug', cerebroSlug).single();
    if (!produto) return [];
    const { data: cerebro } = await sb.from('cerebros').select('id').eq('produto_id', produto.id).single();
    if (!cerebro) return [];
    const { data, error } = await sb.from('cerebro_pecas').select('*')
      .eq('cerebro_id', cerebro.id)
      .eq('status_curador', 'aprovado')
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }
  // Fallback — mock mínimo
  if (cerebroSlug === 'elo') {
    return Array.from({ length: 21 }, (_, i) => ({
      id: 'mock-elo-' + i,
      tipo: 'aula',
      titulo: `Aula ${i + 1} (mock)`,
      conteudo_md: 'Transcrição (modo offline - conecte Supabase para ver conteúdo real)',
      origem: 'upload',
      autor: 'André (import inicial)',
      status_curador: 'aprovado',
      peso: 7,
      tags: ['elo', 'transcricao', 'aula'],
      criado_em: new Date(Date.now() - i * 3600 * 1000).toISOString()
    }));
  }
  if (cerebroSlug === 'proalt') {
    return [
      { id: 'm1', tipo: 'pitch', titulo: 'Pitch deck ProAlt', origem: 'upload', autor: 'Luiz', status_curador: 'aprovado', peso: 9, tags: ['proalt','pitch'], criado_em: new Date().toISOString(), conteudo_md: '4 módulos, 5 protocolos. (mock — conectar Supabase)' },
      { id: 'm2', tipo: 'aula', titulo: 'Módulo 1 — Fundamentos', origem: 'upload', autor: 'Luiz', status_curador: 'aprovado', peso: 8, tags: ['proalt','mod-1'], criado_em: new Date().toISOString(), conteudo_md: '(mock)' },
      { id: 'm3', tipo: 'aula', titulo: 'Módulo 2 — Escalada', origem: 'upload', autor: 'Luiz', status_curador: 'aprovado', peso: 8, tags: ['proalt','mod-2'], criado_em: new Date().toISOString(), conteudo_md: '(mock)' },
      { id: 'm4', tipo: 'sacada', titulo: 'Sacada Luiz sobre ticket', origem: 'expert', autor: 'Luiz', status_curador: 'aprovado', peso: 7, tags: ['proalt','preco'], criado_em: new Date().toISOString(), conteudo_md: '(mock)' },
    ];
  }
  return [];
}

export async function fetchCrons() {
  if (mode === 'supabase') {
    const { data, error } = await sb.from('crons').select('*').order('nome');
    if (error) throw error;
    return data;
  }
  return [
    { slug: 'varre_discord_depoimentos', nome: 'Varrer Discord #depoimentos', descricao: 'Lê mensagens novas, curador classifica e arquiva no Cérebro correto.', schedule_expression: '0 */6 * * *', ativo: false, proxima_execucao: null },
    { slug: 'varre_wa_grupos', nome: 'Varrer grupos WhatsApp', descricao: 'Scan diário dos grupos — feedback de alunos vira contexto.', schedule_expression: '0 23 * * *', ativo: false, proxima_execucao: null },
    { slug: 'consolida_memoria_noturna', nome: 'Consolidar memória noturna', descricao: 'Extrai lições do dia e atualiza os Cérebros.', schedule_expression: '0 23 * * *', ativo: false, proxima_execucao: null },
    { slug: 'relatorio_saude_cerebros', nome: 'Relatório semanal de saúde', descricao: 'Segunda 8h, reporta preenchimento e gaps de cada Cérebro.', schedule_expression: '0 8 * * 1', ativo: false, proxima_execucao: null },
    { slug: 'alerta_cerebros_estagnados', nome: 'Alerta Cérebros parados', descricao: 'Avisa sobre Cérebros sem alimentação há >7 dias.', schedule_expression: '0 9 * * 1', ativo: false, proxima_execucao: null },
  ];
}

export async function fetchSkills() {
  if (mode === 'supabase') {
    const { data, error } = await sb.from('skills').select('*').order('nome');
    if (error) throw error;
    return data;
  }
  return [
    { slug: 'gsd-mode', nome: 'GSD Mode', categoria: 'operacional', descricao: 'Get Shit Done — agente executa direto, sem pedir confirmação.', universal: true, versao: 'v1.0' },
    { slug: 'super-powers', nome: 'Super Powers', categoria: 'operacional', descricao: 'Plano explícito + validação + proatividade.', universal: true, versao: 'v1.0' },
    { slug: 'criar-desafio-com-referencia', nome: 'Criar desafio a partir de referência externa', categoria: 'produto', descricao: 'Analisa material de concorrente e propõe desafio equivalente.', universal: true, versao: 'v1.0' },
    { slug: 'gerar-copy-pagina-de-vendas', nome: 'Gerar página de vendas', categoria: 'copy', descricao: 'Cria página 12 dobras a partir do Cérebro + framework Copy Chief.', universal: true, versao: 'v1.0' },
    { slug: 'responder-objecao-aluno', nome: 'Responder objeção de aluno', categoria: 'suporte', descricao: 'Consulta Cérebro, encontra objeção similar, devolve resposta.', universal: true, versao: 'v1.0' },
    { slug: 'produzir-carrossel', nome: 'Produzir carrossel Instagram', categoria: 'conteudo', descricao: 'Gera texto e estrutura de carrossel do Cérebro.', universal: true, versao: 'v1.0' },
    { slug: 'briefing-pre-call', nome: 'Briefing pré-call', categoria: 'comercial', descricao: 'Lead + histórico → briefing pro closer.', universal: true, versao: 'v1.0' },
    { slug: 'transcrever-video-youtube', nome: 'Transcrever vídeo do YouTube', categoria: 'ingestao', descricao: 'URL do YouTube → transcrição Whisper → Cérebro.', universal: true, versao: 'v1.0' },
    { slug: 'importar-csv', nome: 'Importar CSV genérico', categoria: 'ingestao', descricao: 'Sobe CSV, detecta colunas, cria peças no Cérebro.', universal: true, versao: 'v1.0' },
    { slug: 'curador-classificar', nome: 'Curador — classificar peça nova', categoria: 'curadoria', descricao: 'Classifica (relevante/ruído/duplicado) + identifica produto.', universal: true, versao: 'v1.0' },
  ];
}

export async function fetchOperacaoData() {
  if (mode === 'supabase') {
    const [agentesRes, tasksRes, squadsRes] = await Promise.all([
      sb.from('agentes').select('*'),
      sb.from('tasks').select('*').order('criado_em', { ascending: false }),
      sb.from('squads').select('*'),
    ]);
    return {
      agentes: (agentesRes.data || []).map(a => ({ ...a, id: a.slug, avatar: a.avatar || '?', cor: a.cor || '#E85C00', tasks_ativas: 0, tasks_hoje: 0, online: true })),
      tasks: (tasksRes.data || []).map(t => ({ ...t, id: t.id, titulo: t.titulo, agente_id: t.agente_id, prioridade: t.prioridade || 'normal', requester: t.requester || '—' })),
      squads: squadsRes.data || [],
      liveFeed: []
    };
  }
  const off = await loadOffline();
  return { agentes: off.agentes, tasks: off.tasks, squads: off.squads, liveFeed: off.liveFeed };
}

export async function fetchRoadmapData() {
  if (mode === 'supabase') {
    // Ainda não temos tabelas de roadmap — retorna vazio controlado
    return { fases: [], pipeline_evolucao: { planejado: [], em_criacao: [], em_teste: [], em_producao: [] }, qualidade: { top_performers: [], gargalos: [], retrabalho_semana: 0, alertas_ativos: 0 } };
  }
  const off = await loadOffline();
  return off.roadmap;
}

export function getSupabaseClient() { return sb; }
