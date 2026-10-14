"""Omi memory-trigger payload as documented at docs.omi.me (Integrations > Memory Triggers)."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import Conversation, OmiIntegration

OFFICIAL_PAYLOAD = {
    "id": "memory_doc_example_001",
    "created_at": "2024-07-22T23:59:45.910559+00:00",
    "started_at": "2024-07-21T22:34:43.384323+00:00",
    "finished_at": "2024-07-21T22:35:43.384323+00:00",
    "transcript_segments": [
        {
            "text": "We decided to ship the beta on Friday. Priya will send the proposal.",
            "speaker": "SPEAKER_00",
            "speakerId": 0,
            "speaker_name": "John",
            "is_user": False,
            "start": 10.0,
            "end": 15.0,
        }
    ],
    "structured": {
        "title": "Project Timeline Discussion",
        "overview": "Brief overview",
        "emoji": "📅",
        "category": "work",
        "action_items": [{"description": "Send project proposal by Friday", "completed": False}],
        "events": [],
    },
    "apps_response": [],
    "discarded": False,
    "folder_id": "folder_uuid",
    "folder_name": "Work",
}


def test_official_payload_with_uid_binds_installation(
    client: TestClient, db_session: Session, test_integration: tuple[OmiIntegration, str]
):
    integration, token = test_integration
    integration.external_omi_uid = None
    db_session.add(integration)
    db_session.commit()
    r = client.post(f"/api/v1/webhooks/omi/{token}?uid=omi_user_A", json=OFFICIAL_PAYLOAD)
    assert r.status_code == 202, r.text
    db_session.refresh(integration)
    assert integration.external_omi_uid == "omi_user_A"

    # Omi retry of the same memory with the same uid is idempotent
    r2 = client.post(f"/api/v1/webhooks/omi/{token}?uid=omi_user_A", json=OFFICIAL_PAYLOAD)
    assert r2.status_code == 200
    assert r2.json()["status"] == "duplicate"
    convs = db_session.exec(
        select(Conversation).where(Conversation.source_event_id == OFFICIAL_PAYLOAD["id"])
    ).all()
    assert len(convs) == 1


def test_uid_mismatch_rejected_when_enforced(
    client: TestClient, test_integration: tuple[OmiIntegration, str], monkeypatch
):
    from app.core.config import settings

    _, token = test_integration  # fixture binds external_omi_uid="omi_dev_user_01"
    other_ok = dict(OFFICIAL_PAYLOAD, id="memory_doc_example_002")
    # Not enforced by default: accepted with a warning
    assert client.post(f"/api/v1/webhooks/omi/{token}?uid=omi_user_B", json=other_ok).status_code == 202
    monkeypatch.setattr(settings, "OMI_ENFORCE_UID", True)
    assert (
        client.post(
            f"/api/v1/webhooks/omi/{token}?uid=omi_dev_user_01",
            json=dict(OFFICIAL_PAYLOAD, id="memory_doc_example_004"),
        ).status_code
        == 202
    )
    other = dict(OFFICIAL_PAYLOAD, id="memory_doc_example_003")
    r = client.post(f"/api/v1/webhooks/omi/{token}?uid=omi_user_B", json=other)
    assert r.status_code == 403
