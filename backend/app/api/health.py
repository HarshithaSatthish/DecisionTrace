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
    """Dependency readiness probe (Database, Redis, Qdrant)."""
    deps: dict[str, str] = {}
    is_healthy = True

    # 1. Database check
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

        r = redis.from_url(settings.REDIS_URL, socket_timeout=1.0)
        r.ping()
        deps["redis"] = "connected"
    except Exception as e:
        deps["redis"] = f"unreachable: {type(e).__name__}"
        # Redis unreachability in local dev is non-fatal for pure API readiness if falling back

    # 3. Qdrant check
    try:
        from qdrant_client import QdrantClient

        if settings.QDRANT_URL:
            qc = QdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY, timeout=1.0)
            qc.get_collections()
            deps["qdrant"] = "connected"
        else:
            deps["qdrant"] = "configured_local_memory"
    except Exception as e:
        deps["qdrant"] = f"unreachable: {type(e).__name__}"

    if not is_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if is_healthy else "degraded",
        "dependencies": deps,
        "timestamp": datetime.now(UTC).isoformat(),
    }
