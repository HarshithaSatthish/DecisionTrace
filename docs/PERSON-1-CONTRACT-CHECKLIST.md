# DecisionTrace — Person 1 Backend Contract Alignment Checklist

**Recipient:** Person 1 (Backend Engineer — FastAPI, PostgreSQL, Qdrant)  
**Author:** Frontend & AI Master Workspace  
**Status:** PROPOSED & READY FOR CONFIRMATION  
**Date:** 2026-10-11  

This document details the actionable interface and security contract items identified from our frontend domain models and the independent Replit contract audit. Please review and confirm each requirement as you implement the live FastAPI endpoints.

---

## 1. Actionable API Contract Checklist

| # | Endpoint / Area | Current Mismatch / Gap | Required Alignment | Priority |
|---|---|---|---|---|
| **1** | `GET /api/v1/metrics` | The proposed contract sample omits `recentActivity`, but the frontend `DashboardMetrics` type strictly requires `recentActivity: ActivityItem[]`. | Return `recentActivity` list (last 5-10 events) in the metrics payload to populate overview dashboard cards without an extra round-trip. | **HIGH** |
| **2** | `PATCH /api/v1/commitments/{id}` | Contract sample returns partial object `{ id, status, updatedAt }`, but the frontend mutation adapter expects a full `Commitment` record. | Return the complete updated `Commitment` record (including `decisionId`, `owner`, `deadline`, `priority`, `evidence`). | **HIGH** |
| **3** | `POST /api/v1/approvals/{id}/action` (Rejection) | Contract documents `action: "approve" \| "reject"` but only illustrates the approval response. Rejection body and semantics are undefined. | Return `{ "id": string, "status": "rejected", "executed": false, "rationale": string }` with backend-enforced guarantee that no external side effect executed. | **HIGH** |
| **4** | Idempotency / Repeat Actions | Contract lacks idempotency key or replay semantics if an operator clicks "Approve" or "Reject" multiple times. | Backend should enforce idempotency (e.g., return HTTP 200 with previous outcome or HTTP 409 Conflict if already executed). | **MEDIUM** |
| **5** | Base URL Convention | `DECISIONTRACE_BACKEND_URL` is set to `http://localhost:8000/api/v1`. If routes are also specified with `/api/v1/*`, double-prefixing occurs (`/api/v1/api/v1/...`). | Confirm whether FastAPI routes are mounted at root `/health` or `/api/v1/health`. Frontend proxy standardizes on `${DECISIONTRACE_BACKEND_URL}/health`. | **HIGH** |
| **6** | Clerk JWT & JWKS Verification | Do not assume generic JWKS URLs. Forwarded `X-User-Id` headers cannot be trusted without cryptographic verification. | Validate `Authorization: Bearer <clerk_token>` against the specific instance JWKS discovery endpoint. Authoritative identity must come from JWT claims, never raw headers. | **CRITICAL** |
| **7** | `/health` Public vs Authenticated | Next.js header health pill pings `GET /api/v1/health` without active user session during initial page boot. | Ensure `GET /api/v1/health` is publicly accessible without requiring a Bearer JWT, returning HTTP 200 `{ "status": "ok" }`. | **HIGH** |
| **8** | Evidence Vector Similarity | Frontend evidence drawer displays match confidence based on `vectorSimilarity`. | Ensure Qdrant vector search results populate `vectorSimilarity` as a normalized float between `0.0` and `1.0`. | **MEDIUM** |
| **9** | Filter & Pagination Query Params | Frontend tables support search queries and status filters. | Confirm accepted query parameters: `GET /commitments?status=...&search=...` and `GET /decisions?category=...&search=...`. | **MEDIUM** |
| **10** | Multi-Tenant Data Isolation | Backend queries must enforce tenant boundaries at the database level. | Filter every PostgreSQL and Qdrant query by `org_id` (or `user_id` for individual users) to prevent cross-tenant data leakage. | **CRITICAL** |
| **11** | Lyzr Pipeline Role Clarity | `POST /api/decision-trace/analyze` runs in the Next.js server tier (Person 2's 4 Lyzr agents). | Person 1 does not need to re-implement multi-agent extraction in FastAPI; your backend acts as the database sink for decisions, commitments, conflicts, and approvals. | **INFO** |

---

## 2. Cryptographic Authentication & Identity Trust Model

> [!CAUTION]
> **ZERO-TRUST IDENTITY RULE:**
> Next.js proxies forward `X-User-Id` and `X-Org-Id` as convenience context headers.
> **FastAPI must NEVER trust `X-User-Id` or `X-Org-Id` without validating the Clerk Bearer JWT.**

### A. Clerk JWKS Discovery URL Configuration
Do NOT hardcode `https://api.clerk.com/v1/jwks`. Every Clerk environment has its own instance issuer domain:

- **Development Instances:** `https://<instance-subdomain>.clerk.accounts.dev/.well-known/jwks.json`
- **Production Instances:** `https://clerk.<your-domain>.com/.well-known/jwks.json`
- **Dynamic Derivation:** The Clerk publishable key (`pk_test_...` or `pk_live_...`) encodes the frontend API domain in base64. In Python:
  ```python
  import base64
  raw = publishable_key.split("_", 2)[2].rstrip("$")
  clerk_domain = base64.b64decode(raw + "==").decode("utf-8").rstrip("$")
  jwks_url = f"https://{clerk_domain}/.well-known/jwks.json"
  ```

### B. Python FastAPI Verification Pattern
```python
import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException, status

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "https://<your-instance>.clerk.accounts.dev/.well-known/jwks.json")
jwks_client = PyJWKClient(CLERK_JWKS_URL)

async def verify_authenticated_user(
    authorization: str = Header(...),
    x_user_id: str | None = Header(None),
    x_org_id: str | None = Header(None)
) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")
    
    token = authorization.split("Bearer ", 1)[1]
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(token, signing_key.key, algorithms=["RS256"])
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Clerk token: {e}")

    # Authoritative identity from token claims:
    token_user_id = claims.get("sub")
    token_org_id = claims.get("org_id")

    # Anti-Spoofing: If forwarded header conflicts with token claim, reject immediately
    if x_user_id and x_user_id != token_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Header X-User-Id does not match token sub")

    return {
        "user_id": token_user_id,
        "org_id": token_org_id,
        "claims": claims
    }
```

---

## 3. Approval Action Specifications (Idempotency & Rejection)

### A. Approval Execution (`POST /api/v1/approvals/{id}/action`)
```json
// Request:
{
  "action": "approve",
  "rationale": "Legal and architecture leads approved 90-day retention override."
}

// 200 OK Response:
{
  "id": "APP-042",
  "status": "approved",
  "executed": true,
  "executionSummary": "Mutated conflict CONF-001 state to resolved. Updated baseline decision.",
  "executedAt": "2026-10-11T14:30:00Z"
}
```

### B. Rejection Execution (`POST /api/v1/approvals/{id}/action`)
```json
// Request:
{
  "action": "reject",
  "rationale": "Proposed schema alteration violates Q2 compliance requirements."
}

// 200 OK Response:
{
  "id": "APP-042",
  "status": "rejected",
  "executed": false,
  "executionSummary": "Action rejected by reviewer. No external systems modified.",
  "executedAt": "2026-10-11T14:30:00Z"
}
```

### C. Idempotency Rule
If the same approval action is submitted a second time:
- Return HTTP 200 with the already-recorded outcome (`executed: true/false`), or
- Return HTTP 409 Conflict with `{ "detail": "Approval request APP-042 has already been resolved.", "code": "ACTION_ALREADY_RESOLVED" }`.

---

## 4. Automated Compatibility Probe

Once your FastAPI service is running locally on port `8000`:

```bash
bun run scripts/verify-backend-compatibility.ts
```

This probes all 7 core endpoints and prints an instant compliance report without altering production data.
