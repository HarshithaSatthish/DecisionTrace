from unittest.mock import MagicMock

from qdrant_client.http import models

from app.core.config import settings
from app.services.memory import ensure_collection_exists


def test_existing_collection_repairs_missing_conversation_filter_index():
    client = MagicMock()
    client.get_collections.return_value.collections = [MagicMock(name=settings.QDRANT_COLLECTION)]
    client.get_collections.return_value.collections[0].name = settings.QDRANT_COLLECTION
    info = client.get_collection.return_value
    info.config.params.vectors = models.VectorParams(size=settings.EMBEDDING_DIMENSION, distance=models.Distance.COSINE)
    info.payload_schema = {"user_id": object()}
    ensure_collection_exists(client)
    client.create_collection.assert_not_called()
    client.create_payload_index.assert_called_once_with(
        collection_name=settings.QDRANT_COLLECTION,
        field_name="conversation_id",
        field_schema=models.PayloadSchemaType.KEYWORD,
        wait=True,
    )
