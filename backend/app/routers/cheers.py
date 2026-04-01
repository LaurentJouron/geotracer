"""
Encouragements (cheers) — envoyés par les suiveurs pendant une sortie.
Sauvegardés en base et diffusés en temps réel via WebSocket.
"""

import json
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.app.database import get_db
from app.models.cheer import Cheer
from app.models.activity import Activity

router = APIRouter(prefix="/activities", tags=["cheers"])


# ── Schémas ───────────────────────────────────────────
class CheerCreate(BaseModel):
    author_name: str
    message: str
    parent_id: Optional[int] = None


class CheerResponse(BaseModel):
    id: int
    activity_id: int
    parent_id: Optional[int]
    author_name: str
    message: str
    sent_at: datetime

    class Config:
        from_attributes = True


# ── Endpoints ─────────────────────────────────────────
@router.post("/{activity_id}/cheers", response_model=CheerResponse)
async def send_cheer(
    activity_id: int, body: CheerCreate, db: AsyncSession = Depends(get_db)
):
    """Envoie un encouragement et le sauvegarde en base."""
    activity = await db.get(Activity, activity_id)
    if not activity:
        raise HTTPException(404, "Sortie introuvable")

    cheer = Cheer(
        activity_id=activity_id,
        parent_id=body.parent_id,
        author_name=body.author_name.strip()[:100],
        message=body.message.strip(),
    )
    db.add(cheer)
    await db.commit()
    await db.refresh(cheer)

    # Diffuser en temps réel via le dict _watchers du router tracking
    await _broadcast_cheer(activity_id, cheer)
    return cheer


@router.get("/{activity_id}/cheers", response_model=List[CheerResponse])
async def get_cheers(
    activity_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Récupère tous les encouragements d'une sortie."""
    result = await db.execute(
        select(Cheer)
        .where(Cheer.activity_id == activity_id)
        .order_by(Cheer.sent_at.asc())
    )
    return result.scalars().all()


# ── Diffusion temps réel ──────────────────────────────
async def _broadcast_cheer(activity_id: int, cheer: Cheer):
    """Envoie le cheer aux watchers ET au cycliste via WebSocket."""
    from app.routers.tracking import _watchers, _live_sockets

    msg = json.dumps(
        {
            "type": "cheer",
            "data": {
                "id": cheer.id,
                "author_name": cheer.author_name,
                "message": cheer.message,
                "sent_at": cheer.sent_at.isoformat(),
            },
        }
    )

    # Envoyer au cycliste (live socket)
    live_ws = _live_sockets.get(activity_id)
    if live_ws:
        try:
            await live_ws.send_text(msg)
        except Exception:
            pass

    # Envoyer aux autres watchers (y compris la page detail.html ouverte)
    dead = set()
    for ws in _watchers.get(activity_id, set()):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    _watchers.get(activity_id, set()).difference_update(dead)


@router.patch("/cheers/{cheer_id}")
async def update_cheer(
    cheer_id: int, body: dict, db: AsyncSession = Depends(get_db)
):
    cheer = await db.get(Cheer, cheer_id)
    if not cheer:
        raise HTTPException(404)
    if "message" in body:
        cheer.message = body["message"]
    await db.commit()
    return cheer


@router.delete("/cheers/{cheer_id}")
async def delete_cheer(cheer_id: int, db: AsyncSession = Depends(get_db)):
    cheer = await db.get(Cheer, cheer_id)
    if not cheer:
        raise HTTPException(404)
    await db.delete(cheer)
    await db.commit()
    return {"status": "deleted"}
