/**
 * components.js — Chargement des composants partagés (sidebar, topbar, bottom-nav)
 *
 * Usage dans chaque page HTML :
 *   1. Ajouter <div id="sidebar"></div>, <div id="topbar"></div>, <div id="bottom-nav"></div>
 *   2. Ajouter <script src="js/components.js"></script> en premier script
 *   3. Appeler Components.init('nom-page', 'Titre Page') dans DOMContentLoaded
 */

const Components = (() => {

  // ── Charger un fragment HTML ──────────────────────────
  async function _load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Composant introuvable : ${url}`);
    return res.text();
  }

  // ── Injecter dans un élément ──────────────────────────
  function _inject(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  // ── Marquer la page active ────────────────────────────
  function _setActivePage(page) {
    // Sidebar
    document.querySelectorAll('.sidebar .nav-item[data-page]').forEach(a => {
      a.classList.toggle('active', a.dataset.page === page);
    });
    // Bottom nav
    document.querySelectorAll('.bottom-nav .bottom-nav-item[data-page]').forEach(a => {
      a.classList.toggle('active', a.dataset.page === page);
    });
  }

  // ── Mettre à jour le titre de la topbar ───────────────
  function _setTitle(title) {
    const el = document.getElementById('topbarTitle');
    if (el) el.textContent = title;
  }

  // ── Init principal ────────────────────────────────────
  /**
   * @param {string} page   - identifiant de la page (ex: 'dashboard')
   * @param {string} title  - titre affiché dans la topbar (ex: 'Dashboard')
   */
  async function init(page, title) {
    try {
      // Charger les 3 composants en parallèle
      const [sidebarHtml, topbarHtml, bottomNavHtml] = await Promise.all([
        _load('components/sidebar.html'),
        _load('components/topbar.html'),
        _load('components/bottom-nav.html'),
      ]);

      _inject('sidebar',     sidebarHtml);
      _inject('topbar',      topbarHtml);
      _inject('bottom-nav',  bottomNavHtml);

      // Appliquer la page active et le titre
      _setActivePage(page);
      if (title) _setTitle(title);

      // Auth — afficher username + avatar
      Auth.requireAuth();
      Auth.refreshAvatar();

      // Theme switcher
      Theme.renderSwitcher('themeSwitcher');

    } catch (e) {
      console.error('Components.init error:', e);
    }
  }

  return { init };

})();
