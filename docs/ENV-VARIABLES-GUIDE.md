# DecisionTrace — Environment Variable Reference (Person 2 AI Release)

This document contains the exact environment variable names required for the DecisionTrace Lyzr AI agent pipeline and server API proxy. 

> **SECURITY NOTICE:** Do NOT commit real secret values into version control. These values must be provided in deployment environment secrets or local `.env.local` files.

---

## 1. Lyzr Studio AI Agent Configuration (Required for Live AI)

| Environment Variable | Description | Exposure |
|---|---|---|
| `LYZR_API_KEY` | Lyzr Studio API Key (x-api-key header) | Server-only |
| `LYZR_API_BASE_URL` | Lyzr Studio API Base URL (defaults to `https://agent-prod.studio.lyzr.ai/v3`) | Server-only |
| `LYZR_EXTRACTOR_AGENT_ID` | Agent 1 ID: Commitment Extractor | Server-only |
| `LYZR_CONFLICT_AGENT_ID` | Agent 2 ID: Conflict Detector | Server-only |
| `LYZR_PLANNER_AGENT_ID` | Agent 3 ID: Action Planner | Server-only |
| `LYZR_MANAGER_AGENT_ID` | Agent 4 ID: Manager Agent | Server-only |

---

## 2. Person 1 Backend Integration

| Environment Variable | Description | Exposure |
|---|---|---|
| `DECISIONTRACE_BACKEND_URL` | Base URL of Person 1 FastAPI service (e.g., `http://localhost:8000/api/v1`) | Server-only |
| `NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW` | Allows deterministic verified preview fallback if set to `"true"` | Public / Client |

---

## 3. Clerk Authentication

| Environment Variable | Description | Exposure |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Public Key | Public / Client |
| `CLERK_SECRET_KEY` | Clerk Secret Key | Server-only |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Redirect path for sign in | Public / Client |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Redirect path for sign up | Public / Client |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Post sign in redirect | Public / Client |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Post sign up redirect | Public / Client |

---

## 4. Error Tracking (Optional)

| Environment Variable | Description | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN endpoint | Public / Client |
| `NEXT_PUBLIC_SENTRY_DISABLED` | Set to `"true"` to disable Sentry in local testing | Public / Client |
| `SENTRY_AUTH_TOKEN` | Sentry release upload token | Server-only |
