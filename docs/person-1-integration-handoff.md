# DecisionTrace — Person 1 Backend Integration Handoff

**Recipient:** Person 1 (Backend Engineer — FastAPI, Qdrant, Lyzr)  
**Author:** Frontend Agent  
**Repository Branch:** `feature/decisiontrace-ui`  
**Date:** 2026-04-11  

---

## 1. Overview
The DecisionTrace six-screen frontend is complete, hardened, and running on Next.js 16.4.0. It communicates with your backend via a typed server-side proxy layer (`/api/decision-trace/*`).

The frontend currently runs in **truthful disconnected / preview mode** with verifiable mock fixtures until you connect the FastAPI backend.

---

## 2. Environment Variables

Add the following to `.env.local` (kept private):

```env
# URL to your FastAPI service
DECISIONTRACE_BACKEND_URL="http://localhost:8000/api/v1"

# Development Preview toggle:
# Set to "false" to enforce strict production behavior (empty states when backend is offline)
# Set to "true" or omit in development to permit local verified preview fixtures
NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW="true"
```

---

## 3. Authentication Flow (Clerk JWT)

All requests from Next.js server route handlers to your FastAPI service will include:
```http
Authorization: Bearer <clerk_session_token>
X-User-Id: <user_2xxxxxxxxxxxx>
X-Org-Id: <org_2xxxxxxxxxxxx>
Content-Type: application/json
```

### In FastAPI (Python):
Validate the Bearer token with Clerk's JWKS:
```python
import jwt
from jwt import PyJWKClient

CLERK_JWKS_URL = "https://api.clerk.com/v1/jwks" # or your instance JWKS URL
jwks_client = PyJWKClient(CLERK_JWKS_URL)

def get_current_user(token: str = Header(...)):
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    payload = jwt.decode(token, signing_key.key, algorithms=["RS256"])
    return payload  # sub contains user_id
```

---

## 4. Proposed API Endpoints to Implement

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | `GET` | Health signal. Returning `{ "status": "ok" }` turns the header badge green ("Guardian Connected"). |
| `/metrics` | `GET` | Summary cards: Active Decisions, Open Commitments, Detected Conflicts, Pending Approvals. |
| `/decisions` | `GET` | Search and filter decisions extracted by Lyzr from Slack / Meet. |
| `/decisions/{id}` | `GET` | Single decision with evidence citations from Qdrant. |
| `/commitments` | `GET` | Tracked action items with owner, deadline, and priority. |
| `/commitments/{id}` | `PATCH` | Update commitment status (e.g., from `in_progress` to `completed`). |
| `/conflicts` | `GET` | List detected contradictions with side-by-side evidence quotes. |
| `/conflicts/{id}/resolve`| `POST` | Resolve, escalate, or dismiss a detected conflict. |
| `/approvals` | `GET` | Pending approval actions requiring human consensus. |
| `/approvals/{id}/action` | `POST` | Execute `approve` or `reject` with reviewer rationale. |
| `/activity` | `GET` | Chronological audit stream of all guardian events. |

Full JSON schemas and request payloads are documented in:
[docs/backend-integration-contract.md](./backend-integration-contract.md)

### 4.1 Person 2 Lyzr Multi-Agent Pipeline Handoff

The AI pipeline is live and operational in the Next.js server tier (`/src/server/lyzr/`). Person 1 can either invoke the authenticated endpoint `POST /api/decision-trace/analyze` or consume its output directly to populate PostgreSQL and Qdrant.

#### 1. Server Environment Variables (Do not commit values)
Configure in your deployment environment:
```env
LYZR_API_KEY="sk-..."                       # Lyzr Studio API Key
LYZR_API_BASE_URL="https://agent-prod.studio.lyzr.ai/v3"
LYZR_EXTRACTOR_AGENT_ID="<extractor_id>"    # Commitment Extractor
LYZR_CONFLICT_AGENT_ID="<conflict_id>"      # Conflict Detector
LYZR_PLANNER_AGENT_ID="<planner_id>"        # Action Planner
LYZR_MANAGER_AGENT_ID="<manager_id>"        # Manager Agent
```

