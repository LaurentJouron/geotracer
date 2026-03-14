/**
 * tracker.js — GPS live avec Leaflet, Wake Lock, offline sync
 */

const Tracker = (() => {

  // ── État ──────────────────────────────────────────────
  let _tracking   = false;
  let _paused     = false;
  let _gpsWatchId = null;
  let _activityId = null;
  let _liveWs     = null;
  let _wakeLock   = null;
  let _totalDist  = 0;
  let _lastPos    = null;
  let _pointCount = 0;
  let _startTime  = null;
  let _pausedTime = 0;       // temps cumulé en pause (ms)
  let _pauseStart = null;    // timestamp début pause
  let _durTimer   = null;

  // ── Leaflet ───────────────────────────────────────────
  let _map        = null;
  let _marker     = null;
  let _circle     = null;
  let _polyline   = null;
  let _latlngs    = [];

  // ── IndexedDB (offline buffer) ────────────────────────
  let _db = null;

  async function _openDb() {
    if (_db) return _db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('geotracer-offline', 1);
      req.onupgradeneeded = e =>
        e.target.result.createObjectStore('pending_points', { keyPath: 'id', autoIncrement: true });
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e);
    });
  }

  async function _saveOffline(point) {
    const db = await _openDb();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('pending_points', 'readwrite');
      const req = tx.objectStore('pending_points').add({
        activityId: _activityId,
        token:      Auth.getToken(),
        point,
        ts: Date.now(),
      });
      req.onsuccess = () => resolve();
      req.onerror   = e  => reject(e);
    });
  }

  async function _flushOffline() {
    const db = await _openDb();
    const tx  = db.transaction('pending_points', 'readwrite');
    const store = tx.objectStore('pending_points');
    const all = await new Promise(res => { const r = store.getAll(); r.onsuccess = e => res(e.target.result); });
    for (const item of all) {
      try {
        await Api.addPoint(item.activityId, item.point);
        store.delete(item.id);
      } catch { break; }
    }
  }

  // ── Init carte Leaflet ────────────────────────────────
  function initMap() {
    _map = L.map('liveMap', { zoomControl: true, attributionControl: false });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(_map);

    _map.setView([46.603354, 1.888334], 6);

    _polyline = L.polyline([], {
      color: '#00d4ff',
      weight: 4,
      opacity: 0.9,
    }).addTo(_map);

    // NE PAS demander le GPS ici — iOS bloque les demandes hors action utilisateur
    // La géolocalisation est demandée uniquement au tap sur Démarrer
  }

  // ── Toggle démarrer / arrêter ─────────────────────────
  function toggle() {
    _tracking ? _stop() : _start();
  }

  // ── Pause / Reprendre ─────────────────────────────────
  function togglePause() {
    if (!_tracking) return;
    _paused ? _resume() : _pause();
  }

  function _pause() {
    _paused = true;
    _pauseStart = Date.now();
    if (_gpsWatchId) navigator.geolocation.clearWatch(_gpsWatchId);
    _gpsWatchId = null;
    _lastPos = null; // évite un saut de distance au reprise
    _setUiPaused(true);
    toast('⏸ Sortie en pause');
  }

  function _resume() {
    _paused = false;
    if (_pauseStart) _pausedTime += Date.now() - _pauseStart;
    _pauseStart = null;
    _setUiPaused(false);
    // Reprendre le GPS
    _gpsWatchId = navigator.geolocation.watchPosition(
      _onPosition, _onGpsError,
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
    toast('▶ Sortie reprise');
  }

  async function _start() {
    if (!navigator.geolocation) {
      toast('GPS non disponible dans ce navigateur', 'error');
      return;
    }

    // ── Demander le GPS immédiatement au tap (requis par iOS) ──
    toast('📡 Acquisition GPS...');
    try {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          pos => {
            _map.setView([pos.coords.latitude, pos.coords.longitude], 15);
            resolve();
          },
          err => reject(err),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    } catch (err) {
      const msgs = {
        1: 'Permission GPS refusée — autorise la localisation dans les réglages iPhone',
        2: 'Position GPS indisponible',
        3: 'Délai GPS dépassé — réessaie en extérieur',
      };
      toast(msgs[err.code] || 'Erreur GPS', 'error');
      return; // on n'arrête pas si pas de GPS
    }

    // Créer la sortie backend
    try {
      const title = `Sortie du ${new Date().toLocaleDateString('fr-FR')}`;
      const a = await Api.createActivity(title);
      _activityId = a.id;
      toast(`✅ Sortie démarrée — ID ${_activityId}`);
    } catch {
      _activityId = null;
      toast('⚠️ Mode hors ligne — points stockés localement');
    }

    // Wake Lock
    try { _wakeLock = await navigator.wakeLock?.request('screen'); } catch {}

    // Réinit état
    _tracking = true; _paused = false;
    _totalDist = 0; _lastPos = null;
    _pointCount = 0; _startTime = Date.now();
    _pausedTime = 0; _pauseStart = null;
    _latlngs = [];
    _polyline?.setLatLngs([]);

    _setUiRunning(true);
    _setUiPaused(false);
    _showSharePanel();
    _showCheerFeed(true);

    // Chronomètre (exclut le temps en pause)
    _durTimer = setInterval(() => {
      if (_paused) return;
      const s = Math.floor((Date.now() - _startTime - _pausedTime) / 1000);
      document.getElementById('liveDur').innerHTML = fmtDurShort(s) + '<span class="unit"></span>';
    }, 1000);

    // WebSocket live
    if (_activityId) {
      try {
        _liveWs = Api.connectLive(_activityId);
        _liveWs.onmessage = e => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'cheer') _onCheerReceived(msg.data);
          } catch {}
        };
      } catch {}
    }

    // GPS continu
    _gpsWatchId = navigator.geolocation.watchPosition(
      _onPosition, _onGpsError,
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );

    _flushOffline().catch(() => {});

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }
  }

  async function _stop() {
    _tracking = false;
    _paused   = false;
    if (_gpsWatchId) navigator.geolocation.clearWatch(_gpsWatchId);
    if (_liveWs)     _liveWs.close();
    if (_wakeLock)   { _wakeLock.release(); _wakeLock = null; }
    clearInterval(_durTimer);
    _setUiRunning(false);
    _setUiPaused(false);
    _hideSharePanel();
    _showCheerFeed(false);

    if (_activityId) {
      try {
        await Api.finishActivity(_activityId);
        toast(`🏁 Sortie #${_activityId} enregistrée !`);
        setTimeout(() => {
          if (confirm('Voir le détail de la sortie ?')) {
            sessionStorage.setItem('vt_activity_id', _activityId);
            window.location.href = 'activities.html';
          }
        }, 1000);
      } catch {
        toast('Erreur lors de la finalisation', 'error');
      }
    }
  }

  // ── Réception position GPS ────────────────────────────
  function _onPosition(pos) {
    if (_paused) return; // ignorer les positions pendant la pause

    const { latitude: lat, longitude: lon, altitude: alt, speed, accuracy } = pos.coords;
    const spd = speed != null ? speed * 3.6 : null;

    _updateAccuracy(accuracy);

    if (_lastPos) _totalDist += haversine(_lastPos.lat, _lastPos.lon, lat, lon);
    _lastPos = { lat, lon };
    _pointCount++;

    const latlng = L.latLng(lat, lon);
    _latlngs.push(latlng);
    _polyline.setLatLngs(_latlngs);

    if (!_marker) {
      _marker = L.circleMarker(latlng, {
        radius: 8, color: '#00d4ff', fillColor: '#00d4ff',
        fillOpacity: 0.9, weight: 2,
      }).addTo(_map);
    } else {
      _marker.setLatLng(latlng);
    }

    if (!_circle) {
      _circle = L.circle(latlng, {
        radius: accuracy, color: '#00d4ff',
        fillColor: '#00d4ff', fillOpacity: 0.08,
        weight: 1, dashArray: '4',
      }).addTo(_map);
    } else {
      _circle.setLatLng(latlng);
      _circle.setRadius(accuracy);
    }

    _map.panTo(latlng, { animate: true, duration: 0.5 });

    _setMetric('liveSpeed', spd != null ? spd.toFixed(1) : '—', 'km/h');
    _setMetric('liveAlt',   alt != null ? Math.round(alt) : '—', 'm');
    _setMetric('liveDist',  _totalDist.toFixed(2), 'km');
    document.getElementById('livePoints').innerHTML = _pointCount + '<span class="unit">pts</span>';
    document.getElementById('speedFill').style.width = Math.min((spd || 0) / 60 * 100, 100) + '%';

    const point = { lat, lon, alt, speed_kmh: spd, ts: new Date().toISOString() };
    if (_liveWs?.readyState === WebSocket.OPEN) {
      _liveWs.send(JSON.stringify(point));
    } else if (_activityId) {
      Api.addPoint(_activityId, point).catch(() => _saveOffline(point));
    } else {
      _saveOffline(point).catch(() => {});
    }
  }

  function _onGpsError(err) {
    const msgs = {
      1: 'Permission GPS refusée — autorise la localisation dans les réglages',
      2: 'Position GPS indisponible',
      3: 'Délai GPS dépassé',
    };
    toast(msgs[err.code] || 'Erreur GPS', 'error');
    _updateAccuracy(null);
  }

  // ── Indicateur précision ──────────────────────────────
  function _updateAccuracy(accuracy) {
    const dot  = document.getElementById('gpsDot');
    const text = document.getElementById('gpsAccText');
    if (accuracy == null) {
      dot.className = 'gps-dot';
      text.textContent = 'GPS indisponible';
      return;
    }
    if (accuracy <= 10) {
      dot.className = 'gps-dot good';
      text.textContent = `GPS excellent — ±${Math.round(accuracy)}m`;
    } else if (accuracy <= 30) {
      dot.className = 'gps-dot medium';
      text.textContent = `GPS correct — ±${Math.round(accuracy)}m`;
    } else {
      dot.className = 'gps-dot bad';
      text.textContent = `GPS faible — ±${Math.round(accuracy)}m`;
    }
  }

  // ── Suivre un ami ─────────────────────────────────────
  function watchFriend() {
    const id = document.getElementById('watchIdInput').value.trim();
    if (!id) { toast('Saisissez un ID de sortie', 'error'); return; }

    const ws = Api.connectWatch(id);
    ws.onopen = () => toast(`👁 Suivi de la sortie #${id}...`);
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'position') {
        const { lat, lon, speed_kmh } = msg.data;
        _setMetric('liveSpeed', speed_kmh?.toFixed(1) || '—', 'km/h');
        if (_map && lat && lon) {
          const latlng = L.latLng(lat, lon);
          if (!_marker) {
            _marker = L.circleMarker(latlng, {
              radius: 8, color: '#ff6b00', fillColor: '#ff6b00', fillOpacity: 0.9,
            }).addTo(_map);
          } else _marker.setLatLng(latlng);
          _map.panTo(latlng);
        }
      }
    };
    ws.onerror = () => toast('Erreur de connexion', 'error');
  }

  // ── Plein écran carte ─────────────────────────────────
  function toggleFullscreen() {
    const wrap = document.getElementById('trackerMapWrap');
    if (!document.fullscreenElement) {
      wrap.requestFullscreen?.() || wrap.webkitRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.();
    }
    setTimeout(() => _map?.invalidateSize(), 300);
  }

  // ── Helpers UI ────────────────────────────────────────
  function _setMetric(id, val, unit) {
    document.getElementById(id).innerHTML = `${val}<span class="unit">${unit}</span>`;
  }

  function _setUiRunning(on) {
    const btn      = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const badge    = document.getElementById('liveBadge');
    btn.className  = on ? 'btn-live stop' : 'btn-live start';
    btn.innerHTML  = on ? '<span>⏹</span> Arrêter' : '<span>▶</span> Démarrer';
    badge.style.display  = on ? 'flex' : 'none';
    if (pauseBtn) pauseBtn.style.display = on ? 'block' : 'none';
  }

  function _setUiPaused(paused) {
    const pauseBtn = document.getElementById('pauseBtn');
    const badge    = document.getElementById('liveBadge');
    if (!pauseBtn) return;
    pauseBtn.className = paused ? 'btn-live resume' : 'btn-live pause';
    pauseBtn.innerHTML = paused ? '<span>▶</span> Reprendre' : '<span>⏸</span> Pause';
    if (badge) {
      badge.textContent = paused ? 'En pause' : 'Live';
      badge.style.background = paused ? 'rgba(255,214,0,0.15)' : '';
      badge.style.borderColor = paused ? 'rgba(255,214,0,0.4)' : '';
      badge.style.color = paused ? 'var(--yellow)' : '';
    }
  }

  // ── Partage ───────────────────────────────────────────
  function _showSharePanel() {
    const panel = document.getElementById('sharePanel');
    if (!panel || !_activityId) return;
    const api = document.getElementById('apiUrl')?.value || localStorage.getItem('vt_api_url') || 'https://geoapi.laurentjouron.dev';
    const base = window.location.href.replace('tracker.html', 'watch.html').split('?')[0];
    const url  = `${base}?id=${_activityId}&api=${encodeURIComponent(api)}`;
    panel.style.display = 'flex';
    document.getElementById('sharePanelUrl').textContent = url;
    document.getElementById('sharePanelUrl').dataset.url = url;
  }

  function _hideSharePanel() {
    const panel = document.getElementById('sharePanel');
    if (panel) panel.style.display = 'none';
  }


  // ── Encouragements reçus ──────────────────────────────
  function _onCheerReceived(data) {
    _addCheerToFeed(data);
    _showCheerToast(data);
    // Vibration mobile
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    // Notification système
    if (Notification.permission === 'granted') {
      new Notification(`💬 ${data.author_name}`, {
        body: data.message,
        icon: '/images/apple-touch-icon-180.png',
        badge: '/images/apple-touch-icon-120.png',
        silent: false,
      });
    }
  }

  function _addCheerToFeed(data) {
    const feed = document.getElementById('trackerCheerFeed');
    if (!feed) return;
    // Supprimer le message placeholder si présent
    const placeholder = feed.querySelector('div[style*="italic"]');
    if (placeholder) placeholder.remove();

    const time = new Date(data.sent_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const item = document.createElement('div');
    item.className = 'tracker-cheer-item';
    const name = data.author_name.replace(/&/g,'&amp;').replace(/</g,'&lt;');
    const msg  = data.message.replace(/&/g,'&amp;').replace(/</g,'&lt;');
    item.innerHTML = `<strong>${name}</strong> : ${msg} <span style="opacity:0.4;font-size:10px">${time}</span>`;
    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;
  }

  function _showCheerToast(data) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed;top:80px;left:50%;transform:translateX(-50%);
      background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.4);
      color:#fff;padding:10px 20px;border-radius:12px;font-size:14px;
      z-index:9999;white-space:nowrap;animation:cheerIn 0.3s ease;
    `;
    el.textContent = `💬 ${data.author_name} : ${data.message}`;
    document.body.appendChild(el);
    setTimeout(() => el.style.opacity = '0', 3500);
    setTimeout(() => el.remove(), 4000);
  }

  function _showCheerFeed(show) {
    const el = document.getElementById('trackerCheers');
    if (el) el.style.display = show ? 'block' : 'none';
    // Demander permission notifications au démarrage
    if (show && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  return { toggle, togglePause, watchFriend, initMap, toggleFullscreen };

})();

// Fonctions globales pour les boutons inline
function Tracker_copyShareUrl() {
  const url = document.getElementById('sharePanelUrl')?.dataset?.url;
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => toast('✅ Lien copié !'));
}
function Tracker_shareActivity() {
  const url = document.getElementById('sharePanelUrl')?.dataset?.url;
  if (!url) return;
  if (navigator.share) {
    navigator.share({ title: 'Suis ma sortie vélo en direct !', url });
  } else {
    Tracker_copyShareUrl();
  }
}
