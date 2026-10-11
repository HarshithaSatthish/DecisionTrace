# DecisionTrace — Integration Handoff Document

**To:** Akshay (Person 2 - Frontend & Lyzr Agent Lead)  
**From:** Harshitha (Person 1 - Backend & Infrastructure Lead)  
**Date:** 11 October 2026  
**Status:** Backend Integrated, Hardened, and Verified (40 Tests Passing, 89% Coverage)  
**Target Deadline:** 13 October 2026, 11:59 PM IST  
**Git Branch:** `feature/harshitha-backend` (Isolated Backend Branch)  

---

## 1. Summary of Verified Deliverables & Boundaries
- **Harshitha's Scope (Backend & Infrastructure)**:
  - FastAPI production-ready API with 13 registered route handlers.
  - SQLModel ORM with PostgreSQL/Neon pooling (`postgresql+psycopg`) & Alembic migrations (`4d9c03b5ca37`).
  - Clerk RS256 JWKS token cryptographic validation with `azp` and issuer checks (`AUTH_DEV_MODE=True` strictly forbidden in production).
  - FastEmbed dense vector generation (`BAAI/bge-small-en-v1.5`, 384-dimensional embeddings) and Qdrant multi-tenant memory (`conversation_chunks_v1`).
  - Redis / RQ background processing with transactional outbox and event deduplication.
  - `LyzrAgentAdapter` with schema contract enforcement, chunk ID hallucination filters, and prompt-injection neutralization.
  - Human approval engine with optimistic concurrency versioning (`decisions.version`) and double-approval prevention (`409 Conflict`).
  - Railway deployment artifacts: `Dockerfile`, `Procfile`, and `railway.json`.
- **Akshay's Scope (Frontend & Agent)**:
  - Next.js 14 App Router UI with Clerk session management.
  - Lyzr Manager & Specialist Agent prompt engineering and orchestration.

---

## 2. API Endpoints Quick Reference for Next.js

Base URL: `http://localhost:8000` (Local) / Configured Railway Backend Domain (Production).

All endpoints below require Header: `Authorization: Bearer <clerk_session_token>`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server liveness check (unauthenticated, 200 OK) |
| `GET` | `/ready` | Database / Redis / Qdrant readiness check (unauthenticated) |
| `GET` | `/api/v1/overview` | Dashboard summary metrics (active decisions, pending approvals) |
| `GET` | `/api/v1/conversations` | Paginated list of ingested voice conversations |
| `GET` | `/api/v1/conversations/{id}` | Conversation detail with full transcript segments and chunk IDs |
| `GET` | `/api/v1/decisions` | Active commitments and historical decisions (`?status=active`) |
| `GET` | `/api/v1/decisions/{id}` | Single decision detail with evidence chunk references |
| `GET` | `/api/v1/findings` | Agent findings (`?status=pending_approval`) |
| `GET` | `/api/v1/findings/{id}` | Single finding with excerpt evidence items |
| `GET` | `/api/v1/approvals` | Pending human approval cards |
| `GET` | `/api/v1/approvals/{id}` | Single approval request by ID |
| `POST` | `/api/v1/approvals/{id}/approve` | Confirm and execute decision update atomically |
| `POST` | `/api/v1/approvals/{id}/reject` | Reject proposal with audit trail |
| `POST` | `/api/v1/approvals/{id}/clarify` | Mark finding for clarification |
| `GET` | `/api/v1/activity` | Unified immutable audit trail |
| `GET` | `/api/v1/integrations/omi/status` | Omi device connection status |
| `POST` | `/api/v1/integrations/omi` | Generate new webhook URL and token for Omi app |

---

## 3. How to Connect Clerk in Next.js

In your Next.js application, fetch session tokens using Clerk's `getToken()` and forward in the `Authorization` header:

```typescript
import { useAuth } from "@clerk/nextjs";

export function useBackendApi() {
  const { getToken } = useAuth();

  const fetchWithAuth = async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    return fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  };

  return { fetchWithAuth };
}
```

The backend verifies:
- `CLERK_ISSUER` (e.g., `https://your-app.clerk.accounts.dev`)
- `CLERK_JWKS_URL` (e.g., `https://your-app.clerk.accounts.dev/.well-known/jwks.json`)
- `CLERK_AUTHORIZED_PARTIES` (validates `azp` claim matching your frontend domain)
- User ID (`sub`) extracted and mapped to internal PostgreSQL `users` row automatically.

---

## 4. How to Connect Lyzr Agent

Provide the following in `.env` once your Lyzr Manager Agent is created:

```dotenv
LYZR_API_KEY=your_lyzr_api_key
LYZR_BASE_URL=https://agent.api.lyzr.app/v2
LYZR_MANAGER_AGENT_ID=your_manager_agent_id
```

In `production` mode, if these variables are omitted or invalid, the backend will fail visibly with a descriptive `RuntimeError` rather than fabricating responses. In development/testing, the deterministic contract analyzer validates inputs and enforces anti-hallucination chunk verification.

Refer to `AGENT_CONTRACT.md` for exact JSON schemas.

---

## 5. Omi Mobile Webhook Setup

1. Call `POST /api/v1/integrations/omi` to generate the dedicated webhook URL:
   `https://<backend-domain>/api/v1/webhooks/omi/<raw_token>`
2. In the Omi mobile application (Settings → Developer → Webhooks):
   - Enter the generated Webhook URL.
   - Set trigger to **Memory Created** or **Conversation Ended**.
3. Any audio captured by Omi is automatically sent, transcribed segments ingested, deduplicated, embedded with FastEmbed, stored in Qdrant, and routed to the agent.

---

## 6. Railway Production Deployment Guide

Railway uses the included `Dockerfile` and `Procfile`:
1. **API Service**:
   - Start Command: `python scripts/start_api.py` (or `uvicorn app.main:app --host 0.0.0.0 --port $PORT`)
   - Healthcheck Path: `/health`
2. **Worker Service**:
   - Start Command: `rq worker -u $REDIS_URL default` (or `python scripts/start_worker.py`)
3. **Environment Variables**:
   - `DATABASE_URL`: Neon PostgreSQL connection string (`postgresql+psycopg://...`)
   - `REDIS_URL`: Railway Redis service URL
   - `QDRANT_URL`: Qdrant Cloud cluster endpoint
   - `QDRANT_API_KEY`: Qdrant Cloud API key
   - `CLERK_ISSUER`: Clerk issuer domain
   - `CLERK_JWKS_URL`: Clerk JWKS endpoint
   - `APP_ENV`: `production`
   - `AUTH_DEV_MODE`: `False` (CRITICAL: setting this to True triggers a fatal startup crash)
