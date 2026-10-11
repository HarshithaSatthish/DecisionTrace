"""Integration test: End-to-End Walkthrough of Spoken Event A -> Approval -> Spoken Event B -> Retrieval -> Update -> Audit."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db.models import (
    ApprovalRequest,
    Finding,
    OmiIntegration,
    User,
)
from app.workers.jobs import process_conversation_job


def test_complete_end_to_end_walkthrough(
    client: TestClient,
    db_session: Session,
    test_user: User,
    test_integration: tuple[OmiIntegration, str],
):
    integration, raw_token = test_integration
    headers = {"Authorization": f"Bearer {test_user.clerk_id}"}

    # =========================================================================
    # STEP 1: Spoken Event A arrives from Omi Webhook
    # "The prototype review is scheduled for Friday at 10 AM."
    # =========================================================================
    payload_a = {
        "id": "omi_event_A_uuid",
        "created_at": "2026-10-11T09:00:00Z",
        "finished_at": "2026-10-11T09:05:00Z",
        "transcript_segments": [
            {
                "text": "The prototype review is scheduled for Friday at 10 AM.",
                "speaker": "SPEAKER_00",
                "is_user": True,
                "start": 0.0,
                "end": 4.0,
            }
        ],
        "structured": {
            "title": "Initial Planning",
            "overview": "Set prototype review schedule",
        },
        "discarded": False,
    }

    resp_a = client.post(f"/api/v1/webhooks/omi/{raw_token}", json=payload_a)
    assert resp_a.status_code == 202
    data_a = resp_a.json()
    conv_a_id = data_a["conversation_id"]
    job_a_id = data_a["job_id"]

    # Execute worker processing for Conversation A
    worker_result_a = process_conversation_job(conv_a_id, job_a_id, db_session=db_session)
    assert worker_result_a["status"] == "success"
    assert worker_result_a["state"] == "awaiting_approval"

    # Verify Finding A created with classification 'new_commitment'
    finding_a = db_session.exec(
        select(Finding).where(Finding.conversation_id == uuid.UUID(conv_a_id))
    ).first()
    assert finding_a is not None
    assert finding_a.classification == "new_commitment"
    assert finding_a.topic_key == "prototype_review"

    # Verify Approval Request A generated
    approval_a = db_session.exec(
        select(ApprovalRequest).where(ApprovalRequest.finding_id == finding_a.id)
    ).first()
    assert approval_a is not None
    assert approval_a.status == "pending"

    # Human approves initial commitment A via API
    resp_approve_a = client.post(
        f"/api/v1/approvals/{approval_a.id}/approve",
        headers=headers,
        json={"execution_key": approval_a.execution_key, "note": "Confirmed by team lead"},
    )
    assert resp_approve_a.status_code == 200
    dec_a_data = resp_approve_a.json()["resulting_decision"]
    assert dec_a_data["topic"] == "prototype_review"
    assert dec_a_data["version"] == 1

    # =========================================================================
    # STEP 2: Spoken Event B arrives from Omi Webhook later
    # "The prototype review moved to Thursday 2 PM."
    # =========================================================================
    payload_b = {
        "id": "omi_event_B_uuid",
        "created_at": "2026-10-11T14:00:00Z",
        "finished_at": "2026-10-11T14:03:00Z",
        "transcript_segments": [
            {
                "text": "The prototype review moved to Thursday 2 PM instead.",
                "speaker": "SPEAKER_00",
                "is_user": True,
                "start": 0.0,
                "end": 3.5,
            }
        ],
        "structured": {
            "title": "Review Rescheduling",
            "overview": "Updated review time",
        },
        "discarded": False,
    }

    resp_b = client.post(f"/api/v1/webhooks/omi/{raw_token}", json=payload_b)
    assert resp_b.status_code == 202
    data_b = resp_b.json()
    conv_b_id = data_b["conversation_id"]
    job_b_id = data_b["job_id"]

    # Execute worker processing for Conversation B
    worker_result_b = process_conversation_job(conv_b_id, job_b_id, db_session=db_session)
    assert worker_result_b["status"] == "success"
    assert worker_result_b["state"] == "awaiting_approval"

    # Verify Finding B: Detected as 'superseding_change' with citations from both events!
    finding_b = db_session.exec(
        select(Finding).where(Finding.conversation_id == uuid.UUID(conv_b_id))
    ).first()
    assert finding_b is not None
    assert finding_b.classification == "superseding_change"
    assert finding_b.topic_key == "prototype_review"

    # Verify Approval Request B
    approval_b = db_session.exec(
        select(ApprovalRequest).where(ApprovalRequest.finding_id == finding_b.id)
    ).first()
    assert approval_b is not None
    assert approval_b.status == "pending"

    # Human approves superseding change B via API
    resp_approve_b = client.post(
        f"/api/v1/approvals/{approval_b.id}/approve",
        headers=headers,
        json={"execution_key": approval_b.execution_key, "note": "Updated time approved"},
    )
    assert resp_approve_b.status_code == 200
    dec_b_data = resp_approve_b.json()["resulting_decision"]

    # The decision must be updated to Thursday 2 PM with version bumped to 2
    assert dec_b_data["topic"] == "prototype_review"
    assert dec_b_data["version"] == 2
    assert "Thursday 2 PM" in dec_b_data["current_commitment"]

    # =========================================================================
    # STEP 3: Verify Overview Dashboard & Audit Trail
    # =========================================================================
    resp_overview = client.get("/api/v1/overview", headers=headers)
    assert resp_overview.status_code == 200
    overview_data = resp_overview.json()
    assert overview_data["total_conversations"] >= 2
    assert overview_data["active_decisions"] >= 1

    resp_activity = client.get("/api/v1/activity", headers=headers)
    assert resp_activity.status_code == 200
    activity_data = resp_activity.json()
    assert len(activity_data["items"]) >= 2
