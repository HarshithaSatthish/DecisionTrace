from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from jsonschema import Draft202012Validator

from .config import (
    MOCK_ROUTES_FILE,
    RESPONSE_SCHEMAS_FILE,
    ROOT,
    SCENARIOS_FILE,
    configured_target_url,
    real_target_is_explicitly_safe,
    read_yaml,
    real_mutations_enabled,
)

REPORT_DIR = ROOT / "reports"
TOKEN_PATTERN = re.compile(r"\{\{env:([A-Z0-9_]+)\}\}")
REFERENCE_PATTERN = re.compile(r"\{\{([A-Za-z0-9_-]+)\.json(?:\.([A-Za-z0-9_.\[\]-]+))?\}\}")


def _lookup(value: Any, dotted_path: str) -> Any:
    current = value
    for part in dotted_path.split(".") if dotted_path else []:
        match = re.fullmatch(r"([^\[\]]+)?(?:\[(\d+)\])?", part)
        if not match or not any(match.groups()):
            raise KeyError(part)
        key, index = match.groups()
        if key and isinstance(current, dict):
            current = current[key]
        elif key:
            raise KeyError(key)
        if index is not None:
            current = current[int(index)]
    return current


def _resolve(value: Any, prior: dict[str, dict[str, Any]]) -> Any:
    if isinstance(value, str):
        def replace_reference(match: re.Match[str]) -> str:
            step_id, path = match.groups()
            response = prior[step_id]
            result = _lookup(response.get("json"), path or "")
            return str(result)

        value = REFERENCE_PATTERN.sub(replace_reference, value)
        def replace_env(match: re.Match[str]) -> str:
            env_name = match.group(1)
            if env_name != "DT_API_TOKEN":
                raise ValueError(f"Only DT_API_TOKEN can be interpolated; found {env_name}")
            token = os.getenv(env_name)
            if not token:
                raise ValueError(f"{env_name} is required by a configured scenario step")
            return token
        return TOKEN_PATTERN.sub(replace_env, value)
    if isinstance(value, list):
        return [_resolve(item, prior) for item in value]
    if isinstance(value, dict):
        return {key: _resolve(item, prior) for key, item in value.items()}
    return value


