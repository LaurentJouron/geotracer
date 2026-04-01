/**
 * profile.js — Profil utilisateur + paramètres
 */

const Profile = (() => {

  const PREFS_KEY = 'vt_prefs';

  // ── Préférences par défaut ────────────────────────────
  const DEFAULTS = {
    units:      'km',
    timeFormat: '24h',
    notif:      false,
    autoCenter: true,
  };

  function getPrefs() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
    } catch { return { ...DEFAULTS }; }
  }

  function savePref(key, value) {
    const prefs = getPrefs();
    prefs[key]  = value;
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    toast(`✅ Préférence enregistrée`);
  }

  // ── Chargement de la page ─────────────────────────────
  async function load() {
    const username = Auth.getUsername() || '—';

    // Récupérer les infos complètes depuis le backend
    let me = null;
    try {
      me = await Api.getMe();
    } catch {}

    // Carte profil
    const name = me?.username || username;
    document.getElementById('profileName').textContent   = name.toUpperCase();
    document.getElementById('profileEmail').textContent  = me?.email || '—';
    // Initiale par défaut — sera écrasée par _applyAvatar si une image existe
    document.getElementById('profileAvatar').textContent = name.charAt(0).toUpperCase();
    _applyAvatar();
    // Aussi rafraîchir la topbar
    Auth.refreshAvatar();
  
    // Champs formulaire
    document.getElementById('settingUsername').value = name;
    document.getElementById('settingEmail').value    = me?.email || '';

    // Préférences
    const prefs = getPrefs();
    document.getElementById('settingUnits').value         = prefs.units;
    document.getElementById('settingTimeFormat').value    = prefs.timeFormat;
    document.getElementById('settingNotif').checked       = prefs.notif;
    document.getElementById('settingAutoCenter').checked  = prefs.autoCenter;

    // Stats globales
    try {
      const activities = await Api.getActivities();
      const done = activities.filter(a => !a.is_live);
      const totalDist  = done.reduce((s, a) => s + (a.distance_km     || 0), 0);
      const totalElev  = done.reduce((s, a) => s + (a.elevation_gain_m || 0), 0);
      const avgSpeed   = done.length
        ? done.reduce((s, a) => s + (a.avg_speed_kmh || 0), 0) / done.length
        : 0;

      document.getElementById('pKpiDist').textContent  = totalDist.toFixed(0);
      document.getElementById('pKpiRides').textContent = done.length;
      document.getElementById('pKpiElev').textContent  = totalElev.toFixed(0);
      document.getElementById('pKpiSpeed').textContent = avgSpeed.toFixed(1);
    } catch {
      toast('Impossible de charger les statistiques', 'error');
    }
  }

  // -- Sauvegarde du compte --
  async function saveAccount() {
    const username = document.getElementById('settingUsername').value.trim();
    const email    = document.getElementById('settingEmail').value.trim();
    const password = document.getElementById('settingPassword').value;

    if (!username) { toast('Le nom utilisateur est requis', 'error'); return; }

    const btn = document.getElementById('saveAccountBtn');
    if (btn) { btn.textContent = 'Enregistrement...'; btn.disabled = true; }

    try {
      await Auth.updateProfile(
        username,
        email,
        password || undefined,
      );
      document.getElementById('settingPassword').value = '';
      // Rafraichir le nom dans la topbar
      Auth.refreshAvatar();
      toast('Profil mis a jour');
    } catch (e) {
      toast(e.message || 'Erreur mise a jour', 'error');
    } finally {
      if (btn) { btn.textContent = 'Enregistrer'; btn.disabled = false; }
    }
  }

  // ── Zone danger ───────────────────────────────────────
  function confirmDeleteData() {
    _showConfirmBanner(
      '🗑 Supprimer toutes les sorties ?',
      'Cette action est irréversible. Toutes tes sorties et points GPS seront supprimés.',
      'Supprimer',
      async () => {
        try {
          // TODO: appel API DELETE /users/{id}/activities
          toast('✅ Toutes les sorties supprimées');
          setTimeout(() => window.location.href = 'dashboard.html', 1500);
        } catch {
          toast('Erreur lors de la suppression', 'error');
        }
      }
    );
  }

  function confirmDeleteAccount() {
    _showConfirmBanner(
      '❌ Supprimer mon compte ?',
      'Toutes tes données seront supprimées définitivement. Tu seras déconnecté.',
      'Supprimer le compte',
      async () => {
        try {
          // TODO: appel API DELETE /auth/me
          Auth.logout();
        } catch {
          toast('Erreur lors de la suppression', 'error');
        }
      }
    );
  }

  // ── Banner de confirmation ────────────────────────────
  function _showConfirmBanner(title, message, btnLabel, onConfirm) {
    const existing = document.getElementById('confirmBanner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'confirmBanner';
    banner.innerHTML = `
      <div style="
        position:fixed; inset:0; z-index:9000;
        background:rgba(0,0,0,0.7); backdrop-filter:blur(4px);
        display:flex; align-items:center; justify-content:center; padding:20px;
      ">
        <div style="
          background:var(--bg2); border:1px solid rgba(255,51,85,0.3);
          border-radius:12px; padding:28px 32px; max-width:420px; width:100%;
          box-shadow:0 24px 64px rgba(0,0,0,0.6);
        ">
          <div style="font-family:var(--font-head);font-size:18px;font-weight:700;
            letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px;color:var(--red)">
            ${title}
          </div>
          <p style="font-family:var(--font-mono);font-size:12px;color:var(--text2);
            line-height:1.7;margin-bottom:24px">${message}</p>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button onclick="document.getElementById('confirmBanner').remove()" style="
              background:transparent;border:1px solid var(--border2);border-radius:6px;
              padding:10px 20px;color:var(--text2);font-family:var(--font-head);
              font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;
              cursor:pointer;
            ">Annuler</button>
            <button id="confirmBtn" style="
              background:rgba(255,51,85,0.15);border:1px solid rgba(255,51,85,0.4);
              border-radius:6px;padding:10px 20px;color:var(--red);
              font-family:var(--font-head);font-size:13px;font-weight:700;
              letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;
            ">${btnLabel}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(banner);
    document.getElementById('confirmBtn').addEventListener('click', () => {
      banner.remove();
      onConfirm();
    });
  }

  function changeAvatar() {
    document.getElementById('avatarInput').click();
  }

  async function handleAvatar() {
    const file = document.getElementById('avatarInput').files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast('Seules les images sont acceptees', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast('Image trop volumineuse (max 2 Mo)', 'error');
      return;
    }

    toast('Envoi en cours...');
    try {
      await Auth.uploadAvatar(file);
      toast('Photo de profil mise a jour');
    } catch (e) {
      toast(e.message || 'Erreur upload', 'error');
    }
  }

  return { load, saveAccount, savePref, getPrefs, confirmDeleteData, confirmDeleteAccount, changeAvatar, handleAvatar };

})();