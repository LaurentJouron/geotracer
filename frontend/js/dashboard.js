/**
 * dashboard.js — KPI + sorties récentes
 */

const Dashboard = (() => {

  function _makeRow(activity, num) {
    const row = document.createElement('div');
    row.className = 'activity-row';
    row.innerHTML = `
      <div class="activity-num">#${num}</div>
      <div class="activity-info">
        <div class="title">${activity.title}</div>
        <div class="date">${fmtDateShort(activity.started_at)}</div>
      </div>
      <div class="activity-stat hide-mobile">
        <span class="val">${(activity.distance_km || 0).toFixed(1)}</span>
        <span class="lbl">km</span>
      </div>
      <div class="activity-stat hide-mobile">
        <span class="val">${fmtDur(activity.duration_seconds)}</span>
        <span class="lbl">durée</span>
      </div>
      <div class="activity-stat hide-mobile">
        <span class="val">${(activity.avg_speed_kmh || 0).toFixed(1)}</span>
        <span class="lbl">moy km/h</span>
      </div>
      <div class="activity-stat hide-mobile">
        <span class="val">+${(activity.elevation_gain_m || 0).toFixed(0)}</span>
        <span class="lbl">D+ m</span>
      </div>
      <div class="activity-stat">
        ${activity.is_live
          ? '<span class="badge live">En cours</span>'
          : '<span class="badge done">Terminée</span>'}
      </div>`;
    row.addEventListener('click', () => {
      sessionStorage.setItem('vt_activity', JSON.stringify(activity));
      window.location.href = 'detail.html';
    });
    return row;
  }

  async function load() {
    let activities = [];
    try {
      activities = await Api.getActivities();
    } catch {
      toast('Impossible de charger les sorties', 'error');
    }

    const done = activities.filter(a => !a.is_live);
    const totalDist = done.reduce((s, a) => s + (a.distance_km || 0), 0);
    const avgSpeed  = done.length ? done.reduce((s, a) => s + (a.avg_speed_kmh || 0), 0) / done.length : 0;
    const totalElev = done.reduce((s, a) => s + (a.elevation_gain_m || 0), 0);

    document.getElementById('kpiDist').innerHTML  = totalDist.toFixed(0)  + '<span class="kpi-unit">km</span>';
    document.getElementById('kpiRides').textContent = done.length;
    document.getElementById('kpiSpeed').innerHTML = avgSpeed.toFixed(1)   + '<span class="kpi-unit">km/h</span>';
    document.getElementById('kpiElev').innerHTML  = totalElev.toFixed(0)  + '<span class="kpi-unit">m</span>';

    // Salutation personnalisée dans le label, pas dans le titre
    const label = document.getElementById('heroLabel');
    if (label) label.textContent = `Bonjour ${Auth.getUsername() || ''}`;

    // Sorties récentes
    const list = document.getElementById('recentList');
    list.innerHTML = '';
    activities.slice(0, 5).forEach((a, i) => list.appendChild(_makeRow(a, i + 1)));
  }

  return { load };

})();
