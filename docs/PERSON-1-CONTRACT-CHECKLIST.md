# DecisionTrace — Person 1 Backend Contract Alignment Checklist

**Recipient:** Person 1 (Backend Engineer — FastAPI, PostgreSQL, Qdrant)  
**Author:** Frontend & AI Master Workspace  
**Status:** PROPOSED & READY FOR CONFIRMATION  
**Date:** 2026-10-11  

This checklist summarizes the actionable interface and contract items identified from our frontend domain models and the independent Replit contract audit. Please confirm or resolve each item as you wire up the live FastAPI endpoints.

---

## 1. Actionable API Contract Checklist

| # | Endpoint / Area | Current Mismatch / Gap | Required Alignment | Priority |
|---|---|---|---|---|
| **1** | `GET /api/v1/metrics` | The proposed contract sample omits `recentActivity`, but the frontend `DashboardMetrics` type strictly requires `recentActivity: ActivityItem[]`. | Return `recentActivity` list (last 5-10 events) in the metrics payload to populate overview dashboard cards without an extra round-trip. | **HIGH** |
| **2** | `PATCH /api/v1/commitments/{id}` | Contract sample returns partial object `{ id, status, updatedAt }`, but the frontend mutation adapter expects a full `Commitment` record. | Return the complete updated `Commitment` record (including `decisionId`, `owner`, `deadline`, `priority`, `evidence`). | **HIGH** |
| **3** | `POST /api/v1/approvals/{id}/action` (Rejection) | Contract documents `action: "approve" \| "reject"` but only illustrates the approval response. Rejection body and semantics are undefined. | Return `{ "id": string, "status": "rejected", "executed": false, "rationale": string }` with backend-enforced guarantee that no external side effect executed. | **HIGH** |
| **4** | Idempotency / Repeat Actions | Contract lacks idempotency key or replay semantics if an operator clicks "Approve" or "Reject" multiple times. | Backend should enforce idempotency (e.g., return HTTP 200 with previous outcome or HTTP 409 Conflict if already executed). | **MEDIUM** |
| **5** | Base URL Convention | `DECISIONTRACE_BACKEND_URL` is set to `http://localhost:8000/api/v1`. If routes are also specified with `/api/v1/*`, double-prefixing occurs (`/api/v1/api/v1/...`). | Confirm whether FastAPI routes are mounted at root `/health` or `/api/v1/health`. Frontend proxy standardizes on `${DECISIONTRACE_BACKEND_URL}/health`. | **HIGH** |
| **6** | Clerk JWT Auth Enforcement | Forwarded `X-User-Id` and `X-Org-Id` headers cannot be blindly trusted in production without cryptographic verification. | In FastAPI, validate the `Authorization: Bearer <clerk_token>` header against Clerk's JWKS endpoint (`https://api.clerk.com/v1/jwks`). Return HTTP 401 with `{ "detail": "...", "code": "UNAUTHORIZED" }` on invalid tokens. | **CRITICAL** |
| **7** | `/health` Public vs Authenticated | Next.js header health pill pings `GET /api/v1/health` without active user session during initial page boot. | Ensure `GET /api/v1/health` is publicly accessible without requiring a Bearer JWT, returning HTTP 200 `{ "status": "ok" }`. | **HIGH** |
| **8** | Evidence Vector Similarity | Frontend evidence drawer displays match confidence based on `vectorSimilarity`. | Ensure Qdrant vector search results populate `vectorSimilarity` as a normalized float between `0.0` and `1.0`. | **MEDIUM** |
| **9** | Filter & Pagination Query Params | Frontend tables support search queries and status filters. | Confirm accepted query parameters: `GET /commitments?status=...&search=...` and `GET /decisions?category=...&search=...`. | **MEDIUM** |
| **10** | Lyzr Pipeline Role Clarity | `POST /api/decision-trace/analyze` runs in the Next.js server tier (Person 2's 4 Lyzr agents). | Person 1 does not need to re-implement multi-agent extraction in FastAPI; your backend acts as the database sink for decisions, commitments, conflicts, and approvals. | **INFO** |

---

## 2. Verification Command

Once your FastAPI service is listening on port `8000`, run this automated pre-flight probe:

```bash
bun run scripts/verify-backend-compatibility.ts
```

This verifies all 7 core endpoints and prints an instant compliance report without altering production data.
