"""Pydantic schemas for Human Approvals and Action Payloads."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.schemas.decision import DecisionRead


class ApprovalRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    finding_id: uuid.UUID
    status: str
    action_payload: dict[str, Any]
    requester: str
    execution_key: str
    created_at: datetime
    resolved_at: datetime | None = None


class ApprovalListResponse(BaseModel):
    items: list[ApprovalRequestRead]
    total: int
    limit: int
    offset: int


class ApproveActionRequest(BaseModel):
    execution_key: str
    note: str | None = None


class RejectActionRequest(BaseModel):
    reason: str | None = "Rejected by reviewer"


class ClarifyActionRequest(BaseModel):
    clarification_request: str


class ApprovalExecutionResponse(BaseModel):
    id: uuid.UUID
    status: str
    executed_at: datetime
    resulting_decision: DecisionRead | None = None
    message: str
