/**
 * auth.js — Gestion JWT multi-pages
 */

const Auth = (() => {

  let _token    = null;
  let _userId   = null;
  let _username = null;

  // ── Persistance sessionStorage ────────────────────────
  function _save(data) {
    _token    = data.access_token;
    _userId   = data.user_id;
    _username = data.username;
    sessionStorage.setItem('vt_token',    _token);
    sessionStorage.setItem('vt_user_id',  String(_userId));
    sessionStorage.setItem('vt_username', _username);
  }

  function _restore() {
    _token    = sessionStorage.getItem('vt_token');
    _userId   = parseInt(sessionStorage.getItem('vt_user_id'));
    _username = sessionStorage.getItem('vt_username');
  }

  // ── Getters ───────────────────────────────────────────
  function getToken()    { return _token; }
  function getUserId()   { return _userId; }
  function getUsername() { return _username; }
  function isLoggedIn()  { return !!_token; }

  function authHeaders() {
    return _token ? { 'Authorization': `Bearer ${_token}` } : {};
  }

  // ── Guards ────────────────────────────────────────────
  /** Appelé sur chaque page protégée — redirige si non connecté */
  function requireAuth() {
    _restore();
    if (!isLoggedIn()) {
      window.location.href = 'index.html';
      return false;
    }
    // Afficher le nom dans la topbar
    const el = document.getElementById('topbarUsername');
    if (el) el.textContent = _username;
    // Vérifier le statut API
    _checkApi();
    setInterval(_checkApi, 15000);
    return true;
  }

  /** Appelé sur index.html — redirige si déjà connecté */
  function initLoginPage() {
    _restore();
    if (isLoggedIn()) {
      window.location.href = 'dashboard.html';
      return;
    }
    // Enter sur les champs
    document.getElementById('loginPassword')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitLogin();
    });
    document.getElementById('regConfirm')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitRegister();
    });
  }

  // ── API calls ─────────────────────────────────────────
  function _apiUrl() {
    return (
      document.getElementById('apiUrlAuth')?.value ||
      document.getElementById('apiUrl')?.value ||
      localStorage.getItem('vt_api_url') ||
      'http://localhost:8000'
    ).replace(/\/$/, '');
  }

  async function login(username, password) {
    const res = await fetch(`${_apiUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Identifiants incorrects');
    }
    const data = await res.json();
    _save(data);
    return data;
  }

  async function register(username, email, password) {
    const res = await fetch(`${_apiUrl()}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Erreur lors de l'inscription");
    }
    const data = await res.json();
    _save(data);
    return data;
  }

  function logout() {
    sessionStorage.clear();
    window.location.href = 'index.html';
  }

  // ── UI login page ─────────────────────────────────────
  function switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.querySelector(`.auth-tab[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`form-${tab}`).classList.add('active');
    document.getElementById('authError').textContent = '';
  }

  async function submitLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl    = document.getElementById('authError');
    const btn      = document.getElementById('loginBtn');

    if (!username || !password) { errEl.textContent = 'Remplis tous les champs'; return; }

    btn.textContent = 'Connexion...'; btn.disabled = true;
    try {
      await login(username, password);
      window.location.href = 'dashboard.html';
    } catch (e) {
      errEl.textContent = e.message;
    } finally {
      btn.textContent = 'Se connecter'; btn.disabled = false;
    }
  }

  async function submitRegister() {
    const username = document.getElementById('regUsername').value.trim();
    const email    = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm  = document.getElementById('regConfirm').value;
    const errEl    = document.getElementById('authError');
    const btn      = document.getElementById('registerBtn');

    if (!username || !email || !password) { errEl.textContent = 'Remplis tous les champs'; return; }
    if (password !== confirm) { errEl.textContent = 'Les mots de passe ne correspondent pas'; return; }
    if (password.length < 8)  { errEl.textContent = 'Mot de passe trop court (8 caractères min)'; return; }

    btn.textContent = 'Inscription...'; btn.disabled = true;
    try {
      await register(username, email, password);
      window.location.href = 'dashboard.html';
    } catch (e) {
      errEl.textContent = e.message;
    } finally {
      btn.textContent = "S'inscrire"; btn.disabled = false;
    }
  }

  // ── Statut API ────────────────────────────────────────
  async function _checkApi() {
    const pill = document.getElementById('statusPill');
    if (!pill) return;
    try {
      const res = await fetch(_apiUrl() + '/');
      pill.textContent = res.ok ? 'online' : 'offline';
      pill.className   = res.ok ? 'status-pill online' : 'status-pill offline';
    } catch {
      pill.textContent = 'offline';
      pill.className   = 'status-pill offline';
    }
  }

  // ── Avatar topbar ─────────────────────────────────────
  function refreshAvatar() {
    const avatarEl = document.getElementById('topbarAvatar');
    if (!avatarEl) return;
    const saved = localStorage.getItem('vt_avatar');
    if (saved) {
      avatarEl.innerHTML = `<img src="${saved}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      const username = getUsername() || '?';
      avatarEl.textContent = username.charAt(0).toUpperCase();
    }
    const nameEl = document.getElementById('topbarUsername');
    if (nameEl) nameEl.textContent = getUsername() || '';
  }

  return {
    requireAuth, initLoginPage,
    getToken, getUserId, getUsername, isLoggedIn, authHeaders,
    login, register, logout,
    switchTab, submitLogin, submitRegister,
    refreshAvatar,
  };

})();