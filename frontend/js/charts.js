/**
 * charts.js — Graphiques Plotly vitesse + altitude + fréquence cardiaque
 */

const Charts = (() => {

  const LAYOUT = {
    paper_bgcolor: 'transparent',
    plot_bgcolor:  'transparent',
    margin: { t: 4, b: 36, l: 48, r: 8 },
    xaxis: {
      showgrid: false, color: '#6a8099',
      tickfont: { family: 'Share Tech Mono', size: 10 },
    },
    yaxis: {
      showgrid: true, gridcolor: 'rgba(255,255,255,0.04)',
      color: '#6a8099',
      tickfont: { family: 'Share Tech Mono', size: 10 },
    },
    font:    { family: 'Share Tech Mono', color: '#6a8099', size: 10 },
    hovermode: 'x unified',
    hoverlabel: {
      bgcolor: 'rgba(13,17,23,0.95)',
      bordercolor: 'rgba(0,212,255,0.3)',
      font: { family: 'Share Tech Mono', size: 11, color: '#c8d8e8' },
    },
  };

  const CFG = { responsive: true, displayModeBar: false };

  // ── API publique ──────────────────────────────────────

  function drawFromPoints(activity, points, stats = null) {
    if (points && points.length > 2) {
      _fromRealPoints(points);
    } else if (stats?.speed_series?.length) {
      _fromSeries(stats);
    } else {
      _simulated(activity);
    }
  }

  function draw(activity, stats = null) {
    drawFromPoints(activity, null, stats);
  }

  // ── Depuis les vrais points GPS ───────────────────────
  function _fromRealPoints(points) {
    // Distance cumulée (axe X)
    const distances = [0];
    let cumDist = 0;
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1], p2 = points[i];
      if (p1.lat && p1.lon && p2.lat && p2.lon) {
        cumDist += _haversine(p1.lat, p1.lon, p2.lat, p2.lon);
      }
      distances.push(+cumDist.toFixed(3));
    }

    const speeds = points.map(p => p.speed_kmh  != null ? +p.speed_kmh.toFixed(1)  : null);
    const alts   = points.map(p => p.alt         != null ? +p.alt.toFixed(0)        : null);
    const hrs    = points.map(p => p.heart_rate  != null ? p.heart_rate             : null);

    _plotSpeed(distances, speeds);
    _plotAlt(distances, alts);
    _plotHR(distances, hrs);
  }

  // ── Depuis les séries backend ─────────────────────────
  function _fromSeries(stats) {
    const xs = stats.distance_series?.map(p => p.value) ??
               stats.speed_series.map((_, i) => i);
    _plotSpeed(xs, stats.speed_series.map(p => p.value));
    _plotAlt(xs,   stats.elevation_series.map(p => p.value));
    _plotHR(xs, null); // pas de FC dans les séries
  }

  // ── Données simulées (fallback) ───────────────────────
  function _simulated(a) {
    const n  = 120;
    const xs = Array.from({ length: n }, (_, i) => +(i / n * (a.distance_km || 20)).toFixed(2));
    const speeds = xs.map((_, i) =>
      Math.max(5, (a.avg_speed_kmh || 25) + 8 * Math.sin(i / n * Math.PI * 4) + (Math.random() - .5) * 4)
    );
    const alts = xs.map((_, i) =>
      80 + (a.elevation_gain_m || 200) / 3 * Math.sin(i / n * Math.PI * 3) + (Math.random() - .5) * 6
    );
    _plotSpeed(xs, speeds);
    _plotAlt(xs, alts);
    _plotHR(xs, null);
  }

  // ── Rendus Plotly ─────────────────────────────────────
  function _plotSpeed(x, y) {
    if (!document.getElementById('chartSpeed')) return;
    Plotly.newPlot('chartSpeed', [{
      x, y,
      type: 'scatter', mode: 'lines', fill: 'tozeroy',
      name: 'Vitesse',
      line:      { color: '#00d4ff', width: 2, shape: 'spline' },
      fillcolor: 'rgba(0,212,255,0.07)',
      hovertemplate: '%{y:.1f} km/h<extra></extra>',
      connectgaps: true,
    }], {
      ...LAYOUT,
      yaxis: { ...LAYOUT.yaxis, title: { text: 'km/h', font: { size: 9 } } },
      xaxis: { ...LAYOUT.xaxis, title: { text: 'Distance (km)', font: { size: 9 } } },
    }, CFG);
  }

  function _plotAlt(x, y) {
    if (!document.getElementById('chartAlt')) return;
    Plotly.newPlot('chartAlt', [{
      x, y,
      type: 'scatter', mode: 'lines', fill: 'tozeroy',
      name: 'Altitude',
      line:      { color: '#ff6b00', width: 2, shape: 'spline' },
      fillcolor: 'rgba(255,107,0,0.07)',
      hovertemplate: '%{y:.0f} m<extra></extra>',
      connectgaps: true,
    }], {
      ...LAYOUT,
      yaxis: { ...LAYOUT.yaxis, title: { text: 'm', font: { size: 9 } } },
      xaxis: { ...LAYOUT.xaxis, title: { text: 'Distance (km)', font: { size: 9 } } },
    }, CFG);
  }

  function _plotHR(x, y) {
    const el = document.getElementById('chartHR');
    if (!el) return;

    // Masquer le bloc si pas de données FC
    const hasData = y && y.some(v => v != null);
    const wrapper = el.closest('.chart-card');
    if (!hasData) {
      if (wrapper) wrapper.style.display = 'none';
      return;
    }
    if (wrapper) wrapper.style.display = '';

    // Zones FC colorées
    const maxHR = Math.max(...y.filter(v => v != null));
    const shapes = [
      { y0: 0,              y1: maxHR * 0.60, color: 'rgba(100,200,255,0.04)' }, // repos
      { y0: maxHR * 0.60,   y1: maxHR * 0.70, color: 'rgba(100,255,150,0.04)' }, // zone 1
      { y0: maxHR * 0.70,   y1: maxHR * 0.80, color: 'rgba(255,220,50,0.04)'  }, // zone 2
      { y0: maxHR * 0.80,   y1: maxHR * 0.90, color: 'rgba(255,140,0,0.04)'   }, // zone 3
      { y0: maxHR * 0.90,   y1: maxHR * 1.05, color: 'rgba(255,50,80,0.04)'   }, // zone 4
    ].map(z => ({
      type: 'rect', xref: 'paper', yref: 'y',
      x0: 0, x1: 1, y0: z.y0, y1: z.y1,
      fillcolor: z.color, line: { width: 0 },
    }));

    Plotly.newPlot('chartHR', [{
      x, y,
      type: 'scatter', mode: 'lines',
      name: 'FC',
      line:      { color: '#ff3355', width: 2, shape: 'spline' },
      fill: 'tozeroy',
      fillcolor: 'rgba(255,51,85,0.06)',
      hovertemplate: '%{y} bpm<extra></extra>',
      connectgaps: true,
    }], {
      ...LAYOUT,
      shapes,
      yaxis: { ...LAYOUT.yaxis, title: { text: 'bpm', font: { size: 9 } } },
      xaxis: { ...LAYOUT.xaxis, title: { text: 'Distance (km)', font: { size: 9 } } },
    }, CFG);
  }

  // ── Haversine locale ──────────────────────────────────
  function _haversine(lat1, lon1, lat2, lon2) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r;
    const dLon = (lon2 - lon1) * r;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  return { draw, drawFromPoints };

})();
