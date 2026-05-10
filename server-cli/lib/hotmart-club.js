// ============================================================
// hotmart-club.js — V2.14 D Categoria G4b (Members Area / Club API)
// ============================================================
// Wrapper REAL pra Members Area API da Hotmart. Descoberto via investigação
// real 2026-05-10 (SDK Python tinha bug — chamava /students, endpoint correto
// é /users).
//
// Endpoint: GET /club/api/v1/users?subdomain=<sub>&email=<email>
// Resposta:
//   {
//     "items": [{
//       "user_id": "1466EgVA4d",
//       "name": "Marcos Roberto Morais Pinheiro de Andrade",
//       "email": "marquitoadm1@gmail.com",
//       "status": "ACTIVE" | "INACTIVE" | etc,
//       "type": "BUYER" | "IMPORTED",
//       "role": "STUDENT" | "OWNER",
//       "first_access_date": <epoch ms>,
//       "last_access_date":  <epoch ms>,
//       "purchase_date":     <epoch ms>,
//       "access_count": <int>,
//       "engagement": "LOW" | "MEDIUM" | "HIGH",
//       "progress": { "total": 101, "completed": 5, "completed_percentage": 4 },
//       "class_id": "j14o0Xz5ep",
//       "is_deletable": true | false,
//       "plus_access": "WITHOUT_PLUS_ACCESS" | etc,
//       "locale": "pt"
//     }],
//     "page_info": { "total_results": 1, "results_per_page": 1 }
//   }
//
// Tabela `pinguim.hotmart_clubs` armazena subdomains válidos descobertos.
// Função descobrirSubdomain testa variações sem-hífen quando ainda não conhece.
//
// IMPORTANTE: cadastro de aluno (POST /users) NÃO está disponível via API
// (testado 2026-05-10, retorna /docs/ redirect). Caso Princípia Pay continua
// passando por G8 (ticket suporte humano).
// ============================================================

const db = require('./db');
const hotmart = require('./hotmart');

const BASE = 'https://developers.hotmart.com/club/api/v1';

// ============================================================
// Cache de subdomains validados (RAM, write-through banco)
// ============================================================
let _cacheClubs = null;
let _cacheExpiraEm = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5min

async function carregarClubsAtivos() {
  if (_cacheClubs && Date.now() < _cacheExpiraEm) return _cacheClubs;
  const r = await db.rodarSQL(`SELECT subdomain, produto_id, produto_nome FROM pinguim.hotmart_clubs WHERE ativo = true ORDER BY produto_nome`);
  _cacheClubs = Array.isArray(r) ? r : [];
  _cacheExpiraEm = Date.now() + CACHE_TTL_MS;
  return _cacheClubs;
}

async function cadastrarClub({ subdomain, produto_id, produto_nome, produto_ucode, descricao, total_modulos, observacoes }) {
  const esc = (s) => s == null ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'";
  const sql = `
    INSERT INTO pinguim.hotmart_clubs (subdomain, produto_id, produto_nome, produto_ucode, descricao, total_modulos, observacoes, validado_em)
    VALUES (${esc(subdomain)}, ${produto_id ? parseInt(produto_id, 10) : 'NULL'}, ${esc(produto_nome)}, ${esc(produto_ucode)},
            ${esc(descricao)}, ${total_modulos ? parseInt(total_modulos, 10) : 'NULL'}, ${esc(observacoes)}, now())
    ON CONFLICT (subdomain) DO UPDATE SET
      produto_id = COALESCE(EXCLUDED.produto_id, pinguim.hotmart_clubs.produto_id),
      produto_nome = COALESCE(EXCLUDED.produto_nome, pinguim.hotmart_clubs.produto_nome),
      total_modulos = COALESCE(EXCLUDED.total_modulos, pinguim.hotmart_clubs.total_modulos),
      validado_em = now(),
      atualizado_em = now()
    RETURNING id, subdomain, produto_nome, total_modulos;
  `;
  const r = await db.rodarSQL(sql);
  _cacheClubs = null; // invalida cache
  return Array.isArray(r) && r[0] ? r[0] : null;
}

