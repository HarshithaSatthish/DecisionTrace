"""Unit tests for Vector Memory, FastEmbed 384-d vectors, and multitenant retrieval isolation."""

import uuid

from app.db.models import utc_now
from app.services.chunking import chunk_transcript
from app.services.memory import generate_embeddings, get_qdrant_client, upsert_chunks
from app.services.retrieval import retrieve_prior_evidence


def test_chunking_service_produces_deterministic_ids():
    conv_id = uuid.uuid4()
    user_id = uuid.uuid4()
    transcript = "The quick brown fox jumps over the lazy dog. " * 30

    chunks = chunk_transcript(
        conversation_id=conv_id,
        user_id=user_id,
        transcript=transcript,
        source_time=utc_now(),
        chunk_size=20,
        chunk_overlap=5,
    )

    assert len(chunks) > 1
    assert chunks[0].id == f"chk_{str(conv_id)[:8]}_000"
    assert chunks[1].id == f"chk_{str(conv_id)[:8]}_001"
    assert chunks[0].start_offset == 0
    assert chunks[0].end_offset > 0
    assert chunks[0].vector_point_id is not None


def test_fastembed_generates_384_dimensional_vectors():
    texts = ["DecisionTrace autonomous commitment guardian", "Prototype review moved to Thursday"]
    embeddings = generate_embeddings(texts)

    assert len(embeddings) == 2
    assert len(embeddings[0]) == 384
    assert len(embeddings[1]) == 384


def test_multitenant_isolation_and_conversation_exclusion():
    qc = get_qdrant_client()

    user_a = uuid.uuid4()
    user_b = uuid.uuid4()
    conv_1 = uuid.uuid4()
    conv_2 = uuid.uuid4()

    # Index chunks for User A in Conversation 1
    chunks_user_a_conv_1 = chunk_transcript(
        conversation_id=conv_1,
        user_id=user_a,
        transcript="The architecture review is scheduled for Monday at 10 AM.",
        source_time=utc_now(),
    )
    upsert_chunks(chunks_user_a_conv_1, client=qc)

    # Index chunks for User B in Conversation 2 (identical text!)
    chunks_user_b_conv_2 = chunk_transcript(
        conversation_id=conv_2,
        user_id=user_b,
        transcript="The architecture review is scheduled for Monday at 10 AM.",
        source_time=utc_now(),
    )
    upsert_chunks(chunks_user_b_conv_2, client=qc)

    # 1. User A searches: must retrieve User A's chunk only
    res_a = retrieve_prior_evidence(
        user_id=user_a,
        exclude_conversation_id=uuid.uuid4(),  # Different conversation
        query_text="When is the architecture review?",
        top_k=5,
        score_threshold=0.3,
        client=qc,
    )
    assert len(res_a) > 0
    for hit in res_a:
        assert hit.conversation_id == conv_1

    # 2. User B searches: must retrieve User B's chunk only
    res_b = retrieve_prior_evidence(
        user_id=user_b,
        exclude_conversation_id=uuid.uuid4(),
        query_text="When is the architecture review?",
        top_k=5,
        score_threshold=0.3,
        client=qc,
    )
    assert len(res_b) > 0
    for hit in res_b:
        assert hit.conversation_id == conv_2

    # 3. Conversation Exclusion: When User A is in conv_1, conv_1 must be EXCLUDED
    res_excluded = retrieve_prior_evidence(
        user_id=user_a,
        exclude_conversation_id=conv_1,  # Exclude current conversation!
        query_text="When is the architecture review?",
        top_k=5,
        score_threshold=0.3,
        client=qc,
    )
    # Must NOT return conv_1 chunks!
    assert len(res_excluded) == 0


def test_production_mode_raises_when_qdrant_unreachable(monkeypatch):
    """Verify that in production, unreachable Qdrant raises RuntimeError instead of falling back to :memory:."""
    import pytest
    from app.core.config import settings
    import app.services.memory as mem_service

    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "QDRANT_URL", "http://non-existent-cluster.invalid:6333")
    monkeypatch.setattr(mem_service, "_qdrant_client", None)

    with pytest.raises(RuntimeError, match="Remote Qdrant unavailable in production"):
        mem_service.get_qdrant_client()
