"""Pydantic schemas for Agent Handoff and Lyzr Adapter Contract."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

AgentClassification = Literal[
    "new_commitment",
    "unchanged",
    "superseding_change",
    "possible_conflict",
    "insufficient_evidence",
]

ActionKind = Literal[
    "create_decision",
    "request_decision_update",
    "create_task",
    "request_clarification",
]


class HistoricalEvidenceInput(BaseModel):
    chunk_id: str
    conversation_id: uuid.UUID
    excerpt: str
    source_time: datetime | None = None


class ExistingDecisionInput(BaseModel):
    decision_id: uuid.UUID
    topic: str
    current_commitment: str
    version: int


class NewEvidenceInput(BaseModel):
    chunk_id: str
    excerpt: str


class AgentInvocationPayload(BaseModel):
    user_id: str
    conversation_id: uuid.UUID
    new_transcript: str
    new_evidence_ids: list[str]
    # Chunk id -> excerpt map so the agent can cite real evidence IDs
    new_evidence: list[NewEvidenceInput] = []
    # ISO date the conversation happened; anchor for relative deadlines ("by Thursday")
    conversation_date: str | None = None
    historical_evidence: list[HistoricalEvidenceInput] = []
    existing_decisions: list[ExistingDecisionInput] = []
    allowed_actions: list[ActionKind] = [
        "create_decision",
        "request_decision_update",
        "create_task",
        "request_clarification",
    ]


class ProposedAction(BaseModel):
    kind: ActionKind
    target_decision_id: uuid.UUID | None = None
    expected_version: int | None = Field(default=None, ge=1)
    new_value: str | None = None
    topic: str | None = None
    owner: str | None = None
    due_date: datetime | None = None


class AgentAnalysisResult(BaseModel):
    classification: AgentClassification
    topic_key: str | None = None
    previous_value: str | None = None
    new_value: str | None = None
    evidence_chunk_ids: list[str] = Field(default_factory=list)
    explanation: str
    confidence: Literal["low", "medium", "high"] = "medium"
    proposed_action: ProposedAction | None = None
    requires_human_approval: bool = True
    run_reference: str | None = None
    stage_events: list[dict[str, Any]] = Field(default_factory=list)
