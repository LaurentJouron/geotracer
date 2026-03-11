# 🚴 GeoTracer

**Application de suivi GPS pour sorties vélo et sports outdoor**

![GeoTracer](https://img.shields.io/badge/version-1.0.0-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15--PostGIS-blue) ![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)

GeoTracer est une PWA (Progressive Web App) de suivi GPS en temps réel, pensée pour les cyclistes. Elle permet d'enregistrer ses sorties via GPS, d'importer des fichiers GPX depuis Garmin, de visualiser ses statistiques et de partager ses sorties en direct.

---

## ✨ Fonctionnalités

- **Suivi GPS live** — enregistrement en temps réel avec carte Leaflet, vitesse/altitude/distance
- **Mode offline** — points GPS stockés en IndexedDB, synchronisés dès le retour en ligne
- **Import GPX** — import de fichiers Garmin avec extraction fréquence cardiaque, cadence, puissance
- **Partage live** — lien public pour suivre une sortie en direct (`/watch.html?id=xxx`)
- **Statistiques avancées** — graphiques Plotly, heatmap d'activité, records personnels
- **Multi-sport** — vélo, course à pied, natation, home trainer, etc.
- **Zones de fréquence cardiaque** — Z1 à Z5 calculées automatiquement
- **PWA installable** — fonctionne comme une app native sur iOS et Android
- **Wake Lock** — empêche l'écran de se mettre en veille pendant une sortie

---

## 🏗️ Architecture

```
geotracer/
├── backend/               # API FastAPI
│   ├── app/
│   │   ├── main.py        # Point d'entrée, CORS, routers
│   │   ├── models/        # SQLAlchemy (User, Activity, GpsPoint, ShareToken)
│   │   ├── routers/       # auth, activities, users, shares, tracking
│   │   ├── services/      # gpx.py (parsing), stats.py (calculs)
│   │   └── database.py    # Connexion PostgreSQL async
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/              # PWA statique (HTML/CSS/JS vanilla)
│   ├── index.html         # Login / inscription
│   ├── dashboard.html     # KPIs et sorties récentes
│   ├── tracker.html       # Suivi GPS live
│   ├── activities.html    # Liste des sorties
│   ├── detail.html        # Détail d'une sortie
│   ├── import.html        # Import GPX
│   ├── stats.html         # Statistiques avancées
│   ├── sports.html        # Multi-sport
│   ├── contacts.html      # Partage avec contacts
│   ├── watch.html         # Suivi public live
│   ├── js/
│   │   ├── api.js         # Tous les appels REST
│   │   ├── auth.js        # JWT, login, session
│   │   ├── tracker.js     # GPS, Leaflet, WebSocket, offline sync
│   │   ├── dashboard.js   # KPIs
│   │   ├── stats.js       # Graphiques Plotly
│   │   └── components.js  # Sidebar, topbar, bottom-nav
│   └── service-worker.js  # Cache offline
├── docker-compose.yml
└── nginx.conf
```

---

## 🛠️ Stack technique

| Composant | Technologie |
|---|---|
| Backend | FastAPI + SQLAlchemy async |
| Base de données | PostgreSQL 15 + PostGIS |
| Cache | Redis |
| Live tracking | WebSockets |
| Frontend | HTML/CSS/JS vanilla + Leaflet + Plotly |
| Conteneurs | Docker Compose |
| Proxy | Nginx |
| Tunnel HTTPS | Cloudflare Tunnel |

---

## 🚀 Déploiement sur NAS Synology

### Prérequis
- NAS Synology avec Container Manager
- Docker Compose
- Ports 3000 (frontend) et 8000 (backend) disponibles

### Structure sur le NAS

```
/volume1/docker/
├── geotracer/
│   ├── backend/         ← code Python complet
│   ├── frontend/        ← fichiers statiques HTML/JS/CSS
│   ├── pgdata/          ← données PostgreSQL (créer avant le premier démarrage)
│   └── docker-compose.yml
└── cloudflared/
    ├── cloudflared.yml  ← tunnel Cloudflare
    └── config/
        └── config.yml   ← routes du tunnel
```

### Démarrage

```bash
# Créer le dossier de données PostgreSQL
mkdir -p /volume1/docker/geotracer/pgdata

# Démarrer via Container Manager ou en ligne de commande :
cd /volume1/docker/geotracer
docker-compose up -d
```

### Variables à configurer dans `docker-compose.yml`

```yaml
POSTGRES_PASSWORD: VotreMotDePasse
DATABASE_URL: postgresql+asyncpg://geo:VotreMotDePasse@db:5432/geographix
SECRET_KEY: VotreCleSecrete64caracteres
```

---

## 🌐 Accès public via Cloudflare Tunnel

Le tunnel Cloudflare permet d'accéder à l'application depuis internet sans ouvrir de port sur le routeur.

**`/volume1/docker/cloudflared/config/config.yml`**
```yaml
tunnel: VOTRE_TUNNEL_ID
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: geotracer.votre-domaine.com
    service: http://192.168.1.XX:3000
  - hostname: geoapi.votre-domaine.com
    service: http://192.168.1.XX:8000
  - service: http_status:404
```

---

## 📱 Utilisation sur iOS (Safari / Chrome)

> ⚠️ Sur iOS, la géolocalisation nécessite que l'application soit installée comme PWA et lancée depuis l'écran d'accueil.

1. Ouvrir `https://geotracer.votre-domaine.com` dans **Safari**
2. Partager → **Sur l'écran d'accueil**
3. Lancer depuis l'écran d'accueil (pas depuis le navigateur)
4. Autoriser la localisation quand demandé

> Chrome sur iOS ne supporte pas le GPS en arrière-plan — utiliser Safari ou installer la PWA.

---

## 🔌 API

Documentation interactive : `https://geoapi.votre-domaine.com/docs`

| Méthode | Route | Description |
|---|---|---|
| POST | `/auth/register` | Créer un compte |
| POST | `/auth/login` | Se connecter (JWT) |
| GET | `/users/{id}/activities` | Liste des sorties |
| POST | `/activities` | Créer une sortie |
| POST | `/activities/{id}/points` | Ajouter un point GPS |
| POST | `/activities/{id}/finish` | Terminer une sortie |
| POST | `/activities/import/gpx` | Importer un fichier GPX |
| WS | `/ws/live/{id}` | WebSocket suivi live |
| POST | `/shares` | Créer un lien de partage |

---

## 🔧 Développement local

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend — n'importe quel serveur statique
npx serve frontend -p 3000
```

PostgreSQL et Redis en local via Docker :

```bash
docker run -d --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgis/postgis:15-3.3
docker run -d --name redis -p 6379:6379 redis:alpine
```

---

## 📄 Licence

MIT — Projet personnel, contributions bienvenues.

---

*Développé avec ❤️ pour les sorties vélo autour de Cannes* 🌊


# 4. Simuler une sortie vélo
* python scripts/simulate_ride.py --route calanques
* python scripts/simulate_ride.py --route bonifacio
* python scripts/simulate_ride.py --route porto_vecchio
* python scripts/simulate_ride.py --route cap_corse
* python scripts/simulate_ride.py --route bavella

# 5. Ouvrir le dashboard
open frontend/index.html

# 6. Lancer le frontend
cd frontend && python -m http.server 3000

get token : Invoke-RestMethod -Uri "http://localhost:8000/auth/login" `
  -Method POST `
  -ContentType "application/x-www-form-urlencoded" `
  -Body "username=prenom&password=mot_de_passe"

clean database : pipenv run python ../scripts/reset_db.py --yes
