"""RQ Queue initialization and configuration with JSON serialization."""

import logging

from redis import Redis
from rq import Queue
from rq.serializers import JSONSerializer

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_conn: Redis | None = None
_rq_queue: Queue | None = None


def get_redis_connection() -> Redis:
    """Get or initialize Redis connection."""
    global _redis_conn
    if _redis_conn is None:
        _redis_conn = Redis.from_url(settings.REDIS_URL, socket_timeout=5.0)
    return _redis_conn


def get_queue() -> Queue:
    """Get RQ Queue with JSONSerializer."""
    global _rq_queue
    if _rq_queue is None:
        conn = get_redis_connection()
        _rq_queue = Queue(
            name=settings.RQ_QUEUE_NAME,
            connection=conn,
            serializer=JSONSerializer,
            default_timeout=300,
        )
    return _rq_queue


def enqueue_conversation_job(conversation_id_str: str, job_id_str: str):
    """Enqueue conversation processing task with deterministic ID and deduplication guard."""
    try:
        q = get_queue()
        from rq.job import Job
        from app.workers.jobs import process_conversation_job

        job_rq_id = f"job_{job_id_str}"
        # Deduplication check: if job is already queued or active in RQ, return existing job without creating duplicate
        try:
            existing_job = Job.fetch(job_rq_id, connection=q.connection)
            if existing_job and existing_job.get_status() in ["queued", "started", "deferred"]:
                logger.info(f"RQ Job {job_rq_id} already active with status '{existing_job.get_status()}'. Avoiding duplicate enqueue.")
                return existing_job
        except Exception:
            pass  # Job not found in Redis, safe to enqueue

        job = q.enqueue(
            process_conversation_job,
            conversation_id_str,
            job_id_str,
            job_id=job_rq_id,
            job_timeout=300,
            result_ttl=86400,
            failure_ttl=86400,
        )
        logger.info(f"Enqueued job {job.id} for conversation {conversation_id_str}")
        return job
    except Exception as e:
        logger.warning(f"Could not enqueue job to Redis: {e}")
        return None
