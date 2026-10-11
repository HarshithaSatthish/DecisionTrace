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
    """Enqueue conversation processing task with JSON arguments."""
    try:
        q = get_queue()
        from app.workers.jobs import process_conversation_job

        job = q.enqueue(
            process_conversation_job,
            conversation_id_str,
            job_id_str,
            job_timeout=300,
            result_ttl=86400,
            failure_ttl=86400,
        )
        logger.info(f"Enqueued job {job.id} for conversation {conversation_id_str}")
        return job
    except Exception as e:
        logger.warning(f"Could not enqueue job to Redis: {e}")
        return None
