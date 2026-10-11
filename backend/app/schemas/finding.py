"""Pydantic schemas for Findings and Evidence links."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class EvidenceItem(BaseModel):
    chunk_id: str
    excerpt: str
    conversation_id: uuid.UUID
    source_time: datetime | None = None


class FindingRead(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    classification: str
    topic_key: str | None = None
    previous_value: str | None = None
    new_value: str | None = None
    explanation: str
    confidence: str
    status: str
    evidence: list[EvidenceItem] = []
    created_at: datetime


class FindingListResponse(BaseModel):
    items: list[FindingRead]
    total: int
    limit: int
    offset: int
