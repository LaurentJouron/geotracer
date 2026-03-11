"""
Service d'import/export GPX.
Compatible Garmin Connect, Wahoo, Komoot, Strava, RideWithGPS.
Utilise xml.etree.ElementTree (stdlib) — pas de dépendance gpxpy.
"""

import xml.etree.ElementTree as ET
import math
from datetime import datetime, timezone
from typing import List, Dict, Tuple, Optional


def _haversine(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def _parse_ts(ts_str):
    if not ts_str:
        return None
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except ValueError:
        return None


def _find_text(el, tag_local, ns):
    ns_tag = f"{{{ns}}}{tag_local}" if ns else tag_local
    found = el.find(ns_tag)
    if found is None:
        found = el.find(tag_local)
    return found.text if found is not None else None


def parse_gpx(gpx_content: bytes) -> Tuple[List[Dict], Dict]:
    root = ET.fromstring(gpx_content)
    ns = root.tag.split("}")[0].lstrip("{") if "}" in root.tag else ""
    p = f"{{{ns}}}" if ns else ""

    # Titre
    title = "Sortie importée"
    trk = root.find(f".//{p}trk")
    if trk is not None:
        name_el = trk.find(f"{p}name")
        if name_el is not None and name_el.text:
            title = name_el.text.strip()

    # Points GPS
    raw = []
    for trkpt in root.findall(f".//{p}trkpt"):
        try:
            lat = float(trkpt.get("lat"))
            lon = float(trkpt.get("lon"))
        except (TypeError, ValueError):
            continue

        ele = _find_text(trkpt, "ele", ns)
        ts = _find_text(trkpt, "time", ns)
        alt = float(ele) if ele else None

        hr = cad = spd = pwr = None
        for child in trkpt.iter():
            tag = (
                child.tag.split("}")[-1].lower()
                if "}" in child.tag
                else child.tag.lower()
            )
            val = child.text
            if not val:
                continue
            if tag == "hr":
                try:
                    hr = int(float(val))
                except:
                    pass
            elif tag in ("cad", "cadence"):
                try:
                    cad = int(float(val))
                except:
                    pass
            elif tag == "speed":
                try:
                    spd = round(float(val) * 3.6, 2)
                except:
                    pass
            elif tag in ("power", "watts"):
                try:
                    pwr = int(float(val))
                except:
                    pass

        raw.append(
            {
                "lat": lat,
                "lon": lon,
                "alt": alt,
                "ts": ts,
                "heart_rate": hr,
                "cadence": cad,
                "speed_kmh": spd,
                "power": pwr,
            }
        )

    points = _compute_speed(raw)
    return points, {"title": title, "total_points": len(points)}


def _compute_speed(raw):
    speeds = []
    for i, p in enumerate(raw):
        spd = p.get("speed_kmh")
        if spd is None and i > 0:
            prev = raw[i - 1]
            ts1 = _parse_ts(prev["ts"])
            ts2 = _parse_ts(p["ts"])
            if ts1 and ts2:
                dt = (ts2 - ts1).total_seconds()
                if dt > 0:
                    d = _haversine(
                        prev["lat"], prev["lon"], p["lat"], p["lon"]
                    )
                    spd = round(d / (dt / 3600), 2)
                    if spd > 120:
                        spd = None
        speeds.append(spd)

    # Lissage fenêtre 5 pts
    result = []
    for i, p in enumerate(raw):
        window = [
            speeds[j]
            for j in range(max(0, i - 2), min(len(speeds), i + 3))
            if speeds[j] is not None
        ]
        smooth = round(sum(window) / len(window), 2) if window else None
        result.append({**p, "speed_kmh": smooth})
    return result


def export_gpx(activity_title: str, points: List[Dict]) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="GeoTracer"',
        '  xmlns="http://www.topografix.com/GPX/1/1">',
        f"  <trk><name>{_esc(activity_title)}</name><trkseg>",
    ]
    for p in points:
        lat, lon = p.get("lat", 0), p.get("lon", 0)
        line = f'    <trkpt lat="{lat}" lon="{lon}">'
        if p.get("alt") is not None:
            line += f'<ele>{p["alt"]}</ele>'
        if p.get("ts"):
            line += f'<time>{p["ts"]}</time>'
        line += "</trkpt>"
        lines.append(line)
    lines += ["  </trkseg></trk>", "</gpx>"]
    return "\n".join(lines)


def _esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
