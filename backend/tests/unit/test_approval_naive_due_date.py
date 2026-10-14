"""Regression (live PR #16 local E2E): approving a proposal whose stored due_date is naive must not 500."""

import uuid

from sqlmodel import Session

from app.db.models import ApprovalRequest, Finding, User, utc_now
from app.services.approval import ApprovalService, _parse_due_date


def test_parse_due_date_treats_naive_as_utc():
    assert _parse_due_date("2026-10-14T00:00:00").tzinfo is not None
    assert _parse_due_date("2026-10-16T23:59:00+00:00").isoformat().startswith("2026-10-16T23:59")
    assert _parse_due_date("not a date") is None
    assert _parse_due_date(None) is None


def test_approve_with_naive_stored_due_date(db_session: Session, test_user: User):
    now = utc_now()
    finding = Finding(
        user_id=test_user.id,
        conversation_id=uuid.uuid4(),
        classification="new_commitment",
        topic_key="DecisionTrace Launch",
        new_value="Launch DecisionTrace on Friday.",
        explanation="live Lyzr shape",
        confidence="medium",
        status="pending_approval",
        created_at=now,
    )
    db_session.add(finding)
    db_session.flush()
    approval = ApprovalRequest(
        user_id=test_user.id,
        finding_id=finding.id,
        status="pending",
        action_payload={
            "kind": "create_decision",
            "target_decision_id": None,
            "expected_version": None,
            "new_value": "Launch DecisionTrace on Friday.",
            "topic": "DecisionTrace Launch",
            "owner": "Akshay",
            "due_date": "2026-10-14T00:00:00",  # exactly what the live run stored
        },
        requester="agent",
        execution_key="naive-due-001",
        created_at=now,
    )
    db_session.add(approval)
    db_session.commit()
    resp = ApprovalService.approve(
        session=db_session,
        user_id=test_user.id,
        approval_id=approval.id,
        execution_key="naive-due-001",
        note="ok",
        approver_clerk_id=test_user.clerk_id,
    )
    assert resp.status == "approved"
    assert resp.resulting_decision is not None
