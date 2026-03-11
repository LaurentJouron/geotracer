/**
 * sports.js — Dashboard multi-sport (données depuis le backend)
 */

const Sports = (() => {

  const ZONE_COLORS = ['#4fc3f7','#66bb6a','#ffee58','#ffa726','#ef5350'];
  const ZONE_NAMES  = ['Z1 — Récup','Z2 — Endurance','Z3 — Tempo','Z4 — Seuil','Z5 — Max'];
  const ZONE_RANGES = ['< 50% FCmax','50–60%','60–70%','70–80%','> 80%'];

  const LAYOUT_BASE = {
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    margin: { t: 4, b: 36, l: 44, r: 8 },
    font: { family: 'Share Tech Mono', color: '#6a8099', size: 10 },
    xaxis: { showgrid: false, color: '#6a8099', tickfont: { family: 'Share Tech Mono', size: 9 } },
    yaxis: { showgrid: true, gridcolor: 'rgba(255,255,255,0.04)', color: '#6a8099',
             tickfont: { family: 'Share Tech Mono', size: 9 } },
    hovermode: 'closest',
    hoverlabel: { bgcolor: 'rgba(13,17,23,0.95)', bordercolor: 'rgba(0,212,255,0.3)',
                  font: { family: 'Share Tech Mono', size: 11 } },
  };
  const CFG = { responsive: true, displayModeBar: false };

  let _filter   = 'all';
  let _allData  = [];   // données brutes depuis le backend (activités terminées)

  // ── Détection du sport depuis le titre / type ─────────
  function _detectSport(activity) {
    const title = (activity.title || '').toLowerCase();
    if (title.includes('natation') || title.includes('piscine') || title.includes('nage')) return 'swimming';
    if (title.includes('running') || title.includes('course') || title.includes('tapis')) return 'running';
    if (title.includes('home-trainer') || title.includes('hometrainer') || title.includes('home trainer')) return 'cycling';
    // Par défaut : vélo (GeoTracer est principalement vélo)
    return 'cycling';
  }

  function _sportColor(sport) {
    return { cycling: '#00d4ff', running: '#00ff88', swimming: '#6478ff' }[sport] || '#aaa';
  }

  function _sportIcon(sport) {
    return { cycling: '🚴', running: '🏃', swimming: '🏊' }[sport] || '🏅';
  }

  function _sportLabel(sport) {
    return { cycling: 'Vélo', running: 'Running', swimming: 'Natation' }[sport] || sport;
  }

  function _fmtDur(s) {
    if (!s) return '—';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
  }

  function _fmtTime(s) {
    if (!s) return '0:00';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
             : `${m}:${String(sec).padStart(2, '0')}`;
  }

  // ── Mapper une activité backend → format sports ───────
  function _mapActivity(a) {
    const sport = _detectSport(a);
    return {
      id:               a.id,
      sport,
      sport_label:      _sportLabel(sport),
      date:             a.started_at,
      distance_km:      a.distance_km      || 0,
      duration_seconds: a.duration_seconds || null,
      avg_speed_kmh:    a.avg_speed_kmh    || null,
      max_speed_kmh:    a.max_speed_kmh    || null,
      elevation_m:      a.elevation_gain_m || null,
      calories:         null, // pas stocké dans le backend actuel
      fc_avg:           null, // sera enrichi si GPX importé
      fc_max:           null,
      // Zones FC non stockées au niveau activité — affichage global désactivé
      z1_seconds: null, z2_seconds: null, z3_seconds: null,
      z4_seconds: null, z5_seconds: null,
      title:      a.title,
    };
  }

  // ── Données filtrées ──────────────────────────────────
  function _filtered() {
    if (_filter === 'all') return _allData;
    return _allData.filter(d => d.sport === _filter);
  }

  // ── Compteurs tabs ────────────────────────────────────
  function _updateCounts() {
    document.getElementById('cnt-all').textContent      = _allData.length;
    document.getElementById('cnt-cycling').textContent  = _allData.filter(d => d.sport === 'cycling').length;
    document.getElementById('cnt-running').textContent  = _allData.filter(d => d.sport === 'running').length;
    document.getElementById('cnt-swimming').textContent = _allData.filter(d => d.sport === 'swimming').length;
  }

  // ── KPIs ──────────────────────────────────────────────
  function _renderKpis(data) {
    const totalDist = data.reduce((s, d) => s + (d.distance_km || 0), 0);
    const totalDur  = data.reduce((s, d) => s + (d.duration_seconds || 0), 0);
    const totalElev = data.reduce((s, d) => s + (d.elevation_m || 0), 0);
    const speedArr  = data.filter(d => d.avg_speed_kmh);
    const avgSpeed  = speedArr.length ? speedArr.reduce((s, d) => s + d.avg_speed_kmh, 0) / speedArr.length : 0;
    const fcArr     = data.filter(d => d.fc_avg);
    const avgFC     = fcArr.length ? fcArr.reduce((s, d) => s + d.fc_avg, 0) / fcArr.length : 0;

    const kpis = [
      { icon: '📏', lbl: 'Distance totale', val: totalDist.toFixed(0),             unit: 'km'    },
      { icon: '🏁', lbl: 'Séances',          val: data.length,                      unit: ''      },
      { icon: '⏱',  lbl: 'Temps total',      val: _fmtDur(totalDur),                unit: ''      },
      { icon: '⬆️', lbl: 'Dénivelé cumulé',  val: totalElev.toFixed(0),             unit: 'm'     },
      { icon: '⚡', lbl: 'Vitesse moy.',      val: avgSpeed.toFixed(1),              unit: 'km/h'  },
    ];
    if (avgFC) kpis.push({ icon: '❤️', lbl: 'FC moy.', val: Math.round(avgFC), unit: 'bpm' });

    document.getElementById('sportKpis').innerHTML = kpis.map(k => `
      <div class="sport-kpi">
        <div class="sport-kpi-icon">${k.icon}</div>
        <div class="sport-kpi-lbl">${k.lbl}</div>
        <div class="sport-kpi-val">${k.val}<span class="sport-kpi-unit">${k.unit}</span></div>
      </div>`).join('');
  }

  // ── Graphique distance par sortie ─────────────────────
  function _renderChartDist(data) {
    const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
    const last40 = sorted.slice(-40);
    const colors  = last40.map(d => _sportColor(d.sport));
    Plotly.newPlot('chartSportDist', [{
      x: last40.map((_, i) => i + 1),
      y: last40.map(d => d.distance_km),
      type: 'bar',
      marker: { color: colors, opacity: 0.8 },
      hovertemplate: '<b>%{customdata.title}</b><br>%{y:.1f} km<extra></extra>',
      customdata: last40.map(d => ({ title: `${_sportIcon(d.sport)} ${d.date?.slice(0, 10) || ''}` })),
    }], {
      ...LAYOUT_BASE,
      yaxis: { ...LAYOUT_BASE.yaxis, title: { text: 'km', font: { size: 9 } } },
    }, CFG);
  }

  // ── Graphique mensuel ─────────────────────────────────
  function _renderChartMonthly(data) {
    const monthly = {};
    data.forEach(d => {
      const key = d.date?.slice(0, 7);
      if (!key) return;
      if (!monthly[key]) monthly[key] = { cycling: 0, running: 0, swimming: 0 };
      monthly[key][d.sport] = (monthly[key][d.sport] || 0) + (d.distance_km || 0);
    });
    const months = Object.keys(monthly).sort();
    const traces = ['cycling', 'running', 'swimming'].map(sport => ({
      x: months,
      y: months.map(m => +((monthly[m][sport] || 0).toFixed(1))),
      type: 'bar',
      name: _sportLabel(sport),
      marker: { color: _sportColor(sport), opacity: 0.85 },
      hovertemplate: '%{y:.1f} km<extra></extra>',
    }));
    Plotly.newPlot('chartSportMonthly', traces, {
      ...LAYOUT_BASE, barmode: 'stack',
      yaxis: { ...LAYOUT_BASE.yaxis, title: { text: 'km', font: { size: 9 } } },
      legend: { font: { family: 'Share Tech Mono', size: 9, color: '#6a8099' }, orientation: 'h', y: -0.25 },
    }, CFG);
  }

  // ── Zones FC (cumulées si disponibles) ───────────────
  function _renderHRZones(data) {
    const zones = [0, 0, 0, 0, 0];
    data.forEach(d => {
      zones[0] += d.z1_seconds || 0;
      zones[1] += d.z2_seconds || 0;
      zones[2] += d.z3_seconds || 0;
      zones[3] += d.z4_seconds || 0;
      zones[4] += d.z5_seconds || 0;
    });
    const total = zones.reduce((a, b) => a + b, 0);

    const wrap = document.getElementById('hrZonesWrap');
    if (!total) {
      // Pas encore de données FC — afficher un message
      wrap.innerHTML = `
        <div class="hr-zones-title">❤️ Zones de fréquence cardiaque</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);padding:12px 0">
          Aucune donnée FC disponible — importe des fichiers GPX Garmin avec capteur cardio pour voir tes zones.
        </div>`;
      return;
    }

    document.getElementById('hrZonesBars').innerHTML = zones.map((z, i) => {
      const pct = (z / total * 100).toFixed(1);
      return `
        <div class="hr-zone-row">
          <div class="hr-zone-label">${ZONE_NAMES[i].split('—')[0].trim()}</div>
          <div class="hr-zone-bar-wrap">
            <div class="hr-zone-bar" style="width:${pct}%;background:${ZONE_COLORS[i]}"></div>
          </div>
          <div class="hr-zone-time">${_fmtTime(z)}</div>
          <div class="hr-zone-pct" style="color:${ZONE_COLORS[i]}">${pct}%</div>
        </div>`;
    }).join('');

    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;';
    legend.innerHTML = ZONE_NAMES.map((n, i) => `
      <div style="font-family:var(--font-mono);font-size:9px;color:${ZONE_COLORS[i]};display:flex;align-items:center;gap:4px">
        <div style="width:8px;height:8px;border-radius:2px;background:${ZONE_COLORS[i]}"></div>
        ${n} <span style="color:var(--text3)">${ZONE_RANGES[i]}</span>
      </div>`).join('');
    document.getElementById('hrZonesBars').appendChild(legend);
  }

  // ── Liste des séances ─────────────────────────────────
  function _renderList(data) {
    const sorted = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));
    document.getElementById('sessionsTitle').textContent =
      `${sorted.length} séance${sorted.length > 1 ? 's' : ''} — ${
        _filter === 'all' ? 'tous sports' : _sportLabel(_filter)
      }`;

    if (!sorted.length) {
      document.getElementById('sessionsList').innerHTML = `
        <div style="text-align:center;padding:40px;font-family:var(--font-mono);
          font-size:12px;color:var(--text3)">
          Aucune sortie trouvée.<br>
          <a href="import.html" style="color:var(--accent)">Importer un GPX</a> ou
          <a href="tracker.html" style="color:var(--accent)">démarrer le tracker</a>.
        </div>`;
      return;
    }

    document.getElementById('sessionsList').innerHTML = sorted.map(d => {
      const badge = `<span class="badge-sport badge-${d.sport}">${_sportIcon(d.sport)} ${d.sport_label}</span>`;
      const date  = d.date?.slice(0, 10) || '—';
      return `
        <div class="session-row" onclick="Sports.openActivity(${d.id})">
          <div class="session-num">#${d.id}</div>
          <div class="session-info">
            <div class="title">${d.title || d.sport_label}</div>
            <div class="date">${date} ${badge}</div>
          </div>
          <div class="session-stat">${(d.distance_km || 0).toFixed(1)}<span class="lbl">km</span></div>
          <div class="session-stat">${_fmtDur(d.duration_seconds)}<span class="lbl">durée</span></div>
          <div class="session-stat">${d.avg_speed_kmh?.toFixed(1) || '—'}<span class="lbl">km/h</span></div>
          <div class="session-stat">${d.elevation_m?.toFixed(0) || '—'}<span class="lbl">D+m</span></div>
        </div>`;
    }).join('');
  }

  // ── Ouvrir le détail d'une activité ──────────────────
  function openActivity(id) {
    const activity = _allData.find(d => d.id === id);
    if (!activity) return;
    // Reconstruire l'objet au format attendu par detail.js
    const raw = {
      id:               activity.id,
      title:            activity.title,
      started_at:       activity.date,
      distance_km:      activity.distance_km,
      duration_seconds: activity.duration_seconds,
      avg_speed_kmh:    activity.avg_speed_kmh,
      max_speed_kmh:    activity.max_speed_kmh,
      elevation_gain_m: activity.elevation_m,
      is_live:          0,
    };
    sessionStorage.setItem('vt_activity', JSON.stringify(raw));
    window.location.href = 'detail.html';
  }

  // ── Render tout ───────────────────────────────────────
  function _render() {
    const data = _filtered();
    _renderKpis(data);
    _renderChartDist(data);
    _renderChartMonthly(data);
    _renderHRZones(data);
    _renderList(data);
  }

  // ── Chargement depuis le backend ──────────────────────
  async function load() {
    // Loader
    document.getElementById('sportKpis').innerHTML = `
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);
        grid-column:1/-1;padding:12px">Chargement des sorties…</div>`;

    try {
      const activities = await Api.getActivities();
      // On ne garde que les sorties terminées
      _allData = activities
        .filter(a => !a.is_live)
        .map(_mapActivity);
    } catch (e) {
      toast('Impossible de charger les sorties', 'error');
      _allData = [];
    }

    _updateCounts();
    _render();
  }

  // ── Changement de filtre ──────────────────────────────
  function setFilter(sport, el) {
    _filter = sport;
    document.querySelectorAll('.sport-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    _render();
  }

  return { load, setFilter, openActivity };

})();
