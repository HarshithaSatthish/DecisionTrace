"""Comprehensive unit tests for DecisionTrace API routes and user isolation."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import (
    ApprovalRequest,
    Conversation,
    ConversationChunk,
    Decision,
    Finding,
    OmiIntegration,
    User,
    utc_now,
)


def test_omi_integration_link_and_status(client: TestClient, test_user: User):
    headers = {"Authorization": f"Bearer {test_user.clerk_id}"}

    # 1. Check unlinked status
    res = client.get("/api/v1/integrations/omi/status", headers=headers)
    assert res.status_code == 200
    assert res.json()["connected"] is False

    # 2. Link integration
    res = client.post(
        "/api/v1/integrations/omi",
        headers=headers,
        json={"external_omi_uid": "omi_device_999"},
    )
    assert res.status_code == 201
    data = res.json()
    assert "webhook_token" in data
    assert "webhook_url" in data
    assert data["installation_id"].startswith("inst_")

    # 3. Check linked status
    res2 = client.get("/api/v1/integrations/omi/status", headers=headers)
    assert res2.status_code == 200
    assert res2.json()["connected"] is True
    assert res2.json()["external_omi_uid"] == "omi_device_999"
    first_token = data["webhook_token"]

    # 4. Regenerate / renew token: deactivates first integration
    res3 = client.post(
        "/api/v1/integrations/omi",
        headers=headers,
        json={"external_omi_uid": "omi_device_renewed"},
    )
    assert res3.status_code == 201
    second_token = res3.json()["webhook_token"]
    assert second_token != first_token

    # 5. Verify old token is revoked and rejects webhook with 401
    webhook_res_old = client.post(
        f"/api/v1/webhooks/omi/{first_token}",
        json={"id": "evt_old", "transcript_segments": [{"text": "hello"}]},
    )
    assert webhook_res_old.status_code == 401
    assert "Invalid or revoked" in webhook_res_old.json()["detail"]

    # 6. Verify new token succeeds
    webhook_res_new = client.post(
        f"/api/v1/webhooks/omi/{second_token}",
        json={"id": "evt_new", "transcript_segments": [{"text": "hello"}]},
    )
    assert webhook_res_new.status_code == 202


def test_decisions_api_and_user_isolation(client: TestClient, db_session: Session, test_user: User):
    # Create another user
    other_user = User(clerk_id="user_other_456", email="other@test.local", full_name="Other User")
    db_session.add(other_user)
    db_session.commit()
    db_session.refresh(other_user)

    # Add a decision for test_user
    d1 = Decision(
        user_id=test_user.id,
        topic="release_timeline",
        current_commitment="Deploy to Railway production by Friday",
        owner="Harshitha",
        state="active",
        version=1,
    )
    db_session.add(d1)

    # Add a decision for other_user
    d2 = Decision(
        user_id=other_user.id,
        topic="secret_topic",
        current_commitment="Other user secret decision",
        owner="Akshay",
        state="active",
        version=1,
    )
    db_session.add(d2)
    db_session.commit()
    db_session.refresh(d1)
    db_session.refresh(d2)

    headers = {"Authorization": f"Bearer {test_user.clerk_id}"}

    # List decisions: test_user should only see d1, not d2
    res = client.get("/api/v1/decisions", headers=headers)
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["topic"] == "release_timeline"
    assert items[0]["current_commitment"] == "Deploy to Railway production by Friday"

    # Filter by status
    res_filtered = client.get("/api/v1/decisions?status=superseded", headers=headers)
    assert res_filtered.status_code == 200
    assert len(res_filtered.json()["items"]) == 0

    # Get single decision
    res_get = client.get(f"/api/v1/decisions/{d1.id}", headers=headers)
    assert res_get.status_code == 200
    assert res_get.json()["id"] == str(d1.id)

    # Attempt to get other user's decision -> 404
    res_other = client.get(f"/api/v1/decisions/{d2.id}", headers=headers)
    assert res_other.status_code == 404

    # Non-existent decision -> 404
    res_404 = client.get(f"/api/v1/decisions/{uuid.uuid4()}", headers=headers)
    assert res_404.status_code == 404


def test_findings_api_and_evidence(client: TestClient, db_session: Session, test_user: User):
    headers = {"Authorization": f"Bearer {test_user.clerk_id}"}

    # Create integration and conversation first for foreign key integrity
    integration = OmiIntegration(
        user_id=test_user.id,
        installation_id="inst_finding_test",
        webhook_token_hash="fakehash_f",
        is_active=True,
    )
    db_session.add(integration)
    db_session.commit()
    db_session.refresh(integration)

    conv = Conversation(
        user_id=test_user.id,
        installation_id=integration.id,
        source_event_id="omi_evt_f_test",
        normalized_transcript="We agreed on pitch deck delivery.",
        source_time=utc_now(),
        received_time=utc_now(),
    )
    db_session.add(conv)
    db_session.commit()
    db_session.refresh(conv)

    # Add a finding
    f = Finding(
        user_id=test_user.id,
        conversation_id=conv.id,
        classification="new_commitment",
        topic_key="pitch_deck",
        new_value="Send pitch deck by Friday",
        explanation="Harshitha committed to sending pitch deck by Friday",
        confidence="high",
        status="pending_approval",
    )
    db_session.add(f)
    db_session.commit()
    db_session.refresh(f)

    # List findings
    res = client.get("/api/v1/findings", headers=headers)
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["topic_key"] == "pitch_deck"

    # Filter findings by status
    res_filtered = client.get("/api/v1/findings?status=approved", headers=headers)
    assert res_filtered.status_code == 200
    assert len(res_filtered.json()["items"]) == 0

    # Get single finding
    res_get = client.get(f"/api/v1/findings/{f.id}", headers=headers)
    assert res_get.status_code == 200
    assert res_get.json()["id"] == str(f.id)

    # 404 for unknown finding
    res_404 = client.get(f"/api/v1/findings/{uuid.uuid4()}", headers=headers)
    assert res_404.status_code == 404


def test_conversations_api(client: TestClient, db_session: Session, test_user: User):
    headers = {"Authorization": f"Bearer {test_user.clerk_id}"}

    # Create integration
    integration = OmiIntegration(
        user_id=test_user.id,
        installation_id="inst_conv_test",
        webhook_token_hash="fakehash",
        is_active=True,
    )
    db_session.add(integration)
    db_session.commit()
    db_session.refresh(integration)

    # Add conversation
    conv = Conversation(
        user_id=test_user.id,
        installation_id=integration.id,
        source_event_id="omi_evt_test_conv",
        normalized_transcript="Discussed release timeline with team.",
        source_time=utc_now(),
        received_time=utc_now(),
    )
    db_session.add(conv)
    db_session.commit()
    db_session.refresh(conv)

    # Add chunk
    chunk = ConversationChunk(
        id=f"chk_{conv.id}_0",
        conversation_id=conv.id,
        user_id=test_user.id,
        chunk_index=0,
        excerpt="Discussed release timeline with team.",
        start_offset=0,
        end_offset=37,
        source_time=utc_now(),
        vector_point_id=str(uuid.uuid4()),
    )
    db_session.add(chunk)
    db_session.commit()

    # List conversations
    res = client.get("/api/v1/conversations", headers=headers)
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["source_event_id"] == "omi_evt_test_conv"

    # Get conversation details
    res_detail = client.get(f"/api/v1/conversations/{conv.id}", headers=headers)
    assert res_detail.status_code == 200
    assert len(res_detail.json()["chunks"]) == 1
    assert res_detail.json()["chunks"][0]["excerpt"] == "Discussed release timeline with team."

    # 404 for unknown conversation
    res_404 = client.get(f"/api/v1/conversations/{uuid.uuid4()}", headers=headers)
    assert res_404.status_code == 404


def test_approvals_api_endpoints(client: TestClient, db_session: Session, test_user: User):
    headers = {"Authorization": f"Bearer {test_user.clerk_id}"}

    # Create integration and conversation first
    integration = OmiIntegration(
        user_id=test_user.id,
        installation_id="inst_appr_test",
        webhook_token_hash="fakehash_a",
        is_active=True,
    )
    db_session.add(integration)
    db_session.commit()
    db_session.refresh(integration)

    conv = Conversation(
        user_id=test_user.id,
        installation_id=integration.id,
        source_event_id="omi_evt_appr_test",
        normalized_transcript="Send architectural spec.",
        source_time=utc_now(),
        received_time=utc_now(),
    )
    db_session.add(conv)
    db_session.commit()
    db_session.refresh(conv)

    # Create finding
    f = Finding(
        user_id=test_user.id,
        conversation_id=conv.id,
        classification="new_commitment",
        topic_key="architecture_spec",
        new_value="Send architectural specification",
        explanation="Team lead requested spec document",
        confidence="high",
        status="pending_approval",
    )
    db_session.add(f)
    db_session.commit()
    db_session.refresh(f)

    # Create approval request
    req = ApprovalRequest(
        user_id=test_user.id,
        finding_id=f.id,
        action_payload={"title": "Send architectural specification", "category": "engineering"},
        status="pending",
        requester="agent",
        execution_key=f"exec_{uuid.uuid4()}",
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)

    # List approvals
    res = client.get("/api/v1/approvals", headers=headers)
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == str(req.id)

    # Get single approval
    res_get = client.get(f"/api/v1/approvals/{req.id}", headers=headers)
    assert res_get.status_code == 200
    assert res_get.json()["status"] == "pending"

    # 404 for unknown approval
    res_404 = client.get(f"/api/v1/approvals/{uuid.uuid4()}", headers=headers)
    assert res_404.status_code == 404
