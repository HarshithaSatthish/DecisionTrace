"""Owned tasks: explicit human status changes, due dates, and audit records."""

import uuid
from datetime import UTC, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.security import verify_clerk_token
from app.db.models import Decision, Task, utc_now
from app.db.repository import get_or_create_user, record_audit_event
from app.db.session import get_session

router = APIRouter(prefix="/commitments", tags=["Commitments"])


class StatusChange(BaseModel):
    status: Literal["backlog", "in_progress", "blocked", "completed"]


def task_read(task: Task) -> dict[str, Any]:
    due = task.due_date.replace(tzinfo=UTC) if task.due_date and not task.due_date.tzinfo else task.due_date
    updated = task.updated_at.replace(tzinfo=UTC) if not task.updated_at.tzinfo else task.updated_at
    return {
        "id": str(task.id),
        "title": task.title,
        "task": task.description or task.title,
        "owner": task.owner,
        "due_date": due.isoformat() if due else None,
        "status": "backlog" if task.status == "pending" else task.status,
        "decision_id": str(task.decision_id) if task.decision_id else None,
        "overdue": bool(due and due < utc_now() and task.status not in ("completed", "cancelled")),
        "readOnly": False,
        # ponytail: Seven days without progress flags potentially forgotten work; use team-specific cadence when needed.
        "needsFollowUp": task.status not in ("completed", "cancelled") and updated < utc_now() - timedelta(days=7),
    }


@router.get("")
def list_commitments(
    claims: dict[str, Any] = Depends(verify_clerk_token), session: Session = Depends(get_session)
) -> dict[str, Any]:
    user = get_or_create_user(session, claims["sub"])
    tasks = session.exec(select(Task).where(Task.user_id == user.id, Task.status != "cancelled")).all()
    items = [task_read(task) for task in tasks]
    linked = {task.decision_id for task in tasks}
    # Legacy authoritative commitments remain visible; their content changes require an approval.
    for decision in session.exec(select(Decision).where(Decision.user_id == user.id)).all():
        if decision.id not in linked:
            due = decision.due_date
            if due and not due.tzinfo:
                due = due.replace(tzinfo=UTC)
            items.append(
                {
                    "id": str(decision.id),
                    "topic": decision.topic,
                    "current_commitment": decision.current_commitment,
                    "owner": decision.owner,
                    "due_date": due.isoformat() if due else None,
                    "state": decision.state,
                    "readOnly": True,
                    "overdue": bool(due and due < utc_now() and decision.state == "active"),
                }
            )
    return {"items": items, "total": len(items)}


@router.patch("/{task_id}")
def update_task_status(
    task_id: uuid.UUID,
    payload: StatusChange,
    claims: dict[str, Any] = Depends(verify_clerk_token),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    user = get_or_create_user(session, claims["sub"])
    task = session.exec(select(Task).where(Task.id == task_id, Task.user_id == user.id).with_for_update()).first()
    if not task:
        raise HTTPException(404, "Task not found. Authoritative decisions must be changed through approvals.")
    before = task.status
    if before != payload.status:
        task.status = payload.status
        task.updated_at = utc_now()
        session.add(task)
        record_audit_event(
            session=session,
            user_id=user.id,
            action="commitment_updated",
            actor_type="user",
            actor_id=claims["sub"],
            entity_type="commitment",
            entity_id=str(task.id),
            before_state={"status": before},
            after_state={"status": task.status},
        )
        session.commit()
    return task_read(task)
