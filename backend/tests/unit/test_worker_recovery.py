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
