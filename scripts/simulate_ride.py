"""
Simulateur de sortie vélo — Route des Calanques de Piana, Corse
Porto → Calanques de Piana → Cargèse → retour

Usage :
    python scripts/simulate_ride.py
    python scripts/simulate_ride.py --user-id 1 --route bonifacio
"""

import asyncio
import json
import math
import random
import argparse
import httpx
import websockets
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000"

# ── Routes disponibles ────────────────────────────────────────────────────────
ROUTES = {
    "calanques": {
        "title": "Calanques de Piana — Porto → Cargèse",
        "waypoints": [
            # (lat, lon, alt, description)
            (42.2686, 8.6987, 12, "Porto — départ port"),
            (42.2750, 8.6820, 45, "Montée vers les calanques"),
            (42.2890, 8.6550, 180, "Col de la Croix"),
            (42.3050, 8.6300, 320, "Belvédère Calanques"),
            (42.3200, 8.6100, 280, "Panorama Piana"),
            (42.3350, 8.5900, 180, "Descente vers Piana"),
            (42.3480, 8.5700, 60, "Village de Piana"),
            (42.3720, 8.5450, 45, "Côte vers Cargèse"),
            (42.4100, 8.5950, 30, "Cargèse — arrivée"),
        ],
        "points": 280,
    },
    "bonifacio": {
        "title": "Falaises de Bonifacio — Boucle du Sud",
        "waypoints": [
            (41.3869, 9.1597, 10, "Bonifacio — vieille ville"),
            (41.3700, 9.1800, 35, "Route des falaises"),
            (41.3550, 9.2100, 55, "Capo Pertusato"),
            (41.3400, 9.2400, 30, "Golfe de Santa Manza"),
            (41.3600, 9.2700, 20, "Plage de Piantarella"),
            (41.3900, 9.2950, 15, "Pointe de Sperone"),
            (41.4200, 9.2600, 40, "Retour intérieur"),
            (41.4100, 9.2100, 65, "Col des Quatre Chemins"),
            (41.3869, 9.1597, 10, "Bonifacio — retour"),
        ],
        "points": 240,
    },
    "porto_vecchio": {
        "title": "Porto-Vecchio — Boucle des plages",
        "waypoints": [
            (41.5914, 9.2789, 5, "Porto-Vecchio — marina"),
            (41.5700, 9.2600, 15, "Route de Palombaggia"),
            (41.5450, 9.2450, 8, "Plage de Palombaggia"),
            (41.5200, 9.2300, 12, "Santa Giulia"),
            (41.5100, 9.2600, 25, "Col de Bavella direction"),
            (41.5300, 9.3000, 45, "Forêt de l'Ospedale"),
            (41.5600, 9.3200, 85, "Barrage de l'Ospedale"),
            (41.5800, 9.3100, 55, "Descente vers la côte"),
            (41.5914, 9.2789, 5, "Porto-Vecchio — retour"),
        ],
        "points": 260,
    },
    "cap_corse": {
        "title": "Tour du Cap Corse — Bastia à Erbalunga",
        "waypoints": [
            (42.6977, 9.4510, 10, "Bastia — Vieux Port"),
            (42.7050, 9.4550, 20, "Bastia — Sortie Nord"),
            (42.7150, 9.4650, 15, "Pietranera"),
            (42.7300, 9.4750, 5, "Erbalunga — Tour génoise"),
            (42.7500, 9.4800, 10, "Marine de Sisco"),
            (42.7800, 9.4700, 25, "Pietracorbara"),
            (42.8100, 9.4600, 40, "Cagnano"),
            (42.8500, 9.4500, 30, "Porticciolo"),
            (42.8900, 9.4400, 20, "Luri"),
        ],
        "points": 350,
    },
    "bavella": {
        "title": "Col de Bavella — L'ascension",
        "waypoints": [
            (41.7700, 9.2500, 80, "Solenzara — Départ mer"),
            (41.7850, 9.2400, 150, "Début montée"),
            (41.8000, 9.2300, 300, "Forêt de Bavella"),
            (41.8150, 9.2200, 650, "Lacets de Bavella 1"),
            (41.8250, 9.2150, 900, "Lacets de Bavella 2"),
            (41.8350, 9.2100, 1150, "Col de Bavella — Sommet"),
            (41.8200, 9.1900, 950, "Descente vers Zonza"),
            (41.7500, 9.1700, 750, "Arrivée Zonza"),
        ],
        "points": 400,
    },
}

INTERVAL_SECONDS = 4


# ── Interpolation entre waypoints ─────────────────────────────────────────────
def _interpolate(p1, p2, t):
    """Interpolation linéaire entre deux waypoints (t entre 0 et 1)."""
    return (
        p1[0] + (p2[0] - p1[0]) * t,
        p1[1] + (p2[1] - p1[1]) * t,
        p1[2] + (p2[2] - p1[2]) * t,
    )


