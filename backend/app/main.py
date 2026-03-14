from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.routers import activities, tracking, shares, auth, users, cheers
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup : initialiser la DB
    from app.database import init_db

    await init_db()
    yield
    # Shutdown (rien à faire pour l'instant)


app = FastAPI(
    title=settings.app_name,
    description="API de suivi GPS pour sorties vélo",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — autoriser le frontend (PWA mobile, dashboard web)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restreindre en production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(activities.router)
app.include_router(tracking.router)
app.include_router(cheers.router)
app.include_router(shares.router)
app.include_router(auth.router)
app.include_router(users.router)


@app.get("/")
async def root():
    return {
        "app": settings.app_name,
        "docs": "/docs",
        "status": "running 🚴",
    }
