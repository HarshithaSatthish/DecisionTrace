"""Unit tests for worker restart, outbox reconciliation, and recovery behavior."""

import uuid

from sqlmodel import Session, select

from app.db.models import Conversation, OmiIntegration, ProcessingJob, User, utc_now
from app.workers.reconcile import reconcile_pending_jobs


def test_reconcile_picks_up_stuck_or_unprocessed_jobs(db_session: Session, test_user: User):
    # Create integration
    integration = OmiIntegration(
        user_id=test_user.id,
        installation_id="inst_rec_test",
        webhook_token_hash="hash_rec",
        is_active=True,
    )
    db_session.add(integration)
    db_session.commit()
    db_session.refresh(integration)

    # Create conversation
    conv = Conversation(
        user_id=test_user.id,
        installation_id=integration.id,
        source_event_id="omi_evt_rec_01",
        normalized_transcript="Discussed server recovery procedures.",
        source_time=utc_now(),
        received_time=utc_now(),
    )
    db_session.add(conv)
    db_session.commit()
    db_session.refresh(conv)

    # Simulate stranded job after abrupt process death
    stranded_job = ProcessingJob(
        conversation_id=conv.id,
        state="received",
        attempt_count=0,
        queued_at=None,
    )
    db_session.add(stranded_job)
    db_session.commit()
    db_session.refresh(stranded_job)

    # Execute reconciliation with injected session
    reconciled = reconcile_pending_jobs(batch_size=10, db_session=db_session)
    assert reconciled >= 1

    # Reload job
    reloaded = db_session.exec(
        select(ProcessingJob).where(ProcessingJob.id == stranded_job.id)
    ).first()
    assert reloaded is not None
    assert reloaded.state == "queued"


def test_poison_pill_job_not_re_enqueued(db_session: Session, test_user: User):
    # Create integration and conversation
    integration = OmiIntegration(
        user_id=test_user.id,
        installation_id="inst_poison_test",
        webhook_token_hash="hash_poison",
        is_active=True,
    )
    db_session.add(integration)
    db_session.commit()
    db_session.refresh(integration)

    conv = Conversation(
        user_id=test_user.id,
        installation_id=integration.id,
        source_event_id="omi_evt_poison",
        normalized_transcript="Malformed transcript.",
        source_time=utc_now(),
        received_time=utc_now(),
    )
    db_session.add(conv)
    db_session.commit()
    db_session.refresh(conv)

    # Job that failed 3 times
    failed_job = ProcessingJob(
        conversation_id=conv.id,
        state="retrying",
        attempt_count=3,
        error="Crash on line 12",
    )
    db_session.add(failed_job)
    db_session.commit()
    db_session.refresh(failed_job)

    # Reconciliation must NOT pick up poison pill jobs with attempt_count >= 3
    reconciled = reconcile_pending_jobs(batch_size=10, db_session=db_session)
    assert reconciled == 0


def test_completed_job_not_re_enqueued(db_session: Session, test_user: User):
    integration = OmiIntegration(
        user_id=test_user.id,
        installation_id="inst_comp_test",
        webhook_token_hash="hash_comp",
        is_active=True,
    )
    db_session.add(integration)
    db_session.commit()
    db_session.refresh(integration)

    conv = Conversation(
        user_id=test_user.id,
        installation_id=integration.id,
        source_event_id="omi_evt_comp",
        normalized_transcript="Everything finished.",
        source_time=utc_now(),
        received_time=utc_now(),
    )
    db_session.add(conv)
    db_session.commit()
    db_session.refresh(conv)

    completed_job = ProcessingJob(
        conversation_id=conv.id,
        state="completed",
        attempt_count=1,
    )
    db_session.add(completed_job)
    db_session.commit()

    reconciled = reconcile_pending_jobs(batch_size=10, db_session=db_session)
    assert reconciled == 0


