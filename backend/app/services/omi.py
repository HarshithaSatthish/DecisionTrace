"""Omi Webhook ingestion and transactional outbox service."""

import logging

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.security import hash_webhook_token
from app.db.models import Conversation, ProcessingJob, utc_now
from app.db.repository import get_conversation_by_source_id, get_integration_by_token_hash
from app.schemas.conversation import OmiMemoryCreatedWebhook, WebhookResponse

logger = logging.getLogger(__name__)


def ingest_omi_memory(
    session: Session,
    opaque_token: str,
    payload: OmiMemoryCreatedWebhook,
    enqueue: bool = True,
) -> tuple[int, WebhookResponse]:
    """Ingest Omi memory event with verification, durable deduplication, and outbox enqueue."""
    # 1. Verify token
    token_hash = hash_webhook_token(opaque_token)
    integration = get_integration_by_token_hash(session, token_hash)
    if not integration:
        logger.warning("Rejected Omi webhook: invalid or inactive token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked Omi installation token",
        )

    # 2. Deduplication check by (installation_id, source_event_id) FIRST (idempotent for all retries)
    existing_conv = get_conversation_by_source_id(session, integration.id, payload.id)
    if existing_conv:
        logger.info(
            f"Duplicate Omi memory received: {payload.id} for installation {integration.id}"
        )
        return status.HTTP_200_OK, WebhookResponse(
            status="discarded" if existing_conv.status == "discarded" else "duplicate",
            conversation_id=existing_conv.id,
            message="Event already recorded, no duplicate work queued",
        )

    # 3. Handle discarded payload safely and idempotently
    if payload.discarded:
        logger.info(f"Omi memory {payload.id} marked discarded by client")
        conv = Conversation(
            user_id=integration.user_id,
            installation_id=integration.id,
            source_event_id=payload.id,
            title="Discarded Memory",
            normalized_transcript="",
            status="discarded",
            source_time=payload.finished_at or utc_now(),
            received_time=utc_now(),
        )
        session.add(conv)
        session.commit()
        return status.HTTP_200_OK, WebhookResponse(
            status="discarded",
            conversation_id=conv.id,
            message="Memory was discarded; recorded without queuing processing",
        )

    # 4. Normalize transcript and segments
    segment_texts = [seg.text.strip() for seg in payload.transcript_segments if seg.text.strip()]
    normalized_text = " ".join(segment_texts)

    title = payload.structured.title if payload.structured else None
    overview = payload.structured.overview if payload.structured else None

    if not normalized_text:
        # If no transcript segments, check if overview has content
        if overview:
            normalized_text = overview
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transcript segments are empty; no content to process",
            )

    source_time = payload.finished_at or payload.created_at or utc_now()
    now = utc_now()

    # 5. Outbox commit: create Conversation and ProcessingJob in 'received' state
    conv = Conversation(
        user_id=integration.user_id,
        installation_id=integration.id,
        source_event_id=payload.id,
        title=title or "Voice Memory",
        overview=overview,
        normalized_transcript=normalized_text,
        raw_segments=[seg.model_dump(mode="json") for seg in payload.transcript_segments],
        original_metadata=payload.model_dump(mode="json", exclude={"transcript_segments"}),
        source_time=source_time,
        received_time=now,
        status="received",
    )
    session.add(conv)
    session.flush()

    job = ProcessingJob(
        conversation_id=conv.id,
        state="received",
        attempt_count=0,
        queued_at=None,
        milestones=[
            {"state": "received", "timestamp": now.isoformat()},
            {"state": "saved", "timestamp": now.isoformat()},
        ],
    )
    session.add(job)
    session.commit()
    session.refresh(conv)
    session.refresh(job)

    # 6. Enqueue asynchronously to RQ if enabled
    # Only mark job queued in DB if Redis enqueue actually succeeds
    if enqueue:
        try:
            from app.workers.queue import enqueue_conversation_job

            rq_job = enqueue_conversation_job(str(conv.id), str(job.id))
            if rq_job:
                q_now = utc_now()
                job.state = "queued"
                job.queued_at = q_now
                job.rq_job_id = rq_job.id
                job.milestones.append({"state": "queued", "timestamp": q_now.isoformat()})
                conv.status = "queued"
                session.add(job)
                session.add(conv)
                session.commit()
            else:
                logger.warning(
                    f"Redis enqueue returned None for job {job.id}. Keeping state='received' with queued_at=None."
                )
        except Exception as e:
            logger.warning(f"Could not immediately enqueue to Redis: {e}. Reconciler will recover.")

    return status.HTTP_202_ACCEPTED, WebhookResponse(
        status="queued",
        conversation_id=conv.id,
        job_id=job.id,
        message="Memory received and queued for processing",
    )
