from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "LifeChain API"
    ENV: str = "development"
    DEBUG: bool = True

    # Security
    SECRET_KEY: str = "changeme"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
    JWT_ISSUER: str = "lifechain-api"
    JWT_AUDIENCE: str = "lifechain-clients"
    AUTH_COOKIE_SECURE: bool = False

    # CORS
    BACKEND_CORS_ORIGINS: list[str] = []

    # Database - Local PostgreSQL (must be set in .env file)
    DATABASE_URL: str  # Async connection URL (postgresql+asyncpg://...)
    DIRECT_DATABASE_URL: str  # Sync connection URL for Alembic migrations (postgresql+psycopg2://...)
    
    # AI/ML - Gemini API (must be set in .env file)
    GOOGLE_API_KEY: str
    
    # Translation - Groq API (must be set in .env file)
    GROQ_API_KEY: str

    # Roboflow Oral Cancer model
    ROBOFLOW_API_KEY: str = ""
    ROBOFLOW_ORAL_MODEL_ID: str = "oral-cancer-up2pr"
    ROBOFLOW_ORAL_MODEL_VERSION: str = "1"


@lru_cache
def get_settings() -> Settings:
    return Settings()

def clear_settings_cache():
    """Clear the settings cache - useful when .env file changes"""
    get_settings.cache_clear()

