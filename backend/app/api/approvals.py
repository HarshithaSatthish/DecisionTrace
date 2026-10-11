"""Human Approvals API router."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, col, func, select

from app.core.security import verify_clerk_token
from app.db.models import ApprovalRequest
from app.db.repository import get_or_create_user
from app.db.session import get_session
from app.schemas.approval import (
    ApprovalExecutionResponse,
    ApprovalListResponse,
    ApprovalRequestRead,
    ApproveActionRequest,
    ClarifyActionRequest,
    RejectActionRequest,
)
from app.services.approval import ApprovalService

router = APIRouter(prefix="/approvals", tags=["Approvals"])


@router.get("", response_model=ApprovalListResponse)
def list_approvals(
    status: str | None = Query(default=None, description="Filter by status e.g. pending"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> ApprovalListResponse:
    """List approval requests for current user."""
    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    query = select(ApprovalRequest).where(ApprovalRequest.user_id == user.id)
    if status:
        query = query.where(ApprovalRequest.status == status)

    count_query = select(func.count(ApprovalRequest.id)).where(ApprovalRequest.user_id == user.id)
    if status:
        count_query = count_query.where(ApprovalRequest.status == status)

    total = session.exec(count_query).one()
    results = session.exec(
        query.order_by(col(ApprovalRequest.created_at).desc()).offset(offset).limit(limit)
    ).all()

    items = [ApprovalRequestRead.model_validate(r) for r in results]
    return ApprovalListResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("/{approval_id}/approve", response_model=ApprovalExecutionResponse)
def approve_request(
    approval_id: uuid.UUID,
    payload: ApproveActionRequest,
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> ApprovalExecutionResponse:
    """Human approval: executes atomic DB update with one-time execution key."""
    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    return ApprovalService.approve(
        session=session,
        user_id=user.id,
        approval_id=approval_id,
        execution_key=payload.execution_key,
        note=payload.note,
        approver_clerk_id=clerk_id,
    )


@router.post("/{approval_id}/reject", response_model=ApprovalExecutionResponse)
def reject_request(
    approval_id: uuid.UUID,
    payload: RejectActionRequest,
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> ApprovalExecutionResponse:
    """Human rejection: keeps decision untouched and logs audit trail."""
    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    return ApprovalService.reject(
        session=session,
        user_id=user.id,
        approval_id=approval_id,
        reason=payload.reason,
        approver_clerk_id=clerk_id,
    )


@router.post("/{approval_id}/clarify", response_model=ApprovalExecutionResponse)
def clarify_request(
    approval_id: uuid.UUID,
    payload: ClarifyActionRequest,
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> ApprovalExecutionResponse:
    """Human clarification request: flags finding for further conversation."""
    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    return ApprovalService.clarify(
        session=session,
        user_id=user.id,
        approval_id=approval_id,
        clarification_request=payload.clarification_request,
        approver_clerk_id=clerk_id,
    )
