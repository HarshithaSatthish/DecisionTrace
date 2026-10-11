from __future__ import annotations

import asyncio
import json
import uuid

import httpx
from jsonschema import Draft202012Validator

from decisiontrace_testing import runner
from decisiontrace_testing.config import (
    MOCK_ROUTES_FILE,
    RESPONSE_SCHEMAS_FILE,
    configured_target_url,
    real_mutations_enabled,
    real_target_is_explicitly_safe,
)
from decisiontrace_testing.simulator import app
from decisiontrace_testing.config import read_yaml


def call_api(
    path: str,
    *,
    method: str = "GET",
    json_body=None,
    headers: dict[str, str] | None = None,
    session: str | None = None,
) -> httpx.Response:
    auth_config = read_yaml(MOCK_ROUTES_FILE).get("test_auth", {})
    default_headers = {
        "Authorization": f"Bearer {auth_config.get('token', 'fixture-test-token')}",
        "X-User-Id": auth_config.get("user_id", "user-fixture-001"),
        "X-Org-Id": auth_config.get("org_id", "org-fixture-001"),
        "X-Client-Version": "decisiontrace-frontend/1.0.0",
        "Content-Type": "application/json",
        "X-Test-Session": session or uuid.uuid4().hex,
    }
    if headers:
        default_headers.update(headers)

    async def request() -> httpx.Response:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://simulator.test",
        ) as client:
            return await client.request(
                method,
                path,
                headers=default_headers,
                json=json_body,
            )

    return asyncio.run(request())


def assert_schema(response: httpx.Response, schema_name: str) -> None:
    document = json.loads(RESPONSE_SCHEMAS_FILE.read_text(encoding="utf-8"))
    schema = {
        "$schema": document["$schema"],
        "$defs": document["$defs"],
        "$ref": f"#/$defs/{schema_name}",
    }
    errors = list(Draft202012Validator(schema).iter_errors(response.json()))
    assert not errors, [error.message for error in errors]


def test_every_proposed_read_route_returns_frontend_shaped_data():
    cases = [
        ("/api/v1/metrics", "Metrics"),
        ("/api/v1/decisions", "DecisionPage"),
        ("/api/v1/decisions/DEC-104", "Decision"),
        ("/api/v1/commitments", "CommitmentList"),
        ("/api/v1/conflicts", "ConflictList"),
        ("/api/v1/approvals", "ApprovalList"),
        ("/api/v1/activity", "ActivityList"),
    ]
    session = uuid.uuid4().hex
    for path, schema_name in cases:
        response = call_api(path, session=session)
        assert response.status_code == 200, (path, response.text)
        assert_schema(response, schema_name)

    health = call_api("/api/v1/health", headers={"Authorization": ""}, session=session)
    assert health.status_code == 200
    assert_schema(health, "Health")
    assert "SIMULATOR ONLY" in health.json()["agent"]
    assert "SIMULATOR ONLY" in health.json()["vector_db"]


def test_authentication_and_required_identity_headers_are_rejected():
    no_token = call_api("/api/v1/metrics", headers={"Authorization": ""})
    assert no_token.status_code == 401
    assert no_token.json()["code"] == "UNAUTHORIZED"

    missing_context = call_api("/api/v1/metrics", headers={"X-User-Id": ""})
    assert missing_context.status_code == 401
    assert missing_context.json()["code"] == "AUTH_CONTEXT_MISSING"
    assert_schema(missing_context, "ErrorEnvelope")


def test_commitment_patch_validates_body_updates_isolated_state_and_matches_partial_contract():
    session = uuid.uuid4().hex
    invalid = call_api(
        "/api/v1/commitments/COM-302",
        method="PATCH",
        json_body={"status": "finished"},
        session=session,
    )
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "VALIDATION_ERROR"
    assert_schema(invalid, "ErrorEnvelope")

    response = call_api(
        "/api/v1/commitments/COM-302",
        method="PATCH",
        json_body={"status": "completed"},
        session=session,
    )
    assert response.status_code == 200
    assert_schema(response, "CommitmentPatch")
    assert response.json()["status"] == "completed"

    updated_list = call_api(
        "/api/v1/commitments?status=completed",
        session=session,
    )
    assert any(item["id"] == "COM-302" for item in updated_list.json())


def test_conflict_resolution_validates_payload_and_is_in_memory():
    response = call_api(
        "/api/v1/conflicts/CONF-001/resolve",
        method="POST",
        json_body={"action": "resolve", "rationale": "Simulator-only test."},
    )
    assert response.status_code == 200
    assert_schema(response, "ConflictResolution")
    assert response.json()["status"] == "resolved"
    assert "SIMULATED ONLY" in response.json()["message"]

    invalid = call_api(
        "/api/v1/conflicts/CONF-001/resolve",
        method="POST",
        json_body={"action": "ignore", "rationale": ""},
    )
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "VALIDATION_ERROR"


