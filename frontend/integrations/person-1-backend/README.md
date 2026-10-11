# Person 1 Backend Integration & Pre-Flight Compatibility Guide

## 1. Overview
Person 1 is developing the production FastAPI backend (integrating PostgreSQL, Qdrant vector search, and Omi audio transcript feeds).

Before switching the frontend from development preview (`NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW=true`) to the live FastAPI backend, all compatibility checks documented below must be verified.

---

## 2. Pre-Flight Verification Checklist

| Gate # | Check Description | Requirement | Expected Response |
|---|---|---|---|
| **Gate 1** | **Health Ping** | `GET /health` | HTTP 200 `{ "status": "ok" }`<br>*(Turns dashboard badge green)* |
| **Gate 2** | **Metrics Card Data** | `GET /metrics` | HTTP 200 `{ "activeDecisions": int, "openCommitments": int, "detectedConflicts": int, "pendingApprovals": int, ... }` |
| **Gate 3** | **Decisions List** | `GET /decisions` | HTTP 200 array of decisions matching `Decision` schema. Evidence quotes must include `vectorSimilarity` (0.0 to 1.0). |
| **Gate 4** | **Commitments List** | `GET /commitments` | HTTP 200 array of action items with valid `status` (`not_started` \| `in_progress` \| `completed` \| `blocked` \| `overdue`). |
| **Gate 5** | **Commitment Mutation** | `PATCH /commitments/{id}` | HTTP 200 returning updated `Commitment` object. |
| **Gate 6** | **Conflicts Feed** | `GET /conflicts` | HTTP 200 array of conflicts with `previousDecision` and `newerDecision` side-by-side evidence quotes. |
| **Gate 7** | **Conflict Resolution** | `POST /conflicts/{id}/resolve` | HTTP 200 with `{ "conflictId": string, "resolved": true, "resolution": string }`. |
| **Gate 8** | **Approvals Feed** | `GET /approvals` | HTTP 200 array with `status: "pending"`, `impactLevel: "critical"|"high"|"medium"|"low"`, and `exactActionPreview`. |
| **Gate 9** | **Approval Execution** | `POST /approvals/{id}/action` | HTTP 200 confirming execution of approved human action. |
| **Gate 10** | **Activity Stream** | `GET /activity` | HTTP 200 chronological array of guardian timeline items. |
| **Gate 11** | **Clerk JWT Auth** | Bearer Token Validation | Rejects missing/expired token with HTTP 401. Honors `X-User-Id` and `X-Org-Id`. |
| **Gate 12** | **Error Format** | RFC 7807 Standard | On error, returns `{ "detail": "Descriptive message", "code": "ERROR_CODE" }`. |

---

## 3. Switching from Preview to Live Backend

1. In `.env.local`, set:
   ```env
   # Point to Person 1's live running FastAPI server:
   DECISIONTRACE_BACKEND_URL="http://localhost:8000/api/v1"

   # Enforce strict live backend mode (disables mock fixture fallback):
   NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW="false"
   ```

2. Run the automated pre-flight validation script:
   ```bash
   bun run scripts/verify-backend-compatibility.ts
   ```

3. Open the dashboard at `http://localhost:3000/dashboard/overview`.
   - Verify that the header pill reads **"Guardian Connected"** (green dot).
   - Verify that real PostgreSQL/Qdrant records display in all six screens.
