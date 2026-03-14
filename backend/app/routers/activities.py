"""
Routes REST pour les sorties vélo.
"""

import json
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.models.activity import Activity
from app.services.gps import compute_stats, points_to_wkt_linestring
from app.services.gpx import parse_gpx, export_gpx
from app.services.map import generate_activity_map

router = APIRouter(prefix="/activities", tags=["activities"])


# --- Schémas Pydantic ---


class ActivityCreate(BaseModel):
    user_id: int
    title: str = "Sortie vélo"


class ActivityResponse(BaseModel):
    id: int
    user_id: int
    title: str
    started_at: datetime
    finished_at: Optional[datetime]
    distance_km: Optional[float]
    duration_seconds: Optional[int]
    avg_speed_kmh: Optional[float]
    max_speed_kmh: Optional[float]
    elevation_gain_m: Optional[float]
    is_live: int

    class Config:
        from_attributes = True


class GpsPointIn(BaseModel):
    lat: float
    lon: float
    alt: Optional[float] = None
    speed_kmh: Optional[float] = None
    heart_rate: Optional[int] = None
    ts: Optional[str] = None  # ISO datetime, défaut = maintenant


# --- Endpoints ---


@router.post("/", response_model=ActivityResponse)
async def create_activity(
    data: ActivityCreate, db: AsyncSession = Depends(get_db)
):
    """Démarre une nouvelle sortie."""
    activity = Activity(
        user_id=data.user_id,
        title=data.title,
        started_at=datetime.utcnow(),
        is_live=1,
        raw_points=json.dumps([]),
    )
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


@router.post("/{activity_id}/points")
async def add_gps_point(
    activity_id: int,
    point: GpsPointIn,
    db: AsyncSession = Depends(get_db),
):
    """Ajoute un point GPS à une sortie en cours (pour la collecte mobile)."""
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(404, "Sortie introuvable")
    if not activity.is_live:
        raise HTTPException(400, "La sortie est terminée")

    # Ajouter le point aux données brutes
    points = json.loads(activity.raw_points or "[]")
    new_point = {
        "lat": point.lat,
        "lon": point.lon,
        "alt": point.alt,
        "speed_kmh": point.speed_kmh,
        "heart_rate": point.heart_rate,
        "ts": point.ts or datetime.utcnow().isoformat(),
    }
    points.append(new_point)
    activity.raw_points = json.dumps(points)

    await db.commit()
    return {"status": "ok", "total_points": len(points)}


@router.post("/{activity_id}/finish", response_model=ActivityResponse)
async def finish_activity(
    activity_id: int, db: AsyncSession = Depends(get_db)
):
    """Termine une sortie et calcule les statistiques finales."""
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(404, "Sortie introuvable")

    points = json.loads(activity.raw_points or "[]")

    # Terminer proprement même sans points GPS (GPS refusé, home trainer, etc.)
    activity.finished_at = datetime.utcnow()
    activity.is_live = 0

    if len(points) < 2:
        await db.commit()
        await db.refresh(activity)
        return activity

    # Calcul des stats
    stats = compute_stats(points)

    activity.finished_at = datetime.utcnow()
    activity.is_live = 0
    activity.distance_km = stats.get("distance_km")
    activity.duration_seconds = stats.get("duration_seconds")
    activity.avg_speed_kmh = stats.get("avg_speed_kmh")
    activity.max_speed_kmh = stats.get("max_speed_kmh")
    activity.elevation_gain_m = stats.get("elevation_gain_m")
    activity.elevation_loss_m = stats.get("elevation_loss_m")

    # Stockage tracé PostGIS
    wkt = points_to_wkt_linestring(points)
    if wkt:
        activity.track = f"SRID=4326;{wkt}"

    await db.commit()
    await db.refresh(activity)
    return activity


@router.get("/{activity_id}", response_model=ActivityResponse)
async def get_activity(activity_id: int, db: AsyncSession = Depends(get_db)):
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(404, "Sortie introuvable")
    return activity


@router.get("/{activity_id}/map", response_class=HTMLResponse)
async def get_activity_map(
    activity_id: int, db: AsyncSession = Depends(get_db)
):
    """Retourne la carte HTML Folium de la sortie."""
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(404, "Sortie introuvable")

    points = json.loads(activity.raw_points or "[]")
    stats = {
        "distance_km": activity.distance_km,
        "duration_seconds": activity.duration_seconds,
        "avg_speed_kmh": activity.avg_speed_kmh,
        "max_speed_kmh": activity.max_speed_kmh,
        "elevation_gain_m": activity.elevation_gain_m,
        "elevation_loss_m": activity.elevation_loss_m,
    }
    html = generate_activity_map(points, title=activity.title, stats=stats)
    return HTMLResponse(content=html)


