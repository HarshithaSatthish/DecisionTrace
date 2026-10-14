"""Verify real Qdrant storage and retrieval using a disposable, uniquely named collection."""

import uuid

from app.core.config import settings
from app.db.models import utc_now
from app.services.chunking import chunk_transcript
from app.services.memory import get_qdrant_client, upsert_chunks
from app.services.retrieval import retrieve_prior_evidence

assert settings.APP_ENV == "production", "Live checks must fail on provider errors rather than fall back."
assert settings.QDRANT_API_KEY and settings.QDRANT_URL
settings.QDRANT_COLLECTION = f"decisiontrace_check_{uuid.uuid4().hex}"
client = get_qdrant_client()
try:
    owner, other, conversation = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    chunks = chunk_transcript(conversation, owner, "We decided to use PostgreSQL for our primary database.", utc_now())
    upsert_chunks(chunks, client)
    found = retrieve_prior_evidence(owner, uuid.uuid4(), "PostgreSQL primary database", score_threshold=0.1, client=client)
    assert found and found[0].chunk_id == chunks[0].id
    assert not retrieve_prior_evidence(other, uuid.uuid4(), "PostgreSQL primary database", client=client)
    assert not retrieve_prior_evidence(owner, conversation, "PostgreSQL primary database", client=client)
    print("Live Qdrant storage, retrieval, user isolation, and conversation exclusion verified.")
finally:
    client.delete_collection(settings.QDRANT_COLLECTION)
    client.close()
