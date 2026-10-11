"""Pydantic schemas for Conversation and Omi Webhook payloads."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TranscriptSegment(BaseModel):
    text: str
    speaker: str | None = "SPEAKER_00"
    is_user: bool | None = False
    start: float | None = 0.0
    end: float | None = 0.0


class StructuredMetadata(BaseModel):
    title: str | None = None
    overview: str | None = None
    category: str | None = None
    action_items: list[dict[str, Any]] | None = None


class OmiMemoryCreatedWebhook(BaseModel):
    id: str = Field(description="Unique source ID of memory/conversation from Omi")
    created_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    transcript_segments: list[TranscriptSegment] = Field(default_factory=list)
    structured: StructuredMetadata | None = None
    discarded: bool | None = False


class WebhookResponse(BaseModel):
    status: str
    conversation_id: uuid.UUID
    job_id: uuid.UUID | None = None
    message: str


class ConversationChunkRead(BaseModel):
    id: str
    excerpt: str
    vector_point_id: str
    source_time: datetime


class ConversationRead(BaseModel):
    id: uuid.UUID
    source_event_id: str
    title: str | None = None
    overview: str | None = None
    transcript_preview: str | None = None
    source_time: datetime
    created_at: datetime
    status: str


class ConversationDetailRead(BaseModel):
    id: uuid.UUID
    source_event_id: str
    title: str | None = None
    overview: str | None = None
    normalized_transcript: str
    raw_segments: list[dict[str, Any]]
    chunks: list[ConversationChunkRead] = []
    status: str
    created_at: datetime
