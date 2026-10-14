import pytest
from fastapi import HTTPException
from sqlmodel import SQLModel
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


def test_unsupported_action_kind_fails_with_400(
    db_session: Session, test_user: User
):
    """Ensure unsupported or missing action kinds are rejected with 400 without mutating decisions."""
    now = utc_now()
    finding = Finding(
        user_id=test_user.id,
        conversation_id=uuid.uuid4(),
        classification="new_commitment",
        topic_key="security_review",
        new_value="Schedule security audit",
        explanation="Detected proposal for security review.",
        confidence="high",
        status="pending_approval",
        created_at=now,
    )
    db_session.add(finding)
    db_session.flush()

    exec_key = "exec_key_unsupported_01"
    approval_req = ApprovalRequest(
        user_id=test_user.id,
        finding_id=finding.id,
        status="pending",
        action_payload={"kind": "unsupported_malicious_mutation", "topic": "hack"},
        requester="agent",
        execution_key=exec_key,
        created_at=now,
    )
    db_session.add(approval_req)
    db_session.commit()

    with pytest.raises(HTTPException) as exc_info:
        ApprovalService.approve(
            session=db_session,
            user_id=test_user.id,
            approval_id=approval_req.id,
            execution_key=exec_key,
            approver_clerk_id=test_user.clerk_id,
        )
    assert exc_info.value.status_code == 400
    assert "Unsupported or missing action kind" in exc_info.value.detail

    # Verify no state changes occurred
    db_session.refresh(approval_req)
    assert approval_req.status == "pending"

    decisions = db_session.exec(select(Decision).where(Decision.user_id == test_user.id)).all()
    assert len(decisions) == 0

    audits = db_session.exec(
        select(AuditEvent).where(AuditEvent.entity_id == str(approval_req.id))
    ).all()
    assert len(audits) == 0


def test_concurrent_approvals_with_real_postgresql():
    """Verify true atomic concurrency with two independent threads/sessions against real PostgreSQL.
    
    If real PostgreSQL is reachable, verifies row-level FOR UPDATE locking prevents
    duplicate decisions, tasks, or audit records.
    """
    import os
    import threading
    from concurrent.futures import ThreadPoolExecutor
    from sqlmodel import create_engine

    pg_url = os.getenv("POSTGRES_TEST_URL")
    if not pg_url:
        pytest.skip("Set POSTGRES_TEST_URL to an isolated PostgreSQL test database.")
    try:
        pg_engine = create_engine(pg_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
        with pg_engine.connect() as conn:
            pass
    except Exception as e:
        pytest.skip(f"Live PostgreSQL database not reachable ({e}). Set POSTGRES_TEST_URL or run Docker Postgres to execute live PostgreSQL concurrency test.")

    SQLModel.metadata.create_all(pg_engine)

    # Seed test entities in PostgreSQL
    with Session(pg_engine) as seed_session:
        pg_user = User(
            clerk_id=f"user_pg_conc_{uuid.uuid4().hex[:8]}",
            email="pg_conc@decisiontrace.test",
            created_at=utc_now(),
        )
        seed_session.add(pg_user)
        seed_session.commit()
        seed_session.refresh(pg_user)

        now = utc_now()
        from app.db.models import Conversation, OmiIntegration
        pg_integ = OmiIntegration(
            user_id=pg_user.id,
            installation_id=f"inst_pg_{uuid.uuid4().hex[:8]}",
            webhook_token_hash=f"hash_pg_{uuid.uuid4().hex}",
            is_active=True,
        )
        seed_session.add(pg_integ)
        seed_session.commit()
        seed_session.refresh(pg_integ)

        pg_conv = Conversation(
            user_id=pg_user.id,
            installation_id=pg_integ.id,
            source_event_id=f"pg_conv_{uuid.uuid4().hex[:8]}",
            title="Postgres Concurrency Conv",
            normalized_transcript="Transcript for concurrency test",
            status="processed",
            source_time=now,
            received_time=now,
        )
        seed_session.add(pg_conv)
        seed_session.commit()
        seed_session.refresh(pg_conv)

        pg_finding = Finding(
            user_id=pg_user.id,
            conversation_id=pg_conv.id,
            classification="new_commitment",
            topic_key="infra_migration",
            new_value="Migrate to Postgres 16",
            explanation="Database migration proposal.",
            confidence="high",
            status="pending_approval",
            created_at=now,
        )
        seed_session.add(pg_finding)
        seed_session.flush()

        exec_key = f"exec_key_pg_{uuid.uuid4().hex[:8]}"
        pg_approval = ApprovalRequest(
            user_id=pg_user.id,
            finding_id=pg_finding.id,
            status="pending",
            action_payload={"kind": "create_decision", "topic": "infra_migration", "new_value": "Migrate to Postgres 16"},
            requester="agent",
            execution_key=exec_key,
            created_at=now,
        )
        seed_session.add(pg_approval)
        seed_session.commit()
        seed_session.refresh(pg_approval)
        app_id = pg_approval.id
        u_id = pg_user.id
        u_clerk = pg_user.clerk_id

    results = []
    errors = []
    start_barrier = threading.Barrier(2)

    def _worker_attempt():
        # Each thread gets its own independent session
        with Session(pg_engine) as thread_session:
            start_barrier.wait()  # synchronize release
            try:
                res = ApprovalService.approve(
                    session=thread_session,
                    user_id=u_id,
                    approval_id=app_id,
                    execution_key=exec_key,
                    approver_clerk_id=u_clerk,
                )
                results.append(res)
            except HTTPException as ex:
                errors.append(ex)

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(_worker_attempt)
        f2 = executor.submit(_worker_attempt)
        f1.result()
        f2.result()

    # Under PostgreSQL row locking: exactly ONE session succeeds, second receives 409 Conflict
    assert len(results) == 1, f"Expected exactly 1 success, got {len(results)}"
    assert len(errors) == 1, f"Expected exactly 1 conflict error, got {len(errors)}"
    assert errors[0].status_code == 409
    assert "already resolved" in errors[0].detail

    # Verify authoritative database state in PostgreSQL
    with Session(pg_engine) as verify_session:
        # Exactly ONE decision created
        decisions = verify_session.exec(select(Decision).where(Decision.user_id == u_id)).all()
        assert len(decisions) == 1
        assert decisions[0].topic == "infra_migration"

        # Exactly ONE audit log created
        audits = verify_session.exec(select(AuditEvent).where(AuditEvent.entity_id == str(app_id))).all()
        assert len(audits) == 1
        assert audits[0].action == "approval_granted"
