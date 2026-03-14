/**
 * api.js — Appels backend FastAPI avec JWT automatique
 */

const Api = (() => {

  function baseUrl() {
    // Passe toujours par nginx (/api/) — pas de CORS
    return '/api';
  }

  async function request(path, options = {}) {
    const res = await fetch(baseUrl() + path, {
      headers: {
        'Content-Type': 'application/json',
        ...Auth.authHeaders(),
        ...(options.headers || {}),
      },
      ...options,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${path}`);
    return res.json();
  }

  // ── Users ────────────────────────────────────────────
  async function getActivities(userId) {
    const id = userId || Auth.getUserId() || 1;
    return request(`/users/${id}/activities`);
  }

  // ── Activities ───────────────────────────────────────
  async function createActivity(title) {
    return request('/activities/', {
      method: 'POST',
      body: JSON.stringify({ user_id: Auth.getUserId(), title }),
    });
  }

  async function addPoint(activityId, point) {
    return request(`/activities/${activityId}/points`, {
      method: 'POST',
      body: JSON.stringify(point),
    });
  }

  async function finishActivity(activityId) {
    return request(`/activities/${activityId}/finish`, { method: 'POST' });
  }

  async function getActivityStats(activityId) {
    return request(`/activities/${activityId}/stats`);
  }

  async function getActivityPoints(activityId) {
    return request(`/activities/${activityId}/points`);
  }

  function mapUrl(activityId) {
    return `${baseUrl()}/activities/${activityId}/map`;
  }

  function exportGpxUrl(activityId) {
    return `${baseUrl()}/activities/${activityId}/export/gpx`;
  }

  // ── Import GPX ───────────────────────────────────────
  async function importGpx(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(
      `${baseUrl()}/activities/import/gpx?user_id=${Auth.getUserId()}`,
      { method: 'POST', headers: { ...Auth.authHeaders() }, body: fd }
    );
    if (!res.ok) throw new Error('Import GPX échoué');
    return res.json();
  }

  async function deleteActivity(activityId) {
    return request(`/activities/${activityId}`, { method: 'DELETE' });
  }

  async function enrichActivityGpx(activityId, file) {
    const token = localStorage.getItem('vt_token');
    const form  = new FormData();
    form.append('file', file);
    const res = await fetch(`${baseUrl()}/activities/${activityId}/gpx`, {
      method:  'PATCH',
      headers: { 'Authorization': `Bearer ${token}` },
      body:    form,
    });
    if (!res.ok) throw new Error('Enrichissement GPX échoué');
    return res.json();
  }

  async function getMe() {
    return request('/auth/me');
  }

  // ── WebSockets ───────────────────────────────────────
  function _wsBase() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  function connectLive(activityId) {
    return new WebSocket(`${_wsBase()}/tracking/live/${activityId}`);
  }

  function connectWatch(activityId) {
    return new WebSocket(`${_wsBase()}/tracking/watch/${activityId}`);
  }

  // ── Partage ───────────────────────────────────────────
  async function createShare(data) {
    return request('/shares/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
  }

  async function getShares(userId) {
    return request(`/shares/user/${userId}`);
  }

  async function resolveShare(token) {
    return request(`/shares/${token}`);
  }

  async function revokeShare(token) {
    return request(`/shares/${token}`, { method: 'DELETE' });
  }

  // ── Encouragements ───────────────────────────────────
  // Correction 422 : Utilisation de l'objet data direct pour correspondre au Pydantic
  async function sendCheer(activityId, data) {
    return request(`/activities/${activityId}/cheers`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async function getCheers(activityId) {
    return request(`/activities/${activityId}/cheers`);
  }

  async function updateCheer(cheerId, message) {
      return request(`/activities/cheers/${cheerId}`, {
        method: 'PATCH',
        body: JSON.stringify({ message }),
      });
    }
  
  async function deleteCheer(cheerId) {
    return request(`/activities/cheers/${cheerId}`, { method: 'DELETE' });
  }

  // Modifie sendCheer pour accepter le parent_id
  async function sendCheer(activityId, data) {
    return request(`/activities/${activityId}/cheers`, {
      method: 'POST',
      body: JSON.stringify(data), // data peut contenir {author_name, message, parent_id}
    });
  }

  // Exposition des méthodes
  return { 
    sendCheer, 
    getCheers,
    getActivities, 
    createActivity, 
    addPoint,
    finishActivity, 
    getActivityStats, 
    getActivityPoints,
    mapUrl, 
    exportGpxUrl, 
    importGpx,
    deleteActivity, 
    enrichActivityGpx, 
    getMe,
    createShare, 
    getShares, 
    resolveShare, 
    revokeShare,
    connectLive, 
    connectWatch,
    updateCheer,
    deleteCheer,
  };

})();