def test_persisted_conversation_survives_restart(db_session: Session, test_user: User):
    integration = OmiIntegration(
        user_id=test_user.id,
        installation_id="inst_surv_test",
        webhook_token_hash="hash_surv",
        is_active=True,
    )
    db_session.add(integration)
    db_session.commit()
    db_session.refresh(integration)

    conv_id = uuid.uuid4()
    conv = Conversation(
        id=conv_id,
        user_id=test_user.id,
        installation_id=integration.id,
        source_event_id="omi_evt_survive_test",
        normalized_transcript="Test persistence across connection resets.",
        source_time=utc_now(),
        received_time=utc_now(),
    )
    db_session.add(conv)
    db_session.commit()

    # Query from a separate fresh session instance on the connection to verify persistence
    with Session(bind=db_session.connection()) as fresh_session:
        fetched = fresh_session.exec(
            select(Conversation).where(Conversation.id == conv_id)
        ).first()
        assert fetched is not None
        assert fetched.id == conv_id


def test_interrupted_running_job_recovered_by_reconciler(db_session: Session, test_user: User):
    """Ensure running jobs that were interrupted when a worker died (> 5 min ago) are requeued safely."""
    from datetime import timedelta
    
    integration = OmiIntegration(
        user_id=test_user.id,
        installation_id="inst_interrupted_test",
        webhook_token_hash="hash_interrupted",
        is_active=True,
    )
    db_session.add(integration)
    db_session.commit()
    db_session.refresh(integration)

    conv = Conversation(
        user_id=test_user.id,
        installation_id=integration.id,
        source_event_id="omi_evt_interrupted",
        normalized_transcript="Interrupted meeting transcript.",
        source_time=utc_now(),
        received_time=utc_now(),
    )
    db_session.add(conv)
    db_session.commit()
    db_session.refresh(conv)

    # Job that was running when process crashed 10 minutes ago
    ten_min_ago = utc_now() - timedelta(minutes=10)
    interrupted_job = ProcessingJob(
        conversation_id=conv.id,
        state="running",
        attempt_count=1,
        started_at=ten_min_ago,
        queued_at=ten_min_ago,
    )
    db_session.add(interrupted_job)
    db_session.commit()
    db_session.refresh(interrupted_job)

    reconciled = reconcile_pending_jobs(batch_size=10, db_session=db_session)
    assert reconciled >= 1

    db_session.refresh(interrupted_job)
    assert interrupted_job.state == "queued"
    assert interrupted_job.queued_at is not None


def test_job_pipeline_propagates_failure_to_rq(db_session: Session, test_user: User, monkeypatch):
    """Ensure pipeline failures re-raise exceptions so RQ marks job failed instead of silently succeeding."""
    import pytest
    from app.workers import jobs as worker_jobs
    from app.services.retrieval import RetrievalError

    integration = OmiIntegration(
        user_id=test_user.id,
        installation_id="inst_fail_test",
        webhook_token_hash="hash_fail",
        is_active=True,
    )
    db_session.add(integration)
    db_session.commit()
    db_session.refresh(integration)

    conv = Conversation(
        user_id=test_user.id,
        installation_id=integration.id,
        source_event_id="omi_evt_fail",
        normalized_transcript="Meeting discussing database scaling.",
        source_time=utc_now(),
        received_time=utc_now(),
    )
    db_session.add(conv)
    db_session.commit()
    db_session.refresh(conv)

    job = ProcessingJob(
        conversation_id=conv.id,
        state="queued",
        attempt_count=0,
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    # Mock retrieval service to simulate upstream Qdrant/vector failure
    def mock_failing_retrieval(*args, **kwargs):
        raise RetrievalError("Simulated Qdrant cluster partition")

    monkeypatch.setattr(worker_jobs, "retrieve_prior_evidence", mock_failing_retrieval)

    # When an error occurs, process_conversation_job must re-raise so RQ records job failure
    with pytest.raises(RetrievalError, match="Simulated Qdrant cluster partition"):
        worker_jobs.process_conversation_job(
            conversation_id_str=str(conv.id),
            job_id_str=str(job.id),
            db_session=db_session,
        )

    # Database state must accurately reflect failure / retry attempt with error message
    db_session.refresh(job)
    assert job.attempt_count == 1
    assert job.state == "retrying"
    assert "Simulated Qdrant cluster partition" in job.error
