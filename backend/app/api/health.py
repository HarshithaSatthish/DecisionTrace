"""Health and Readiness endpoints."""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine

router = APIRouter(tags=["Health"])


@router.get("/health")
def get_health() -> dict[str, Any]:
    """Process liveness probe."""
    return {
        "status": "healthy",
        "version": settings.VERSION,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("/ready")
def get_readiness(response: Response) -> dict[str, Any]:
    """Dependency readiness probe (Database, Redis, Qdrant).

    In production (APP_ENV=production), PostgreSQL, Redis, and Qdrant are required.
    Any required dependency failure returns HTTP 503 Service Unavailable.
    """
    deps: dict[str, str] = {}
    is_healthy = True
    is_prod = settings.APP_ENV.lower() == "production"

    # 1. Database check (always required)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        deps["database"] = "connected"
    except Exception as e:
        deps["database"] = f"unhealthy: {type(e).__name__}"
        is_healthy = False

    # 2. Redis check
    try:
        import redis

        if settings.REDIS_URL:
            r = redis.from_url(settings.REDIS_URL, socket_connect_timeout=0.2, socket_timeout=0.2)
            r.ping()
            deps["redis"] = "connected"
        else:
            deps["redis"] = "not_configured"
            if is_prod:
                is_healthy = False
    except Exception as e:
        deps["redis"] = f"unreachable: {type(e).__name__}"
        if is_prod:
            is_healthy = False

    # 3. Qdrant check
    try:
        from qdrant_client import QdrantClient

        if settings.QDRANT_URL and not settings.QDRANT_URL.startswith("memory"):
            qc = QdrantClient(
                url=settings.QDRANT_URL,
                api_key=settings.QDRANT_API_KEY,
                timeout=0.5,
                check_compatibility=False,
            )
            qc.get_collections()
            deps["qdrant"] = "connected"
        else:
            deps["qdrant"] = "configured_local_memory"
            if is_prod:
                deps["qdrant"] = "unhealthy: memory_not_allowed_in_production"
                is_healthy = False
    except Exception as e:
        deps["qdrant"] = f"unreachable: {type(e).__name__}"
        if is_prod:
            is_healthy = False

    if not is_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if is_healthy else "degraded",
        "dependencies": deps,
        "timestamp": datetime.now(UTC).isoformat(),
    }
