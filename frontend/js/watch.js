const Watch = (() => {

  let _ws       = null;
  let _map      = null;
  let _marker   = null;
  let _polyline = null;
  let _latlngs  = [];
  let _actId    = null;
  let _startTs  = null;
  let _durTimer = null;
  let _qr       = null;
  let _cheerName = '';

  // ── Lire les params URL ───────────────────────────────
  function _params() {
    const p = new URLSearchParams(window.location.search);
    return {
      id:      p.get('id'),
      user:    p.get('user'),
      api:     p.get('api') || 'http://localhost:8000',
    };
  }

  // ── Init ─────────────────────────────────────────────
  function init() {
    const { id, user, api } = _params();

    // Pré-remplir l'input API si fourni dans l'URL
    if (api) sessionStorage.setItem('vt_watch_api', api);

    if (id) {
      // Lien direct avec ID → démarrer directement
      document.getElementById('watchIdInput').value = id;
      start();
    }

    if (user) {
      document.getElementById('watchRiderName').textContent = user.toUpperCase();
      document.getElementById('watchAvatar').textContent    = user.charAt(0).toUpperCase();
      document.getElementById('watchRider').style.display   = 'flex';
    }

    // Écouter Enter sur l'input
    document.getElementById('watchIdInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') start();
    });
  }

  // ── Démarrer le suivi ─────────────────────────────────
  function start() {
    const input = document.getElementById('watchIdInput');
    _actId = input.value.trim();
    if (!_actId) { alert('Saisissez un ID de sortie'); return; }

    // Basculer sur la vue carte
    document.getElementById('watchInputPage').style.display = 'none';
    document.getElementById('watchMapPage').style.display   = 'flex';
    document.getElementById('watchFooter').style.display    = 'flex';

    _initMap();
    _connect();
    _updateShareUrl();
    _initCheerPanel();
  }

  // ── Carte Leaflet ─────────────────────────────────────
  function _initMap() {
    if (_map) return;
    _map = L.map('watchMap', { zoomControl: true, attributionControl: false });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(_map);

    // Appliquer le filtre thème
    document.querySelector('#watchMap .leaflet-tile-pane').classList.add('watch-map-filter');

    _map.setView([46.603354, 1.888334], 6); // France par défaut
    setTimeout(() => _map.invalidateSize(), 200);
  }

  // ── WebSocket ─────────────────────────────────────────
  function _connect() {
    const api = sessionStorage.getItem('vt_watch_api') || 'http://localhost:8000';
    const wsUrl = api.replace('http', 'ws') + `/tracking/watch/${_actId}`;

    _ws = new WebSocket(wsUrl);

    _ws.onopen = () => {
      _setStatus('live', 'Connecté — En attente GPS...');
    };

    _ws.onmessage = e => {
      const msg = JSON.parse(e.data);

      if (msg.type === 'position') {
        const d = msg.data;
        _onPosition(d);
      }

      if (msg.type === 'cheer') {
        _onCheerReceived(msg.data);
      }

      if (msg.type === 'finished') {
        _onFinished(msg.data);
      }
    };

    _ws.onerror = () => _setStatus('', 'Erreur de connexion');

    _ws.onclose = () => {
      if (!document.getElementById('watchEnded').classList.contains('show')) {
        _setStatus('', 'Déconnecté');
      }
    };
  }

  // ── Réception d'un point GPS ──────────────────────────
  function _onPosition(d) {
    const { lat, lon, speed_kmh, alt, distance_km, ts } = d;

    // Cacher waiting, montrer métriques
    document.getElementById('watchWaiting').style.display  = 'none';
    document.getElementById('watchMetrics').style.display  = 'flex';

    _setStatus('live', 'En direct 🔴');

    // Démarrer timer durée
    if (!_startTs) {
      _startTs = ts ? new Date(ts) : new Date();
      _durTimer = setInterval(_updateDur, 1000);
    }

    // Métriques
    document.getElementById('wSpeed').innerHTML = `${(speed_kmh || 0).toFixed(1)}<span class="watch-metric-unit">km/h</span>`;
    document.getElementById('wDist').innerHTML  = `${(distance_km || 0).toFixed(2)}<span class="watch-metric-unit">km</span>`;
    document.getElementById('wAlt').innerHTML   = `${Math.round(alt || 0)}<span class="watch-metric-unit">m</span>`;

    // Carte
    if (lat && lon) {
      const ll = L.latLng(lat, lon);
      _latlngs.push(ll);

      if (!_marker) {
        // Marqueur cycliste animé
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:20px;height:20px;border-radius:50%;
            background:var(--accent);border:3px solid #fff;
            box-shadow:0 0 12px rgba(0,212,255,0.8);
            animation:pulse 1.5s infinite;
          "></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        _marker = L.marker(ll, { icon }).addTo(_map);

        // Tracé
        _polyline = L.polyline(_latlngs, {
          color: 'var(--accent)', weight: 3, opacity: 0.8,
        }).addTo(_map);

        _map.setView(ll, 15);
      } else {
        _marker.setLatLng(ll);
        _polyline.addLatLng(ll);
        _map.panTo(ll);
      }
    }
  }

  // ── Sortie terminée ───────────────────────────────────
  function _onFinished(data) {
    clearInterval(_durTimer);
    _setStatus('ended', 'Sortie terminée');

    const stats = data || {};
    document.getElementById('watchEndedStats').innerHTML = `
      Distance : <strong>${(stats.distance_km || 0).toFixed(1)} km</strong><br>
      Durée : <strong>${_fmtDur(stats.duration_seconds || 0)}</strong><br>
      Vitesse moy. : <strong>${(stats.avg_speed_kmh || 0).toFixed(1)} km/h</strong>
    `;
    document.getElementById('watchEnded').classList.add('show');
  }

  // ── Durée ─────────────────────────────────────────────
  function _updateDur() {
    if (!_startTs) return;
    const secs = Math.floor((Date.now() - _startTs) / 1000);
    document.getElementById('wDur').textContent = _fmtDur(secs);
  }

  function _fmtDur(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h
      ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  // ── Status ────────────────────────────────────────────
  function _setStatus(type, text) {
    const dot  = document.getElementById('watchDot');
    const span = document.getElementById('watchStatusText');
    dot.className = 'watch-dot' + (type ? ' ' + type : '');
    span.textContent = text;
  }

  // ── URL de partage ────────────────────────────────────
  function _updateShareUrl() {
    const api    = sessionStorage.getItem('vt_watch_api') || 'http://localhost:8000';
    const url    = `${window.location.origin}${window.location.pathname}?id=${_actId}&api=${encodeURIComponent(api)}`;
    const el     = document.getElementById('shareUrl');
    el.textContent = url;
    el.dataset.url = url;
    return url;
  }

  function copyUrl() {
    const url = document.getElementById('shareUrl').dataset.url;
    navigator.clipboard.writeText(url).then(() => {
      document.getElementById('shareUrl').textContent = '✅ Lien copié !';
      setTimeout(_updateShareUrl, 2000);
    });
  }

  function share() {
    const url = document.getElementById('shareUrl').dataset.url;
    if (navigator.share) {
      navigator.share({
        title: 'Suis ma sortie vélo en direct !',
        text: `Je suis en sortie vélo, suis-moi en temps réel sur GeoTracer !`,
        url,
      });
    } else {
      copyUrl();
    }
  }

  // ── QR Code ───────────────────────────────────────────
  function showQr() {
    const url = document.getElementById('shareUrl').dataset.url;
    document.getElementById('qrUrl').textContent = url;
    document.getElementById('qrCanvas').innerHTML = '';

    _qr = new QRCode(document.getElementById('qrCanvas'), {
      text: url,
      width: 200, height: 200,
      colorDark: '#000', colorLight: '#fff',
      correctLevel: QRCode.CorrectLevel.M,
    });

    document.getElementById('qrModal').classList.add('open');
  }

  function hideQr() {
    document.getElementById('qrModal').classList.remove('open');
  }

  // ── Reset ─────────────────────────────────────────────
  function reset() {
    if (_ws) _ws.close();
    if (_durTimer) clearInterval(_durTimer);
    if (_map) { _map.remove(); _map = null; }
    _marker = null; _polyline = null; _latlngs = [];
    _actId = null; _startTs = null;

    document.getElementById('watchEnded').classList.remove('show');
    document.getElementById('watchMapPage').style.display  = 'none';
    document.getElementById('watchFooter').style.display   = 'none';
    document.getElementById('watchInputPage').style.display = 'flex';
    document.getElementById('watchMetrics').style.display  = 'none';
    document.getElementById('watchWaiting').style.display  = 'flex';
    _setStatus('', 'En attente...');
  }


  // ── Encouragements ───────────────────────────────────
  function _onCheerReceived(data) {
    _addCheerToFeed(data);
    _showCheerToast(data);
    // Notification système si permission accordée
    if (Notification.permission === 'granted') {
      new Notification(`💬 ${data.author_name}`, {
        body: data.message,
        icon: '/images/apple-touch-icon-180.png',
        badge: '/images/apple-touch-icon-120.png',
        vibrate: [200, 100, 200],
      });
    }
  }

  function _addCheerToFeed(data) {
    const feed = document.getElementById('cheerFeed');
    if (!feed) return;
    const time = new Date(data.sent_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const item = document.createElement('div');
    item.className = 'cheer-item';
    item.innerHTML = `<strong>${_esc(data.author_name)}</strong> · ${_esc(data.message)} <span style="opacity:0.4;font-size:10px">${time}</span>`;
    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;
  }

  function _showCheerToast(data) {
    const el = document.createElement('div');
    el.className = 'cheer-toast';
    el.textContent = `💬 ${data.author_name} : ${data.message}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function _esc(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  async function sendCheer() {
    const nameEl = document.getElementById('cheerName');
    const msgEl  = document.getElementById('cheerMsg');
    const name   = nameEl.value.trim();
    const msg    = msgEl.value.trim();

    if (!name) { nameEl.focus(); return; }
    if (!msg)  { msgEl.focus();  return; }

    // Mémoriser le prénom
    _cheerName = name;
    localStorage.setItem('vt_cheer_name', name);

    // Envoyer via WebSocket si connecté, sinon via API REST
    const payload = { type: 'cheer', author_name: name, message: msg };
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify(payload));
      // Afficher localement dans le feed
      _addCheerToFeed({ author_name: name, message: msg, sent_at: new Date().toISOString() });
    } else {
      // Fallback API REST
      const api = sessionStorage.getItem('vt_watch_api') || 'https://geoapi.laurentjouron.dev';
      try {
        await fetch(`${api}/activities/${_actId}/cheers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ author_name: name, message: msg }),
        });
        _addCheerToFeed({ author_name: name, message: msg, sent_at: new Date().toISOString() });
      } catch {
        alert('Erreur envoi, vérifie ta connexion');
        return;
      }
    }

    msgEl.value = '';
  }

  function _initCheerPanel() {
    const panel = document.getElementById('cheerPanel');
    if (panel) panel.style.display = 'flex';

    // Pré-remplir le prénom mémorisé
    const saved = localStorage.getItem('vt_cheer_name');
    if (saved) document.getElementById('cheerName').value = saved;

    // Demander permission notifications
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Envoyer avec Enter sur le champ message
    document.getElementById('cheerMsg').addEventListener('keydown', e => {
      if (e.key === 'Enter') sendCheer();
    });
  }

  return { init, start, copyUrl, share, showQr, hideQr, reset, sendCheer };

})();

document.addEventListener('DOMContentLoaded', () => Watch.init());