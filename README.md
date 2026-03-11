# 🚴 GeoTracer

Application de suivi GPS pour sorties vélo, style Strava/Garmin.

## Stack

- **Backend** : FastAPI + PostgreSQL/PostGIS + Redis
- **Analyse** : gpxpy, GeoPandas, Shapely
- **Visualisation** : Folium, Plotly
- **Temps réel** : WebSockets + Redis pub/sub

## Structure

```
velo-tracker/
├── backend/
│   ├── app/
│   │   ├── main.py           # Point d'entrée FastAPI
│   │   ├── config.py         # Configuration (env vars)
│   │   ├── database.py       # Connexion PostgreSQL/PostGIS
│   │   ├── models/
│   │   │   ├── activity.py   # Modèle sortie vélo
│   │   │   └── user.py       # Modèle utilisateur
│   │   ├── routers/
│   │   │   ├── activities.py # CRUD sorties
│   │   │   ├── tracking.py   # GPS temps réel (WebSocket)
│   │   │   └── users.py      # Gestion utilisateurs
│   │   └── services/
│   │       ├── gps.py        # Traitement GPS, calcul stats
│   │       ├── gpx.py        # Import/export GPX
│   │       └── map.py        # Génération cartes Folium
├── frontend/
│   └── index.html            # Dashboard PWA
├── scripts/
│   └── simulate_ride.py      # Simulateur de sortie (dev)
├── docker-compose.yml
└── requirements.txt
```

## Lancement rapide

```bash
# 1. Démarrer PostgreSQL + Redis
docker-compose up -d

# 2. Installer les dépendances
pip install -r requirements.txt

# 3. Lancer le backend
cd backend && uvicorn app.main:app --reload

# 4. Simuler une sortie vélo
python scripts/simulate_ride.py --route calanques
python scripts/simulate_ride.py --route bonifacio
python scripts/simulate_ride.py --route porto_vecchio
python scripts/simulate_ride.py --route cap_corse
python scripts/simulate_ride.py --route bavella

# 5. Ouvrir le dashboard
open frontend/index.html

# 6. Lancer le frontend
cd frontend && python -m http.server 3000
```

## API Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/activities/` | Créer une sortie |
| GET | `/activities/{id}` | Détails d'une sortie |
| GET | `/activities/{id}/map` | Carte HTML Folium |
| POST | `/activities/import/gpx` | Importer un fichier GPX |
| WS | `/tracking/live/{activity_id}` | Position GPS en temps réel |
| GET | `/tracking/watch/{activity_id}` | Suivre un ami (WebSocket) |


get token : Invoke-RestMethod -Uri "http://localhost:8000/auth/login" `
  -Method POST `
  -ContentType "application/x-www-form-urlencoded" `
  -Body "username=prenom&password=mot_de_passe"

clean database : pipenv run python ../scripts/reset_db.py --yes
