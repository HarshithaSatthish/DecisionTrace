"""Repository layer for scoped queries and atomic operations."""

import uuid
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db.models import (
    AuditEvent,
    Conversation,
    OmiIntegration,
    User,
    utc_now,
)


def get_or_create_user(session: Session, clerk_id: str, email: str | None = None) -> User:
    """Find existing user by clerk_id or create a new user record.

    Uses a nested transaction (SAVEPOINT) to safely recover from concurrent
    creation races without leaving the session in a failed transaction state.
    """
    statement = select(User).where(User.clerk_id == clerk_id)
    user = session.exec(statement).first()
    if user:
        return user

    try:
        with session.begin_nested():
            user = User(clerk_id=clerk_id, email=email)
            session.add(user)
            session.flush()
        session.commit()
        session.refresh(user)
        return user
    except IntegrityError:
        # A concurrent request created the user first; query the committed record
        user = session.exec(statement).first()
        if user:
            return user
        # Re-raise if the error was not a recoverable conflict for this clerk_id
        raise


def get_integration_by_token_hash(session: Session, token_hash: str) -> OmiIntegration | None:
    """Find active Omi integration by hashed webhook token."""
    statement = select(OmiIntegration).where(
        OmiIntegration.webhook_token_hash == token_hash,
        OmiIntegration.is_active == True,
    )
    return session.exec(statement).first()


def get_conversation_by_source_id(
    session: Session, installation_id: uuid.UUID, source_event_id: str
) -> Conversation | None:
    """Deduplication check: find existing conversation by installation and source_event_id."""
    statement = select(Conversation).where(
        Conversation.installation_id == installation_id,
        Conversation.source_event_id == source_event_id,
    )
    return session.exec(statement).first()


def record_audit_event(
    session: Session,
    user_id: uuid.UUID,
    action: str,
    actor_type: str,
    actor_id: str,
    entity_type: str,
    entity_id: str,
    before_state: dict[str, Any] | None = None,
    after_state: dict[str, Any] | None = None,
) -> AuditEvent:
    """Append immutable audit log entry."""
    audit = AuditEvent(
        user_id=user_id,
        action=action,
        actor_type=actor_type,
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        before_state=before_state,
        after_state=after_state,
        timestamp=utc_now(),
    )
    session.add(audit)
    return audit
