"""
Configuration pytest — base de données SQLite en mémoire.
Pas besoin de PostgreSQL ni Redis pour les tests CI/CD.
"""

import os
import sys
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from unittest.mock import AsyncMock, patch

# ── Forcer les variables d'env AVANT tout import de l'app ─────────────────
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["REDIS_URL"] = "redis://localhost:6379"
os.environ["SECRET_KEY"] = "test-secret-key-for-ci"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Base de données SQLite en mémoire ─────────────────────────────────────
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

TestSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def override_get_db():
    async with TestSessionLocal() as session:
        yield session


mock_redis_instance = AsyncMock(
    publish=AsyncMock(),
    setex=AsyncMock(),
    get=AsyncMock(return_value=None),
    keys=AsyncMock(return_value=[]),
    aclose=AsyncMock(),
)


@pytest_asyncio.fixture(scope="session")
async def app():
    with patch("redis.asyncio.from_url", return_value=mock_redis_instance):
        from main import app as fastapi_app
        from backend.app.database import Base, get_db

        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        fastapi_app.dependency_overrides[get_db] = override_get_db
        yield fastapi_app

        fastapi_app.dependency_overrides.clear()
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client(app):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


@pytest_asyncio.fixture
async def auth_client(client):
    await client.post(
        "/auth/register",
        json={
            "username": "testuser",
            "email": "test@geographix.dev",
            "password": "testpassword123",
        },
    )
    response = await client.post(
        "/auth/login",
        data={
            "username": "testuser",
            "password": "testpassword123",
        },
    )
    token = response.json()["access_token"]
    user_id = response.json()["user_id"]

    client.headers.update({"Authorization": f"Bearer {token}"})
    client.user_id = user_id
    return client


@pytest_asyncio.fixture
async def activity(auth_client):
    response = await auth_client.post(
        "/activities/",
        json={
            "user_id": auth_client.user_id,
            "title": "Sortie test",
        },
    )
    return response.json()
