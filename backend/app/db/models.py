"""Database SQLModel models for DecisionTrace."""

import uuid
from datetime import UTC, datetime
from typing import Any, Optional

from sqlalchemy import Column, UniqueConstraint
from sqlmodel import JSON, Field, Relationship, SQLModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    clerk_id: str = Field(unique=True, index=True, nullable=False)
    email: str | None = Field(default=None, nullable=True)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)

    integrations: list["OmiIntegration"] = Relationship(back_populates="user")
    conversations: list["Conversation"] = Relationship(back_populates="user")
    decisions: list["Decision"] = Relationship(back_populates="user")


class OmiIntegration(SQLModel, table=True):
    __tablename__ = "omi_integrations"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)
    external_omi_uid: str | None = Field(default=None, index=True)
    installation_id: str = Field(unique=True, index=True, nullable=False)
    webhook_token_hash: str = Field(unique=True, index=True, nullable=False)
    is_active: bool = Field(default=True, nullable=False)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)

    user: User | None = Relationship(back_populates="integrations")
    conversations: list["Conversation"] = Relationship(back_populates="installation")


class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("installation_id", "source_event_id", name="uq_conv_inst_source_event"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)
    installation_id: uuid.UUID = Field(
        foreign_key="omi_integrations.id", index=True, nullable=False
    )
    source_event_id: str = Field(index=True, nullable=False)
    title: str | None = Field(default=None)
    overview: str | None = Field(default=None)
    normalized_transcript: str = Field(nullable=False)
    raw_segments: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    original_metadata: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    source_time: datetime = Field(default_factory=utc_now, nullable=False)
    received_time: datetime = Field(default_factory=utc_now, nullable=False)
    status: str = Field(
        default="pending", index=True, nullable=False
    )  # pending, queued, processed, discarded, failed

    user: User | None = Relationship(back_populates="conversations")
    installation: OmiIntegration | None = Relationship(back_populates="conversations")
    jobs: list["ProcessingJob"] = Relationship(back_populates="conversation")
    chunks: list["ConversationChunk"] = Relationship(back_populates="conversation")
    findings: list["Finding"] = Relationship(back_populates="conversation")


class ProcessingJob(SQLModel, table=True):
    __tablename__ = "processing_jobs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    conversation_id: uuid.UUID = Field(foreign_key="conversations.id", index=True, nullable=False)
    state: str = Field(
        default="received", index=True, nullable=False
    )  # received, queued, running, awaiting_approval, completed, failed, retrying
    attempt_count: int = Field(default=0, nullable=False)
    error: str | None = Field(default=None)
    retry_schedule: datetime | None = Field(default=None)
    queued_at: datetime | None = Field(default=None)
    started_at: datetime | None = Field(default=None)
    finished_at: datetime | None = Field(default=None)
    rq_job_id: str | None = Field(default=None, index=True)
    milestones: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))

    conversation: Conversation | None = Relationship(back_populates="jobs")


class ConversationChunk(SQLModel, table=True):
    __tablename__ = "conversation_chunks"

    id: str = Field(primary_key=True)  # Deterministic stable chunk ID e.g. chk_<conv_id>_<idx>
    conversation_id: uuid.UUID = Field(foreign_key="conversations.id", index=True, nullable=False)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)
    chunk_index: int = Field(nullable=False)
    excerpt: str = Field(nullable=False)
    start_offset: int = Field(default=0, nullable=False)
    end_offset: int = Field(default=0, nullable=False)
    source_time: datetime = Field(default_factory=utc_now, nullable=False)
    vector_point_id: str = Field(index=True, nullable=False)

    conversation: Conversation | None = Relationship(back_populates="chunks")


class Decision(SQLModel, table=True):
    __tablename__ = "decisions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)
    topic: str = Field(index=True, nullable=False)
    current_commitment: str = Field(nullable=False)
    owner: str | None = Field(default=None)
    due_date: datetime | None = Field(default=None)
    state: str = Field(default="active", index=True, nullable=False)  # active, superseded, archived
    version: int = Field(default=1, nullable=False)  # Optimistic concurrency version
    source_provenance: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)

    user: User | None = Relationship(back_populates="decisions")
    evidence: list["DecisionEvidence"] = Relationship(back_populates="decision")
    tasks: list["Task"] = Relationship(back_populates="decision")


