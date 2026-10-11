from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from jsonschema import Draft202012Validator

from .config import FIXTURES, MOCK_ROUTES_FILE, read_yaml

DATA_FILE = FIXTURES / "domain-data.json"
SCENARIO_FILE = FIXTURES / "scenario-fixtures.json"
SIMULATOR_TOKEN = str(read_yaml(MOCK_ROUTES_FILE).get("test_auth", {}).get("token", "fixture-test-token"))
FIXTURE_TIMESTAMP = "2026-10-11T00:00:00Z"

app = FastAPI(
    title="DecisionTrace Proposed-Contract Simulator",
    description=(
        "In-memory mock API for the proposed frontend contract. It makes no "
        "Lyzr, Qdrant, Omi, or production calls."
    ),
    version="0.2.0",
)
app.state.sessions = {}
_DOMAIN_DATA: dict[str, Any] = json.loads(DATA_FILE.read_text(encoding="utf-8"))
_SCENARIOS: dict[str, Any] = json.loads(SCENARIO_FILE.read_text(encoding="utf-8"))

REQUEST_SCHEMAS: dict[str, dict[str, Any]] = {
    "commitment_patch": {
        "type": "object",
        "required": ["status"],
        "properties": {
            "status": {"enum": ["backlog", "in_progress", "blocked", "completed"]}
        },
        "additionalProperties": False,
    },
    "conflict_resolution": {
        "type": "object",
        "required": ["action", "rationale"],
        "properties": {
            "action": {"enum": ["resolve", "escalate", "dismiss"]},
            "rationale": {"type": "string", "minLength": 1},
        },
        "additionalProperties": False,
    },
    "approval_action": {
        "type": "object",
        "required": ["action", "rationale"],
        "properties": {
            "action": {"enum": ["approve", "reject"]},
            "rationale": {"type": "string", "minLength": 1},
        },
        "additionalProperties": False,
    },
}


def _store(request: Request) -> dict[str, Any]:
    session_id = request.headers.get("x-test-session", "manual")
    if len(session_id) > 128:
        session_id = session_id[:128]
    sessions: dict[str, dict[str, Any]] = app.state.sessions
    if session_id not in sessions:
        sessions[session_id] = {
            "data": copy.deepcopy(_DOMAIN_DATA),
            "simulated_approval_action_count": 0,
            "simulated_duplicate_request_count": 0,
            "external_side_effects_count": 0,
            "approval_results": {},
            "events": [],
        }
    return sessions[session_id]


def _error(status: int, code: str, detail: str, **extra: Any) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"detail": detail, "code": code, **extra},
    )


def _validate_body(payload: Any, schema_key: str) -> list[dict[str, str]]:
    validator = Draft202012Validator(REQUEST_SCHEMAS[schema_key])
    errors = sorted(validator.iter_errors(payload), key=lambda error: list(error.absolute_path))
    return [
        {
            "path": ".".join(str(part) for part in error.absolute_path),
            "message": error.message,
        }
        for error in errors
    ]


