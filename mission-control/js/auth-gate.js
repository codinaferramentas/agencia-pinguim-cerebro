/* Mission Control — Auth Gate
   Protege o painel inteiro. Sem sessão = tela de login.
   Usa Supabase Auth. Sessão persiste em localStorage.
*/

const ENV = (typeof window !== 'undefined' && window.__ENV__) || {};
const SUPABASE_URL = ENV.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY || '';

const authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage },
});

function renderLogin(errorMsg) {
  document.body.innerHTML = `
    <div class="authgate">
      <form class="authgate-card" id="authform">
        <div class="authgate-brand">
          <div class="authgate-brand-icon">P</div>
          <div>
            <div class="authgate-brand-title">Pinguim</div>
            <div class="authgate-brand-sub">Mission Control</div>
          </div>
        </div>
        <div class="authgate-title">Entrar</div>
        <label>Email
          <input type="email" id="auth-email" autocomplete="email" required>
        </label>
        <label>Senha
          <input type="password" id="auth-pass" autocomplete="current-password" required>
        </label>
        <button type="submit" id="auth-submit">Entrar</button>
        <div class="authgate-err" id="auth-err">${errorMsg || ''}</div>
      </form>
    </div>
    <style>
      body { margin:0; background:#0A0A0A; color:#EDEDED; font-family:'Inter',system-ui,sans-serif; }
      .authgate { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
      .authgate-card { width:100%; max-width:360px; background:#121212; border:1px solid #1F1F1F; border-radius:12px; padding:32px; display:flex; flex-direction:column; gap:16px; }
      .authgate-brand { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
      .authgate-brand-icon { width:36px; height:36px; background:#E85C00; color:#fff; border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:700; }
      .authgate-brand-title { font-weight:600; font-size:14px; }
      .authgate-brand-sub { font-size:12px; color:#7E7E7E; }
      .authgate-title { font-size:18px; font-weight:600; margin-top:4px; }
      .authgate label { display:flex; flex-direction:column; gap:6px; font-size:12px; color:#B4B4B4; }
      .authgate input { background:#0A0A0A; border:1px solid #1F1F1F; border-radius:6px; padding:10px 12px; color:#EDEDED; font-size:14px; font-family:inherit; }
      .authgate input:focus { outline:none; border-color:#E85C00; }
      .authgate button { background:#E85C00; color:#fff; border:0; border-radius:6px; padding:11px; font-weight:600; font-size:14px; cursor:pointer; margin-top:8px; }
      .authgate button:hover { background:#FF6B00; }
      .authgate button:disabled { opacity:.5; cursor:wait; }
      .authgate-err { color:#FF5555; font-size:13px; min-height:18px; }
    </style>
  `;

  document.getElementById('authform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('auth-submit');
    const err = document.getElementById('auth-err');
    btn.disabled = true; err.textContent = '';
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;
    const { error } = await authClient.auth.signInWithPassword({ email, password: pass });
    if (error) {
      err.textContent = error.message || 'Erro ao entrar';
      btn.disabled = false;
      return;
    }
    // Login ok — recarrega a página pra bootar o painel com sessão viva
    window.location.reload();
  });
}

/* ======== Gate ========
   Se não tem sessão, renderiza login e PARA o bootstrap do app.
   Se tem sessão, libera: scripts normais do painel seguem.
*/
export async function guard() {
  const { data: { session } } = await authClient.auth.getSession();
  if (!session) {
    renderLogin();
    return false;
  }
  return true;
}

/* Expõe logout pra ser usado pelo app */
export async function logout() {
  await authClient.auth.signOut();
  window.location.reload();
}

window.__authLogout = logout;