def test_rejected_approval_has_no_external_side_effects():
    session = uuid.uuid4().hex
    response = call_api(
        "/api/v1/approvals/APP-042/action",
        method="POST",
        json_body={"action": "reject", "rationale": "Not approved in test."},
        session=session,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert response.json()["executed"] is False
    assert "SIMULATED ONLY" in response.json()["executionSummary"]

    state = call_api("/__test/state", session=session).json()
    assert state["simulated_approval_action_count"] == 1
    assert state["external_side_effects_count"] == 0


def test_duplicate_approval_action_is_deduplicated_only_inside_simulator():
    session = uuid.uuid4().hex
    body = {"action": "approve", "rationale": "Duplicate test request."}
    first = call_api(
        "/api/v1/approvals/APP-042/action",
        method="POST",
        json_body=body,
        session=session,
    )
    second = call_api(
        "/api/v1/approvals/APP-042/action",
        method="POST",
        json_body=body,
        session=session,
    )
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert "SIMULATED ONLY" in first.json()["executionSummary"]
    state = call_api("/__test/state", session=session).json()
    assert state["simulated_approval_action_count"] == 1
    assert state["simulated_duplicate_request_count"] == 1
    assert state["external_side_effects_count"] == 0


def test_backend_unavailable_error_shape_and_fault_are_simulator_only():
    response = call_api(
        "/api/v1/health",
        headers={"X-Test-Fault": "backend-unavailable"},
    )
    assert response.status_code == 503
    assert_schema(response, "ErrorEnvelope")
    assert response.json()["code"] == "BACKEND_UNAVAILABLE"
    assert "No backend" in response.json()["detail"]


def test_lyzr_owned_scenario_fixtures_are_explicitly_not_live_agent_results():
    for scenario_id in (
        "meeting_to_decision",
        "conflict_recommendation",
        "missing_evidence",
    ):
        response = call_api(f"/__test/scenarios/{scenario_id}")
        assert response.status_code == 200
        assert_schema(response, "ScenarioFixtureEnvelope")
        assert response.json()["simulated"] is True
        assert response.json()["does_not_call_lyzr"] is True

    missing = call_api("/__test/scenarios/missing_evidence").json()["fixture"]["observed"]
    assert missing["decisions"] == []
    assert missing["ungroundedClaims"]
    assert missing["commitmentDeadlineUncertain"] is True


def test_simulator_openapi_contains_all_proposed_api_operations():
    response = call_api("/openapi.json", headers={"Authorization": ""})
    assert response.status_code == 200
    document = response.json()
    actual = {
        (method.lower(), path)
        for path, operations in document["paths"].items()
        for method in operations
        if method.lower() in {"get", "post", "patch"}
    }
    expected = {
        (route["method"].lower(), route["path"])
        for route in read_yaml(MOCK_ROUTES_FILE)["routes"]
    }
    assert expected <= actual


def test_real_target_requires_explicit_safe_host_before_any_request(monkeypatch):
    monkeypatch.setenv("DT_BACKEND_URL", "https://safe-api.example.test/api/v1")
    monkeypatch.delenv("DT_TARGET_ENV", raising=False)
    monkeypatch.delenv("DT_SAFE_HOST", raising=False)
    url = configured_target_url("real")
    assert real_target_is_explicitly_safe(url) is False
    assert runner._scenario_blocker(
        {"name": "read test", "steps": [{"path": "/api/v1/metrics"}]},
        "real",
    ) is not None

    monkeypatch.setenv("DT_TARGET_ENV", "safe-test")
    monkeypatch.setenv("DT_SAFE_HOST", "safe-api.example.test")
    assert real_target_is_explicitly_safe(url) is True
    monkeypatch.setenv("DT_SAFE_HOST", "production.example.com")
    assert real_target_is_explicitly_safe(url) is False


def test_real_mutations_require_both_safety_flags(monkeypatch):
    monkeypatch.setenv("DT_TARGET_ENV", "safe-test")
    monkeypatch.delenv("DT_ALLOW_REAL_MUTATIONS", raising=False)
    assert real_mutations_enabled() is False
    monkeypatch.setenv("DT_ALLOW_REAL_MUTATIONS", "1")
    assert real_mutations_enabled() is True
    monkeypatch.setenv("DT_TARGET_ENV", "production")
    assert real_mutations_enabled() is False


def test_backend_url_rejects_credentials_and_unexpected_paths(monkeypatch):
    monkeypatch.setenv("DT_BACKEND_URL", "https://user:secret@example.test")
    try:
        configured_target_url("real")
    except ValueError as error:
        assert "cannot contain credentials" in str(error)
    else:
        raise AssertionError("A URL with embedded credentials must be rejected.")

    monkeypatch.setenv("DT_BACKEND_URL", "https://safe-api.example.test/other-prefix")
    try:
        configured_target_url("real")
    except ValueError as error:
        assert "other URL paths" in str(error)
    else:
        raise AssertionError("An unsupported backend URL path must be rejected.")
