/**
 * detail.js — Détail d'une sortie avec carte Leaflet
 */

const Detail = (() => {

  let _map      = null;
  let _activity = null;

  // ── Icône et label par type de sport ─────────────────
  const SPORT_META = {
    'home-trainer': { icon: '🚴', label: 'Home-Trainer', color: '#00d4ff', hasGps: false },
    'hometrainer':  { icon: '🚴', label: 'Home-Trainer', color: '#00d4ff', hasGps: false },
    'tapis':        { icon: '🏃', label: 'Tapis de course', color: '#00ff88', hasGps: false },
    'piscine':      { icon: '🏊', label: 'Natation piscine', color: '#6478ff', hasGps: false },
    'natation':     { icon: '🏊', label: 'Natation', color: '#6478ff', hasGps: false },
    'running':      { icon: '🏃', label: 'Running', color: '#00ff88', hasGps: true  },
    'velo':         { icon: '🚴', label: 'Vélo', color: '#00d4ff', hasGps: true  },
    'cycling':      { icon: '🚴', label: 'Vélo', color: '#00d4ff', hasGps: true  },
  };

  function _getSportMeta(activity) {
    const title = (activity.title || '').toLowerCase();
    const type  = (activity.sport_type || activity.type || '').toLowerCase();
    for (const [key, meta] of Object.entries(SPORT_META)) {
      if (title.includes(key) || type.includes(key)) return meta;
    }
    return null; // GPS par défaut
  }

  // ── Chargement principal ──────────────────────────────
  async function load() {
    const raw = sessionStorage.getItem('vt_activity');
    if (!raw) { window.location.href = 'activities.html'; return; }
    _activity = JSON.parse(raw);

    // En-tête
    document.getElementById('dTitle').textContent = _activity.title;
    document.getElementById('dDate').textContent  = fmtDateLong(_activity.started_at);
    document.getElementById('dExport').href       = Api.exportGpxUrl(_activity.id);

    // Bande de stats (sans FC d'abord)
    _renderStats(_activity, null);

    // Carte + graphiques en parallèle
    const [points, stats] = await Promise.all([
      Api.getActivityPoints(_activity.id).catch(() => []),
      Api.getActivityStats(_activity.id).catch(() => null),
    ]);

    // Mettre à jour les stats avec la FC
    _renderStats(_activity, points);

    const hasGps = points && points.length > 2;
    const hasRich = points && points.some(p => p.heart_rate || p.cadence || p.power);

    // Afficher le bouton "Enrichir GPX" si sortie terminée et pas de données riches
    if (!_activity.is_live && (!hasGps || !hasRich)) {
      document.getElementById('dEnrichBtn').style.display = 'inline-flex';
    }

    if (hasGps) {
      _initMap(points);
      _renderHRZones(points);
      Charts.drawFromPoints(_activity, points, stats);
    } else {
      _renderNoGps();
      _renderHRZones(points || []);
      Charts.drawFromPoints(_activity, points, stats);
    }
  }

  // ── Vue sans GPS ──────────────────────────────────────
  function _renderNoGps() {
    const meta   = _getSportMeta(_activity);
    const icon   = meta?.icon  || '🏅';
    const label  = meta?.label || 'Entraînement';
    const color  = meta?.color || 'var(--accent)';

    // Remplacer le bloc carte
    const mapWrap = document.querySelector('.detail-map-wrap');
    if (mapWrap) {
      mapWrap.innerHTML = `
        <div style="
          background:var(--bg2);border:1px solid var(--border);border-radius:12px;
          padding:48px 24px;text-align:center;
        ">
          <div style="font-size:56px;margin-bottom:12px">${icon}</div>
          <div style="font-family:var(--font-head);font-size:22px;font-weight:800;
            color:${color};letter-spacing:0.08em;margin-bottom:8px">
            ${label}
          </div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">
            Entraînement en intérieur — pas de tracé GPS disponible
          </div>

          <!-- Résumé visuel -->
          <div style="display:flex;justify-content:center;gap:32px;margin-top:32px;flex-wrap:wrap">
            ${_activity.distance_km ? `
            <div style="text-align:center">
              <div style="font-family:var(--font-head);font-size:32px;font-weight:800;color:${color}">
                ${(_activity.distance_km).toFixed(1)}<span style="font-size:14px;color:var(--text2);margin-left:4px">km</span>
              </div>
              <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.1em">Distance</div>
            </div>` : ''}
            ${_activity.duration_seconds ? `
            <div style="text-align:center">
              <div style="font-family:var(--font-head);font-size:32px;font-weight:800;color:var(--text)">
                ${fmtDur(_activity.duration_seconds)}
              </div>
              <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.1em">Durée</div>
            </div>` : ''}
            ${_activity.avg_speed_kmh ? `
            <div style="text-align:center">
              <div style="font-family:var(--font-head);font-size:32px;font-weight:800;color:var(--text)">
                ${(_activity.avg_speed_kmh).toFixed(1)}<span style="font-size:14px;color:var(--text2);margin-left:4px">km/h</span>
              </div>
              <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.1em">Vitesse moy.</div>
            </div>` : ''}
            ${_activity.elevation_gain_m ? `
            <div style="text-align:center">
              <div style="font-family:var(--font-head);font-size:32px;font-weight:800;color:var(--green)">
                +${(_activity.elevation_gain_m).toFixed(0)}<span style="font-size:14px;color:var(--text2);margin-left:4px">m</span>
              </div>
              <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.1em">Dénivelé</div>
            </div>` : ''}
          </div>

          <!-- Barre de progression durée -->
          ${_renderDurationBar(color)}
        </div>`;
    }
  }

  function _renderDurationBar(color) {
    if (!_activity.duration_seconds) return '';
    const dur  = _activity.duration_seconds;
    const h    = Math.floor(dur / 3600);
    const m    = Math.floor((dur % 3600) / 60);
    // Intensité basée sur durée (max visuel = 3h)
    const pct  = Math.min(100, (dur / 10800) * 100).toFixed(0);
    return `
      <div style="margin-top:28px;max-width:400px;margin-left:auto;margin-right:auto">
        <div style="display:flex;justify-content:space-between;
          font-family:var(--font-mono);font-size:9px;color:var(--text3);margin-bottom:6px">
          <span>Durée</span><span>${h}h${String(m).padStart(2,'0')}</span>
        </div>
        <div style="background:var(--bg3);border-radius:6px;height:8px;overflow:hidden">
          <div style="width:${pct}%;height:100%;border-radius:6px;
            background:linear-gradient(90deg,${color},${color}88);
            transition:width 0.8s ease"></div>
        </div>
      </div>`;
  }

  // ── Bande de stats ────────────────────────────────────
  function _renderStats(a, points) {
    const hrs   = points ? points.filter(p => p.heart_rate).map(p => p.heart_rate) : [];
    const avgHR = hrs.length ? Math.round(hrs.reduce((s, v) => s + v, 0) / hrs.length) : null;
    const maxHR = hrs.length ? Math.max(...hrs) : null;

    const cells = [
      { lbl: 'Distance', val: (a.distance_km      || 0).toFixed(2), unit: 'km'   },
      { lbl: 'Durée',    val: fmtDur(a.duration_seconds),            unit: ''     },
      { lbl: 'Moy.',     val: (a.avg_speed_kmh    || 0).toFixed(1), unit: 'km/h' },
      { lbl: 'Max',      val: (a.max_speed_kmh    || 0).toFixed(1), unit: 'km/h' },
      { lbl: 'D+',       val: (a.elevation_gain_m || 0).toFixed(0), unit: 'm'    },
      { lbl: 'D−',       val: (a.elevation_loss_m || 0).toFixed(0), unit: 'm'    },
    ];

    if (avgHR) cells.push({ lbl: 'FC moy.', val: avgHR, unit: 'bpm', color: '#ff3355' });
    if (maxHR) cells.push({ lbl: 'FC max',  val: maxHR, unit: 'bpm', color: '#ff3355' });

    document.getElementById('dStats').innerHTML = cells.map(c => `
      <div class="stat-cell">
        <div class="stat-cell-lbl">${c.lbl}</div>
        <div class="stat-cell-val" style="${c.color ? `color:${c.color}` : ''}">${c.val}<span class="stat-cell-unit">${c.unit}</span></div>
      </div>`).join('');
  }

  // ── Zones FC ─────────────────────────────────────────
  function _renderHRZones(points) {
    const FC_MAX     = 180;
    const thresholds = [0, 0.50, 0.60, 0.70, 0.80, 1.05].map(p => Math.round(p * FC_MAX));
    const zoneColors = ['#4fc3f7','#66bb6a','#ffee58','#ffa726','#ef5350'];
    const zoneNames  = ['Z1 Récup','Z2 Endurance','Z3 Tempo','Z4 Seuil','Z5 Max'];

    const hrPoints = (points || []).filter(p => p.heart_rate && p.ts);
    if (hrPoints.length < 5) return;

    const zoneSecs = [0,0,0,0,0];
    for (let i = 1; i < hrPoints.length; i++) {
      const dt   = (new Date(hrPoints[i].ts) - new Date(hrPoints[i-1].ts)) / 1000;
      const hr   = hrPoints[i].heart_rate;
      const zone = thresholds.findIndex((t, j) => hr >= t && hr < thresholds[j+1]);
      if (zone >= 0 && zone < 5 && dt > 0 && dt < 120) zoneSecs[zone] += dt;
    }

    const total = zoneSecs.reduce((a,b) => a+b, 0) || 1;
    const fmtT  = s => {
      const m = Math.floor(s/60), sec = Math.round(s%60);
      return m ? `${m}:${String(sec).padStart(2,'0')}` : `${sec}s`;
    };

    const existing = document.getElementById('hrZonesDetail');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.id    = 'hrZonesDetail';
    wrap.style.cssText = `
      background:var(--bg2);border:1px solid var(--border);border-radius:10px;
      padding:18px 20px;margin-bottom:16px;`;
    wrap.innerHTML = `
      <div style="font-family:var(--font-head);font-size:13px;font-weight:700;
        color:var(--text2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:14px">
        ❤️ Zones de fréquence cardiaque
      </div>
      ${zoneSecs.map((z, i) => {
        const pct = (z/total*100).toFixed(1);
        return `
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:9px">
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--text2);width:80px;flex-shrink:0">
              ${zoneNames[i]}<br>
              <span style="color:var(--text3);font-size:9px">${thresholds[i]}–${thresholds[i+1]} bpm</span>
            </div>
            <div style="flex:1;background:var(--bg3);border-radius:4px;height:10px;overflow:hidden">
              <div style="width:${pct}%;height:100%;border-radius:4px;background:${zoneColors[i]};transition:width 0.6s"></div>
            </div>
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);width:44px;text-align:right">${fmtT(z)}</div>
            <div style="font-family:var(--font-mono);font-size:10px;width:36px;text-align:right;color:${zoneColors[i]}">${pct}%</div>
          </div>`;
      }).join('')}`;

    const chartsGrid = document.querySelector('.detail-grid');
    if (chartsGrid) chartsGrid.parentNode.insertBefore(wrap, chartsGrid);
  }

  // ── Carte Leaflet ─────────────────────────────────────
  function _initMap(points) {
    const loader = document.getElementById('mapLoader');

    if (!points || points.length === 0) {
      if (loader) loader.innerHTML = `
        <div style="font-size:32px">📍</div>
        <span>Aucun point GPS disponible</span>`;
      return;
    }

    if (loader) loader.remove();

    _map = L.map('detailMap', { zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(_map);

    const latlngs  = points.map(p => [p.lat, p.lon]);
    const polyline = L.polyline(latlngs, { color: '#00d4ff', weight: 4, opacity: 0.9 }).addTo(_map);
    _map.fitBounds(polyline.getBounds(), { padding: [32, 32] });

    const startIcon = L.divIcon({
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#00ff88;border:2px solid white;box-shadow:0 0 8px rgba(0,255,136,0.6)"></div>',
      className: '', iconAnchor: [7, 7],
    });
    L.marker([points[0].lat, points[0].lon], { icon: startIcon })
      .addTo(_map).bindPopup(`<b>Départ</b><br>${fmtDateShort(_activity.started_at)}`);

    const endPt   = points[points.length - 1];
    const endIcon = L.divIcon({
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#ff3355;border:2px solid white;box-shadow:0 0 8px rgba(255,51,85,0.6)"></div>',
      className: '', iconAnchor: [7, 7],
    });
    L.marker([endPt.lat, endPt.lon], { icon: endIcon })
      .addTo(_map).bindPopup(`<b>Arrivée</b><br>${(_activity.distance_km || 0).toFixed(1)} km`);

    polyline.on('mousemove', e => {
      const idx   = _closestPointIndex(points, e.latlng);
      const pt    = points[idx];
      const speed = pt.speed_kmh  ? `${pt.speed_kmh.toFixed(1)} km/h` : '—';
      const alt   = pt.alt        ? `${Math.round(pt.alt)} m` : '—';
      const hr    = pt.heart_rate ? `❤️ ${pt.heart_rate} bpm<br>` : '';
      polyline.bindPopup(`<b>⚡ ${speed}</b><br>⛰ ${alt}<br>${hr}`,
        { closeButton: false, offset: [0, -6] }).openPopup(e.latlng);
    });
    polyline.on('mouseout', () => polyline.closePopup());

    document.getElementById('mapLegend').style.display = 'flex';
  }

  function _closestPointIndex(points, latlng) {
    let minDist = Infinity, idx = 0;
    points.forEach((p, i) => {
      const d = Math.hypot(p.lat - latlng.lat, p.lon - latlng.lng);
      if (d < minDist) { minDist = d; idx = i; }
    });
    return idx;
  }

  function toggleFullscreen() {
    const wrap = document.querySelector('.detail-map-wrap');
    if (!document.fullscreenElement) {
      wrap.requestFullscreen?.() || wrap.webkitRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.();
    }
    setTimeout(() => _map?.invalidateSize(), 300);
  }

  // ── Enrichir une sortie avec un GPX ──────────────────
  function promptEnrichGpx() {
    document.getElementById('dGpxInput').click();
  }

  async function enrichWithGpx(file) {
    if (!file || !_activity) return;
    const btn = document.getElementById('dEnrichBtn');
    btn.textContent = '⏳ Import…';
    btn.disabled = true;
    try {
      const updated = await Api.enrichActivityGpx(_activity.id, file);
      // Mettre à jour l'activité en session
      _activity = { ..._activity, ...updated };
      sessionStorage.setItem('vt_activity', JSON.stringify(_activity));
      toast('✅ Sortie enrichie avec le GPX');
      // Recharger la page pour afficher les nouvelles données
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast('Erreur lors de l\'import GPX', 'error');
      btn.textContent = '⬆ Enrichir GPX';
      btn.disabled = false;
    }
  }

  return { load, toggleFullscreen, promptEnrichGpx, enrichWithGpx };

})();
