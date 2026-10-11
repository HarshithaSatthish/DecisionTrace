"""Findings & Agent Detections API router."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, col, func, select

from app.core.security import verify_clerk_token
from app.db.models import ConversationChunk, DecisionEvidence, Finding
from app.db.repository import get_or_create_user
from app.db.session import get_session
from app.schemas.finding import EvidenceItem, FindingListResponse, FindingRead

router = APIRouter(prefix="/findings", tags=["Findings"])


@router.get("", response_model=FindingListResponse)
def list_findings(
    status: str | None = Query(default=None, description="Filter by status e.g. pending_approval"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> FindingListResponse:
    """List agent findings for the current authenticated user."""
    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    query = select(Finding).where(Finding.user_id == user.id)
    if status:
        query = query.where(Finding.status == status)

    count_query = select(func.count(Finding.id)).where(Finding.user_id == user.id)
    if status:
        count_query = count_query.where(Finding.status == status)

    total = session.exec(count_query).one()
    results = session.exec(
        query.order_by(col(Finding.created_at).desc()).offset(offset).limit(limit)
    ).all()

    items: list[FindingRead] = []
    for f in results:
        # Load evidence links
        ev_records = session.exec(
            select(DecisionEvidence).where(DecisionEvidence.finding_id == f.id)
        ).all()

        evidence_items: list[EvidenceItem] = []
        for ev in ev_records:
            chunk = session.get(ConversationChunk, ev.chunk_id)
            if chunk:
                evidence_items.append(
                    EvidenceItem(
                        chunk_id=chunk.id,
                        excerpt=chunk.excerpt,
                        conversation_id=chunk.conversation_id,
                        source_time=chunk.source_time,
                    )
                )

        items.append(
            FindingRead(
                id=f.id,
                conversation_id=f.conversation_id,
                classification=f.classification,
                topic_key=f.topic_key,
                previous_value=f.previous_value,
                new_value=f.new_value,
                explanation=f.explanation,
                confidence=f.confidence,
                status=f.status,
                evidence=evidence_items,
                created_at=f.created_at,
            )
        )

    return FindingListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{finding_id}", response_model=FindingRead)
def get_finding_detail(
    finding_id: uuid.UUID,
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> FindingRead:
    """Get finding detail and linked evidence chunks."""
    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    f = session.exec(
        select(Finding).where(Finding.id == finding_id, Finding.user_id == user.id)
    ).first()

    if not f:
        raise HTTPException(status_code=404, detail="Finding not found")

    ev_records = session.exec(
        select(DecisionEvidence).where(DecisionEvidence.finding_id == f.id)
    ).all()

    evidence_items: list[EvidenceItem] = []
    for ev in ev_records:
        chunk = session.get(ConversationChunk, ev.chunk_id)
        if chunk:
            evidence_items.append(
                EvidenceItem(
                    chunk_id=chunk.id,
                    excerpt=chunk.excerpt,
                    conversation_id=chunk.conversation_id,
                    source_time=chunk.source_time,
                )
            )

    return FindingRead(
        id=f.id,
        conversation_id=f.conversation_id,
        classification=f.classification,
        topic_key=f.topic_key,
        previous_value=f.previous_value,
        new_value=f.new_value,
        explanation=f.explanation,
        confidence=f.confidence,
        status=f.status,
        evidence=evidence_items,
        created_at=f.created_at,
    )
