"""Conversations API router."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, col, func, select

from app.core.security import verify_clerk_token
from app.db.models import Conversation, ConversationChunk
from app.db.repository import get_or_create_user
from app.db.session import get_session
from app.schemas.conversation import ConversationChunkRead, ConversationDetailRead, ConversationRead

router = APIRouter(prefix="/conversations", tags=["Conversations"])


class ConversationListResponse(BaseModel):
    items: list[ConversationRead]
    total: int
    limit: int
    offset: int


@router.get("", response_model=ConversationListResponse)
def list_conversations(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> ConversationListResponse:
    """List paginated conversations for current authenticated user."""
    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    total = session.exec(
        select(func.count(Conversation.id)).where(Conversation.user_id == user.id)
    ).one()

    statement = (
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(col(Conversation.source_time).desc())
        .offset(offset)
        .limit(limit)
    )
    results = session.exec(statement).all()

    items = [
        ConversationRead(
            id=c.id,
            source_event_id=c.source_event_id,
            title=c.title,
            overview=c.overview,
            transcript_preview=c.normalized_transcript[:120] + "..."
            if len(c.normalized_transcript) > 120
            else c.normalized_transcript,
            source_time=c.source_time,
            created_at=c.received_time,
            status=c.status,
        )
        for c in results
    ]

    return ConversationListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{conversation_id}", response_model=ConversationDetailRead)
def get_conversation_detail(
    conversation_id: uuid.UUID,
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> ConversationDetailRead:
    """Get conversation detail including raw segments and chunk references."""
    clerk_id = claims.get("sub", "")
    user = get_or_create_user(session, clerk_id)

    conv = session.exec(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    ).first()

    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    chunks_db = session.exec(
        select(ConversationChunk).where(ConversationChunk.conversation_id == conv.id)
    ).all()

    chunks_read = [
        ConversationChunkRead(
            id=chk.id,
            excerpt=chk.excerpt,
            vector_point_id=chk.vector_point_id,
            source_time=chk.source_time,
        )
        for chk in chunks_db
    ]

    return ConversationDetailRead(
        id=conv.id,
        source_event_id=conv.source_event_id,
        title=conv.title,
        overview=conv.overview,
        normalized_transcript=conv.normalized_transcript,
        raw_segments=conv.raw_segments,
        chunks=chunks_read,
        status=conv.status,
        created_at=conv.received_time,
    )
