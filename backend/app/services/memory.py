"""Vector memory service using Qdrant and FastEmbed (BAAI/bge-small-en-v1.5)."""

import logging

from fastembed import TextEmbedding
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from app.core.config import settings
from app.db.models import ConversationChunk

logger = logging.getLogger(__name__)

_qdrant_client: QdrantClient | None = None
_embedding_model: TextEmbedding | None = None


def get_qdrant_client() -> QdrantClient:
    """Get or initialize singleton Qdrant client with automatic test/offline fallback.
    In production (APP_ENV == 'production'), remote Qdrant failure raises RuntimeError
    to prevent silent loss of durable semantic memory.
    """
    global _qdrant_client
    if _qdrant_client is None:
        if settings.APP_ENV == "test":
            _qdrant_client = QdrantClient(":memory:")
        elif settings.QDRANT_URL and not settings.QDRANT_URL.startswith("memory"):
            try:
                client = QdrantClient(
                    url=settings.QDRANT_URL,
                    api_key=settings.QDRANT_API_KEY,
                    timeout=2.0,
                    check_compatibility=False,
                )
                client.get_collections()
                _qdrant_client = client
            except Exception as e:
                if settings.APP_ENV == "production":
                    logger.error(f"FATAL: Remote Qdrant connection failed in production: {e}")
                    raise RuntimeError(f"Remote Qdrant unavailable in production: {e}") from e
                logger.warning(f"Remote Qdrant unreachable ({e}), falling back to in-memory mode for dev/test")
                _qdrant_client = QdrantClient(":memory:")
        else:
            if settings.APP_ENV == "production":
                raise RuntimeError("QDRANT_URL must be configured with a remote cluster in production")
            _qdrant_client = QdrantClient(":memory:")
        ensure_collection_exists(_qdrant_client)
    return _qdrant_client


def get_embedding_model() -> TextEmbedding:
    """Get or lazy-load FastEmbed CPU model."""
    global _embedding_model
    if _embedding_model is None:
        logger.info(f"Loading FastEmbed model: {settings.EMBEDDING_MODEL}")
        _embedding_model = TextEmbedding(model_name=settings.EMBEDDING_MODEL)
    return _embedding_model


def ensure_collection_exists(client: QdrantClient | None = None) -> None:
    """Ensure vector collection exists with 384-dimensional cosine distance."""
    qc = client or get_qdrant_client()
    collection_name = settings.QDRANT_COLLECTION
    try:
        collections = qc.get_collections().collections
        exists = any(c.name == collection_name for c in collections)
        if not exists:
            logger.info(f"Creating Qdrant collection '{collection_name}' with 384 dimensions")
            qc.create_collection(
                collection_name=collection_name,
                vectors_config=qmodels.VectorParams(
                    size=settings.EMBEDDING_DIMENSION,
                    distance=qmodels.Distance.COSINE,
                ),
            )
            # Create payload index for fast user_id multitenant filtering
            qc.create_payload_index(
                collection_name=collection_name,
                field_name="user_id",
                field_schema=qmodels.PayloadSchemaType.KEYWORD,
            )
    except Exception as e:
        logger.warning(f"Could not verify Qdrant collection: {e}")


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate 384-dimensional dense vectors using FastEmbed."""
    if not texts:
        return []
    model = get_embedding_model()
    embeddings = list(model.embed(texts))
    return [e.tolist() for e in embeddings]


def upsert_chunks(chunks: list[ConversationChunk], client: QdrantClient | None = None) -> None:
    """Embed and index chunks into Qdrant collection with payload."""
    if not chunks:
        return

    qc = client or get_qdrant_client()
    texts = [c.excerpt for c in chunks]
    vectors = generate_embeddings(texts)

    points: list[qmodels.PointStruct] = []
    for chunk, vector in zip(chunks, vectors):
        points.append(
            qmodels.PointStruct(
                id=chunk.vector_point_id,
                vector=vector,
                payload={
                    "user_id": str(chunk.user_id),
                    "conversation_id": str(chunk.conversation_id),
                    "chunk_id": chunk.id,
                    "excerpt": chunk.excerpt,
                    "start_offset": chunk.start_offset,
                    "end_offset": chunk.end_offset,
                    "source_time": chunk.source_time.isoformat() if chunk.source_time else None,
                },
            )
        )

    qc.upsert(
        collection_name=settings.QDRANT_COLLECTION,
        points=points,
    )
    logger.info(
        f"Upserted {len(points)} chunks into Qdrant collection '{settings.QDRANT_COLLECTION}'"
    )
