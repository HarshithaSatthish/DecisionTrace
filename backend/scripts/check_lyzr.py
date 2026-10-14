"""Verify the live backend agent contract without persisting or executing any action."""

import asyncio
import uuid

from app.core.config import settings
from app.schemas.agent import AgentInvocationPayload
from app.services.agent_adapter import LyzrAgentAdapter

assert settings.APP_ENV == "production", "Live verification must never use development fallback."
payload = AgentInvocationPayload(
    user_id=str(uuid.uuid4()),
    conversation_id=uuid.uuid4(),
    new_transcript="We decided that Alice will deliver the PostgreSQL migration scripts by 2026-10-20.",
    new_evidence_ids=["live_check_source"],
)
result = asyncio.run(LyzrAgentAdapter().analyze_conversation(payload))
assert result.proposed_action and result.requires_human_approval
assert result.evidence_chunk_ids == ["live_check_source"]
assert result.proposed_action.owner == "Alice"
assert result.proposed_action.due_date and result.proposed_action.due_date.date().isoformat() == "2026-10-20"
print("Live backend Lyzr extraction, owner, deadline, source grounding, and approval gating verified.")
