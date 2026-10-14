"""Decision list returns tenant-scoped evidence excerpts (dashboard showed 0 citations)."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import Conversation, ConversationChunk, Decision, DecisionEvidence, OmiIntegration, User


def test_decision_list_includes_evidence(
    client: TestClient, db_session: Session, test_user: User, test_integration: tuple[OmiIntegration, str]
):
    other = User(clerk_id="user_other_tenant", email="o@x")
    db_session.add(other)
    db_session.commit()
    conv = Conversation(
        user_id=test_user.id,
        installation_id=test_integration[0].id,
        source_event_id="ev1",
        normalized_transcript="t",
        status="processed",
    )
    db_session.add(conv)
    db_session.commit()
    chunk = ConversationChunk(
        id=f"chk_{conv.id.hex[:8]}_000", conversation_id=conv.id, user_id=test_user.id,
        chunk_index=0, excerpt="We decided to launch on Friday.", vector_point_id=str(uuid.uuid4()),
    )
    dec = Decision(user_id=test_user.id, topic="launch", current_commitment="Friday", state="active", version=1)
    db_session.add_all([chunk, dec])
    db_session.commit()
    db_session.add(DecisionEvidence(decision_id=dec.id, chunk_id=chunk.id))
    db_session.commit()

    r = client.get("/api/v1/decisions", headers={"Authorization": f"Bearer {test_user.clerk_id}"})
    assert r.status_code == 200
    item = r.json()["items"][0]
    assert item["evidence"][0]["excerpt"] == "We decided to launch on Friday."

    r2 = client.get("/api/v1/decisions", headers={"Authorization": f"Bearer {other.clerk_id}"})
    assert r2.json()["items"] == []
