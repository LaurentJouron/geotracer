/**
 * activities.js — Liste des sorties
 */

const Activities = (() => {

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
      <div class="activity-stat" style="display:flex;align-items:center;gap:8px">
        ${activity.is_live
          ? '<span class="badge live">En cours</span>'
          : '<span class="badge done">Terminée</span>'}
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;color:var(--red);border-color:var(--red)"
          onclick="event.stopPropagation(); Activities.deleteActivity(${activity.id}, '${activity.title.replace(/'/g, "\\'")}')">
          🗑
        </button>
      </div>`;
    row.addEventListener('click', () => {
      sessionStorage.setItem('vt_activity', JSON.stringify(activity));
      window.location.href = 'detail.html';
    });
    return row;
  }

  async function loadList() {
    const list  = document.getElementById('allList');
    const empty = document.getElementById('emptyActivities');
    list.innerHTML = '';

    let activities = [];
    try {
      activities = await Api.getActivities();
    } catch {
      toast('Impossible de charger les sorties', 'error');
    }

    if (!activities.length) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    activities.forEach((a, i) => list.appendChild(_makeRow(a, i + 1)));
  }

  async function deleteActivity(id, title) {
    if (!confirm(`Supprimer "${title}" ?\nCette action est irréversible.`)) return;
    try {
      await Api.deleteActivity(id);
      toast('🗑 Sortie supprimée');
      loadList();
    } catch {
      toast('Erreur lors de la suppression', 'error');
    }
  }

  return { loadList, deleteActivity };

})();
