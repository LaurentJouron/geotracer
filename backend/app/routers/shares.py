"""
share.py — Liens courts pour partage par SMS
POST /share/        → crée un token court, retourne l'URL courte
GET  /share/{token} → redirige vers watch.html avec les bons paramètres
"""

import secrets
import time
from typing import Dict
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from pydantic import BaseModel

router = APIRouter(prefix="/share", tags=["share"])

# Stockage en mémoire (tokens valides 24h)
# En production, utiliser Redis
_store: Dict[str, dict] = {}
_TTL = 60 * 60 * 24  # 24 heures


class ShareRequest(BaseModel):
    activity_id: int
    username: str = ""
    api_url: str = "https://geoapi.laurentjouron.dev"
    frontend_url: str = "https://geographix.laurentjouron.dev"


class ShareResponse(BaseModel):
    token: str
    short_url: str
    watch_url: str


@router.post("/", response_model=ShareResponse)
async def create_share(data: ShareRequest):
    """Crée un token court valable 24h pour partager une sortie live."""
    token = secrets.token_urlsafe(6)  # ~8 caractères, ex: "aB3xKp2"

    _store[token] = {
        "activity_id": data.activity_id,
        "username": data.username,
        "api_url": data.api_url,
        "frontend_url": data.frontend_url,
        "created_at": time.time(),
    }

    short_url = f"{data.api_url}/share/{token}"
    watch_url = (
        f"{data.frontend_url}/watch.html"
        f"?id={data.activity_id}"
        f"&api={data.api_url}"
        f"&user={data.username}"
    )

    return ShareResponse(token=token, short_url=short_url, watch_url=watch_url)


@router.get("/{token}")
async def follow_share(token: str):
    """
    Redirige vers watch.html avec les bons paramètres.
    Ce lien court est celui envoyé par SMS.
    """
    entry = _store.get(token)

    if not entry:
        raise HTTPException(404, "Lien expiré ou invalide")

    # Vérifier expiration
    if time.time() - entry["created_at"] > _TTL:
        del _store[token]
        return HTMLResponse(
            """
        <!DOCTYPE html><html><head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Lien expiré</title>
          <style>
            body { font-family: sans-serif; text-align: center;
                   padding: 60px 20px; background: #080c10; color: #c8d8e8; }
            h1 { font-size: 48px; margin-bottom: 12px; }
            p  { color: #6a8099; }
          </style>
        </head><body>
          <h1>⏱</h1>
          <h2>Lien expiré</h2>
          <p>Ce lien de suivi n'est valable que 24 heures.</p>
        </body></html>
        """,
            status_code=410,
        )

    # Construire l'URL watch avec tous les paramètres
    from urllib.parse import quote

    watch_url = (
        f"{entry['frontend_url']}/watch.html"
        f"?id={entry['activity_id']}"
        f"&api={quote(entry['api_url'], safe='')}"
        f"&user={quote(entry['username'], safe='')}"
    )

    return RedirectResponse(url=watch_url, status_code=302)


@router.delete("/{token}")
async def delete_share(token: str):
    """Supprime un token (appelé quand la sortie est terminée)."""
    _store.pop(token, None)
    return {"deleted": True}
