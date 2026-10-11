"""Reconciliation service for interrupted, pending, or failed outbox jobs."""

import logging
from datetime import timedelta

from sqlmodel import Session, select

from app.db.models import ProcessingJob, utc_now
from app.db.session import get_session_context
from app.workers.queue import enqueue_conversation_job

logger = logging.getLogger(__name__)


def reconcile_pending_jobs(batch_size: int = 50, db_session: Session | None = None) -> int:
    """Find orphan or stuck jobs and re-enqueue them safely."""
    stuck_threshold = utc_now() - timedelta(minutes=5)

    def _execute_reconcile(session: Session) -> int:
        reconciled_count = 0
        statement = (
            select(ProcessingJob)
            .where(
                ProcessingJob.state.in_(["received", "queued", "retrying"]),
                ProcessingJob.attempt_count < 3,
                (ProcessingJob.queued_at == None) | (ProcessingJob.queued_at <= stuck_threshold),  # noqa: E711
            )
            .limit(batch_size)
        )

        pending_jobs = session.exec(statement).all()
        for job in pending_jobs:
            logger.info(f"Reconciling job {job.id} for conversation {job.conversation_id}")
            rq_job = enqueue_conversation_job(str(job.conversation_id), str(job.id))
            job.state = "queued"
            if rq_job:
                job.rq_job_id = rq_job.id
            session.add(job)
            reconciled_count += 1

        session.commit()
        logger.info(f"Reconciled {reconciled_count} orphan jobs")
        return reconciled_count

    if db_session is not None:
        return _execute_reconcile(db_session)

    with get_session_context() as session:
        return _execute_reconcile(session)
