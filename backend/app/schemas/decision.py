"""Pydantic schemas for Decisions and Commitments."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.schemas.finding import EvidenceItem


class DecisionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    topic: str
    current_commitment: str
    owner: str | None = None
    due_date: datetime | None = None
    state: str
    version: int
    updated_at: datetime
    created_at: datetime
    source_evidence: list[EvidenceItem] = []


class DecisionDetailRead(DecisionRead):
    source_provenance: dict[str, Any] = {}
    evidence_chunk_ids: list[str] = []


class DecisionListResponse(BaseModel):
    items: list[DecisionRead]
    total: int
    limit: int
    offset: int
