"""Retrieval service: semantic search with mandatory tenant isolation and conversation exclusion."""

import logging
import uuid
from datetime import datetime

from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from app.core.config import settings
from app.schemas.agent import HistoricalEvidenceInput
from app.services.memory import generate_embeddings, get_qdrant_client

logger = logging.getLogger(__name__)


def retrieve_prior_evidence(
    user_id: uuid.UUID,
    exclude_conversation_id: uuid.UUID,
    query_text: str,
    top_k: int = 5,
    score_threshold: float = 0.5,
    client: QdrantClient | None = None,
) -> list[HistoricalEvidenceInput]:
    """Search prior evidence chunks in Qdrant scoped to user_id, excluding current conversation."""
    if not query_text or not query_text.strip():
        return []

    qc = client or get_qdrant_client()
    query_vectors = generate_embeddings([query_text])
    if not query_vectors:
        return []

    query_vector = query_vectors[0]

    # Server-side multitenant filter: mandatory user_id & exclude current conversation
    query_filter = qmodels.Filter(
        must=[
            qmodels.FieldCondition(
                key="user_id",
                match=qmodels.MatchValue(value=str(user_id)),
            ),
        ],
        must_not=[
            qmodels.FieldCondition(
                key="conversation_id",
                match=qmodels.MatchValue(value=str(exclude_conversation_id)),
            ),
        ],
    )

    try:
        search_result = qc.query_points(
            collection_name=settings.QDRANT_COLLECTION,
            query=query_vector,
            query_filter=query_filter,
            limit=top_k,
            score_threshold=score_threshold,
        )
        scored_points = search_result.points
    except Exception as e:
        logger.warning(f"Error querying Qdrant: {e}")
        return []

    evidence_items: list[HistoricalEvidenceInput] = []
    for hit in scored_points:
        payload = hit.payload or {}
        source_time_str = payload.get("source_time")
        source_time = datetime.fromisoformat(source_time_str) if source_time_str else None

        conv_id_raw = payload.get("conversation_id")
        try:
            conv_uuid = uuid.UUID(conv_id_raw) if conv_id_raw else uuid.uuid4()
        except ValueError:
            conv_uuid = uuid.uuid4()

        evidence_items.append(
            HistoricalEvidenceInput(
                chunk_id=str(payload.get("chunk_id", hit.id)),
                conversation_id=conv_uuid,
                excerpt=str(payload.get("excerpt", "")),
                source_time=source_time,
            )
        )

    logger.info(f"Retrieved {len(evidence_items)} historical evidence chunks for user {user_id}")
    return evidence_items
