# DecisionTrace contract audit

**Audit scope:** frontend source and handoff ZIP supplied for this testing
project. This report describes source-document consistency; it is not evidence
that Person 1's FastAPI service implements these routes.

## Contract status

`docs/backend-integration-contract.md` labels endpoint paths, payloads, and
headers **PROPOSED** pending Person 1's confirmation. The handoff repeats that
these are proposed endpoints. No live backend or production service was
contacted for this audit or the test run.

The simulator implements the proposed `/api/v1` routes listed in
`fixtures/mock_routes.yaml`, uses fictional frontend preview records, and
returns explicit simulator-only health values. Its local OpenAPI surface check
proves only that the simulator advertises its own routes.

## Mismatches or decisions Person 1 / frontend owners must confirm

1. **Metrics response omits a required frontend field.** The proposed metrics
   example in the API contract has no `recentActivity`; `DashboardMetrics` in
   the frontend types requires it. The simulator includes `recentActivity` to
   satisfy the frontend type. Confirm the backend response includes it or
   update the type/adapter.
2. **Commitment PATCH response is partial.** The proposed response contains
   only `id`, `status`, and `updatedAt`, but `updateCommitmentStatus` returns
   that body as a full `Commitment`. Confirm that the frontend needs only the
   partial result or return a complete object/update the adapter.
3. **Approval rejection response is unspecified.** The request allows
   `approve` or `reject`; only an approval response example is documented.
   The simulator's rejection fields and "not executed" assertion are its own
   safety policy, not verified backend behavior. Define and confirm the
   rejection response and guarantee.
4. **Duplicate action/idempotency behavior is unspecified.** The contract has
   no idempotency header, deduplication key, or repeat-request semantics. The
   simulator deduplicates identical actions only as an illustrative policy.
5. **Analysis/action-planning routes are absent from the FastAPI contract.**
   The handoff assigns `POST /api/decision-trace/analyze` to a Next.js route
   and the four-agent Lyzr pipeline (Person 2). The simulator's three
   `/__test/scenarios/*` fixtures do not execute that pipeline.
6. **Authentication behavior needs backend confirmation.** The docs propose
   Clerk Bearer JWT, user/org/client headers, but do not define FastAPI's
   unauthorized status or error body. The simulator uses a fake local token
   and returns 401; it does not validate JWT/JWKS. The health proxy also does
   not forward the same auth context as the other Next.js routes, so confirm
   whether `/api/v1/health` is intentionally public.
7. **Base URL conventions differ by layer.** The source docs set
   `DECISIONTRACE_BACKEND_URL` to `http://localhost:8000/api/v1`; API paths
   themselves are also written with `/api/v1`. This runner accepts either an
   origin or a URL ending in `/api/v1`, then issues the documented full paths.
   Confirm the production proxy's configured base is not double-prefixed.
8. **Read filters differ between types and adapters.** The frontend filter
   types include more fields than the documented backend query contract
   (for example commitment search). Several service methods do not forward
   their filter arguments to the Next.js proxy. Confirm desired server-side
   filter behavior before expanding these routes.
9. **Decision detail is proposed but not used by the current service.** The
   contract lists `GET /api/v1/decisions/{id}`; `getDecisionById` in the
   frontend service currently reads the decision collection and selects locally.
10. **Activity response shape is only described as a chronological list.**
    The simulator validates it against the frontend `ActivityItem` type; the
    backend contract should confirm that type and whether pagination is needed.
11. **Health values in the contract are examples, not health evidence.** The
    proposed sample names a Lyzr agent and Qdrant connection. The simulator
    uses explicit `SIMULATOR ONLY` values and does not report either service
    healthy.

## Error handling implemented for simulator tests

- Backend-failure injection returns HTTP 503 with the documented
  `{ "detail": "...", "code": "BACKEND_UNAVAILABLE" }` shape.
- Authentication failure returns a proposed `{detail, code}` envelope but its
  exact status/schema remains unconfirmed against FastAPI.
- Invalid mutation request bodies return HTTP 422 with
  `{detail, code, errors}` as a simulator validation response.
- Rejection and duplicate-action semantics are never asserted against a real
  target until Person 1 confirms them.

## Scenario evidence limits

The ten `PASS` results in the provided report mean that the scenario assertions
passed against the isolated simulator. Tests 1, 4, and 10 use static fixture
outcomes for the separate Lyzr-owned flows. Tests 2, 3, and 5 inspect
fictional API records; test 2 also updates an in-memory commitment. Tests 6 and
9 verify simulator-only approval/replay state. Tests 7 and 8 use local fault
injection and a fake test token. None of these establish real backend or Lyzr
behavior.
