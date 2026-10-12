"""Infrastructure and Managed Service Connectivity Verification Script."""

import os
import sys
from datetime import datetime

from sqlalchemy import text

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.db.session import engine, init_db
from app.services.memory import ensure_collection_exists, generate_embeddings, get_qdrant_client
from app.workers.queue import get_queue, get_redis_connection


def check_database() -> dict:
    """Verify PostgreSQL (Neon) or SQLite database."""
    db_display = settings.DATABASE_URL.split("@")[-1] if "@" in settings.DATABASE_URL else settings.DATABASE_URL
    print(f"[1/4] Checking Database ({db_display})...")
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1")).scalar()
            init_db()
            table_count = conn.execute(
                text("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
                if not settings.DATABASE_URL.startswith("sqlite")
                else text("SELECT count(*) FROM sqlite_master WHERE type='table'")
            ).scalar()
        print(f"      Database CONNECTED (SELECT 1 returned {result}, {table_count} tables detected).")
        db_type = "postgresql" if "postgres" in settings.DATABASE_URL else "sqlite"
        return {"status": "connected", "type": db_type, "tables": table_count}
    except Exception as e:
        print(f"      Database ERROR: {e}")
        return {"status": "error", "error": str(e)}


def check_qdrant() -> dict:
    """Verify Qdrant Cloud or Local Vector Memory."""
    print(f"[2/4] Checking Qdrant Vector DB ({settings.QDRANT_URL or 'in-memory'})...")
    try:
        qc = get_qdrant_client()
        ensure_collection_exists(qc)
        collections = qc.get_collections().collections
        names = [c.name for c in collections]
        print(f"      Qdrant CONNECTED. Collections: {names}")
        return {"status": "connected", "collections": names}
    except Exception as e:
        print(f"      Qdrant ERROR: {e}")
        return {"status": "error", "error": str(e)}


def check_fastembed() -> dict:
    """Verify FastEmbed model and 384-dimensional dense vectors."""
    print(f"[3/4] Checking FastEmbed ({settings.EMBEDDING_MODEL})...")
    try:
        t0 = datetime.now()
        vectors = generate_embeddings(["DecisionTrace test embedding"])
        dim = len(vectors[0])
        dur = (datetime.now() - t0).total_seconds()
        print(f"      FastEmbed VERIFIED. Vector dimension: {dim} (generated in {dur:.2f}s).")
        return {"status": "verified", "dimension": dim, "duration_seconds": dur}
    except Exception as e:
        print(f"      FastEmbed ERROR: {e}")
        return {"status": "error", "error": str(e)}


def check_redis_rq() -> dict:
    """Verify Redis connection and RQ Queue."""
    from urllib.parse import urlparse
    parsed_r = urlparse(settings.REDIS_URL)
    sanitized_r = f"{parsed_r.scheme}://{parsed_r.hostname or 'localhost'}:{parsed_r.port or 6379}{parsed_r.path}"
    print(f"[4/4] Checking Redis / RQ ({sanitized_r})...")
    try:
        conn = get_redis_connection()
        conn.ping()
        q = get_queue()
        job_count = len(q)
        print(f"      Redis CONNECTED. Queue '{settings.RQ_QUEUE_NAME}' ready (current jobs: {job_count}).")
        return {"status": "connected", "queue": settings.RQ_QUEUE_NAME, "pending_jobs": job_count}
    except Exception as e:
        print(f"      Redis UNREACHABLE (local dev fallback active): {type(e).__name__}")
        return {"status": "unreachable", "error": str(e)}


def main():
    print("=" * 60)
    print("DecisionTrace Backend Infrastructure Verification")
    print(f"Environment: {settings.APP_ENV}")
    print("=" * 60)

    db_res = check_database()
    qd_res = check_qdrant()
    fe_res = check_fastembed()
    rd_res = check_redis_rq()

    print("=" * 60)
    print("Summary:")
    print(f"  Database : {db_res.get('status')}")
    print(f"  Qdrant   : {qd_res.get('status')}")
    print(f"  FastEmbed: {fe_res.get('status')}")
    print(f"  Redis/RQ : {rd_res.get('status')}")
    print("=" * 60)


if __name__ == "__main__":
    main()
