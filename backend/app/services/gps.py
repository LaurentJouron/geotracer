"""
Service de traitement GPS.
Calcule distance, vitesse, dénivelé à partir d'une liste de points GPS.
"""
import math
import json
from datetime import datetime
from typing import List, Dict, Optional
import numpy as np


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance en km entre deux points GPS (formule haversine)."""
    R = 6371.0  # Rayon Terre en km
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def compute_stats(points: List[Dict]) -> Dict:
    """
    Calcule les statistiques d'une sortie à partir des points GPS.

    Args:
        points: liste de dicts {lat, lon, alt, ts (ISO string), speed_kmh}

    Returns:
        dict avec distance_km, duration_seconds, avg_speed_kmh, max_speed_kmh,
        elevation_gain_m, elevation_loss_m, speed_series, elevation_series
    """
    if len(points) < 2:
        return {}

    # --- Distance totale ---
    total_distance_km = 0.0
    for i in range(1, len(points)):
        total_distance_km += haversine(
            points[i - 1]["lat"], points[i - 1]["lon"],
            points[i]["lat"], points[i]["lon"]
        )

    # --- Durée ---
    ts_start = datetime.fromisoformat(points[0]["ts"])
    ts_end = datetime.fromisoformat(points[-1]["ts"])
    duration_seconds = int((ts_end - ts_start).total_seconds())

    # --- Vitesse ---
    speeds = [p.get("speed_kmh", 0) for p in points if p.get("speed_kmh") is not None]
    avg_speed = total_distance_km / (duration_seconds / 3600) if duration_seconds > 0 else 0
    max_speed = max(speeds) if speeds else 0

    # --- Dénivelé (avec lissage pour éviter le bruit GPS) ---
    altitudes = [p.get("alt", 0) for p in points if p.get("alt") is not None]
    elevation_gain = 0.0
    elevation_loss = 0.0

    if len(altitudes) > 1:
        # Lissage simple sur 5 points
        smoothed = _smooth(altitudes, window=5)
        for i in range(1, len(smoothed)):
            diff = smoothed[i] - smoothed[i - 1]
            if diff > 0:
                elevation_gain += diff
            else:
                elevation_loss += abs(diff)

    # --- Séries temporelles pour les graphiques ---
    speed_series = [
        {"ts": p["ts"], "value": p.get("speed_kmh", 0)}
        for p in points
    ]
    elevation_series = [
        {"ts": p["ts"], "value": p.get("alt", 0)}
        for p in points
    ]
    distance_series = _compute_cumulative_distances(points)

    return {
        "distance_km": round(total_distance_km, 3),
        "duration_seconds": duration_seconds,
        "avg_speed_kmh": round(avg_speed, 1),
        "max_speed_kmh": round(max_speed, 1),
        "elevation_gain_m": round(elevation_gain, 1),
        "elevation_loss_m": round(elevation_loss, 1),
        "speed_series": speed_series,
        "elevation_series": elevation_series,
        "distance_series": distance_series,
    }


def _smooth(values: List[float], window: int = 5) -> List[float]:
    """Lissage par moyenne mobile."""
    arr = np.array(values)
    if len(arr) < window:
        return values
    kernel = np.ones(window) / window
    smoothed = np.convolve(arr, kernel, mode="same")
    return smoothed.tolist()


def _compute_cumulative_distances(points: List[Dict]) -> List[Dict]:
    """Distance cumulée en km pour l'axe X des graphiques."""
    result = [{"ts": points[0]["ts"], "value": 0.0}]
    cumulative = 0.0
    for i in range(1, len(points)):
        cumulative += haversine(
            points[i - 1]["lat"], points[i - 1]["lon"],
            points[i]["lat"], points[i]["lon"]
        )
        result.append({"ts": points[i]["ts"], "value": round(cumulative, 3)})
    return result


def points_to_wkt_linestring(points: List[Dict]) -> Optional[str]:
    """Convertit les points GPS en WKT LINESTRINGZM pour PostGIS."""
    if len(points) < 2:
        return None
    coords = []
    for p in points:
        lon = p["lon"]
        lat = p["lat"]
        alt = p.get("alt", 0) or 0
        ts = datetime.fromisoformat(p["ts"]).timestamp()
        coords.append(f"{lon} {lat} {alt} {ts}")
    return f"LINESTRINGZM ({', '.join(coords)})"
