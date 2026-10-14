"""Pydantic schemas for Decisions and Commitments."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.finding import EvidenceItem


class DecisionEvidenceItem(BaseModel):
    chunk_id: str
    conversation_id: uuid.UUID | None = None
    excerpt: str
    source_time: datetime | None = None


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
    # validation_alias keeps the ORM `Decision.evidence` relationship from being read here;
    # the API fills this explicitly with tenant-scoped excerpts.
    evidence: list[DecisionEvidenceItem] = Field(default_factory=list, validation_alias="evidence_excerpts")


class DecisionDetailRead(DecisionRead):
    source_provenance: dict[str, Any] = {}
    evidence_chunk_ids: list[str] = []


class DecisionListResponse(BaseModel):
    items: list[DecisionRead]
    total: int
    limit: int
    offset: int
