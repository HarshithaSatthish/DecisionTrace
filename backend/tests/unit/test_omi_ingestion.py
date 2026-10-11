"""Unit tests for Omi Webhook Ingestion, Deduplication, and Outbox reliability."""

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import Conversation, OmiIntegration, ProcessingJob


def test_valid_omi_webhook_ingestion(
    client: TestClient, test_integration: tuple[OmiIntegration, str]
):
    integration, raw_token = test_integration
    payload = {
        "id": "omi_mem_uuid_001",
        "created_at": "2026-10-11T12:00:00Z",
        "finished_at": "2026-10-11T12:05:00Z",
        "transcript_segments": [
            {
                "text": "The prototype review is scheduled for Friday at 10 AM.",
                "speaker": "SPEAKER_00",
                "is_user": True,
                "start": 0.0,
                "end": 3.0,
            }
        ],
        "structured": {
            "title": "Weekly Planning Discussion",
            "overview": "Discussion regarding prototype review timing",
        },
        "discarded": False,
    }

    response = client.post(f"/api/v1/webhooks/omi/{raw_token}", json=payload)
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "queued"
    assert "conversation_id" in data


def test_invalid_token_rejected(client: TestClient):
    payload = {
        "id": "omi_mem_uuid_002",
        "transcript_segments": [{"text": "Hello world"}],
    }
    response = client.post("/api/v1/webhooks/omi/invalid_token_999", json=payload)
    assert response.status_code == 401


def test_discarded_event_saved_without_queueing(
    client: TestClient, test_integration: tuple[OmiIntegration, str]
):
    integration, raw_token = test_integration
    payload = {
        "id": "omi_mem_uuid_discarded_003",
        "transcript_segments": [{"text": "Casual chatter"}],
        "discarded": True,
    }
    response = client.post(f"/api/v1/webhooks/omi/{raw_token}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "discarded"


def test_empty_transcript_rejected(
    client: TestClient, test_integration: tuple[OmiIntegration, str]
):
    integration, raw_token = test_integration
    payload = {
        "id": "omi_mem_uuid_empty_004",
        "transcript_segments": [],
        "discarded": False,
    }
    response = client.post(f"/api/v1/webhooks/omi/{raw_token}", json=payload)
    assert response.status_code == 400


def test_deliver_same_event_three_times_deduplicates(
    client: TestClient, db_session: Session, test_integration: tuple[OmiIntegration, str]
):
    integration, raw_token = test_integration
    payload = {
        "id": "omi_mem_uuid_duplicate_005",
        "transcript_segments": [{"text": "Unique sync event for deduplication"}],
    }

    # Delivery 1: Accepted
    r1 = client.post(f"/api/v1/webhooks/omi/{raw_token}", json=payload)
    assert r1.status_code == 202
    c1_id = r1.json()["conversation_id"]

    # Delivery 2: Deduplicated (200 OK)
    r2 = client.post(f"/api/v1/webhooks/omi/{raw_token}", json=payload)
    assert r2.status_code == 200
    assert r2.json()["status"] == "duplicate"
    assert r2.json()["conversation_id"] == c1_id

    # Delivery 3: Deduplicated (200 OK)
    r3 = client.post(f"/api/v1/webhooks/omi/{raw_token}", json=payload)
    assert r3.status_code == 200
    assert r3.json()["status"] == "duplicate"
    assert r3.json()["conversation_id"] == c1_id

    # Verify only ONE conversation and ONE job in DB
    convs = db_session.exec(
        select(Conversation).where(Conversation.source_event_id == "omi_mem_uuid_duplicate_005")
    ).all()
    assert len(convs) == 1

    jobs = db_session.exec(
        select(ProcessingJob).where(ProcessingJob.conversation_id == convs[0].id)
    ).all()
    assert len(jobs) == 1
