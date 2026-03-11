"""
Router de partage — génère des tokens pour suivre une sortie en temps réel.
"""
import secrets
import json
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db
from app.models.share_token import ShareToken
from app.models.activity import Activity

router = APIRouter(prefix="/shares", tags=["shares"])

DURATIONS = {
    "1d":  timedelta(days=1),
    "3d":  timedelta(days=3),
    "7d":  timedelta(days=7),
    "14d": timedelta(days=14),
    "30d": timedelta(days=30),
}


class ShareCreate(BaseModel):
    user_id:     int
    activity_id: Optional[int] = None   # None = toutes les sorties live
    label:       Optional[str] = None
    duration:    str = "7d"             # "1d" | "3d" | "7d" | "14d" | "30d"


class ShareResponse(BaseModel):
    id:          int
    token:       str
    label:       Optional[str]
    activity_id: Optional[int]
    expires_at:  datetime
    created_at:  datetime

    class Config:
        from_attributes = True


@router.post("/", response_model=ShareResponse)
async def create_share(data: ShareCreate, db: AsyncSession = Depends(get_db)):
    """Crée un token de partage."""
    delta = DURATIONS.get(data.duration, timedelta(days=7))
    share = ShareToken(
        token       = secrets.token_urlsafe(32),
        user_id     = data.user_id,
        activity_id = data.activity_id,
        label       = data.label or ("Sortie en direct" if data.activity_id else "Suivi live"),
        expires_at  = datetime.utcnow() + delta,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)
    return share


@router.get("/{token}")
async def resolve_share(token: str, db: AsyncSession = Depends(get_db)):
    """
    Résout un token de partage.
    Retourne l'activité live associée (ou la dernière sortie live de l'utilisateur).
    """
    result = await db.execute(
        select(ShareToken).where(ShareToken.token == token)
    )
    share = result.scalar_one_or_none()

    if not share:
        raise HTTPException(404, "Lien de partage introuvable")
    if share.expires_at < datetime.utcnow():
        raise HTTPException(410, "Lien de partage expiré")

    # Résoudre l'activité
    activity = None
    if share.activity_id:
        activity = await db.get(Activity, share.activity_id)
    else:
        # Trouver la dernière sortie live de l'utilisateur
        result = await db.execute(
            select(Activity)
            .where(Activity.user_id == share.user_id)
            .where(Activity.is_live == 1)
            .order_by(Activity.started_at.desc())
            .limit(1)
        )
        activity = result.scalar_one_or_none()

    return {
        "valid":       True,
        "label":       share.label,
        "expires_at":  share.expires_at.isoformat(),
        "user_id":     share.user_id,
        "activity_id": activity.id if activity else None,
        "is_live":     activity.is_live if activity else False,
        "activity":    {
            "id":           activity.id,
            "title":        activity.title,
            "started_at":   activity.started_at.isoformat(),
            "distance_km":  activity.distance_km,
            "is_live":      activity.is_live,
        } if activity else None,
    }


@router.get("/user/{user_id}", response_model=list[ShareResponse])
async def list_shares(user_id: int, db: AsyncSession = Depends(get_db)):
    """Liste les tokens actifs d'un utilisateur."""
    result = await db.execute(
        select(ShareToken)
        .where(ShareToken.user_id == user_id)
        .where(ShareToken.expires_at > datetime.utcnow())
        .order_by(ShareToken.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/{token}")
async def revoke_share(token: str, db: AsyncSession = Depends(get_db)):
    """Révoque un token de partage."""
    result = await db.execute(
        select(ShareToken).where(ShareToken.token == token)
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(404, "Token introuvable")
    await db.delete(share)
    await db.commit()
    return {"status": "revoked"}
