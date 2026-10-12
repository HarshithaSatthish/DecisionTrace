"""Reconciliation service for interrupted, pending, or failed outbox jobs."""

import logging
from datetime import timedelta

from sqlmodel import Session, or_, select

from app.db.models import ProcessingJob, utc_now
from app.db.session import get_session_context
from app.workers.queue import enqueue_conversation_job

logger = logging.getLogger(__name__)


def reconcile_pending_jobs(batch_size: int = 50, db_session: Session | None = None) -> int:
    """Find orphan or interrupted jobs and re-enqueue them safely without duplicates.
    
    Recovers:
    1. Orphaned jobs (received, queued, retrying) never queued or queued > 5 min ago with attempt_count < 3.
    2. Interrupted jobs (running) whose worker crashed or was killed (started > 5 min ago) with attempt_count < 3.
    """
    stuck_threshold = utc_now() - timedelta(minutes=5)

    def _execute_reconcile(session: Session) -> int:
        reconciled_count = 0
        is_orphaned = ProcessingJob.state.in_(["received", "queued", "retrying"]) & (
            (ProcessingJob.queued_at == None) | (ProcessingJob.queued_at <= stuck_threshold)  # noqa: E711
        )
        is_interrupted = (ProcessingJob.state == "running") & (
            (ProcessingJob.started_at != None) & (ProcessingJob.started_at <= stuck_threshold)  # noqa: E711
        )

        statement = (
            select(ProcessingJob)
            .where(
                ProcessingJob.attempt_count < 3,
                or_(is_orphaned, is_interrupted),
            )
            .limit(batch_size)
        )

        pending_jobs = session.exec(statement).all()
        now = utc_now()
        for job in pending_jobs:
            logger.info(
                f"Reconciling job {job.id} (previous_state={job.state}) for conversation {job.conversation_id}"
            )
            rq_job = enqueue_conversation_job(str(job.conversation_id), str(job.id))
            # Never mark a job queued or refresh queued_at when Redis enqueue fails
            if rq_job is not None:
                job.state = "queued"
                job.queued_at = now
                job.rq_job_id = rq_job.id
                session.add(job)
                reconciled_count += 1
            else:
                logger.warning(
                    f"Redis enqueue failed during reconcile for job {job.id}; keeping state='{job.state}' without refreshing queued_at"
                )

        session.commit()
        logger.info(f"Reconciled {reconciled_count} orphan/interrupted jobs")
        return reconciled_count

    if db_session is not None:
        return _execute_reconcile(db_session)

    with get_session_context() as session:
        return _execute_reconcile(session)