def _assert_response(response: httpx.Response, step: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    expected_status = step.get("expected_status")
    if expected_status is not None and response.status_code != int(expected_status):
        problems.append(f"expected HTTP {expected_status}, received {response.status_code}")
    try:
        payload = response.json()
    except ValueError:
        payload = None
    if "expected_json" in step and payload != step["expected_json"]:
        problems.append("response JSON did not equal expected_json")

    schema_name = step.get("response_schema")
    if schema_name:
        try:
            schema_document = json.loads(RESPONSE_SCHEMAS_FILE.read_text(encoding="utf-8"))
            schema = {
                "$schema": schema_document["$schema"],
                "$defs": schema_document["$defs"],
                "$ref": f"#/$defs/{schema_name}",
            }
            schema_errors = sorted(
                Draft202012Validator(schema).iter_errors(payload),
                key=lambda error: list(error.absolute_path),
            )
            problems.extend(
                f"response schema {schema_name}: {error.message}"
                for error in schema_errors[:3]
            )
        except (KeyError, OSError, json.JSONDecodeError) as error:
            problems.append(f"response schema {schema_name} could not be loaded: {type(error).__name__}")

    for assertion in step.get("assertions", []):
        path = str(assertion.get("path", ""))
        op = assertion.get("op", "exists")
        try:
            actual = _lookup(payload, path)
            exists = True
        except (KeyError, IndexError, TypeError, ValueError):
            actual, exists = None, False
        if op == "exists" and not exists:
            problems.append(f"JSON path {path!r} does not exist")
        elif op == "equals" and (not exists or actual != assertion.get("value")):
            problems.append(f"JSON path {path!r} did not equal the expected value")
        elif op == "contains":
            try:
                contains = exists and assertion.get("value") in actual
            except TypeError:
                contains = False
            if not contains:
                problems.append(f"JSON path {path!r} did not contain the expected value")
        elif op == "is_true" and (not exists or actual is not True):
            problems.append(f"JSON path {path!r} was not true")
        elif op not in {"exists", "equals", "contains", "is_true"}:
            problems.append(f"unsupported assertion operator: {op}")
    return problems


def _scenario_blocker(scenario: dict[str, Any], target: str) -> str | None:
    if target != "real":
        return None
    if scenario.get("real_blocker"):
        return str(scenario["real_blocker"])
    steps = scenario.get("steps", [])
    if any(str(step.get("path", "")).startswith("/__test/") for step in steps):
        return "Uses a local test-only fixture route; it is not part of the FastAPI contract."
    backend_url = configured_target_url("real")
    if not real_target_is_explicitly_safe(backend_url):
        return (
            "No request sent. Real-target access requires DT_TARGET_ENV=safe-test "
            "and DT_SAFE_HOST to exactly match the backend host."
        )
    if any(step.get("use_bearer_env") for step in steps) and not all(
        os.getenv(name) for name in ("DT_API_TOKEN", "DT_USER_ID", "DT_ORG_ID")
    ):
        return "No request sent. Set the safe-test DT_API_TOKEN, DT_USER_ID, and DT_ORG_ID first."
    if any(step.get("mutation") for step in steps):
        if not real_mutations_enabled():
            return (
                "Contains a mutation. Real mutations require "
                "DT_TARGET_ENV=safe-test and DT_ALLOW_REAL_MUTATIONS=1."
            )
    return None


def _check_openapi_surface(client: httpx.Client, target: str) -> dict[str, str]:
    expected_routes = read_yaml(MOCK_ROUTES_FILE).get("routes", [])
    expected = {
        (str(route.get("method", "GET")).lower(), str(route.get("path", "")))
        for route in expected_routes
        if isinstance(route, dict)
    }
    try:
        response = client.get("/openapi.json")
        if response.status_code != 200:
            return {
                "status": "FAIL" if target == "simulator" else "BLOCKED",
                "detail": f"OpenAPI request returned HTTP {response.status_code}.",
            }
        document = response.json()
        paths = document.get("paths", {})
        actual = {
            (method.lower(), path)
            for path, operations in paths.items()
            if isinstance(operations, dict)
            for method in operations
            if method.lower() in {"get", "post", "patch", "put", "delete"}
        }
        missing = sorted(f"{method.upper()} {path}" for method, path in expected - actual)
        if missing:
            return {
                "status": "FAIL",
                "detail": "Missing proposed route operation(s): " + ", ".join(missing),
            }
        return {
            "status": "PASS",
            "detail": f"OpenAPI advertises all {len(expected)} proposed FastAPI route operations.",
        }
    except (httpx.HTTPError, ValueError, TypeError) as error:
        return {
            "status": "FAIL" if target == "simulator" else "BLOCKED",
            "detail": f"Could not inspect OpenAPI route surface ({type(error).__name__}).",
        }


def _default_headers(target: str, scenario: dict[str, Any], session_id: str) -> dict[str, str]:
    if scenario.get("no_auth"):
        return {}
    if target == "simulator":
        test_auth = read_yaml(MOCK_ROUTES_FILE).get("test_auth", {})
        return {
            "Authorization": f"Bearer {test_auth.get('token', 'fixture-test-token')}",
            "X-User-Id": str(test_auth.get("user_id", "user-fixture-001")),
            "X-Org-Id": str(test_auth.get("org_id", "org-fixture-001")),
            "X-Client-Version": "decisiontrace-frontend/1.0.0",
            "Content-Type": "application/json",
            "X-Test-Session": session_id,
        }
    headers = {
        "X-Client-Version": "decisiontrace-frontend/1.0.0",
        "Content-Type": "application/json",
    }
    if scenario.get("use_bearer_env"):
        headers.update(
            {
                "Authorization": f"Bearer {os.environ['DT_API_TOKEN']}",
                "X-User-Id": os.environ["DT_USER_ID"],
                "X-Org-Id": os.environ["DT_ORG_ID"],
            }
        )
    return headers


def run_scenarios(target: str) -> dict[str, Any]:
    config = read_yaml(SCENARIOS_FILE)
    scenarios = config.get("scenarios", [])
    base_url = configured_target_url(target)
    results: list[dict[str, Any]] = []
    timeout = float(os.getenv("DT_TIMEOUT_SECONDS", "10"))

    with httpx.Client(base_url=base_url, timeout=timeout, follow_redirects=False) as client:
        if target == "real" and not real_target_is_explicitly_safe(base_url):
            contract_surface = {
                "status": "BLOCKED",
                "detail": (
                    "No request sent. Set DT_TARGET_ENV=safe-test and DT_SAFE_HOST "
                    "to the exact non-production backend hostname to permit read-only tests."
                ),
            }
        else:
            contract_surface = _check_openapi_surface(client, target)
        for scenario in scenarios:
            if not isinstance(scenario, dict):
                continue
            name = str(scenario.get("name", "unnamed scenario"))
            blocker = _scenario_blocker(scenario, target)
            if blocker:
                results.append({"scenario": name, "status": "BLOCKED", "detail": blocker})
                continue
            prior: dict[str, dict[str, Any]] = {}
            failures: list[str] = []
            session_id = f"{uuid.uuid4().hex}-{len(results)}"
            for index, step in enumerate(scenario["steps"], start=1):
                step_id = str(step.get("id", f"step_{index}"))
                try:
                    url = _resolve(step["path"], prior)
                    if not isinstance(url, str) or not url.startswith("/") or url.startswith("//"):
                        failures.append(
                            f"{step_id}: path must be a relative API path beginning with one slash"
                        )
                        break
                    headers = {
                        **_default_headers(
                            target,
                            {
                                **scenario,
                                "no_auth": step.get("no_auth", scenario.get("no_auth", False)),
                            },
                            session_id,
                        ),
                        **_resolve(step.get("headers", {}), prior),
                    }
                    if target == "real" and step.get("use_bearer_env"):
                        headers.update(_default_headers(target, scenario, session_id))
                    body = _resolve(step.get("json"), prior) if "json" in step else None
                    response = client.request(
                        str(step.get("method", "GET")).upper(),
                        url,
                        headers=headers,
                        json=body,
                    )
                    try:
                        payload = response.json()
                    except ValueError:
                        payload = None
                    prior[step_id] = {"status": response.status_code, "json": payload}
                    failures.extend(
                        f"{step_id}: {problem}"
                        for problem in _assert_response(response, step)
                    )
                    if failures:
                        break
                except (httpx.HTTPError, KeyError, ValueError, TypeError) as error:
                    # Do not echo request headers/bodies: they may contain test credentials.
                    failures.append(f"{step_id}: {type(error).__name__}: {error}")
                    break
            status = "FAIL" if failures else "PASS"
            results.append(
                {
                    "scenario": name,
                    "status": status,
                    "detail": "; ".join(failures) if failures else f"{len(scenario['steps'])} configured step(s) passed.",
                }
            )

    counts = {
        status: sum(1 for item in results if item["status"] == status)
        for status in ("PASS", "FAIL", "BLOCKED")
    }
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target": target,
        "base_url": base_url,
        "results": results,
        "summary": counts,
        "contract_status": config.get("contract_status", "not provided"),
        "execution_scope": (
            "local simulator only; no live backend or production service contacted"
            if target == "simulator"
            else "safe-test target only; production targets are not permitted"
        ),
        "contract_surface": contract_surface,
    }


