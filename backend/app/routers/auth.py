"""
Authentification JWT — register, login, me
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt
from pydantic import BaseModel
import bcrypt

from app.database import get_db
from app.models.user import User
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ── Schémas ─────────────────────────────────────────────
class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    avatar_url: Optional[str] = None


class UserMe(BaseModel):
    id: int
    username: str
    email: str
    avatar_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Helpers ─────────────────────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: int, username: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "exp": datetime.utcnow()
        + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(
        payload, settings.secret_key, algorithm=settings.algorithm
    )


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalide ou expiré",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise credentials_error

    user = await db.get(User, user_id)
    if not user:
        raise credentials_error
    return user


# ── Endpoints ────────────────────────────────────────────
@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Inscription d'un nouvel utilisateur."""
    # Vérifier unicité
    result = await db.execute(
        select(User).where(User.username == data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(400, "Ce nom d'utilisateur est déjà pris")

    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(400, "Cet email est déjà utilisé")

    user = User(
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(
        access_token=create_token(user.id, user.username),
        user_id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Connexion — retourne un JWT."""
    result = await db.execute(
        select(User).where(User.username == form.username)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants incorrects",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenResponse(
        access_token=create_token(user.id, user.username),
        user_id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
    )


@router.get("/me", response_model=UserMe)
async def me(current_user: User = Depends(get_current_user)):
    """Profil de l'utilisateur connecté."""
    return current_user


@router.patch("/me")
async def update_me(
    username: Optional[str] = None,
    email: Optional[str] = None,
    password: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mise à jour du profil (username, email, password)."""
    if username and username != current_user.username:
        result = await db.execute(
            select(User).where(User.username == username)
        )
        if result.scalar_one_or_none():
            raise HTTPException(400, "Nom d'utilisateur déjà pris")
        current_user.username = username

    if email and email != current_user.email:
        result = await db.execute(select(User).where(User.email == email))
        if result.scalar_one_or_none():
            raise HTTPException(400, "Email déjà utilisé")
        current_user.email = email

    if password:
        if len(password) < 8:
            raise HTTPException(
                400, "Mot de passe trop court (8 caractères min)"
            )
        current_user.hashed_password = hash_password(password)

    await db.commit()
    await db.refresh(current_user)
    return {
        "ok": True,
        "username": current_user.username,
        "email": current_user.email,
    }


@router.post("/me/avatar")
async def upload_avatar(
    file: "UploadFile" = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload de la photo de profil.
    Stockée en base sous forme de data URL base64 (max 2 Mo).
    """
    from fastapi import UploadFile
    import base64

    if not file:
        raise HTTPException(400, "Aucun fichier fourni")

    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(400, "Le fichier doit être une image")

    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(400, "Image trop volumineuse (max 2 Mo)")

    b64 = base64.b64encode(data).decode()
    avatar_url = f"data:{content_type};base64,{b64}"

    current_user.avatar_url = avatar_url
    await db.commit()

    return {"ok": True, "avatar_url": avatar_url}


@router.delete("/me/avatar")
async def delete_avatar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Supprime la photo de profil."""
    current_user.avatar_url = None
    await db.commit()
    return {"ok": True}
