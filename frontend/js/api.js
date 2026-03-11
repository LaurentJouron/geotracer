/**
 * api.js — Appels backend FastAPI avec JWT automatique
 */

const Api = (() => {

  function baseUrl() {
    return (
      document.getElementById('apiUrl')?.value ||
      localStorage.getItem('vt_api_url') ||
      'http://localhost:8000'
    ).replace(/\/$/, '');
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
  function connectLive(activityId) {
    return new WebSocket(baseUrl().replace('http', 'ws') + `/tracking/live/${activityId}`);
  }

  function connectWatch(activityId) {
    return new WebSocket(baseUrl().replace('http', 'ws') + `/tracking/watch/${activityId}`);
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

  return {
    getActivities, createActivity, addPoint,
    finishActivity, getActivityStats, getActivityPoints,
    mapUrl, exportGpxUrl, importGpx,
    deleteActivity, enrichActivityGpx, getMe,
    createShare, getShares, resolveShare, revokeShare,
    connectLive, connectWatch,
  };

})();