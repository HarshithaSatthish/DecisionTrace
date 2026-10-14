"""Script to run the RQ background worker."""

import os
import platform
import sys

from rq import SimpleWorker, Worker
from rq.serializers import JSONSerializer

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.logging import setup_logging
from app.workers.queue import get_queue, get_redis_connection

if __name__ == "__main__":
    setup_logging()
    from urllib.parse import urlparse
    parsed = urlparse(settings.REDIS_URL)
    sanitized_redis = f"{parsed.scheme}://{parsed.hostname or 'localhost'}:{parsed.port or 6379}{parsed.path}"
    print(f"Connecting to Redis at {sanitized_redis}...")
    conn = get_redis_connection()
    q = get_queue()

    # Choose worker class based on operating system
    if platform.system() == "Windows":
        print("Windows OS detected: Using SimpleWorker (single process, no-fork execution)...")
        worker_cls = SimpleWorker
    else:
        print("Linux/Unix OS detected: Using standard RQ Worker...")
        worker_cls = Worker

    worker = worker_cls([q], connection=conn, serializer=JSONSerializer)
    print(f"DecisionTrace Worker listening on queue '{settings.RQ_QUEUE_NAME}'...")
    worker.work(with_scheduler=True)
