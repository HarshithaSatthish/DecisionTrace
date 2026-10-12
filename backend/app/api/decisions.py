"""Decisions & Commitments API router."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, col, func, select

from app.core.security import verify_clerk_token
from app.db.models import Decision, DecisionEvidence
from app.db.repository import get_or_create_user
from app.db.session import get_session
from app.schemas.decision import DecisionDetailRead, DecisionListResponse, DecisionRead

router = APIRouter(prefix="/decisions", tags=["Decisions"])


@router.get("", response_model=DecisionListResponse)
def list_decisions(
    status: str | None = Query(default=None, description="Filter by status e.g. active"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> DecisionListResponse:
    """List tracked decisions for current authenticated user."""
    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    query = select(Decision).where(Decision.user_id == user.id)
    if status:
        query = query.where(Decision.state == status)

    count_query = select(func.count(Decision.id)).where(Decision.user_id == user.id)
    if status:
        count_query = count_query.where(Decision.state == status)

    total = session.exec(count_query).one()
    results = session.exec(
        query.order_by(col(Decision.updated_at).desc()).offset(offset).limit(limit)
    ).all()

    items = [DecisionRead.model_validate(d) for d in results]
    return DecisionListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{decision_id}", response_model=DecisionDetailRead)
def get_decision_detail(
    decision_id: uuid.UUID,
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> DecisionDetailRead:
    """Get decision details including evidence chunk links (eager relationship load)."""
    from sqlalchemy.orm import selectinload

    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    decision = session.exec(
        select(Decision)
        .options(selectinload(Decision.evidence))
        .where(Decision.id == decision_id, Decision.user_id == user.id)
    ).first()

    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    evidence_chunk_ids = [e.chunk_id for e in decision.evidence]

    return DecisionDetailRead(
        id=decision.id,
        topic=decision.topic,
        current_commitment=decision.current_commitment,
        owner=decision.owner,
        due_date=decision.due_date,
        state=decision.state,
        version=decision.version,
        source_provenance=decision.source_provenance,
        evidence_chunk_ids=evidence_chunk_ids,
        created_at=decision.created_at,
        updated_at=decision.updated_at,
    )
