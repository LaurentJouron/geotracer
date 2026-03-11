"""
Suivi GPS en temps réel via WebSockets + Redis pub/sub.

Workflow :
  1. Le cycliste ouvre une connexion WS sur /tracking/live/{activity_id}
     → Il envoie ses points GPS en JSON
  2. Ses amis ouvrent une connexion WS sur /tracking/watch/{activity_id}
     → Ils reçoivent les points en temps réel
"""

import json
import asyncio
from typing import Dict, Set
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import redis.asyncio as aioredis
from app.config import settings
from app.database import AsyncSessionLocal
from app.models.activity import Activity

router = APIRouter(prefix="/tracking", tags=["tracking"])

_watchers: Dict[int, Set[WebSocket]] = {}


async def get_redis():
    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def _persist_point(activity_id: int, point: dict):
    """Sauvegarde le point GPS dans raw_points de l'activité."""
    async with AsyncSessionLocal() as db:
        activity = await db.get(Activity, activity_id)
        if not activity or not activity.is_live:
            return
        points = json.loads(activity.raw_points or "[]")
        points.append(point)
        activity.raw_points = json.dumps(points)
        await db.commit()


@router.websocket("/live/{activity_id}")
async def live_tracking(websocket: WebSocket, activity_id: int):
    """
    WebSocket pour le cycliste qui envoie sa position.

    Format message envoyé par le client :
    {"lat": 48.8566, "lon": 2.3522, "alt": 35.5, "speed_kmh": 28.3}
    """
    await websocket.accept()
    redis = await get_redis()

    try:
        while True:
            raw = await websocket.receive_text()
            point = json.loads(raw)

            if "ts" not in point:
                point["ts"] = datetime.utcnow().isoformat()

            # ── Persistance en base ──────────────────────
            await _persist_point(activity_id, point)

            # ── Redis pub/sub pour les watchers ──────────
            channel = f"activity:{activity_id}:live"
            await redis.publish(channel, json.dumps(point))
            await redis.setex(
                f"activity:{activity_id}:last_point", 3600, json.dumps(point)
            )

            # ── Diffusion aux watchers en mémoire ────────
            if activity_id in _watchers:
                dead = set()
                for watcher_ws in _watchers[activity_id]:
                    try:
                        await watcher_ws.send_text(
                            json.dumps(
                                {
                                    "type": "position",
                                    "data": point,
                                }
                            )
                        )
                    except Exception:
                        dead.add(watcher_ws)
                _watchers[activity_id] -= dead

            # ACK au cycliste
            await websocket.send_text(json.dumps({"status": "ok"}))

    except WebSocketDisconnect:
        if activity_id in _watchers:
            for watcher_ws in _watchers[activity_id]:
                try:
                    await watcher_ws.send_text(
                        json.dumps({"type": "finished"})
                    )
                except Exception:
                    pass
    finally:
        await redis.aclose()


@router.websocket("/watch/{activity_id}")
async def watch_activity(websocket: WebSocket, activity_id: int):
    """WebSocket pour les amis qui suivent la sortie en temps réel."""
    await websocket.accept()
    redis = await get_redis()

    if activity_id not in _watchers:
        _watchers[activity_id] = set()
    _watchers[activity_id].add(websocket)

    try:
        last = await redis.get(f"activity:{activity_id}:last_point")
        if last:
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "position",
                        "data": json.loads(last),
                    }
                )
            )

        while True:
            await asyncio.sleep(30)
            await websocket.send_text(json.dumps({"type": "ping"}))

    except WebSocketDisconnect:
        pass
    finally:
        _watchers.get(activity_id, set()).discard(websocket)
        await redis.aclose()


@router.get("/active")
async def get_active_activities():
    """Retourne les IDs des sorties actuellement en cours (depuis Redis)."""
    redis = await get_redis()
    try:
        keys = await redis.keys("activity:*:last_point")
        active_ids = [int(k.split(":")[1]) for k in keys]
        return {"active_activities": active_ids}
    finally:
        await redis.aclose()
