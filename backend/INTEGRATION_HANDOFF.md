# DecisionTrace — Integration Handoff Document

**To:** Akshay (Person 2 - Frontend & Lyzr Agent Lead)  
**From:** Harshitha (Person 1 - Backend & Infrastructure Lead)  
**Date:** 11 October 2026  
**Status:** In Progress / On Track for October 13, 2026 11:59 PM IST Deadline  

---

## 1. Summary of Deliverables & Boundaries
- **Harshitha's Scope (Backend)**: FastAPI backend, PostgreSQL database, SQLModel + Alembic migrations, Redis/RQ background worker, Qdrant FastEmbed vector memory, Clerk JWT session verification, Omi webhook ingestion, human approval execution engine, Railway deployment configuration.
- **Akshay's Scope (Frontend & Agent)**: Next.js + Clerk UI, Lyzr Manager & Specialist Agent prompt engineering and orchestration.

---

## 2. API Endpoints Quick Reference for Next.js

Base URL: `http://localhost:8000` (Local) / Railway domain in production.

All endpoints require Header: `Authorization: Bearer <clerk_session_token>`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server liveness check (unauthenticated) |
| `GET` | `/ready` | Database / Redis / Qdrant health check |
| `GET` | `/api/v1/overview` | Dashboard summary numbers |
| `GET` | `/api/v1/conversations` | Paginated list of ingested voice conversations |
| `GET` | `/api/v1/conversations/{id}` | Conversation detail with full transcript segments and chunk IDs |
| `GET` | `/api/v1/decisions` | Active commitments and historical decisions |
| `GET` | `/api/v1/findings` | Agent findings (conflicts, superseding changes, new commitments) |
| `GET` | `/api/v1/approvals` | Pending human approval cards |
| `POST` | `/api/v1/approvals/{id}/approve` | Confirm and execute decision update atomically |
| `POST` | `/api/v1/approvals/{id}/reject` | Reject proposal with audit trail |
| `POST` | `/api/v1/approvals/{id}/clarify` | Mark finding for clarification |
| `GET` | `/api/v1/activity` | Unified audit trail |
| `GET` | `/api/v1/integrations/omi/status` | Omi device connection status |
| `POST` | `/api/v1/integrations/omi` | Generate new webhook URL and token for Omi app |

---

## 3. How to Connect Clerk in Next.js
In your Next.js application, fetch session tokens using:
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
- JWT Issuer (`https://<clerk-domain>.clerk.accounts.dev` or custom issuer)
- JWKS public keys fetched dynamically with in-memory caching
- User ID (`sub`) extracted and mapped to internal PostgreSQL `users` row automatically.

---

## 4. How to Connect Lyzr Agent
Provide the following in `.env` once your Lyzr Manager Agent is created:
```dotenv
LYZR_API_KEY=your_lyzr_api_key
LYZR_BASE_URL=https://agent.api.lyzr.app/v2
LYZR_MANAGER_AGENT_ID=your_manager_agent_id
```
Refer to `AGENT_CONTRACT.md` for exact JSON schemas.
