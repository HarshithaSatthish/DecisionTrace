"""Unit tests for Human Approvals, Atomic mutations, Double-Approval Protection, and Audit trail."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import ApprovalRequest, AuditEvent, Decision, Finding, User, utc_now
from app.services.approval import ApprovalService


def test_approve_create_decision(client: TestClient, db_session: Session, test_user: User):
    conv_id = uuid.uuid4()
    now = utc_now()

    # Create finding
    finding = Finding(
        user_id=test_user.id,
        conversation_id=conv_id,
        classification="new_commitment",
        topic_key="security_review",
        new_value="Tuesday at 3 PM",
        explanation="Agreed in standup",
        confidence="high",
        status="pending_approval",
        created_at=now,
    )
    db_session.add(finding)
    db_session.flush()

    exec_key = "exec_key_test_001"
    approval_req = ApprovalRequest(
        user_id=test_user.id,
        finding_id=finding.id,
        status="pending",
        action_payload={
            "kind": "create_decision",
            "topic": "security_review",
            "new_value": "Tuesday at 3 PM",
        },
        requester="agent",
        execution_key=exec_key,
        created_at=now,
    )
    db_session.add(approval_req)
    db_session.commit()

    # Execute approval
    resp = ApprovalService.approve(
        session=db_session,
        user_id=test_user.id,
        approval_id=approval_req.id,
        execution_key=exec_key,
        note="Approved by Harshitha",
        approver_clerk_id=test_user.clerk_id,
    )

    assert resp.status == "approved"
    assert resp.resulting_decision is not None
    assert resp.resulting_decision.topic == "security_review"
    assert resp.resulting_decision.version == 1

    # Verify Audit log entry
    audits = db_session.exec(
        select(AuditEvent).where(
            AuditEvent.entity_id == str(approval_req.id),
            AuditEvent.action == "approval_granted",
        )
    ).all()
    assert len(audits) == 1
    assert audits[0].after_state["current_commitment"] == "Tuesday at 3 PM"


def test_double_approval_fails_with_409(db_session: Session, test_user: User):
    conv_id = uuid.uuid4()
    now = utc_now()

    finding = Finding(
        user_id=test_user.id,
        conversation_id=conv_id,
        classification="new_commitment",
        topic_key="standup",
        new_value="9 AM daily",
        explanation="Agreed",
        confidence="high",
        status="pending_approval",
        created_at=now,
    )
    db_session.add(finding)
    db_session.flush()

    exec_key = "exec_key_test_002"
    approval_req = ApprovalRequest(
        user_id=test_user.id,
        finding_id=finding.id,
        status="pending",
        action_payload={"kind": "create_decision", "topic": "standup", "new_value": "9 AM daily"},
        requester="agent",
        execution_key=exec_key,
        created_at=now,
    )
    db_session.add(approval_req)
    db_session.commit()

    # 1st Approval: Succeeds
    ApprovalService.approve(
        session=db_session,
        user_id=test_user.id,
        approval_id=approval_req.id,
        execution_key=exec_key,
    )

    # 2nd Approval: Must fail with 409 Conflict!
    import pytest
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        ApprovalService.approve(
            session=db_session,
            user_id=test_user.id,
            approval_id=approval_req.id,
            execution_key=exec_key,
        )
    assert exc_info.value.status_code == 409

    # Verify only ONE decision exists
    decs = db_session.exec(
        select(Decision).where(Decision.user_id == test_user.id, Decision.topic == "standup")
    ).all()
    assert len(decs) == 1


def test_approve_superseding_decision_update(db_session: Session, test_user: User):
    now = utc_now()
    # Initial decision
    dec = Decision(
        user_id=test_user.id,
        topic="demo_day",
        current_commitment="October 14th",
        state="active",
        version=1,
        created_at=now,
        updated_at=now,
    )
    db_session.add(dec)
    db_session.flush()

    finding = Finding(
        user_id=test_user.id,
        conversation_id=uuid.uuid4(),
        classification="superseding_change",
        topic_key="demo_day",
        previous_value="October 14th",
        new_value="October 16th",
        explanation="Rescheduled",
        confidence="high",
        status="pending_approval",
        created_at=now,
    )
    db_session.add(finding)
    db_session.flush()

    exec_key = "exec_key_test_003"
    approval_req = ApprovalRequest(
        user_id=test_user.id,
        finding_id=finding.id,
        status="pending",
        action_payload={
            "kind": "request_decision_update",
            "target_decision_id": str(dec.id),
            "new_value": "October 16th",
        },
        requester="agent",
        execution_key=exec_key,
        created_at=now,
    )
    db_session.add(approval_req)
    db_session.commit()

    resp = ApprovalService.approve(
        session=db_session,
        user_id=test_user.id,
        approval_id=approval_req.id,
        execution_key=exec_key,
        approver_clerk_id=test_user.clerk_id,
    )

    assert resp.status == "approved"
    assert resp.resulting_decision.version == 2
    assert resp.resulting_decision.current_commitment == "October 16th"


def test_reject_request(db_session: Session, test_user: User):
    now = utc_now()
    finding = Finding(
        user_id=test_user.id,
        conversation_id=uuid.uuid4(),
        classification="possible_conflict",
        explanation="Ambiguous statement",
        confidence="low",
        status="pending_approval",
        created_at=now,
    )
    db_session.add(finding)
    db_session.flush()

    approval_req = ApprovalRequest(
        user_id=test_user.id,
        finding_id=finding.id,
        status="pending",
        action_payload={"kind": "create_decision"},
        requester="agent",
        execution_key="exec_key_reject",
        created_at=now,
    )
    db_session.add(approval_req)
    db_session.commit()

    resp = ApprovalService.reject(
        session=db_session,
        user_id=test_user.id,
        approval_id=approval_req.id,
        reason="Not an authoritative commitment",
    )
    assert resp.status == "rejected"
    db_session.refresh(finding)
    assert finding.status == "rejected"


def test_clarify_request(db_session: Session, test_user: User):
    now = utc_now()
    finding = Finding(
        user_id=test_user.id,
        conversation_id=uuid.uuid4(),
        classification="possible_conflict",
        explanation="Need clarity",
        confidence="low",
        status="pending_approval",
        created_at=now,
    )
    db_session.add(finding)
    db_session.flush()

    approval_req = ApprovalRequest(
        user_id=test_user.id,
        finding_id=finding.id,
        status="pending",
        action_payload={"kind": "request_clarification"},
        requester="agent",
        execution_key="exec_key_clarify",
        created_at=now,
    )
    db_session.add(approval_req)
    db_session.commit()

    resp = ApprovalService.clarify(
        session=db_session,
        user_id=test_user.id,
        approval_id=approval_req.id,
        clarification_request="Please verify with Akshay on Slack",
    )
    assert resp.status == "clarified"
    db_session.refresh(finding)
    assert finding.status == "clarified"


def test_cross_user_target_decision_authorization_fails_with_403(db_session: Session, test_user: User):
    """Ensure every referenced target decision belongs to the authenticated user.
    Cross-user target decision references must fail with HTTP 403 Forbidden.
    """
    import pytest
    from fastapi import HTTPException
    
    # Create User B
    user_b = User(clerk_id="user_clerk_other", email="other@test.com")
    db_session.add(user_b)
    db_session.commit()
    db_session.refresh(user_b)

    now = utc_now()
    # User B owns Decision B
    decision_b = Decision(
        user_id=user_b.id,
        topic="restricted_policy",
        current_commitment="Only User B can touch this",
        state="active",
        version=1,
        created_at=now,
        updated_at=now,
    )
    db_session.add(decision_b)
    db_session.commit()
    db_session.refresh(decision_b)

    # Test User (User A) has a finding
    finding_a = Finding(
        user_id=test_user.id,
        conversation_id=uuid.uuid4(),
        classification="superseding_change",
        topic_key="restricted_policy",
        new_value="Malicious overwrite by User A",
        explanation="Attempting cross-user mutation",
        confidence="high",
        status="pending_approval",
        created_at=now,
    )
    db_session.add(finding_a)
    db_session.flush()

    exec_key = "exec_key_cross_tenant"
    # Approval payload references Decision B belonging to User B!
    approval_req = ApprovalRequest(
        user_id=test_user.id,
        finding_id=finding_a.id,
        status="pending",
        action_payload={
            "kind": "request_decision_update",
            "target_decision_id": str(decision_b.id),
            "new_value": "Malicious overwrite by User A",
        },
        requester="agent",
        execution_key=exec_key,
        created_at=now,
    )
    db_session.add(approval_req)
    db_session.commit()

    # User A attempts to execute approval targeting User B's decision
    with pytest.raises(HTTPException) as exc_info:
        ApprovalService.approve(
            session=db_session,
            user_id=test_user.id,
            approval_id=approval_req.id,
            execution_key=exec_key,
            approver_clerk_id=test_user.clerk_id,
        )
    assert exc_info.value.status_code == 403
    assert "Cross-tenant mutation forbidden" in exc_info.value.detail

    # Verify Decision B was NOT mutated
    db_session.refresh(decision_b)
    assert decision_b.current_commitment == "Only User B can touch this"
    assert decision_b.version == 1


def test_concurrent_approval_collision_returns_409(db_session: Session, test_user: User):
    """Simulate concurrent approval resolution race condition."""
    import pytest
    from fastapi import HTTPException
    
    now = utc_now()
    finding = Finding(
        user_id=test_user.id,
        conversation_id=uuid.uuid4(),
        classification="new_commitment",
        topic_key="infra_migration",
        new_value="Completed by Friday",
        explanation="Agreed",
        confidence="high",
        status="pending_approval",
        created_at=now,
    )
    db_session.add(finding)
    db_session.flush()

    exec_key = "exec_key_concurrent_01"
    approval_req = ApprovalRequest(
        user_id=test_user.id,
        finding_id=finding.id,
        status="pending",
        action_payload={"kind": "create_decision", "topic": "infra_migration", "new_value": "Completed by Friday"},
        requester="agent",
        execution_key=exec_key,
        created_at=now,
    )
    db_session.add(approval_req)
    db_session.commit()

    # First concurrent request succeeds
    res1 = ApprovalService.approve(
        session=db_session,
        user_id=test_user.id,
        approval_id=approval_req.id,
        execution_key=exec_key,
        approver_clerk_id=test_user.clerk_id,
    )
    assert res1.status == "approved"

    # Second concurrent request with the same approval_req must be rejected with HTTP 409 Conflict
    with pytest.raises(HTTPException) as exc_info:
        ApprovalService.approve(
            session=db_session,
            user_id=test_user.id,
            approval_id=approval_req.id,
            execution_key=exec_key,
            approver_clerk_id=test_user.clerk_id,
        )
    assert exc_info.value.status_code == 409