def _filter_items(
    items: list[dict[str, Any]],
    request: Request,
    fields: tuple[str, ...],
    searchable_fields: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    result = items
    params = request.query_params
    for field in fields:
        value = params.get(field)
        if value and value != "all":
            result = [item for item in result if str(item.get(field, "")) == value]
    search = params.get("search", "").strip().casefold()
    if search and searchable_fields:
        result = [
            item
            for item in result
            if any(search in str(item.get(field, "")).casefold() for field in searchable_fields)
        ]
    return result


@app.middleware("http")
async def proposed_contract_auth_and_faults(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/v1/") and request.headers.get("x-test-fault") == "backend-unavailable":
        return _error(
            503,
            "BACKEND_UNAVAILABLE",
            "Simulated upstream failure. No backend or external service was contacted.",
        )
    if path.startswith("/api/v1/") and path != "/api/v1/health":
        authorization = request.headers.get("authorization", "")
        if authorization != f"Bearer {SIMULATOR_TOKEN}":
            return _error(401, "UNAUTHORIZED", "Missing or invalid simulator-only bearer token.")
        missing_context = [
            name
            for name in ("x-user-id", "x-org-id", "x-client-version")
            if name not in request.headers
        ]
        missing_context.extend(
            name
            for name in ("x-user-id", "x-client-version")
            if not request.headers.get(name, "").strip() and name not in missing_context
        )
        if missing_context:
            return _error(
                401,
                "AUTH_CONTEXT_MISSING",
                "A proposed identity/client header is missing.",
                missingHeaders=missing_context,
            )
    return await call_next(request)


@app.get("/__test/health")
async def simulator_health() -> dict[str, Any]:
    routes = read_yaml(MOCK_ROUTES_FILE).get("routes", [])
    return {
        "status": "ok",
        "mode": "isolated-simulator",
        "contract_status": "proposed-unverified",
        "configured_route_count": len(routes),
        "fictional_test_records": True,
        "external_services_contacted": False,
    }


@app.get("/__test/meta")
async def simulator_metadata() -> dict[str, Any]:
    return {
        "mode": "isolated-simulator",
        "contract_status": "proposed-unverified",
        "fixture_source": _DOMAIN_DATA.get("source"),
        "fictional_test_records": True,
        "integrations": {"lyzr": False, "qdrant": False, "omi": False},
        "approval_execution": "in-memory simulation only; no external side effects",
    }


@app.get("/__test/state")
async def simulator_state(request: Request) -> dict[str, Any]:
    session = _store(request)
    return {
        "simulated_approval_action_count": session["simulated_approval_action_count"],
        "simulated_duplicate_request_count": session["simulated_duplicate_request_count"],
        "external_side_effects_count": session["external_side_effects_count"],
        "events": list(session["events"]),
        "session_state_is_in_memory": True,
    }


@app.get("/__test/scenarios/{scenario_id}")
async def simulated_scenario(scenario_id: str) -> dict[str, Any]:
    if scenario_id not in _SCENARIOS:
        return JSONResponse(
            status_code=404,
            content={"detail": "No scenario fixture exists.", "code": "SCENARIO_FIXTURE_NOT_FOUND"},
        )
    return {
        "scenario": scenario_id,
        "simulated": True,
        "does_not_call_lyzr": True,
        "fixture": _SCENARIOS[scenario_id],
    }


@app.get("/api/v1/health")
async def backend_health() -> dict[str, Any]:
    # Same scalar fields as the proposed response example, but values explicitly
    # identify a fixture so this cannot imply real Lyzr/Qdrant connectivity.
    return {
        "status": "ok",
        "agent": "SIMULATOR ONLY — no Lyzr agent call",
        "vector_db": "SIMULATOR ONLY — no Qdrant connection",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/metrics")
async def metrics(request: Request) -> dict[str, Any]:
    data = _store(request)["data"]
    result = copy.deepcopy(data["metrics"])
    result["recentActivity"] = copy.deepcopy(data["activity"])
    return result


@app.get("/api/v1/decisions")
async def decisions(
    request: Request,
    search: str = "",
    status: str = "",
    category: str = "",
    page: int = 1,
    limit: int = 20,
) -> dict[str, Any]:
    items = _filter_items(
        _store(request)["data"]["decisions"],
        request,
        ("status", "category"),
        ("title", "summary", "whatWasDecided"),
    )
    if search:
        needle = search.casefold()
        items = [
            item
            for item in _store(request)["data"]["decisions"]
            if needle in " ".join(
                str(item.get(field, "")) for field in ("title", "summary", "whatWasDecided")
            ).casefold()
            and (not status or status == "all" or item["status"] == status)
            and (not category or category == "all" or item["category"] == category)
        ]
    page = max(page, 1)
    limit = min(max(limit, 1), 100)
    start = (page - 1) * limit
    return {
        "total": len(items),
        "page": page,
        "limit": limit,
        "items": copy.deepcopy(items[start : start + limit]),
    }


@app.get("/api/v1/decisions/{id}")
async def decision_detail(id: str, request: Request):
    for item in _store(request)["data"]["decisions"]:
        if item["id"] == id:
            return copy.deepcopy(item)
    return _error(404, "NOT_FOUND", f"Decision {id} does not exist in the fictional fixture.")


@app.get("/api/v1/commitments")
async def commitments(request: Request) -> list[dict[str, Any]]:
    items = _filter_items(
        _store(request)["data"]["commitments"],
        request,
        ("status", "owner", "priority"),
        ("title", "task"),
    )
    return copy.deepcopy(items)


@app.patch("/api/v1/commitments/{id}")
async def update_commitment(id: str, request: Request):
    try:
        body = await request.json()
    except Exception:
        body = None
    errors = _validate_body(body, "commitment_patch")
    if errors:
        return _error(422, "VALIDATION_ERROR", "Commitment patch body is invalid.", errors=errors)
    for item in _store(request)["data"]["commitments"]:
        if item["id"] == id:
            item["status"] = body["status"]
            item["updatedAt"] = FIXTURE_TIMESTAMP
            _store(request)["events"].append(
                {"kind": "commitment_status_updated", "id": id, "status": body["status"]}
            )
            # The contract example documents this partial result. The frontend
            # currently casts it to a full Commitment; see contract-audit.md.
            return {
                "id": id,
                "status": body["status"],
                "updatedAt": FIXTURE_TIMESTAMP,
            }
    return _error(404, "NOT_FOUND", f"Commitment {id} does not exist in the fictional fixture.")


@app.get("/api/v1/conflicts")
async def conflicts(request: Request) -> list[dict[str, Any]]:
    items = _filter_items(
        _store(request)["data"]["conflicts"],
        request,
        ("status", "severity"),
        ("title", "explanation"),
    )
    return copy.deepcopy(items)


@app.post("/api/v1/conflicts/{id}/resolve")
async def resolve_conflict(id: str, request: Request):
    try:
        body = await request.json()
    except Exception:
        body = None
    errors = _validate_body(body, "conflict_resolution")
    if errors:
        return _error(422, "VALIDATION_ERROR", "Conflict resolution body is invalid.", errors=errors)
    for item in _store(request)["data"]["conflicts"]:
        if item["id"] == id:
            state = {"resolve": "resolved", "escalate": "escalated", "dismiss": "dismissed"}[body["action"]]
            item["status"] = state
            item["resolvedAt"] = FIXTURE_TIMESTAMP
            item["resolutionNotes"] = body["rationale"]
            _store(request)["events"].append(
                {"kind": "conflict_resolution", "id": id, "status": state}
            )
            return {
                "success": True,
                "conflictId": id,
                "status": state,
                "resolvedAt": FIXTURE_TIMESTAMP,
                "message": f"SIMULATED ONLY: conflict {id} marked {state} in memory.",
            }
    return _error(404, "NOT_FOUND", f"Conflict {id} does not exist in the fictional fixture.")


@app.get("/api/v1/approvals")
async def approvals(request: Request) -> list[dict[str, Any]]:
    items = _filter_items(
        _store(request)["data"]["approvals"],
        request,
        ("status", "impactLevel"),
        ("title", "description"),
    )
    return copy.deepcopy(items)


@app.post("/api/v1/approvals/{id}/action")
async def approval_action(id: str, request: Request):
    try:
        body = await request.json()
    except Exception:
        body = None
    errors = _validate_body(body, "approval_action")
    if errors:
        return _error(422, "VALIDATION_ERROR", "Approval action body is invalid.", errors=errors)
    session = _store(request)
    fingerprint = json.dumps(
        {"approval_id": id, "action": body["action"], "rationale": body["rationale"]},
        sort_keys=True,
    )
    if fingerprint in session["approval_results"]:
        session["simulated_duplicate_request_count"] += 1
        return copy.deepcopy(session["approval_results"][fingerprint])

    approval = next(
        (item for item in session["data"]["approvals"] if item["id"] == id),
        None,
    )
    if approval is None:
        return _error(404, "NOT_FOUND", f"Approval {id} does not exist in the fictional fixture.")
    action = body["action"]
    status = "approved" if action == "approve" else "rejected"
    approval["status"] = status
    approval["reviewedBy"] = "Simulator Test Reviewer"
    approval["reviewedAt"] = FIXTURE_TIMESTAMP
    approval["reviewReason"] = body["rationale"]
    session["simulated_approval_action_count"] += 1

    if action == "approve":
        result = {
            "success": True,
            "approvalId": id,
            "status": "approved",
            "executedAt": FIXTURE_TIMESTAMP,
            "executionSummary": "SIMULATED ONLY: approval state changed in memory; no external action executed.",
        }
    else:
        # The proposed contract does not define this rejection response shape.
        # `executed: false` is a simulator safety assertion, not backend evidence.
        result = {
            "success": True,
            "approvalId": id,
            "status": "rejected",
            "executedAt": None,
            "executionSummary": "SIMULATED ONLY: rejected; no external action executed.",
            "executed": False,
        }
    session["approval_results"][fingerprint] = copy.deepcopy(result)
    session["events"].append(
        {"kind": "approval_action", "id": id, "action": action, "simulated": True}
    )
    return result


@app.get("/api/v1/activity")
async def activity(request: Request) -> list[dict[str, Any]]:
    items = _filter_items(
        _store(request)["data"]["activity"],
        request,
        ("type",),
        ("title", "description"),
    )
    return copy.deepcopy(items)
