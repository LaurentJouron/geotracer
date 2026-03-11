/**
 * theme.js — Gestion des thèmes dark / light / garmin
 * À inclure sur toutes les pages AVANT style.css
 */

const Theme = (() => {

  const THEMES = [
    { key: 'dark',   icon: '🌙', label: 'Dark'   },
    { key: 'light',  icon: '☀️', label: 'Light'  },
    { key: 'garmin', icon: '<img src="images/garmin.svg" style="width:20px;height:20px;vertical-align:middle;filter:brightness(0.8)">', label: 'Garmin' },
  ];

  const STORAGE_KEY = 'vt_theme';

  // ── Appliquer un thème ────────────────────────────────
  function apply(key) {
    document.documentElement.setAttribute('data-theme', key);
    localStorage.setItem(STORAGE_KEY, key);
    _updateButtons(key);
  }

  // ── Restaurer le thème sauvegardé ─────────────────────
  function restore() {
    const saved = localStorage.getItem(STORAGE_KEY) || 'dark';
    apply(saved);
    return saved;
  }

  // ── Mettre à jour l'état des boutons ──────────────────
  function _updateButtons(activeKey) {
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === activeKey);
    });
  }

  // ── Générer le HTML du sélecteur ──────────────────────
  function renderSwitcher(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const current = localStorage.getItem(STORAGE_KEY) || 'dark';

    container.innerHTML = `
      <div class="theme-switcher">
        ${THEMES.map(t => `
          <button
            class="theme-btn ${t.key === current ? 'active' : ''}"
            data-theme="${t.key}"
            title="${t.label}"
            onclick="Theme.apply('${t.key}')"
          >${t.icon}</button>
        `).join('')}
      </div>
    `;
  }

  // ── Init — appliquer le thème immédiatement au chargement ──
  // (appelé inline dans le <head> pour éviter le flash)
  function init() {
    restore();
  }

  return { apply, restore, init, renderSwitcher, THEMES };

})();

// Appliquer immédiatement pour éviter le flash de thème
Theme.restore();