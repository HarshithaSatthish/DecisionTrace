"""Regression tests for live-E2E bugs: pipeline audit events, owners/deadlines, evidence, worker logging."""

import logging
import uuid
from datetime import date

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import AuditEvent, OmiIntegration, User
from app.schemas.agent import AgentInvocationPayload, NewEvidenceInput
from app.services.agent_adapter import LyzrAgentAdapter
from app.services.dates import resolve_due_date
from app.workers.jobs import process_conversation_job

PAYLOAD = {
    "id": "omi_audit_evt_001",
    "created_at": "2026-10-14T11:40:00Z",
    "finished_at": "2026-10-14T11:40:00Z",
    "transcript_segments": [{"text": "The prototype review is scheduled for Friday at 10 AM."}],
    "structured": {"title": "Planning"},
}


def _actions(session: Session, user_id) -> list[str]:
    return [
        e.action
        for e in session.exec(select(AuditEvent).where(AuditEvent.user_id == user_id)).all()
    ]


def test_ingest_and_process_write_audit_events(
    client: TestClient, db_session: Session, test_user: User, test_integration: tuple[OmiIntegration, str]
):
    _, token = test_integration
    r = client.post(f"/api/v1/webhooks/omi/{token}", json=PAYLOAD)
    assert r.status_code == 202
    assert "conversation_ingested" in _actions(db_session, test_user.id)

    # Duplicate delivery must not write a second ingest event
    client.post(f"/api/v1/webhooks/omi/{token}", json=PAYLOAD)
    assert _actions(db_session, test_user.id).count("conversation_ingested") == 1

    data = r.json()
    res = process_conversation_job(data["conversation_id"], data["job_id"], db_session=db_session)
    acts = _actions(db_session, test_user.id)
    assert "conversation_processed" in acts
    if res["state"] == "awaiting_approval":
        assert "approval_requested" in acts

    # Activity feed exposes them (tenant scoped)
    feed = client.get("/api/v1/activity", headers={"Authorization": f"Bearer {test_user.clerk_id}"})
    assert feed.status_code == 200
    body = feed.json()
    items = body if isinstance(body, list) else body.get("items", [])
    assert {"conversation_ingested", "conversation_processed"} <= {i["action"] for i in items}


def test_relative_deadlines_resolve_against_conversation_date():
    wed = date(2026, 10, 14)  # Wednesday
    assert resolve_due_date("by Thursday", wed).startswith("2026-10-15")
    assert resolve_due_date("Friday", wed).startswith("2026-10-16")
    assert resolve_due_date("tomorrow", wed).startswith("2026-10-15")
    assert resolve_due_date("Wednesday", wed).startswith("2026-10-21")  # never collapses to today
    assert resolve_due_date("2026-10-20", wed).startswith("2026-10-20")
    assert resolve_due_date("sometime soon", wed) is None
    assert resolve_due_date(None, wed) is None


def _payload(**kw) -> AgentInvocationPayload:
    return AgentInvocationPayload(
        user_id="u",
        conversation_id=uuid.uuid4(),
        new_transcript="Akshay will send the demo deck by Thursday.",
        new_evidence_ids=["chk_a_000"],
        new_evidence=[NewEvidenceInput(chunk_id="chk_a_000", excerpt="Akshay will send the demo deck by Thursday.")],
        conversation_date="2026-10-14",
        **kw,
    )


def _raw(**action):
    return {
        "classification": "new_commitment",
        "explanation": "x",
        "evidence_chunk_ids": action.pop("_cids", []),
        "proposed_action": {"kind": "create_decision", "topic": "demo_deck", "new_value": "send deck", **action},
        "requires_human_approval": True,
    }


def test_owner_and_relative_due_date_normalised():
    a = LyzrAgentAdapter(api_key=None)
    p = _payload()
    r = a._validate_and_sanitize(_raw(owner="Akshay", due_date="by Thursday"), p, {"chk_a_000"})
    assert r.proposed_action.owner == "Akshay"
    assert r.proposed_action.due_date.date() == date(2026, 10, 15)
    r2 = a._validate_and_sanitize(_raw(owner="Team", due_date="whenever"), p, {"chk_a_000"})
    assert r2.proposed_action.owner is None
    assert r2.proposed_action.due_date is None


def test_uncited_finding_gets_grounded_evidence_but_fabricated_is_still_rejected():
    a = LyzrAgentAdapter(api_key=None)
    p = _payload()
    r = a._validate_and_sanitize(_raw(), p, {"chk_a_000"})
    assert r.evidence_chunk_ids == ["chk_a_000"]
    bad = a._validate_and_sanitize(_raw(_cids=["chk_made_up_999"]), p, {"chk_a_000"})
    assert bad.evidence_chunk_ids == []
    assert bad.classification == "insufficient_evidence"
    assert bad.proposed_action is None


def test_agent_prompt_requests_owner_date_and_evidence():
    import inspect

    src = inspect.getsource(LyzrAgentAdapter._call_lyzr_api)
    assert '"owner"' in src and '"due_date"' in src and "conversation_date" in src


def test_worker_entrypoint_configures_info_logging():
    src = open("scripts/start_worker.py").read()
    main = src.split('if __name__ == "__main__":', 1)[1]
    assert main.lstrip().startswith("setup_logging()")
    from app.core.logging import setup_logging

    setup_logging()
    assert logging.getLogger().getEffectiveLevel() <= logging.INFO


def test_stated_weekday_beats_agent_date_from_live_lyzr_run():
    """Live PR #16 run: Lyzr returned the conversation date for 'Launch DecisionTrace on Friday.'"""
    import uuid as _uuid

    from app.schemas.agent import AgentInvocationPayload
    from app.services.agent_adapter import LyzrAgentAdapter

    payload = AgentInvocationPayload(
        user_id="u",
        conversation_id=_uuid.uuid4(),
        new_transcript="We decided to launch DecisionTrace on Friday.",
        new_evidence_ids=["chk_1"],
        conversation_date="2026-10-14",  # Wednesday
    )
    raw = {
        "proposed_action": {
            "kind": "create_decision",
            "new_value": "Launch DecisionTrace on Friday.",
            "topic": "DecisionTrace Launch",
            "owner": None,
            "due_date": "2026-10-14",
        }
    }
    out = LyzrAgentAdapter._normalize_raw(raw, payload)
    assert out["proposed_action"]["due_date"].startswith("2026-10-16T23:59")


def test_agent_date_before_conversation_is_dropped_and_bare_date_is_end_of_day():
    import uuid as _uuid
    from datetime import date

    from app.schemas.agent import AgentInvocationPayload
    from app.services.agent_adapter import LyzrAgentAdapter
    from app.services.dates import resolve_due_date

    assert resolve_due_date("2026-10-20", date(2026, 10, 14)).startswith("2026-10-20T23:59")
    payload = AgentInvocationPayload(
        user_id="u", conversation_id=_uuid.uuid4(), new_transcript="x", new_evidence_ids=[], conversation_date="2026-10-14"
    )
    raw = {"proposed_action": {"kind": "create_decision", "new_value": "Ship it", "due_date": "2026-10-01"}}
    assert LyzrAgentAdapter._normalize_raw(raw, payload)["proposed_action"]["due_date"] is None
