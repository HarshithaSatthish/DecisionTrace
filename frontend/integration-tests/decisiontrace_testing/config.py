from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import yaml

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"
SCENARIOS_FILE = FIXTURES / "scenarios.yaml"
MOCK_ROUTES_FILE = FIXTURES / "mock_routes.yaml"
RESPONSE_SCHEMAS_FILE = FIXTURES / "response-schemas.json"
SCENARIO_FIXTURES_FILE = FIXTURES / "scenario-fixtures.json"


def read_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as stream:
        loaded = yaml.safe_load(stream)
    return loaded if isinstance(loaded, dict) else {}


def real_mutations_enabled() -> bool:
    return (
        os.getenv("DT_TARGET_ENV", "").strip().lower() == "safe-test"
        and os.getenv("DT_ALLOW_REAL_MUTATIONS", "").strip() == "1"
    )


def configured_target_url(target: str) -> str:
    if target == "simulator":
        return os.getenv("DT_SIMULATOR_URL", "http://127.0.0.1:8000").rstrip("/")
    if target == "real":
        url = os.getenv("DT_BACKEND_URL", "").strip().rstrip("/")
        if not url:
            raise ValueError("DT_BACKEND_URL is required for --target real")
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("DT_BACKEND_URL must be an absolute HTTP(S) URL.")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError(
                "DT_BACKEND_URL cannot contain credentials, query parameters, or a fragment."
            )
        path = parsed.path.rstrip("/")
        if path.endswith("/api/v1"):
            path = path[: -len("/api/v1")]
        if path:
            raise ValueError(
                "DT_BACKEND_URL may be an origin or end in /api/v1; other URL paths are unsupported."
            )
        return f"{parsed.scheme}://{parsed.netloc}"
    raise ValueError(f"Unsupported target: {target}")


def real_target_is_explicitly_safe(url: str) -> bool:
    """Require an explicit safe-test label and exact host allow-list before any request."""
    if os.getenv("DT_TARGET_ENV", "").strip().lower() != "safe-test":
        return False
    expected_host = os.getenv("DT_SAFE_HOST", "").strip().lower()
    if not expected_host:
        return False
    actual_host = urlsplit(url).hostname or ""
    return actual_host.lower() == expected_host