// ============================================================
// Validação de subdomain — retorna { valido, total_modulos } ou null
// CloudFront redireciona pra /docs/ quando subdomain inválido.
// CL=0 + xcache=Error from cloudfront = inválido.
// CL>0 ou body com {} = válido.
// ============================================================
async function validarSubdomain(subdomain) {
  const tok = await hotmart.obterAccessToken();
  const url = `${BASE}/modules?subdomain=${encodeURIComponent(subdomain)}`;
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${tok}`, 'Accept': 'application/json' }, redirect: 'manual' });
  const xcache = resp.headers.get('x-cache') || '';
  const loc = resp.headers.get('location') || '';
  // Inválido: CloudFront error redirecting to /docs/
  if (loc === '/docs/' || /Error from cloudfront/i.test(xcache)) {
    return { valido: false, motivo: 'subdomain inválido (CloudFront /docs/)' };
  }
  const txt = await resp.text();
  let total_modulos = 0;
  try {
    const j = JSON.parse(txt);
    if (Array.isArray(j)) total_modulos = j.length;
    else if (j?.items) total_modulos = j.items.length;
  } catch { /* corpo {} ou vazio = subdomain válido mas sem módulos */ }
  return { valido: true, total_modulos };
}

// ============================================================
// Descoberta de subdomain a partir de nome/slug do produto
// Tenta variações sem-hífen, lowercase, etc.
// ============================================================
async function descobrirSubdomain(slugOrNome) {
  const variantes = new Set();
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const base = norm(slugOrNome);
  variantes.add(base);
  variantes.add(base.replace(/-/g, ''));        // sem hífen
  variantes.add(base.replace(/[\s-_]+/g, ''));   // sem espaço/hífen/underscore
  variantes.add(base.replace(/[\s_]+/g, '-'));   // troca espaço/underscore por hífen
  variantes.add(base.replace(/[^a-z0-9]/g, '')); // só alfanum

  for (const v of variantes) {
    if (!v) continue;
    const r = await validarSubdomain(v).catch(() => null);
    if (r?.valido && r.total_modulos > 0) {
      // Cadastra automaticamente no banco (descoberta validada)
      await cadastrarClub({ subdomain: v, produto_nome: slugOrNome, total_modulos: r.total_modulos, observacoes: 'descoberto automaticamente' }).catch(() => {});
      return { subdomain: v, total_modulos: r.total_modulos, fonte: 'descoberta' };
    }
  }
  return null;
}

// ============================================================
// G4b — Buscar aluno por email em UM club específico
// ============================================================
async function buscarAlunoEmClub({ subdomain, email }) {
  if (!subdomain || !email) throw new Error('subdomain e email obrigatórios');
  const tok = await hotmart.obterAccessToken();
  const url = `${BASE}/users?subdomain=${encodeURIComponent(subdomain)}&email=${encodeURIComponent(email)}`;
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${tok}`, 'Accept': 'application/json' } });
  const txt = await resp.text();
  if (!resp.ok) throw new Error(`Hotmart Club ${resp.status}: ${txt.slice(0, 200)}`);
  let json;
  try { json = JSON.parse(txt); } catch { json = null; }
  const items = Array.isArray(json?.items) ? json.items : [];
  return items[0] || null;
}

// ============================================================
// G4b — Buscar aluno em TODOS os clubs cadastrados (paralelo)
// Retorna lista de produtos onde tem acesso + status + last_access + progresso
// ============================================================
async function buscarAlunoEmTodosClubs({ email }) {
  if (!email) throw new Error('email obrigatório');
  const clubs = await carregarClubsAtivos();
  if (clubs.length === 0) {
    return {
      ok: true,
      total_clubs_consultados: 0,
      tem_acesso: false,
      acessos: [],
      aviso: 'Nenhum Club Hotmart cadastrado em pinguim.hotmart_clubs. Cadastrar com bash scripts/hotmart-cadastrar-club.sh',
    };
  }

  // Consulta em paralelo (Munger — falhas isoladas, allSettled)
  const resultados = await Promise.allSettled(
    clubs.map(async c => {
      const aluno = await buscarAlunoEmClub({ subdomain: c.subdomain, email });
      return { club: c, aluno };
    })
  );

  const acessos = [];
  const erros = [];
  for (const r of resultados) {
    if (r.status === 'fulfilled') {
      const { club, aluno } = r.value;
      if (aluno) acessos.push({ club, aluno });
    } else {
      erros.push(r.reason?.message || String(r.reason));
    }
  }

  return {
    ok: true,
    email_consultado: email,
    total_clubs_consultados: clubs.length,
    tem_acesso: acessos.length > 0,
    total_acessos: acessos.length,
    acessos: acessos.map(a => ({
      produto: a.club.produto_nome,
      subdomain: a.club.subdomain,
      produto_id: a.club.produto_id,
      status: a.aluno.status,
      tipo_entrada: a.aluno.type,
      role: a.aluno.role,
      nome_aluno: a.aluno.name,
      first_access_date: a.aluno.first_access_date ? new Date(a.aluno.first_access_date).toISOString() : null,
      last_access_date:  a.aluno.last_access_date  ? new Date(a.aluno.last_access_date).toISOString()  : null,
      purchase_date:     a.aluno.purchase_date     ? new Date(a.aluno.purchase_date).toISOString()     : null,
      access_count: a.aluno.access_count,
      engagement: a.aluno.engagement,
      progress: a.aluno.progress,
      user_id: a.aluno.user_id,
      class_id: a.aluno.class_id,
    })),
    erros: erros.length > 0 ? erros : undefined,
  };
}

// ============================================================
// Listar todos os Clubs cadastrados (pra UI / debug)
// ============================================================
async function listarClubs() {
  const r = await db.rodarSQL(`SELECT subdomain, produto_id, produto_nome, total_modulos, validado_em, ativo FROM pinguim.hotmart_clubs ORDER BY produto_nome`);
  return Array.isArray(r) ? r : [];
}

module.exports = {
  carregarClubsAtivos,
  cadastrarClub,
  validarSubdomain,
  descobrirSubdomain,
  buscarAlunoEmClub,
  buscarAlunoEmTodosClubs,
  listarClubs,
};
