/**
 * auth.js - Gestion JWT multi-pages + avatar persistant
 */

const Auth = (() => {

  let _token     = null;
  let _userId    = null;
  let _username  = null;
  let _avatarUrl = null;

  // -- Persistance sessionStorage --
  function _save(data) {
    _token     = data.access_token;
    _userId    = data.user_id;
    _username  = data.username;
    _avatarUrl = data.avatar_url || null;
    sessionStorage.setItem('vt_token',    _token);
    sessionStorage.setItem('vt_user_id',  String(_userId));
    sessionStorage.setItem('vt_username', _username);
    if (_avatarUrl) sessionStorage.setItem('vt_avatar_url', _avatarUrl);
    else            sessionStorage.removeItem('vt_avatar_url');
  }

  function _restore() {
    _token     = sessionStorage.getItem('vt_token');
    _userId    = parseInt(sessionStorage.getItem('vt_user_id'));
    _username  = sessionStorage.getItem('vt_username');
    _avatarUrl = sessionStorage.getItem('vt_avatar_url') || null;
  }

  // -- Getters --
  function getToken()    { return _token; }
  function getUserId()   { return _userId; }
  function getUsername() { return _username; }
  function getAvatar()   { return _avatarUrl; }
  function isLoggedIn()  { return !!_token; }

  function authHeaders() {
    return _token ? { 'Authorization': `Bearer ${_token}` } : {};
  }

  // -- Guards --
  function requireAuth() {
    _restore();
    if (!isLoggedIn()) {
      window.location.href = 'index.html';
      return false;
    }
    refreshAvatar();
    _checkApi();
    setInterval(_checkApi, 15000);
    return true;
  }

  function initLoginPage() {
    _restore();
    if (isLoggedIn()) {
      window.location.href = 'dashboard.html';
      return;
    }
    document.getElementById('loginPassword')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitLogin();
    });
    document.getElementById('regConfirm')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitRegister();
    });
  }

  // -- API URL --
  function _apiUrl() {
    return (
      document.getElementById('apiUrlAuth')?.value ||
      document.getElementById('apiUrl')?.value ||
      localStorage.getItem('vt_api_url') ||
      'https://geoapi.laurentjouron.dev'
    ).replace(/\/$/, '');
  }

  // -- Login --
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

  // -- Register --
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

  // -- Upload avatar vers le backend --
  async function uploadAvatar(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${_apiUrl()}/auth/me/avatar`, {
      method: 'POST',
      headers: authHeaders(),  // pas de Content-Type : laisse le navigateur setter multipart
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Erreur upload avatar");
    }
    const data = await res.json();
    _avatarUrl = data.avatar_url;
    sessionStorage.setItem('vt_avatar_url', _avatarUrl);
    refreshAvatar();
    return _avatarUrl;
  }

  // -- Mise a jour profil --
  async function updateProfile(username, email, password) {
    const params = new URLSearchParams();
    if (username) params.append('username', username);
    if (email)    params.append('email', email);
    if (password) params.append('password', password);

    const res = await fetch(`${_apiUrl()}/auth/me?${params.toString()}`, {
      method: 'PATCH',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Erreur mise a jour profil");
    }
    const data = await res.json();
    if (data.username) {
      _username = data.username;
      sessionStorage.setItem('vt_username', _username);
    }
    return data;
  }

  // -- UI login --
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
    if (password.length < 8)  { errEl.textContent = 'Mot de passe trop court (8 caracteres min)'; return; }

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

  // -- Statut API --
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

  // -- Avatar : topbar + page profil --
  function refreshAvatar() {
    const src = _avatarUrl || null;

    // Topbar avatar
    const topbarAvatar = document.getElementById('topbarAvatar');
    if (topbarAvatar) {
      topbarAvatar.innerHTML = src
        ? `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : (_username || '?').charAt(0).toUpperCase();
    }

    // Page profil
    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar) {
      profileAvatar.innerHTML = src
        ? `<img src="${src}" style="width:80px;height:80px;border-radius:50%;object-fit:cover">`
        : (_username || '?').charAt(0).toUpperCase();
    }

    // Username topbar
    const nameEl = document.getElementById('topbarUsername');
    if (nameEl) nameEl.textContent = _username || '';
  }

  return {
    requireAuth, initLoginPage,
    getToken, getUserId, getUsername, getAvatar, isLoggedIn, authHeaders,
    login, register, logout,
    uploadAvatar, updateProfile,
    switchTab, submitLogin, submitRegister,
    refreshAvatar,
  };

})();