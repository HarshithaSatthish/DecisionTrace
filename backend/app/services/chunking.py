"""Chunking service: produces deterministic transcript chunks with evidence offsets."""

import uuid
from datetime import datetime

from app.db.models import ConversationChunk, utc_now


def chunk_transcript(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    transcript: str,
    source_time: datetime,
    chunk_size: int = 250,
    chunk_overlap: int = 50,
) -> list[ConversationChunk]:
    """Split transcript into overlapping chunks with deterministic IDs and offsets."""
    if not transcript or not transcript.strip():
        return []

    words = transcript.strip().split()
    if not words:
        return []

    chunks: list[ConversationChunk] = []
    chunk_idx = 0
    start_word_idx = 0

    while start_word_idx < len(words):
        end_word_idx = min(start_word_idx + chunk_size, len(words))
        chunk_words = words[start_word_idx:end_word_idx]
        excerpt = " ".join(chunk_words)

        start_offset = len(" ".join(words[:start_word_idx]))
        if start_word_idx > 0:
            start_offset += 1  # count the space
        end_offset = start_offset + len(excerpt)

        # Deterministic IDs
        chunk_id = f"chk_{str(conversation_id)[:8]}_{chunk_idx:03d}"
        vector_point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{conversation_id}_{chunk_id}"))

        chunks.append(
            ConversationChunk(
                id=chunk_id,
                conversation_id=conversation_id,
                user_id=user_id,
                chunk_index=chunk_idx,
                excerpt=excerpt,
                start_offset=start_offset,
                end_offset=end_offset,
                source_time=source_time or utc_now(),
                vector_point_id=vector_point_id,
            )
        )

        chunk_idx += 1
        if end_word_idx >= len(words):
            break
        start_word_idx += max(1, chunk_size - chunk_overlap)

    return chunks
