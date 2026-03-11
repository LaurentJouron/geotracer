from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "GeoTracer"
    database_url: str = (
        "postgresql+asyncpg://velo:velopassword@localhost/velotracker"
    )
    redis_url: str = "redis://localhost:6379"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 jours

    class Config:
        env_file = ".env"


settings = Settings()
