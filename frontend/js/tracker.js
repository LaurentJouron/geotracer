/**
 * tracker.js — GPS live avec Leaflet, Wake Lock, offline sync
 */

const Tracker = (() => {

  // ── État ──────────────────────────────────────────────
  let _tracking   = false;
  let _gpsWatchId = null;
  let _activityId = null;
  let _liveWs     = null;
  let _wakeLock   = null;
  let _totalDist  = 0;
  let _lastPos    = null;
  let _pointCount = 0;
  let _startTime  = null;
  let _durTimer   = null;

  // ── Leaflet ───────────────────────────────────────────
  let _map        = null;
  let _marker     = null;       // position actuelle
  let _circle     = null;       // cercle de précision
  let _polyline   = null;       // tracé parcouru
  let _latlngs    = [];         // historique des points

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

    // Centrer sur la France par défaut
    _map.setView([46.603354, 1.888334], 6);

    // Tracé GPS
    _polyline = L.polyline([], {
      color: '#00d4ff',
      weight: 4,
      opacity: 0.9,
    }).addTo(_map);

    // Essayer de centrer sur la position actuelle
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        _map.setView([pos.coords.latitude, pos.coords.longitude], 15);
      }, () => {}, { timeout: 5000 });
    }
  }

  // ── Toggle démarrer / arrêter ─────────────────────────
  function toggle() {
    _tracking ? _stop() : _start();
  }

  async function _start() {
    if (!navigator.geolocation) {
      toast('GPS non disponible dans ce navigateur', 'error');
      return;
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

    // Wake Lock — empêche l'écran de se mettre en veille
    try {
      _wakeLock = await navigator.wakeLock?.request('screen');
    } catch {}

    // Réinit
    _tracking = true; _totalDist = 0; _lastPos = null;
    _pointCount = 0; _startTime = Date.now(); _latlngs = [];
    _polyline?.setLatLngs([]);

    _setUiRunning(true);
    _showSharePanel();

    // Chronomètre
    _durTimer = setInterval(() => {
      const s = Math.floor((Date.now() - _startTime) / 1000);
      document.getElementById('liveDur').innerHTML = fmtDurShort(s) + '<span class="unit"></span>';
    }, 1000);

    // WebSocket live
    if (_activityId) {
      try { _liveWs = Api.connectLive(_activityId); } catch {}
    }

    // Enregistrement GPS haute précision
    _gpsWatchId = navigator.geolocation.watchPosition(
      _onPosition,
      _onGpsError,
      {
        enableHighAccuracy: true,
        maximumAge: 1000,      // accepte des positions jusqu'à 1s d'ancienneté
        timeout: 15000,
      }
    );

    // Flush des points offline en attente
    _flushOffline().catch(() => {});

    // Enregistrement Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }
  }

  async function _stop() {
    _tracking = false;
    if (_gpsWatchId) navigator.geolocation.clearWatch(_gpsWatchId);
    if (_liveWs)     _liveWs.close();
    if (_wakeLock)   { _wakeLock.release(); _wakeLock = null; }
    clearInterval(_durTimer);
    _setUiRunning(false);
    _hideSharePanel();

    if (_activityId) {
      try {
        await Api.finishActivity(_activityId);
        toast(`🏁 Sortie #${_activityId} enregistrée !`);
        // Proposer de voir la sortie
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
    const { latitude: lat, longitude: lon, altitude: alt, speed, accuracy } = pos.coords;
    const spd = speed != null ? speed * 3.6 : null;

    // Précision GPS
    _updateAccuracy(accuracy);

    // Distance cumulée
    if (_lastPos) _totalDist += haversine(_lastPos.lat, _lastPos.lon, lat, lon);
    _lastPos = { lat, lon };
    _pointCount++;

    // ── Mise à jour carte ──
    const latlng = L.latLng(lat, lon);
    _latlngs.push(latlng);
    _polyline.setLatLngs(_latlngs);

    // Marqueur position
    if (!_marker) {
      _marker = L.circleMarker(latlng, {
        radius: 8, color: '#00d4ff', fillColor: '#00d4ff',
        fillOpacity: 0.9, weight: 2,
      }).addTo(_map);
    } else {
      _marker.setLatLng(latlng);
    }

    // Cercle de précision
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

    // Centrer la carte sur la position
    _map.panTo(latlng, { animate: true, duration: 0.5 });

    // ── Métriques ──
    _setMetric('liveSpeed', spd != null ? spd.toFixed(1) : '—', 'km/h');
    _setMetric('liveAlt',   alt != null ? Math.round(alt) : '—', 'm');
    _setMetric('liveDist',  _totalDist.toFixed(2), 'km');
    document.getElementById('livePoints').innerHTML = _pointCount + '<span class="unit">pts</span>';
    document.getElementById('speedFill').style.width = Math.min((spd || 0) / 60 * 100, 100) + '%';

    // ── Envoi backend ──
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
    const btn   = document.getElementById('startBtn');
    const badge = document.getElementById('liveBadge');
    btn.className = on ? 'btn-live stop' : 'btn-live start';
    btn.innerHTML = on ? '<span>⏹</span> Arrêter' : '<span>▶</span> Démarrer';
    badge.style.display = on ? 'flex' : 'none';
  }

  // ── Partage ───────────────────────────────────────────
  function _showSharePanel() {
    const panel = document.getElementById('sharePanel');
    if (!panel || !_activityId) return;
    const api = document.getElementById('apiUrl')?.value || 'http://localhost:8000';
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

  return { toggle, watchFriend, initMap, toggleFullscreen };

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
