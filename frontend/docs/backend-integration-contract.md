# DecisionTrace — Backend Integration Contract (FastAPI + Qdrant + Lyzr)

> **Status:** PROPOSED SPECIFICATION  
> **Status Notice:** All endpoint paths, payload schemas, and headers documented below represent the frontend integration contract proposed to **Person 1**. These remain marked as **PROPOSED** until Person 1 confirms implementation in the FastAPI service.

---

## 1. Architecture Overview

```mermaid
graph LR
    User[Frontend User] --> NextApp[Next.js App Router (Port 3000)]
    NextApp --> RouteHandler[/api/decision-trace/*]
    RouteHandler --> ClerkAuth[Clerk Auth JWT Verification]
    RouteHandler --> FastAPI[FastAPI Backend (Port 8000)]
    FastAPI --> LyzrAgent[Lyzr Agent Orchestrator]
    FastAPI --> QdrantDB[(Qdrant Vector DB)]
```

### Authentication & Headers (Proposed)
Every request forwarded by the Next.js server proxy to FastAPI includes:
```http
Authorization: Bearer <clerk_jwt_session_token>
X-User-Id: <clerk_user_id>
X-Org-Id: <clerk_org_id_or_empty>
Content-Type: application/json
X-Client-Version: decisiontrace-frontend/1.0.0
```

### FastAPI JWT Verification Guide
To validate the incoming Clerk session token in FastAPI:
1. Fetch Clerk's public JSON Web Key Set (JWKS) from `https://api.clerk.com/v1/jwks` or using `CLERK_SECRET_KEY`.
2. Decode and verify the JWT signature using `PyJWT` or `fastapi-clerk`.
3. Extract `sub` as the `userId`, and `org_id` / `org_role` for RBAC authorization.

### Environment Configuration
The Next.js backend proxy reads the target FastAPI URL from:
- `DECISIONTRACE_BACKEND_URL`: Defaults to `http://localhost:8000/api/v1`

---

## 2. API Endpoints Contract (Proposed)

### 2.0 Health & Probe [PROPOSED]
`GET /api/v1/health`
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "agent": "lyzr-guardian-v1",
  "vector_db": "qdrant-connected",
  "timestamp": "2026-04-11T12:00:00Z"
}
```

### 2.1 Overview & Metrics [PROPOSED]
`GET /api/v1/metrics`
- **Response `200 OK`**:
```json
{
  "activeDecisionsCount": 24,
  "openCommitmentsCount": 18,
  "detectedConflictsCount": 3,
  "pendingApprovalsCount": 5,
  "decisionTrend": [
    { "period": "Jan 2026", "decisions": 14, "commitments": 10 },
    { "period": "Feb 2026", "decisions": 19, "commitments": 16 },
    { "period": "Mar 2026", "decisions": 26, "commitments": 22 },
    { "period": "Apr 2026", "decisions": 31, "commitments": 28 }
  ],
  "attentionItems": [
    {
      "id": "conf-001",
      "type": "conflict",
      "title": "Data Retention Contradiction: 90 Days vs 30 Days",
      "severity": "critical",
      "actionUrl": "/dashboard/conflicts",
      "time": "Detected 2d ago"
    }
  ]
}
```

### 2.2 Decisions [PROPOSED]
`GET /api/v1/decisions?search=&status=&category=&page=1&limit=20`
`GET /api/v1/decisions/{id}`
- **Response `200 OK`**:
```json
{
  "total": 24,
  "page": 1,
  "limit": 20,
  "items": [
    {
      "id": "DEC-104",
      "title": "Default Batch Export Retention Window (90 Days)",
      "summary": "Standardized lifecycle policy for all analytics raw parquet dumps across cloud buckets.",
      "whatWasDecided": "All automated batch exports and data lake raw partitions shall be stored under a 90-day cold-tier retention lifecycle rule before automated archival.",
      "participants": ["Sarah Chen", "Marcus Rivera", "Alex Turner"],
      "createdAt": "2026-03-15T14:30:00Z",
      "updatedAt": "2026-03-15T14:30:00Z",
      "status": "superseded",
      "sourceConversation": {
        "id": "conv-slack-8821",
        "title": "Infra Storage Sync & Cost Architecture",
        "channel": "#infra-core",
        "timestamp": "2026-03-15T14:15:00Z"
      },
      "evidence": [
        {
          "id": "ev-104-1",
          "sourceType": "slack",
          "sourceTitle": "#infra-core Thread 8821",
          "channelOrLocation": "#infra-core",
          "speakerOrAuthor": "Marcus Rivera",
          "timestamp": "2026-03-15T14:22:10Z",
          "quote": "Let us standardize cold storage lifecycle to 90 days for all raw parquet batches to balance cost against backfill needs.",
          "vectorSimilarity": 0.96
        }
      ],
      "confidence": 96,
      "confidenceLevel": "high",
      "relatedCommitmentIds": ["COM-301"],
      "category": "Infrastructure & Storage",
      "impactLevel": "medium"
    }
  ]
}
```

### 2.3 Commitments [PROPOSED]
`GET /api/v1/commitments?status=&owner=&priority=`  
`PATCH /api/v1/commitments/{id}`
- **Request Body for `PATCH`**:
```json
{
  "status": "in_progress"
}
```
- **Response `200 OK`**:
```json
{
  "id": "COM-302",
  "status": "in_progress",
  "updatedAt": "2026-04-11T12:00:00Z"
}
```

### 2.4 Conflicts [PROPOSED]
`GET /api/v1/conflicts`  
`POST /api/v1/conflicts/{id}/resolve`
- **Request Body for `POST`**:
```json
{
  "action": "resolve" | "escalate" | "dismiss",
  "rationale": "Superseded older rule in favor of GDPR compliance"
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "conflictId": "CONF-001",
  "status": "resolved",
  "resolvedAt": "2026-04-11T12:00:00Z",
  "message": "Conflict resolved: newer policy DEC-188 marked active."
}
```

### 2.5 Approvals [PROPOSED]
`GET /api/v1/approvals`  
`POST /api/v1/approvals/{id}/action`
- **Request Body**:
```json
{
  "action": "approve" | "reject",
  "rationale": "Confirmed by VP Engineering during security sign-off"
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "approvalId": "APP-042",
  "status": "approved",
  "executedAt": "2026-04-11T12:00:00Z",
  "executionSummary": "Decision #DEC-104 status updated to superseded. Pipeline lifecycle rule updated to 30 days."
}
```
- **Error Response `502 / 503 Service Unavailable`**:
```json
{
  "detail": "Backend consensus engine is offline or unreachable.",
  "code": "BACKEND_UNAVAILABLE"
}
```

### 2.6 Activity [PROPOSED]
`GET /api/v1/activity?type=&search=`
- **Response `200 OK`**: List of chronological audit items.

---

## 3. Outstanding Backend Dependencies (Person 1 Action Items)
1. **FastAPI Service Scaffold**: Deploy FastAPI listening on `http://localhost:8000` (or configure via `DECISIONTRACE_BACKEND_URL`).
2. **Implement `/api/v1/health`**: Required for the frontend `GuardianStatusPill` to transition from "Guardian Disconnected" to "Guardian Connected".
3. **Clerk Token Validation Middleware**: Ensure incoming `Authorization: Bearer <token>` is validated against Clerk JWKS.
4. **Qdrant Vector DB Connection**: Ensure Lyzr agent queries the active Qdrant cluster for semantic similarity scores.
5. **Confirm/Adjust Endpoint Paths**: If Person 1 requires different route naming (e.g., `/decisions/` vs `/decisions`), notify frontend to adjust route proxy mapping.