@router.get("/{activity_id}/stats")
async def get_activity_stats(
    activity_id: int, db: AsyncSession = Depends(get_db)
):
    """Retourne les stats détaillées + séries temporelles pour les graphiques."""
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(404, "Sortie introuvable")

    points = json.loads(activity.raw_points or "[]")
    return compute_stats(points)


@router.post("/import/gpx", response_model=ActivityResponse)
async def import_gpx(
    user_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Importe un fichier GPX (Garmin, Wahoo, Komoot, Strava...)."""
    content = await file.read()
    points, metadata = parse_gpx(content)

    if not points:
        raise HTTPException(400, "Fichier GPX invalide ou vide")

    stats = compute_stats(points)

    def _parse_dt(ts):
        """Parse un timestamp ISO avec ou sans Z/timezone."""
        if not ts:
            return datetime.utcnow()
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(
                tzinfo=None
            )
        except (ValueError, AttributeError):
            return datetime.utcnow()

    activity = Activity(
        user_id=user_id,
        title=metadata.get("title", "Sortie importée"),
        started_at=_parse_dt(points[0].get("ts")),
        finished_at=_parse_dt(points[-1].get("ts")),
        is_live=0,
        raw_points=json.dumps(points),
        distance_km=stats.get("distance_km"),
        duration_seconds=stats.get("duration_seconds"),
        avg_speed_kmh=stats.get("avg_speed_kmh"),
        max_speed_kmh=stats.get("max_speed_kmh"),
        elevation_gain_m=stats.get("elevation_gain_m"),
        elevation_loss_m=stats.get("elevation_loss_m"),
    )

    wkt = points_to_wkt_linestring(points)
    if wkt:
        activity.track = f"SRID=4326;{wkt}"

    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


@router.get("/{activity_id}/export/gpx")
async def export_activity_gpx(
    activity_id: int, db: AsyncSession = Depends(get_db)
):
    """Exporte la sortie en fichier GPX."""
    from fastapi.responses import Response

    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(404, "Sortie introuvable")

    points = json.loads(activity.raw_points or "[]")
    gpx_xml = export_gpx(activity.title, points)

    return Response(
        content=gpx_xml,
        media_type="application/gpx+xml",
        headers={
            "Content-Disposition": f"attachment; filename=sortie_{activity_id}.gpx"
        },
    )


@router.get("/{activity_id}/points")
async def get_activity_points(
    activity_id: int, db: AsyncSession = Depends(get_db)
):
    """Retourne les points GPS d'une sortie pour affichage carte + graphiques."""
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(404, "Sortie introuvable")

    points = json.loads(activity.raw_points or "[]")
    return [
        {
            "lat": p.get("lat"),
            "lon": p.get("lon"),
            "alt": p.get("alt"),
            "speed_kmh": p.get("speed_kmh"),
            "heart_rate": p.get("heart_rate"),
            "cadence": p.get("cadence"),
            "power": p.get("power"),
            "ts": p.get("ts"),
        }
        for p in points
        if p.get("lat") and p.get("lon")
    ]


@router.patch("/{activity_id}/gpx", response_model=ActivityResponse)
async def enrich_activity_gpx(
    activity_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Enrichit une sortie existante avec un fichier GPX.
    Remplace les points bruts et recalcule toutes les stats.
    Utile pour associer le GPX Garmin à une sortie live.
    """
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(404, "Sortie introuvable")

    content = await file.read()
    points, metadata = parse_gpx(content)

    if not points:
        raise HTTPException(400, "Fichier GPX invalide ou vide")

    stats = compute_stats(points)

    # Mettre à jour le titre seulement si encore générique
    if metadata.get("title") and activity.title in (
        "Sortie vélo",
        "Sortie importée",
        "",
    ):
        activity.title = metadata["title"]

    # Remplacer les points et recalculer les stats
    activity.raw_points = json.dumps(points)
    activity.is_live = 0

    def _parse_dt(ts):
        if not ts:
            return datetime.utcnow()
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(
                tzinfo=None
            )
        except (ValueError, AttributeError):
            return datetime.utcnow()

    activity.finished_at = _parse_dt(points[-1].get("ts"))
    activity.distance_km = stats.get("distance_km")
    activity.duration_seconds = stats.get("duration_seconds")
    activity.avg_speed_kmh = stats.get("avg_speed_kmh")
    activity.max_speed_kmh = stats.get("max_speed_kmh")
    activity.elevation_gain_m = stats.get("elevation_gain_m")
    activity.elevation_loss_m = stats.get("elevation_loss_m")

    wkt = points_to_wkt_linestring(points)
    if wkt:
        activity.track = f"SRID=4326;{wkt}"

    await db.commit()
    await db.refresh(activity)
    return activity


@router.delete("/{activity_id}")
async def delete_activity(
    activity_id: int, db: AsyncSession = Depends(get_db)
):
    """Supprime une sortie."""
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(404, "Sortie introuvable")
    await db.delete(activity)
    await db.commit()
    return {"status": "deleted", "id": activity_id}
