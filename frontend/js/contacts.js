/**
 * contacts.js — Carnet de contacts + partage de sorties
 * Contacts stockés en localStorage (pas de backend nécessaire)
 * Liens de partage générés via POST /shares
 */

const Contacts = (() => {

  const STORAGE_KEY = 'vt_contacts';
  let _duration     = '7d';
  let _currentLink  = null;
  let _selectedContacts = new Set();

  // ── CONTACTS (localStorage) ───────────────────────────

  function _getContacts() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function _saveContacts(contacts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  }

  function addContact() {
    const name  = document.getElementById('newContactName').value.trim();
    const email = document.getElementById('newContactEmail').value.trim();
    const phone = document.getElementById('newContactPhone').value.trim();

    if (!name)  { toast('Le nom est requis', 'error'); return; }
    if (!email && !phone) { toast('Email ou téléphone requis', 'error'); return; }

    const contacts = _getContacts();
    contacts.push({
      id:    Date.now(),
      name,
      email: email || null,
      phone: phone || null,
    });
    _saveContacts(contacts);

    // Reset form
    document.getElementById('newContactName').value  = '';
    document.getElementById('newContactEmail').value = '';
    document.getElementById('newContactPhone').value = '';

    toast(`✅ ${name} ajouté`);
    _renderContacts();
  }

  function deleteContact(id) {
    const contacts = _getContacts().filter(c => c.id !== id);
    _saveContacts(contacts);
    _renderContacts();
    toast('Contact supprimé');
  }

  function _renderContacts() {
    const contacts = _getContacts();
    const list     = document.getElementById('contactsList');
    const empty    = document.getElementById('contactsEmpty');

    if (!contacts.length) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = contacts.map(c => `
      <div class="contact-card">
        <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
        <div class="contact-info">
          <div class="contact-name">${c.name}</div>
          <div class="contact-detail">${[c.email, c.phone].filter(Boolean).join(' · ')}</div>
        </div>
        <div class="contact-actions">
          <button class="btn-icon" title="Partager une sortie"
            onclick="Contacts.openShareModal(${c.id})">🔗</button>
          <button class="btn-icon danger" title="Supprimer"
            onclick="Contacts.deleteContact(${c.id})">🗑</button>
        </div>
      </div>`).join('');
  }

  // ── LIENS DE PARTAGE ──────────────────────────────────

  async function _loadShareLinks() {
    const list  = document.getElementById('sharesList');
    const empty = document.getElementById('sharesEmpty');
    const uid   = Auth.getUserId();
    if (!uid) return;

    try {
      const shares = await Api.getShares(uid);
      if (!shares.length) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
      }
      empty.style.display = 'none';

      const base = _watchBaseUrl();
      list.innerHTML = shares.map(s => {
        const url    = `${base}/watch.html?token=${s.token}`;
        const expiry = new Date(s.expires_at).toLocaleDateString('fr-FR');
        return `
          <div class="share-link-card">
            <div class="share-link-label">${s.label || 'Lien de partage'}</div>
            <div class="share-link-meta">Expire le ${expiry}</div>
            <div class="share-link-url" onclick="navigator.clipboard.writeText('${url}').then(()=>toast('📋 Copié !'))"
              title="Cliquer pour copier">${url}</div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-ghost" style="font-size:11px;padding:5px 12px"
                onclick="navigator.clipboard.writeText('${url}').then(()=>toast('📋 Copié !'))">
                📋 Copier
              </button>
              <button class="btn btn-ghost" style="font-size:11px;padding:5px 12px;color:var(--red);border-color:var(--red)"
                onclick="Contacts.revokeShare('${s.token}')">
                ✕ Révoquer
              </button>
            </div>
          </div>`;
      }).join('');
    } catch {
      empty.style.display = 'block';
    }
  }

  async function revokeShare(token) {
    if (!confirm('Révoquer ce lien ? Les personnes qui l\'ont ne pourront plus y accéder.')) return;
    try {
      await Api.revokeShare(token);
      toast('Lien révoqué');
      _loadShareLinks();
    } catch {
      toast('Erreur lors de la révocation', 'error');
    }
  }

  // ── MODAL DE PARTAGE ──────────────────────────────────

  function openShareModal(preselectedContactId = null) {
    _currentLink = null;
    _selectedContacts = new Set();
    if (preselectedContactId) _selectedContacts.add(preselectedContactId);

    document.getElementById('shareLabel').value     = '';
    document.getElementById('shareLinkResult').style.display = 'none';
    document.getElementById('btnGenerateLink').style.display = 'inline-flex';

    // Réinitialiser durée
    setDuration('7d', document.querySelector('.duration-btn.active'));

    // Remplir la liste de contacts
    const contacts = _getContacts();
    const container = document.getElementById('shareContactsList');
    if (!contacts.length) {
      container.innerHTML = `<div style="font-family:var(--font-mono);font-size:11px;
        color:var(--text3)">Aucun contact — <a href="contacts.html"
        style="color:var(--accent)">ajouter des contacts</a> pour les sélectionner.</div>`;
    } else {
      container.innerHTML = contacts.map(c => `
        <label class="contact-checkbox-row">
          <input type="checkbox" value="${c.id}"
            ${_selectedContacts.has(c.id) ? 'checked' : ''}
            onchange="Contacts._toggleContact(${c.id}, this.checked)">
          <div>
            <div style="font-family:var(--font-head);font-size:13px;font-weight:700;color:var(--text)">${c.name}</div>
            <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3)">
              ${[c.email, c.phone].filter(Boolean).join(' · ')}
            </div>
          </div>
        </label>`).join('');
    }

    // Afficher bouton share natif si disponible
    if (navigator.share) {
      document.getElementById('btnNativeShare').style.display = 'inline-flex';
    }

    document.getElementById('shareModal').style.display = 'block';
  }

  function closeShareModal() {
    document.getElementById('shareModal').style.display = 'none';
  }

  function setDuration(d, el) {
    _duration = d;
    document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
  }

  function _toggleContact(id, checked) {
    if (checked) _selectedContacts.add(id);
    else _selectedContacts.delete(id);
  }

  async function generateLink() {
    const label = document.getElementById('shareLabel').value.trim() || 'Sortie en direct';
    const uid   = Auth.getUserId();
    if (!uid) { toast('Non connecté', 'error'); return; }

    const btn = document.getElementById('btnGenerateLink');
    btn.textContent = '⏳ Génération…';
    btn.disabled    = true;

    try {
      const share = await Api.createShare({
        user_id:  uid,
        label,
        duration: _duration,
      });

      const url = `${_watchBaseUrl()}/watch.html?token=${share.token}`;
      _currentLink = { url, share, label };

      document.getElementById('shareLinkUrl').textContent      = url;
      document.getElementById('shareLinkResult').style.display = 'block';
      btn.style.display = 'none';

      toast('✅ Lien généré !');
      _loadShareLinks();
    } catch (e) {
      toast('Erreur lors de la génération', 'error');
    } finally {
      btn.textContent = 'Générer le lien';
      btn.disabled    = false;
    }
  }

  function _watchBaseUrl() {
    const apiUrl = localStorage.getItem('vt_api_url') || 'http://localhost:8000';
    // Frontend URL = même origine que la page actuelle
    return window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  }

  function copyShareLink() {
    if (!_currentLink) return;
    navigator.clipboard.writeText(_currentLink.url)
      .then(() => toast('📋 Lien copié !'))
      .catch(() => toast('Impossible de copier', 'error'));
  }

  function sendByEmail() {
    if (!_currentLink) return;
    const contacts  = _getContacts().filter(c => _selectedContacts.has(c.id) && c.email);
    const to        = contacts.map(c => c.email).join(',');
    const subject   = encodeURIComponent(`Suis ma sortie en direct — ${_currentLink.label}`);
    const body      = encodeURIComponent(
      `Salut !\n\nSuis ma sortie en temps réel ici :\n${_currentLink.url}\n\nLien valable jusqu'au ${new Date(_currentLink.share.expires_at).toLocaleDateString('fr-FR')}.\n\nBonne route ! 🚴`
    );
    window.open(`mailto:${to}?subject=${subject}&body=${body}`);
  }

  function sendBySms() {
    if (!_currentLink) return;
    const contacts = _getContacts().filter(c => _selectedContacts.has(c.id) && c.phone);
    const phones   = contacts.map(c => c.phone).join(',');
    const body     = encodeURIComponent(`Suis ma sortie en direct 🚴 → ${_currentLink.url}`);
    window.open(`sms:${phones}?body=${body}`);
  }

  async function shareNative() {
    if (!_currentLink || !navigator.share) return;
    try {
      await navigator.share({
        title: _currentLink.label,
        text:  'Suis ma sortie en temps réel 🚴',
        url:   _currentLink.url,
      });
    } catch {}
  }

  // ── Chargement ────────────────────────────────────────
  function load() {
    _renderContacts();
    _loadShareLinks();
  }

  return {
    load, addContact, deleteContact,
    openShareModal, closeShareModal,
    setDuration, _toggleContact,
    generateLink, copyShareLink, sendByEmail, sendBySms, shareNative,
    revokeShare,
  };

})();