class DecisionEvidence(SQLModel, table=True):
    __tablename__ = "decision_evidence"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    decision_id: uuid.UUID | None = Field(default=None, foreign_key="decisions.id", index=True)
    finding_id: uuid.UUID | None = Field(default=None, foreign_key="findings.id", index=True)
    chunk_id: str = Field(foreign_key="conversation_chunks.id", index=True, nullable=False)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)

    decision: Decision | None = Relationship(back_populates="evidence")
    finding: Optional["Finding"] = Relationship(back_populates="evidence_links")


class AgentRun(SQLModel, table=True):
    __tablename__ = "agent_runs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    conversation_id: uuid.UUID = Field(foreign_key="conversations.id", index=True, nullable=False)
    provider: str = Field(default="lyzr", nullable=False)
    agent_id: str = Field(nullable=False)
    run_reference: str = Field(nullable=False)
    outcome: str = Field(nullable=False)  # success, error
    error_message: str | None = Field(default=None)
    stage_events: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    started_at: datetime = Field(default_factory=utc_now, nullable=False)
    finished_at: datetime | None = Field(default=None)

    findings: list["Finding"] = Relationship(back_populates="agent_run")


class Finding(SQLModel, table=True):
    __tablename__ = "findings"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)
    conversation_id: uuid.UUID = Field(foreign_key="conversations.id", index=True, nullable=False)
    agent_run_id: uuid.UUID | None = Field(default=None, foreign_key="agent_runs.id", index=True)
    classification: str = Field(
        index=True, nullable=False
    )  # new_commitment, unchanged, superseding_change, possible_conflict, insufficient_evidence
    topic_key: str | None = Field(default=None, index=True)
    previous_value: str | None = Field(default=None)
    new_value: str | None = Field(default=None)
    explanation: str = Field(nullable=False)
    confidence: str = Field(default="medium", nullable=False)  # low, medium, high
    status: str = Field(
        default="pending_approval", index=True, nullable=False
    )  # pending_approval, approved, rejected, clarified, auto_applied
    created_at: datetime = Field(default_factory=utc_now, nullable=False)

    conversation: Conversation | None = Relationship(back_populates="findings")
    agent_run: AgentRun | None = Relationship(back_populates="findings")
    evidence_links: list[DecisionEvidence] = Relationship(back_populates="finding")
    approval_request: Optional["ApprovalRequest"] = Relationship(back_populates="finding")


class ApprovalRequest(SQLModel, table=True):
    __tablename__ = "approval_requests"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)
    finding_id: uuid.UUID = Field(
        foreign_key="findings.id", unique=True, index=True, nullable=False
    )
    status: str = Field(
        default="pending", index=True, nullable=False
    )  # pending, approved, rejected, clarified
    action_payload: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    requester: str = Field(default="agent", nullable=False)
    approver: str | None = Field(default=None)
    resolution_note: str | None = Field(default=None)
    execution_key: str = Field(unique=True, index=True, nullable=False)  # One-time idempotent key
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    resolved_at: datetime | None = Field(default=None)

    finding: Finding | None = Relationship(back_populates="approval_request")


class Task(SQLModel, table=True):
    __tablename__ = "tasks"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)
    decision_id: uuid.UUID | None = Field(default=None, foreign_key="decisions.id", index=True)
    title: str = Field(nullable=False)
    description: str | None = Field(default=None)
    owner: str | None = Field(default=None)
    due_date: datetime | None = Field(default=None)
    status: str = Field(
        default="pending", index=True, nullable=False
    )  # pending, in_progress, completed, cancelled
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)

    decision: Decision | None = Relationship(back_populates="tasks")


class AuditEvent(SQLModel, table=True):
    __tablename__ = "audit_events"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)
    action: str = Field(index=True, nullable=False)
    actor_type: str = Field(nullable=False)  # user, agent, system
    actor_id: str = Field(nullable=False)
    entity_type: str = Field(
        index=True, nullable=False
    )  # decision, approval, finding, omi_integration
    entity_id: str = Field(index=True, nullable=False)
    before_state: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    after_state: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    timestamp: datetime = Field(default_factory=utc_now, nullable=False)