def generate_route(route_key: str, n_points: int):
    waypoints = ROUTES[route_key]["waypoints"]
    points = []
    n_segs = len(waypoints) - 1
    pts_per_seg = n_points // n_segs

    for seg_idx in range(n_segs):
        wp1 = waypoints[seg_idx]
        wp2 = waypoints[seg_idx + 1]

        # Nombre de points pour ce segment (proportionnel à la distance)
        dlat = wp2[0] - wp1[0]
        dlon = wp2[1] - wp1[1]
        dist = math.sqrt(dlat**2 + dlon**2)
        n_seg = max(10, int(pts_per_seg * dist / 0.05 * 2))
        n_seg = min(n_seg, pts_per_seg * 2)

        for i in range(n_seg):
            t = i / n_seg

            # Position interpolée + bruit GPS réaliste (±8m)
            lat, lon, alt = _interpolate(wp1, wp2, t)
            lat += random.gauss(0, 0.00007)
            lon += random.gauss(0, 0.00007)
            alt += random.gauss(0, 2.0)
            alt = max(0, alt)

            # Vitesse selon pente
            d_alt = wp2[2] - wp1[2]
            slope_pct = d_alt / max(1, dist * 111000) * 100  # % pente approx
            if slope_pct > 3:
                base_spd = 14.0  # montée raide
            elif slope_pct > 1:
                base_spd = 18.0  # montée douce
            elif slope_pct < -3:
                base_spd = 42.0  # descente raide
            elif slope_pct < -1:
                base_spd = 36.0  # descente douce
            else:
                base_spd = 27.0  # plat

            speed = base_spd + random.gauss(0, 2.5)
            speed = max(5.0, min(65.0, speed))

            total_idx = len(points)
            ts = (
                datetime.utcnow()
                - timedelta(seconds=(n_points - total_idx) * INTERVAL_SECONDS)
            ).isoformat()

            points.append(
                {
                    "lat": round(lat, 7),
                    "lon": round(lon, 7),
                    "alt": round(alt, 1),
                    "speed_kmh": round(speed, 1),
                    "ts": ts,
                }
            )

    # Tronquer / compléter à n_points
    return points[:n_points]


# ── Simulation ────────────────────────────────────────────────────────────────
async def simulate(user_id: int = 1, route_key: str = "calanques"):
    route = ROUTES[route_key]
    print(f"\n🚴 Simulation : {route['title']}")
    print(
        f"   {len(route['waypoints'])-1} segments · {route['points']} points GPS\n"
    )

    # 1. Créer la sortie
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE_URL}/activities/",
            json={
                "user_id": user_id,
                "title": route["title"],
            },
        )
        resp.raise_for_status()
        activity = resp.json()
        activity_id = activity["id"]
        print(f"✅ Sortie créée : ID {activity_id}")
        print(f"   🗺  Carte live  : {BASE_URL}/activities/{activity_id}/map")
        print(f"   👁  WebSocket   : {WS_URL}/tracking/watch/{activity_id}\n")

    # 2. Générer les points
    points = generate_route(route_key, route["points"])
    print(f"📍 {len(points)} points générés\n")

    # 3. Envoi via WebSocket (fallback HTTP)
    ws_url = f"{WS_URL}/tracking/live/{activity_id}"
    try:
        async with websockets.connect(ws_url) as ws:
            for i, pt in enumerate(points):
                await ws.send(json.dumps(pt))
                await ws.recv()
                pct = (i + 1) / len(points) * 100
                bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
                print(
                    f"\r  [{bar}] {pct:5.1f}% "
                    f"| 📍 {pt['lat']:.5f}, {pt['lon']:.5f} "
                    f"| ⚡ {pt['speed_kmh']:.1f} km/h "
                    f"| ⛰  {pt['alt']:.0f}m",
                    end="",
                    flush=True,
                )
                await asyncio.sleep(0.08)

    except Exception as e:
        print(f"\n⚠️  WebSocket indisponible ({e}), envoi HTTP...")
        async with httpx.AsyncClient(timeout=30) as client:
            for i, pt in enumerate(points):
                await client.post(
                    f"{BASE_URL}/activities/{activity_id}/points", json=pt
                )
                pct = (i + 1) / len(points) * 100
                print(f"\r  Envoi HTTP {pct:5.1f}%", end="", flush=True)

    # 4. Finaliser
    print("\n\n🏁 Calcul des statistiques...")
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{BASE_URL}/activities/{activity_id}/finish")
        stats = resp.json()

    elev_gain = stats.get("elevation_gain_m") or 0
    elev_loss = stats.get("elevation_loss_m") or 0
    dist = stats.get("distance_km") or 0
    dur = stats.get("duration_seconds") or 0
    avg_spd = stats.get("avg_speed_kmh") or 0
    max_spd = stats.get("max_speed_kmh") or 0

    print(
        f"""
╔══════════════════════════════════════════╗
║         RÉSUMÉ — {route['title'][:22]:<22} ║
╠══════════════════════════════════════════╣
║  📏 Distance    : {dist:.2f} km
║  ⏱  Durée       : {dur // 3600}h{(dur % 3600) // 60:02d}
║  ⚡ Vitesse moy : {avg_spd:.1f} km/h
║  🚀 Vitesse max : {max_spd:.1f} km/h
║  ⬆️  Dénivelé + : {elev_gain:.0f} m
║  ⬇️  Dénivelé - : {elev_loss:.0f} m
╠══════════════════════════════════════════╣
║  🗺  {BASE_URL}/activities/{activity_id}/map
╚══════════════════════════════════════════╝
    """
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulateur vélo Corse")
    parser.add_argument("--user-id", type=int, default=1)
    parser.add_argument(
        "--route",
        choices=list(ROUTES.keys()),
        default="calanques",
        help="calanques | bonifacio | porto_vecchio",
    )
    args = parser.parse_args()
    asyncio.run(simulate(user_id=args.user_id, route_key=args.route))
