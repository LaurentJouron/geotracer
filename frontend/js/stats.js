/**
 * stats.js — Statistiques avancées
 */

const Stats = (() => {

  let _all      = [];   // toutes les sorties
  let _period   = 'all';
  let _filtered = [];

  const LAYOUT = {
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    margin: { t: 8, b: 36, l: 48, r: 8 },
    xaxis: { showgrid: false, color: '#6a8099', tickfont: { family: 'Share Tech Mono', size: 10 } },
    yaxis: { showgrid: true, gridcolor: 'rgba(255,255,255,0.04)', color: '#6a8099', tickfont: { family: 'Share Tech Mono', size: 10 } },
    font: { family: 'Share Tech Mono', color: '#6a8099', size: 10 },
    hovermode: 'x unified',
    hoverlabel: { bgcolor: 'rgba(13,17,23,0.95)', bordercolor: 'rgba(0,212,255,0.3)', font: { family: 'Share Tech Mono', size: 11, color: '#c8d8e8' } },
  };
  const CFG = { responsive: true, displayModeBar: false };

  // ── Chargement ────────────────────────────────────────
  async function load() {
    try {
      _all = (await Api.getActivities()).filter(a => !a.is_live);
    } catch {
      toast('Impossible de charger les sorties', 'error');
      return;
    }
    _render();
  }

  function setPeriod(period, btn) {
    _period = period;
    document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    _render();
  }

  // ── Filtrer par période ───────────────────────────────
  function _filterByPeriod(activities) {
    const now  = new Date();
    const days = { week: 7, month: 30, year: 365, all: Infinity };
    const d    = days[_period] || Infinity;
    if (d === Infinity) return activities;
    const cutoff = new Date(now - d * 86400000);
    return activities.filter(a => new Date(a.started_at) >= cutoff);
  }

  // ── Rendu principal ───────────────────────────────────
  function _render() {
    _filtered = _filterByPeriod(_all);

    _renderKpis();
    _renderDistBar();
    _renderSpeedLine();
    _renderCumDist();
    _renderHeatmap();
    _renderRecords();
  }

  // ── KPIs ──────────────────────────────────────────────
  function _renderKpis() {
    const cur  = _filtered;
    const dist  = cur.reduce((s, a) => s + (a.distance_km      || 0), 0);
    const elev  = cur.reduce((s, a) => s + (a.elevation_gain_m || 0), 0);
    const secs  = cur.reduce((s, a) => s + (a.duration_seconds || 0), 0);

    document.getElementById('skDist').innerHTML  = dist.toFixed(0)  + '<span class="stats-kpi-unit">km</span>';
    document.getElementById('skRides').textContent = cur.length;
    document.getElementById('skElev').innerHTML  = elev.toFixed(0)  + '<span class="stats-kpi-unit">m</span>';
    document.getElementById('skTime').textContent = _fmtHours(secs);

    // Deltas vs période précédente
    if (_period !== 'all') {
      const prev  = _prevPeriod();
      const pDist = prev.reduce((s, a) => s + (a.distance_km || 0), 0);
      const pRides = prev.length;

      _setDelta('skDistDelta',  dist,      pDist);
      _setDelta('skRidesDelta', cur.length, pRides);
    } else {
      ['skDistDelta','skRidesDelta','skElevDelta','skTimeDelta'].forEach(id => {
        document.getElementById(id).textContent = '';
      });
    }
  }

  function _prevPeriod() {
    const days   = { week: 7, month: 30, year: 365 };
    const d      = days[_period] || 30;
    const now    = new Date();
    const end    = new Date(now - d * 86400000);
    const start  = new Date(now - 2 * d * 86400000);
    return _all.filter(a => {
      const t = new Date(a.started_at);
      return t >= start && t < end;
    });
  }

  function _setDelta(id, cur, prev) {
    const el = document.getElementById(id);
    if (!el) return;
    if (prev === 0) { el.textContent = ''; return; }
    const pct  = ((cur - prev) / prev * 100).toFixed(0);
    const sign = cur >= prev ? '▲' : '▼';
    el.textContent  = `${sign} ${Math.abs(pct)}% vs période préc.`;
    el.className    = `stats-kpi-delta ${cur >= prev ? 'up' : 'down'}`;
  }

  function _fmtHours(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h ? `${h}h${String(m).padStart(2,'0')}` : `${m}min`;
  }

  // ── Distance par sortie (barres) ──────────────────────
  function _renderDistBar() {
    const data = _filtered.slice(-20); // max 20 dernières
    if (!data.length) { Plotly.purge('chartDistBar'); return; }

    const x = data.map(a => fmtDateShort(a.started_at));
    const y = data.map(a => +(a.distance_km || 0).toFixed(1));

    Plotly.newPlot('chartDistBar', [{
      x, y, type: 'bar', name: 'Distance',
      marker: { color: y.map(v => v >= 50 ? '#00d4ff' : v >= 30 ? '#0099cc' : '#005580') },
      hovertemplate: '%{y} km<extra></extra>',
    }], {
      ...LAYOUT,
      yaxis: { ...LAYOUT.yaxis, title: { text: 'km', font: { size: 9 } } },
    }, CFG);
  }

  // ── Vitesse moyenne (ligne) ───────────────────────────
  function _renderSpeedLine() {
    const data = _filtered.slice(-20);
    if (!data.length) { Plotly.purge('chartSpeedLine'); return; }

    const x = data.map(a => fmtDateShort(a.started_at));
    const y = data.map(a => +(a.avg_speed_kmh || 0).toFixed(1));
    const avg = y.reduce((s, v) => s + v, 0) / y.length;

    Plotly.newPlot('chartSpeedLine', [
      {
        x, y, type: 'scatter', mode: 'lines+markers', name: 'Vitesse moy.',
        line: { color: '#ff6b00', width: 2, shape: 'spline' },
        marker: { color: '#ff6b00', size: 5 },
        fill: 'tozeroy', fillcolor: 'rgba(255,107,0,0.07)',
        hovertemplate: '%{y} km/h<extra></extra>',
      },
      {
        x, y: x.map(() => +avg.toFixed(1)),
        type: 'scatter', mode: 'lines', name: 'Moyenne',
        line: { color: 'rgba(255,255,255,0.2)', width: 1, dash: 'dot' },
        hovertemplate: 'Moy. %{y} km/h<extra></extra>',
      },
    ], {
      ...LAYOUT,
      yaxis: { ...LAYOUT.yaxis, title: { text: 'km/h', font: { size: 9 } } },
    }, CFG);
  }

  // ── Distance cumulée ──────────────────────────────────
  function _renderCumDist() {
    const data = [..._filtered].sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
    if (!data.length) { Plotly.purge('chartCumDist'); return; }

    let cum = 0;
    const x = data.map(a => fmtDateShort(a.started_at));
    const y = data.map(a => { cum += (a.distance_km || 0); return +cum.toFixed(1); });

    Plotly.newPlot('chartCumDist', [{
      x, y, type: 'scatter', mode: 'lines', name: 'Distance cumulée',
      line: { color: '#00d4ff', width: 3, shape: 'spline' },
      fill: 'tozeroy', fillcolor: 'rgba(0,212,255,0.06)',
      hovertemplate: '%{y} km cumulés<extra></extra>',
    }], {
      ...LAYOUT,
      yaxis: { ...LAYOUT.yaxis, title: { text: 'km', font: { size: 9 } } },
    }, CFG);
  }

  // ── Heatmap 12 mois ───────────────────────────────────
  function _renderHeatmap() {
    const grid   = document.getElementById('heatmapGrid');
    const months = document.getElementById('heatmapMonths');
    if (!grid) return;

    // Construire un map date → distance
    const byDay = {};
    _all.forEach(a => {
      const d = new Date(a.started_at).toISOString().slice(0, 10);
      byDay[d] = (byDay[d] || 0) + (a.distance_km || 0);
    });

    // 53 semaines en arrière
    const today  = new Date();
    const start  = new Date(today);
    start.setDate(start.getDate() - 371); // ~53 semaines

    // Aligner sur le lundi de la semaine de départ
    const dayOfWeek = start.getDay();
    start.setDate(start.getDate() - dayOfWeek);

    const cells     = [];
    const monthLabels = [];
    let lastMonth   = -1;
    let col         = 0;

    const cur = new Date(start);
    while (cur <= today) {
      const iso   = cur.toISOString().slice(0, 10);
      const dist  = byDay[iso] || 0;
      const month = cur.getMonth();

      // Label du mois
      if (month !== lastMonth && cur.getDay() === 0) {
        monthLabels.push({ col, label: cur.toLocaleString('fr-FR', { month: 'short' }) });
        lastMonth = month;
      }

      let lvl = 0;
      if (dist > 0)  lvl = 1;
      if (dist > 20) lvl = 2;
      if (dist > 50) lvl = 3;
      if (dist > 80) lvl = 4;

      cells.push({ iso, dist, lvl, col: Math.floor((cur - start) / 604800000) });
      cur.setDate(cur.getDate() + 1);
      if (cur.getDay() === 0) col++;
    }

    // Rendu mois
    const MONTH_WIDTH = 17; // px par cellule + gap
    months.innerHTML = monthLabels.map(m =>
      `<span style="width:${MONTH_WIDTH}px;display:inline-block;margin-left:${m.col * MONTH_WIDTH}px">${m.label}</span>`
    ).join('');
    months.innerHTML = monthLabels.map((m, i) => {
      const next = monthLabels[i + 1];
      const span = next ? next.col - m.col : 5;
      return `<span style="width:${span * MONTH_WIDTH}px;display:inline-block;text-align:left">${m.label}</span>`;
    }).join('');

    // Rendu cellules
    grid.innerHTML = cells.map(c => `
      <div class="heatmap-cell lvl${c.lvl}" title="${c.iso}${c.dist ? ' — ' + c.dist.toFixed(1) + ' km' : ''}"></div>
    `).join('');
  }

  // ── Records personnels ────────────────────────────────
  function _renderRecords() {
    const container = document.getElementById('recordsGrid');
    if (!container || !_all.length) return;

    const sorted = (fn) => [..._all].sort((a, b) => fn(b) - fn(a))[0];

    const records = [
      {
        medal: '🥇', lbl: 'Plus longue sortie',
        val: (sorted(a => a.distance_km || 0).distance_km || 0).toFixed(1),
        unit: 'km',
        date: sorted(a => a.distance_km || 0).started_at,
        activity: sorted(a => a.distance_km || 0),
      },
      {
        medal: '⚡', lbl: 'Vitesse max',
        val: (sorted(a => a.max_speed_kmh || 0).max_speed_kmh || 0).toFixed(1),
        unit: 'km/h',
        date: sorted(a => a.max_speed_kmh || 0).started_at,
        activity: sorted(a => a.max_speed_kmh || 0),
      },
      {
        medal: '🚀', lbl: 'Meilleure moy.',
        val: (sorted(a => a.avg_speed_kmh || 0).avg_speed_kmh || 0).toFixed(1),
        unit: 'km/h',
        date: sorted(a => a.avg_speed_kmh || 0).started_at,
        activity: sorted(a => a.avg_speed_kmh || 0),
      },
      {
        medal: '⛰️', lbl: 'Max dénivelé +',
        val: (sorted(a => a.elevation_gain_m || 0).elevation_gain_m || 0).toFixed(0),
        unit: 'm',
        date: sorted(a => a.elevation_gain_m || 0).started_at,
        activity: sorted(a => a.elevation_gain_m || 0),
      },
      {
        medal: '⏱', lbl: 'Plus longue durée',
        val: fmtDur(sorted(a => a.duration_seconds || 0).duration_seconds || 0),
        unit: '',
        date: sorted(a => a.duration_seconds || 0).started_at,
        activity: sorted(a => a.duration_seconds || 0),
      },
      {
        medal: '📅', lbl: 'Sorties ce mois',
        val: _all.filter(a => {
          const d = new Date(a.started_at);
          const n = new Date();
          return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
        }).length,
        unit: 'rides',
        date: null,
        activity: null,
      },
    ];

    container.innerHTML = records.map(r => `
      <div class="record-card" ${r.activity ? `onclick="Stats.openActivity(${JSON.stringify(r.activity).replace(/"/g, '&quot;')})"` : ''}>
        <div class="record-medal">${r.medal}</div>
        <div class="record-lbl">${r.lbl}</div>
        <div class="record-val">${r.val}<span class="record-unit">${r.unit}</span></div>
        ${r.date ? `<div class="record-date">${fmtDateShort(r.date)}</div>` : ''}
      </div>
    `).join('');
  }

  function openActivity(activity) {
    sessionStorage.setItem('vt_activity', JSON.stringify(activity));
    window.location.href = 'detail.html';
  }

  return { load, setPeriod, openActivity };

})();
