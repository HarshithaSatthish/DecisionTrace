"""Application configuration using Pydantic Settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    APP_NAME: str = "DecisionTrace Backend"
    APP_ENV: str = "development"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    LOG_LEVEL: str = "INFO"

    # Database
    DATABASE_URL: str = "sqlite:///./decisiontrace.db"

    # Redis / RQ
    REDIS_URL: str = "redis://localhost:6379/0"
    RQ_QUEUE_NAME: str = "decisiontrace_processing"

    # Qdrant & Embeddings
    QDRANT_URL: str | None = "http://localhost:6333"
    QDRANT_API_KEY: str | None = None
    QDRANT_COLLECTION: str = "conversation_chunks_v1"
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_DIMENSION: int = 384

    # Clerk Authentication
    CLERK_ISSUER: str | None = None
    CLERK_JWKS_URL: str | None = None
    CLERK_AUTHORIZED_PARTIES: str | None = None
    CLERK_AUDIENCE: str | None = None
    AUTH_DEV_MODE: bool = False  # Allows mock header in testing/dev

    # Lyzr Integration
    LYZR_API_KEY: str | None = None
    LYZR_BASE_URL: str = "https://agent.api.lyzr.app/v2"
    LYZR_MANAGER_AGENT_ID: str | None = None

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        if not self.CORS_ORIGINS:
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def authorized_parties_list(self) -> list[str]:
        if not self.CLERK_AUTHORIZED_PARTIES:
            return []
        return [
            party.strip() for party in self.CLERK_AUTHORIZED_PARTIES.split(",") if party.strip()
        ]


settings = Settings()
