# DecisionTrace Integration Test System

An independent FastAPI simulator and scenario runner in the existing testing
project. It uses the attached frontend source and backend integration documents
as **proposed** specifications; it does not modify or replace the Next.js
frontend, Lyzr agents, or Person 1's backend.

## Contract status and safety

- The source contract labels all API routes, payloads, and headers **PROPOSED**
  until Person 1 confirms them. See `docs/contract-audit.md`.
- Simulator records are fictional frontend preview fixtures. Simulator state
  is isolated in memory per scenario and is discarded when the process exits.
- Approval actions are simulated state changes only. The simulator never calls
  Lyzr, Qdrant, Omi, a pipeline, or a production backend.
- The local test token is a fixture value, not a Clerk JWT. This does not test
  Clerk signature/JWKS verification.
- `/__test/*` routes are harness-only fixtures and are not FastAPI product API
  routes. In particular, the extraction, recommendation, and missing-evidence
  checks do not execute Lyzr.

## Requirements

- Python 3.11+
- Install dependencies with `python -m pip install -r requirements.txt`

## Run the simulator and scenarios

From this directory, start the simulator on loopback:

```sh
uvicorn decisiontrace_testing.simulator:app --host 127.0.0.1 --port 8000
```

In another terminal:

```sh
python -m decisiontrace_testing.runner run --target simulator
python -m pytest -q
```

The runner checks the simulator's advertised OpenAPI route surface, then runs
all ten scenarios. A `PASS` is a pass against the local simulator only; it does
not verify a deployed backend or the separate Lyzr pipeline. The report keeps
that scope visible and names any real-backend blocker.

## Real safe-test target (not production)

No live backend is configured or contacted by this project. If a separate,
non-production test service is later provided, the runner requires an exact
hostname allow-list before sending even read-only requests:

```sh
DT_BACKEND_URL=https://<safe-test-host>/api/v1 \
DT_TARGET_ENV=safe-test \
DT_SAFE_HOST=<safe-test-host> \
DT_API_TOKEN=<safe-test-token> \
DT_USER_ID=<safe-test-user-id> \
DT_ORG_ID=<safe-test-org-id> \
python -m decisiontrace_testing.runner run --target real
```

Use the workspace secrets flow for the bearer token; do not put it in a file,
command history, or report. The project does not read or display secret values.
Without `DT_TARGET_ENV=safe-test` and an exact `DT_SAFE_HOST` match, the runner
marks the real-target checks `BLOCKED` and sends no request. The real-target
scenario list also blocks simulator-only behaviors and unconfirmed mutation
semantics. Mutations on any safe-test target require the additional explicit
flags `DT_TARGET_ENV=safe-test` and `DT_ALLOW_REAL_MUTATIONS=1`. Never set these
values for a production host.

## Contract and scenario files

- `fixtures/mock_routes.yaml` records the proposed routes, fake simulator auth,
  and known real-backend blockers.
- `fixtures/domain-data.json` contains fictional preview-shaped API records.
- `fixtures/response-schemas.json` validates the frontend domain response
  shapes used by scenarios.
- `fixtures/scenario-fixtures.json` contains clearly marked test-only outcomes
  for the three scenarios that belong to the Lyzr pipeline.
- `fixtures/scenarios.yaml` defines the ten executable scenario checks.
- `decisiontrace_testing/simulator.py` implements the proposed API behavior
  plus test-only fixture/fault routes.
- `decisiontrace_testing/runner.py` validates status, selected JSON paths,
  response schemas, and the advertised OpenAPI operation list.
- `docs/contract-audit.md` lists mismatches requiring contract confirmation.

After changing the simulator or fixtures:

```sh
python -m pytest -q
python -m decisiontrace_testing.runner run --target simulator
python scripts/package_release.py
```

Keep source archives, credentials, and production data out of the release ZIP.
