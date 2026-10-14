import uuid

import pytest
from fastapi import HTTPException
from sqlmodel import select

from app.db.models import ApprovalRequest, AuditEvent, Decision, Finding
from app.schemas.agent import AgentInvocationPayload, ExistingDecisionInput
from app.services.agent_adapter import LyzrAgentAdapter
from app.services.approval import ApprovalService


def test_mutation_requires_evidence_and_uses_server_version():
    decision_id = uuid.uuid4()
    payload = AgentInvocationPayload(
        user_id="test",
        conversation_id=uuid.uuid4(),
        new_transcript="Move the release.",
        new_evidence_ids=["verified"],
        existing_decisions=[
            ExistingDecisionInput(decision_id=decision_id, topic="release", current_commitment="Friday", version=3)
        ],
    )
    raw = {
        "classification": "superseding_change",
        "topic_key": "release",
        "explanation": "Move release",
        "evidence_chunk_ids": [],
        "proposed_action": {
            "kind": "request_decision_update",
            "target_decision_id": str(decision_id),
            "new_value": "Monday",
            "expected_version": 99,
        },
    }
    adapter = LyzrAgentAdapter()
    assert adapter._validate_and_sanitize(raw, payload, {"verified"}).proposed_action is None
    raw["evidence_chunk_ids"] = ["verified"]
    result = adapter._validate_and_sanitize(raw, payload, {"verified"})
    assert result.proposed_action.expected_version == 3


def test_stale_approval_cannot_overwrite_newer_decision(db_session, test_user):
    decision = Decision(user_id=test_user.id, topic="release", current_commitment="Friday", version=2)
    finding = Finding(
        user_id=test_user.id,
        conversation_id=uuid.uuid4(),
        classification="superseding_change",
        topic_key="release",
        new_value="Monday",
        explanation="Move release",
    )
    db_session.add(decision)
    db_session.add(finding)
    db_session.flush()
    approval = ApprovalRequest(
        user_id=test_user.id,
        finding_id=finding.id,
        execution_key="test-key",
        action_payload={
            "kind": "request_decision_update",
            "target_decision_id": str(decision.id),
            "new_value": "Monday",
            "expected_version": 1,
        },
    )
    db_session.add(approval)
    db_session.commit()
    with pytest.raises(HTTPException) as error:
        ApprovalService.approve(db_session, test_user.id, approval.id, "test-key")
    assert error.value.status_code == 409
    assert decision.current_commitment == "Friday"
    assert approval.status == "pending"
    assert not db_session.exec(select(AuditEvent)).all()
