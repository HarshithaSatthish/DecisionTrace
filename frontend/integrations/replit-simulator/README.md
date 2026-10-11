# Replit Integration Simulator — Isolated Sandbox

## 1. Overview & Purpose
This directory provides an **isolated staging environment** for Replit's end-to-end integration testing harness and API simulator.

> [!CAUTION]
> **CRITICAL SECURITY CONSTRAINT:**
> The Replit simulator must **NEVER** be mounted, aliased, or deployed as the production backend.
> In strict production environments (`NODE_ENV=production` and `NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW=false`),
> all frontend API requests must target Person 1's authentic FastAPI backend (`DECISIONTRACE_BACKEND_URL`).

---

## 2. Sandbox Architecture & Isolation Rules

1. **Port Isolation**:
   - The simulator runs on a dedicated, non-standard local port (e.g., `http://localhost:8001` or `http://localhost:3001`).
   - It must never hijack port `8000` (reserved for Person 1's FastAPI server) or port `3000` (Next.js master dashboard).

2. **Network & Proxy Boundary**:
   - The Next.js API proxy routes in `src/app/api/decision-trace/*` only proxy to the URL specified in `DECISIONTRACE_BACKEND_URL`.
   - When running Replit tests, set `DECISIONTRACE_BACKEND_URL="http://localhost:8001"` in a separate `.env.test.local` or environment flag.
   - Do not commit simulator URLs to `.env.local` or production environment manifests.

3. **Data Boundary**:
   - Simulator fixtures must reside within this isolated directory.
   - Simulator runs must not contaminate local development caches or production database tables.

---

## 3. Simulator Contract Verification

The simulator must strictly comply with the domain types defined in `src/features/decision-trace/types/index.ts`:

- `GET /health` → `{ "status": "ok" }`
- `GET /metrics` → Summary metrics payload
- `GET /decisions` & `GET /decisions/{id}` → Decision schema with evidence array
- `GET /commitments` & `PATCH /commitments/{id}` → Commitment status updates
- `GET /conflicts` & `POST /conflicts/{id}/resolve` → Conflict resolution payloads
- `GET /approvals` & `POST /approvals/{id}/action` → Approval execution responses
- `GET /activity` → Audit log feed

---

## 4. Test Execution Instructions

When running Replit simulator test suites:
```bash
# 1. Start Replit simulator on port 8001 (isolated)
# (Run from this directory)

# 2. In frontend workspace, verify proxy with simulator URL:
DECISIONTRACE_BACKEND_URL="http://localhost:8001" bun run test
```
