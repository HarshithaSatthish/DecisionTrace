"""Omi Integrations Management API router."""

import secrets
from typing import Any

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.security import generate_webhook_token, hash_webhook_token, verify_clerk_token
from app.db.models import OmiIntegration, utc_now
from app.db.repository import get_or_create_user
from app.db.session import get_session

router = APIRouter(prefix="/integrations/omi", tags=["Integrations"])


class LinkOmiRequest(BaseModel):
    external_omi_uid: str | None = None


class LinkOmiResponse(BaseModel):
    installation_id: str
    webhook_token: str
    webhook_url: str
    message: str


class OmiStatusResponse(BaseModel):
    connected: bool
    installation_id: str | None = None
    external_omi_uid: str | None = None
    created_at: str | None = None
    webhook_url: str | None = None


@router.get("/status", response_model=OmiStatusResponse)
def get_omi_status(
    request: Request,
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> OmiStatusResponse:
    """Check Omi connection status for the authenticated user."""
    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    statement = select(OmiIntegration).where(
        OmiIntegration.user_id == user.id,
        OmiIntegration.is_active == True,
    )
    integration = session.exec(statement).first()

    if not integration:
        return OmiStatusResponse(connected=False)

    base_url = str(request.base_url).rstrip("/")
    return OmiStatusResponse(
        connected=True,
        installation_id=integration.installation_id,
        external_omi_uid=integration.external_omi_uid,
        created_at=integration.created_at.isoformat(),
        webhook_url=f"{base_url}/api/v1/webhooks/omi/REDACTED",
    )


@router.post("", response_model=LinkOmiResponse, status_code=status.HTTP_201_CREATED)
def link_omi_integration(
    payload: LinkOmiRequest,
    request: Request,
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> LinkOmiResponse:
    """Create or renew Omi integration token for authenticated user."""
    clerk_id = claims.get("sub", "")
    email = claims.get("email")
    user = get_or_create_user(session, clerk_id, email)

    raw_token = generate_webhook_token()
    token_hash = hash_webhook_token(raw_token)
    installation_id = f"inst_{secrets.token_hex(8)}"

    integration = OmiIntegration(
        user_id=user.id,
        external_omi_uid=payload.external_omi_uid,
        installation_id=installation_id,
        webhook_token_hash=token_hash,
        is_active=True,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    session.add(integration)
    session.commit()
    session.refresh(integration)

    base_url = str(request.base_url).rstrip("/")
    webhook_url = f"{base_url}/api/v1/webhooks/omi/{raw_token}"

    return LinkOmiResponse(
        installation_id=installation_id,
        webhook_token=raw_token,
        webhook_url=webhook_url,
        message="Configure this webhook URL in the Omi application developer settings.",
    )
