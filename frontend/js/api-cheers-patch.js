// ── PATCH à ajouter dans api.js ──────────────────────
// Ajouter ces deux méthodes dans l'objet Api (avant le `return { ... }`)
// ou les coller à la fin si Api est un objet littéral.

// Récupère tous les encouragements d'une sortie
getCheers: async (activityId) => {
  const res = await fetch(`${Api.base}/activities/${activityId}/cheers`, {
    headers: Api.authHeaders(),
  });
  if (!res.ok) throw new Error('getCheers failed');
  return res.json();
},

// Envoie un encouragement (utilisé depuis la page détail)
sendCheer: async (activityId, { author_name, message }) => {
  const res = await fetch(`${Api.base}/activities/${activityId}/cheers`, {
    method: 'POST',
    headers: { ...Api.authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ author_name, message }),
  });
  if (!res.ok) throw new Error('sendCheer failed');
  return res.json();
},
