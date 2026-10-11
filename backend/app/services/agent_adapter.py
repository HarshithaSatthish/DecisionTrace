"""Lyzr Agent Adapter service: payload construction, external API invocation, and strict validation."""

import json
import logging
import re
from typing import Any

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.config import settings
from app.schemas.agent import (
    AgentAnalysisResult,
    AgentInvocationPayload,
    ProposedAction,
)

logger = logging.getLogger(__name__)


class AgentValidationError(Exception):
    """Raised when agent output fails security or schema constraints."""


class LyzrAgentAdapter:
    """Adapter for Lyzr Manager Agent with fallback and strict server-side validation."""

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or settings.LYZR_API_KEY
        self.base_url = (base_url or settings.LYZR_BASE_URL).rstrip("/")
        self.manager_agent_id = settings.LYZR_MANAGER_AGENT_ID

    async def analyze_conversation(
        self,
        payload: AgentInvocationPayload,
    ) -> AgentAnalysisResult:
        """Execute agent analysis via live Lyzr API or deterministic verification engine."""
        valid_chunk_ids: set[str] = set(payload.new_evidence_ids) | {
            h.chunk_id for h in payload.historical_evidence
        }

        if self.api_key and self.manager_agent_id:
            try:
                raw_result = await self._call_lyzr_api(payload)
                return self._validate_and_sanitize(raw_result, payload, valid_chunk_ids)
            except Exception as e:
                logger.error(f"Lyzr API invocation failed: {e}")
                if settings.APP_ENV.lower() == "production":
                    raise RuntimeError(f"Live Lyzr Agent call failed in production: {e}") from e
                logger.warning("Falling back to deterministic test evaluation engine for non-production environment.")

        if settings.APP_ENV.lower() == "production":
            raise RuntimeError(
                "Lyzr integration unconfigured in production: LYZR_API_KEY and LYZR_MANAGER_AGENT_ID are required."
            )

        # Deterministic verification engine (for test verification & offline local usage)
        return self._deterministic_analyze(payload, valid_chunk_ids)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        retry=retry_if_exception_type(httpx.RequestError),
        reraise=True,
    )
    async def _call_lyzr_api(self, payload: AgentInvocationPayload) -> dict[str, Any]:
        """Direct HTTPX call to Lyzr Manager API with timeouts and retries."""
        url = f"{self.base_url}/chat"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "x-agent-id": str(self.manager_agent_id),
        }
        body = {
            "message": (
                "Analyze the following conversation context for commitments and decisions. "
                "Respond strictly with the specified JSON schema."
            ),
            "context": payload.model_dump(mode="json"),
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
            # If agent response is wrapped in string or json field
            if isinstance(data.get("response"), str):
                try:
                    return json.loads(data["response"])
                except json.JSONDecodeError:
                    pass
            return data

    def _validate_and_sanitize(
        self,
        raw_data: dict[str, Any],
        payload: AgentInvocationPayload,
        valid_chunk_ids: set[str],
    ) -> AgentAnalysisResult:
        """Validate result against schema, drop hallucinated chunk IDs, enforce human approval."""
        result = AgentAnalysisResult.model_validate(raw_data)

        # 1. Hallucination guard: Filter out any evidence chunk ID not in provided evidence
        filtered_chunks = [cid for cid in result.evidence_chunk_ids if cid in valid_chunk_ids]
        if not filtered_chunks and payload.new_evidence_ids:
            # Fall back to linking current conversation chunk
            filtered_chunks = [payload.new_evidence_ids[0]]
        result.evidence_chunk_ids = filtered_chunks

        # 2. Allowlisted action guard
        if result.proposed_action:
            if result.proposed_action.kind not in payload.allowed_actions:
                logger.warning(
                    f"Agent proposed non-allowlisted action '{result.proposed_action.kind}'. Rejecting action."
                )
                result.proposed_action = None

        # 3. Always enforce human approval for mutations
        result.requires_human_approval = True
        return result

    def _deterministic_analyze(
        self,
        payload: AgentInvocationPayload,
        valid_chunk_ids: set[str],
    ) -> AgentAnalysisResult:
        """Deterministic analyzer simulating Lyzr agent contract for verified offline execution."""
        transcript_lower = payload.new_transcript.lower()

        # Check for historical evidence indicating an existing commitment
        historical_excerpts = [h.excerpt.lower() for h in payload.historical_evidence]
        has_historical_commitment = (
            len(historical_excerpts) > 0 or len(payload.existing_decisions) > 0
        )

        # Topic detection heuristics
        topic_key = "general_commitment"
        if (
            "review" in transcript_lower
            or "meeting" in transcript_lower
            or "prototype" in transcript_lower
        ):
            topic_key = "prototype_review"
        elif "deploy" in transcript_lower or "release" in transcript_lower:
            topic_key = "deployment_schedule"
        elif "deadline" in transcript_lower:
            topic_key = "project_deadline"

        # Evidence chunks to cite
        cited_chunks = list(valid_chunk_ids)

        # Check for superseding / change wording
        is_change = any(
            word in transcript_lower
            for word in [
                "moved to",
                "rescheduled",
                "changed to",
                "postponed to",
                "instead",
                "shift",
            ]
        )

        if has_historical_commitment and is_change:
            # Extract previous and new values
            previous_val = "Previous schedule"
            if payload.existing_decisions:
                previous_val = payload.existing_decisions[0].current_commitment
            elif payload.historical_evidence:
                previous_val = payload.historical_evidence[0].excerpt

            target_decision_id = (
                payload.existing_decisions[0].decision_id if payload.existing_decisions else None
            )

            # Extract new value if present
            new_val = payload.new_transcript
            time_match = re.search(
                r"(thursday|friday|monday|tuesday|wednesday|tomorrow|\d+\s*(am|pm))",
                transcript_lower,
            )
            if time_match:
                new_val = payload.new_transcript

            return AgentAnalysisResult(
                classification="superseding_change",
                topic_key=topic_key,
                previous_value=previous_val,
                new_value=new_val,
                evidence_chunk_ids=cited_chunks,
                explanation=f"The latest conversation explicitly modifies the commitment for '{topic_key}'.",
                confidence="high",
                proposed_action=ProposedAction(
                    kind="request_decision_update",
                    target_decision_id=target_decision_id,
                    new_value=new_val,
                    topic=topic_key,
                ),
                requires_human_approval=True,
            )

        elif not has_historical_commitment and any(
            w in transcript_lower
            for w in ["will", "is scheduled", "agreed", "decided", "at", "due", "let's"]
        ):
            return AgentAnalysisResult(
                classification="new_commitment",
                topic_key=topic_key,
                previous_value=None,
                new_value=payload.new_transcript,
                evidence_chunk_ids=list(payload.new_evidence_ids),
                explanation=f"Identified initial commitment proposal for topic '{topic_key}'.",
                confidence="high",
                proposed_action=ProposedAction(
                    kind="create_decision",
                    new_value=payload.new_transcript,
                    topic=topic_key,
                ),
                requires_human_approval=True,
            )

        elif has_historical_commitment and any(
            w in transcript_lower for w in ["disagree", "conflict", "wait no"]
        ):
            return AgentAnalysisResult(
                classification="possible_conflict",
                topic_key=topic_key,
                previous_value=payload.historical_evidence[0].excerpt
                if payload.historical_evidence
                else "Unknown",
                new_value=payload.new_transcript,
                evidence_chunk_ids=cited_chunks,
                explanation="Ambiguous conflict detected between historical decision and current statement.",
                confidence="medium",
                proposed_action=ProposedAction(
                    kind="request_clarification",
                    topic=topic_key,
                ),
                requires_human_approval=True,
            )

        return AgentAnalysisResult(
            classification="insufficient_evidence",
            topic_key=None,
            previous_value=None,
            new_value=None,
            evidence_chunk_ids=list(payload.new_evidence_ids),
            explanation="The transcript contains casual dialogue with no clear actionable commitment.",
            confidence="low",
            proposed_action=None,
            requires_human_approval=False,
        )
