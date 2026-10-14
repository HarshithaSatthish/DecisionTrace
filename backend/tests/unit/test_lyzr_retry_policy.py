"""Lyzr retry policy: retry transient failures only (MOCKED transport, no live calls)."""

import uuid

import httpx
import pytest

from app.schemas.agent import AgentInvocationPayload
from app.services.agent_adapter import LyzrAgentAdapter, _is_retryable_lyzr_error


def _err(code: int) -> httpx.HTTPStatusError:
    req = httpx.Request("POST", "https://agent-prod.studio.lyzr.ai/v3/inference/chat/")
    return httpx.HTTPStatusError("x", request=req, response=httpx.Response(code, request=req))


@pytest.mark.parametrize("code,expected", [(429, True), (503, True), (500, True), (401, False), (400, False), (422, False)])
def test_retry_classification(code, expected):
    assert _is_retryable_lyzr_error(_err(code)) is expected


def test_transport_error_is_retryable():
    assert _is_retryable_lyzr_error(httpx.ConnectTimeout("t"))


@pytest.mark.asyncio
async def test_429_then_success_is_retried(monkeypatch):
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, json={"detail": "rate limited"})
        return httpx.Response(200, json={"response": '{"classification":"insufficient_evidence","explanation":"ok"}'})

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    adapter = LyzrAgentAdapter(api_key="test", base_url="https://agent-prod.studio.lyzr.ai/v3")
    adapter.manager_agent_id = "agent_test"
    payload = AgentInvocationPayload(
        user_id="u", conversation_id=uuid.uuid4(), new_transcript="TEST", new_evidence_ids=["c1"]
    )
    out = await adapter._call_lyzr_api(payload)
    assert calls["n"] == 2
    assert out["classification"] == "insufficient_evidence"
