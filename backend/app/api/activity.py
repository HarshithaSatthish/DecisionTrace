"""Dashboard Overview, Audit Activity stream, and Job status API router."""

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, col, func, select

from app.core.security import verify_clerk_token
from app.db.models import (
    ApprovalRequest,
    AuditEvent,
    Conversation,
    Decision,
    Finding,
    ProcessingJob,
    Task,
    utc_now,
)
from app.db.repository import get_or_create_user
from app.db.session import get_session

router = APIRouter(tags=["Activity & Dashboard"])


class OverviewResponse(BaseModel):
    total_conversations: int
    active_decisions: int
    pending_approvals: int
    recent_findings: int
    system_status: str
    open_commitments: int
    overdue_commitments: int
    detected_conflicts: int


class AuditEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action: str
    actor_type: str
    actor_id: str
    entity_type: str
    entity_id: str
    before_state: dict[str, Any] | None = None
    after_state: dict[str, Any] | None = None
    timestamp: datetime


class ActivityResponse(BaseModel):
    items: list[AuditEventRead]
    total: int
    limit: int
    offset: int


class JobStatusResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    state: str
    attempt_count: int
    error: str | None = None
    milestones: list[dict[str, Any]]
    queued_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


@router.get("/overview", response_model=OverviewResponse)
def get_dashboard_overview(
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> OverviewResponse:
    """Dashboard statistics for Akshay's Next.js UI."""
    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    total_convs = session.exec(select(func.count(Conversation.id)).where(Conversation.user_id == user.id)).one()

    active_decs = session.exec(
        select(func.count(Decision.id)).where(
            Decision.user_id == user.id,
            Decision.state == "active",
        )
    ).one()

    pending_apps = session.exec(
        select(func.count(ApprovalRequest.id)).where(
            ApprovalRequest.user_id == user.id,
            ApprovalRequest.status == "pending",
        )
    ).one()

    recent_findings = session.exec(select(func.count(Finding.id)).where(Finding.user_id == user.id)).one()
    legacy_conditions = [
        Decision.user_id == user.id,
        Decision.state == "active",
        Decision.id.notin_(select(Task.decision_id).where(Task.decision_id.is_not(None))),
    ]
    legacy_open = session.exec(select(func.count(Decision.id)).where(*legacy_conditions)).one()
    legacy_overdue = session.exec(select(func.count(Decision.id)).where(*legacy_conditions, Decision.due_date < utc_now())).one()

    return OverviewResponse(
        total_conversations=total_convs,
        active_decisions=active_decs,
        pending_approvals=pending_apps,
        recent_findings=recent_findings,
        system_status="healthy",
        open_commitments=session.exec(
            select(func.count(Task.id)).where(Task.user_id == user.id, Task.status.notin_(["completed", "cancelled"]))
        ).one()
        + legacy_open,
        overdue_commitments=session.exec(
            select(func.count(Task.id)).where(
                Task.user_id == user.id, Task.status.notin_(["completed", "cancelled"]), Task.due_date < utc_now()
            )
        ).one()
        + legacy_overdue,
        detected_conflicts=session.exec(
            select(func.count(Finding.id)).where(
                Finding.user_id == user.id,
                Finding.status == "pending_approval",
                Finding.classification.in_(["possible_conflict", "superseding_change"]),
            )
        ).one(),
    )


@router.get("/activity", response_model=ActivityResponse)
def get_activity_stream(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> ActivityResponse:
    """Paginated immutable audit activity trail for current user."""
    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    total = session.exec(select(func.count(AuditEvent.id)).where(AuditEvent.user_id == user.id)).one()

    statement = (
        select(AuditEvent)
        .where(AuditEvent.user_id == user.id)
        .order_by(col(AuditEvent.timestamp).desc())
        .offset(offset)
        .limit(limit)
    )
    results = session.exec(statement).all()
    items = [AuditEventRead.model_validate(a) for a in results]

    return ActivityResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(
    job_id: uuid.UUID,
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> JobStatusResponse:
    """Fetch status and milestones for a background processing job."""
    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    job = session.get(ProcessingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Processing job not found")

    conv = session.get(Conversation, job.conversation_id)
    if not conv or conv.user_id != user.id:
        raise HTTPException(status_code=403, detail="Unauthorized access to job")

    return JobStatusResponse(
        id=job.id,
        conversation_id=job.conversation_id,
        state=job.state,
        attempt_count=job.attempt_count,
        error=job.error,
        milestones=job.milestones,
        queued_at=job.queued_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
    )
