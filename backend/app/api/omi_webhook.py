"""Omi Webhook ingestion API router."""

from fastapi import APIRouter, Depends, Path, Response, status
from sqlmodel import Session

from app.db.session import get_session
from app.schemas.conversation import OmiMemoryCreatedWebhook, WebhookResponse
from app.services.omi import ingest_omi_memory

router = APIRouter(prefix="/webhooks/omi", tags=["Omi Webhook"])


@router.post(
    "/{opaque_token}",
    response_model=WebhookResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Secure Omi completed memory ingestion webhook",
)
def handle_omi_webhook(
    response: Response,
    payload: OmiMemoryCreatedWebhook,
    opaque_token: str = Path(..., description="Secret installation token"),
    session: Session = Depends(get_session),
) -> WebhookResponse:
    """Ingest Omi memory event with verification, durable deduplication, and outbox commit."""
    status_code, result = ingest_omi_memory(
        session=session,
        opaque_token=opaque_token,
        payload=payload,
        enqueue=True,
    )
    response.status_code = status_code
    return result