def write_report(report: dict[str, Any]) -> tuple[Path, Path]:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = REPORT_DIR / "latest-report.json"
    text_path = REPORT_DIR / "latest-report.txt"
    json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    lines = [
        "DecisionTrace integration test report",
        f"Target: {report['target']}",
        f"Contract status: {report['contract_status']}",
        f"OpenAPI surface: {report['contract_surface']['status']} — {report['contract_surface']['detail']}",
        f"Execution scope: {report['execution_scope']}",
        "Summary: " + ", ".join(f"{key}={value}" for key, value in report["summary"].items()),
        "",
    ]
    for item in report["results"]:
        lines.append(f"{item['status']}: {item['scenario']} — {item['detail']}")
        scenario = next(
            (value for value in read_yaml(SCENARIOS_FILE).get("scenarios", []) if value.get("name") == item["scenario"]),
            {},
        )
        if scenario.get("evidence_note"):
            lines.append(f"  Scope note: {scenario['evidence_note']}")
        if scenario.get("real_blocker"):
            lines.append(f"  Real-backend status: BLOCKED — {scenario['real_blocker']}")
    text_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return json_path, text_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run isolated DecisionTrace simulator scenarios.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("--target", choices=("simulator", "real"), default="simulator")
    args = parser.parse_args(argv)
    try:
        report = run_scenarios(args.target)
    except (OSError, ValueError) as error:
        print(f"Runner configuration error: {error}", file=sys.stderr)
        return 2
    _, text_path = write_report(report)
    print(text_path.read_text(encoding="utf-8"), end="")
    if report["summary"]["FAIL"]:
        return 1
    if report["summary"]["BLOCKED"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
