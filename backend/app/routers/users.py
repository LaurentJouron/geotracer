"""
Routes REST pour la gestion des utilisateurs.
"""

import bcrypt
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


# --- Schémas Pydantic ---


class UserCreate(BaseModel):
    username: str
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Endpoints ---


@router.post("/", response_model=UserResponse)
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Crée un nouvel utilisateur."""
    # Vérifier que le username/email ne sont pas déjà pris
    result = await db.execute(
        select(User).where(User.username == data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(400, "Ce nom d'utilisateur est déjà pris")

    user = User(
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    return user


@router.get("/{user_id}/activities")
async def get_user_activities(
    user_id: int, db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import select
    from app.models.activity import Activity

    result = await db.execute(
        select(
            Activity.id,
            Activity.title,
            Activity.started_at,
            Activity.finished_at,
            Activity.distance_km,
            Activity.duration_seconds,
            Activity.avg_speed_kmh,
            Activity.max_speed_kmh,
            Activity.elevation_gain_m,
            Activity.elevation_loss_m,
            Activity.is_live,
        )
        .where(Activity.user_id == user_id)
        .order_by(Activity.started_at.desc())
    )
    rows = result.mappings().all()
    return [dict(r) for r in rows]