#### 2. Pipeline Orchestration Sequence
```
Input Transcript (Omi/Slack/Meet)
   │
   ▼
[Agent 1: Commitment Extractor] ──► Extracted Decisions & Commitments with Verbatim Quotes
   │
   ├──────────────────────────────► [Historical Decisions from Person 1 Qdrant/Postgres]
   ▼                                     │
[Agent 2: Conflict Detector] ◄───────────┘
   │
   ▼ (Detected Contradictions with Dual Evidence)
[Agent 3: Action Planner] ────────► Suggested Actions & Strict Human Consensus Gating
   │
   ▼
[Agent 4: Manager Agent / Deduplicator] ──► Executive Summary & Unified Domain Entity Payload
```

#### 3. Request Contract: `POST /api/decision-trace/analyze`
**Request Body**:
```json
{
  "conversationText": "Alice: We decided to deploy to Europe.\nBob: I will update DNS routing by 2026-06-01.",
  "sourceTitle": "Sprint Architecture Review",
  "channel": "Google Meet",
  "timestamp": "2026-05-10T14:30:00Z",
  "existingDecisions": [
    {
      "id": "dec-101",
      "title": "US Deployment Standard",
      "whatWasDecided": "Deploy services exclusively in us-east-1",
      "summary": "Compliance policy requires US-only data residency",
      "evidence": [{ "quote": "We decided to keep all data in US-East.", "speakerOrAuthor": "Security Lead" }]
    }
  ]
}
```

#### 4. Response Contract & Evidence Identifiers
**Response Output (`200 OK`)**:
```json
{
  "summary": "Executive summary synthesized by Lyzr Manager Agent.",
  "decisions": [
    {
      "id": "dec-...",
      "title": "string",
      "whatWasDecided": "string",
      "status": "active",
      "confidence": 95,
      "confidenceLevel": "high",
      "evidence": [
        {
          "id": "ev-dec-...",
          "sourceType": "slack | meeting",
          "speakerOrAuthor": "Alice",
          "quote": "verbatim text excerpt",
          "vectorSimilarity": 0.94
        }
      ]
    }
  ],
  "commitments": [
    {
      "id": "cmt-...",
      "task": "string",
      "owner": "Bob",
      "deadline": "2026-06-01",
      "status": "in_progress",
      "priority": "high",
      "relatedDecisionId": "dec-...",
      "evidence": [...]
    }
  ],
  "conflicts": [
    {
      "id": "conf-...",
      "title": "string",
      "severity": "critical | high | medium | low",
      "explanation": "why decision A contradicts decision B",
      "status": "unresolved",
      "previousDecision": { "id": "dec-101", "evidence": { "quote": "..." } },
      "newerDecision": { "id": "dec-...", "evidence": { "quote": "..." } }
    }
  ],
  "pendingApprovals": [
    {
      "id": "appr-...",
      "title": "Override Conflict: ...",
      "exactActionPreview": "Mutate conflict state and record consensus between dec-101 and candidate.",
      "riskLevel": "critical",
      "requiresApproval": true,
      "status": "pending"
    }
  ],
  "provenance": {
    "orchestrator": "lyzr-manager-agent-v1",
    "mode": "live-lyzr-agent"
  }
}
```

#### 5. Human Approval Gating Rules
- **ZERO Silent Autonomous Action**: Agents NEVER execute actions, override policies, or mutate PostgreSQL tables directly.
- **`requiresApproval: true`**: Mandatory on all conflict overrides, state alterations, policy supersessions, and pipeline triggers.
- **Exact Action Preview**: Every approval item provides an unambiguous human-readable preview before execution.

#### 6. Minimum Data Required from Person 1
1. **Omi / Audio Transcription Feed**: Clean text transcripts for `/api/decision-trace/analyze`.
2. **Qdrant Semantic Decision Search**: Top 3-5 semantically similar decisions passed into `existingDecisions` for conflict detection.
3. **Database Sink**: Ingestion of the returned `decisions`, `commitments`, `conflicts`, and `pendingApprovals` arrays into PostgreSQL.

---

## 5. Outstanding Backend Dependencies (Action Items)

1. [ ] **Spin up FastAPI on Port 8000**: Provide `/api/v1/health` first to establish connection.
2. [ ] **Verify Endpoints**: If you prefer different route paths (e.g. `/v1/decisions` instead of `/api/v1/decisions`), let the frontend know so the proxy URLs can be updated.
3. [ ] **Qdrant Vector Embeddings**: Ensure each evidence citation returns `vectorSimilarity` (float between 0.0 and 1.0) for match score display.
4. [ ] **Error Handling**: On failure, return standard RFC 7807 JSON: `{ "detail": "Descriptive message", "code": "ERROR_CODE" }`. The frontend surfaces these messages directly to reviewers.
