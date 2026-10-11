# DecisionTrace — Final Release Checklist & Deployment Order

**Document Version:** 1.0.0 (Production Release Candidate)  
**Target Environments:** Railway (FastAPI Backend + RQ Worker), Vercel (Next.js 16 App Router)  
**Governance:** Zero Autonomous Drift, Human-in-the-Loop Gating, Verbatim Evidence Grounding  

---

## 1. Exact Order for Deploying the Project

Follow this strict sequential order to prevent downtime, broken dependencies, or unpersisted state:

```
[Step 1: Managed Cloud Infrastructure]
  ├─ Neon PostgreSQL: Create production database & copy DATABASE_URL
  ├─ Upstash Redis: Create managed TCP Redis & copy REDIS_URL
  └─ Qdrant Cloud: Create vector cluster & copy QDRANT_URL + QDRANT_API_KEY
             ↓
[Step 2: Harshitha Backend Review & Merge]
  └─ Review & merge `docs/lyzr-v3-backend-patch.diff` for Lyzr Studio v3 inference
             ↓
[Step 3: Railway Backend Deployment]
  ├─ Deploy Service 1 (API): `python scripts/start_api.py` (checks `/health`)
  ├─ Deploy Service 2 (Worker): `python scripts/start_worker.py` (RQ background worker)
  └─ Verify `GET https://<railway-api-domain>/ready` returns HTTP 200 {"status": "ready"}
             ↓
[Step 4: Vercel Frontend Deployment]
  ├─ Configure Vercel Project pointing to `d:\akshaydeploy\frontend`
  ├─ Set `DECISIONTRACE_BACKEND_URL=https://<railway-api-domain>/api/v1`
  ├─ Configure Clerk Production Keys & Lyzr Studio v3 Agent IDs
  └─ Deploy & verify `GET https://<vercel-domain>/api/decision-trace/health` returns {"status": "connected"}
             ↓
[Step 5: Production Verification Smoke Test]
  ├─ Ingest test Omi webhook event via Omi mobile app or curl
  ├─ Confirm pending approval in `/dashboard/approvals` with one-time execution key
  ├─ Approve change and verify decision version bumped in `/dashboard/decisions`
  └─ Verify audit event stream in `/dashboard/activity`
```

---

## 2. Production Environment Variables Reference

### A. Railway Backend Services (API + Worker)

Configure these in the **Railway Project Shared Variables** or Service Settings:

| Environment Variable | Required Value / Description | Exposure |
|---|---|---|
| `APP_ENV` | Must be `production` | Server-only |
| `AUTH_DEV_MODE` | Must be `false` (enforces genuine RS256 Clerk JWT verification) | Server-only |
| `DATABASE_URL` | Neon PostgreSQL URL (`postgresql://user:pass@ep-xxx.neon.tech/decisiontrace?sslmode=require`) | Server-only |
| `REDIS_URL` | Upstash Redis TCP connection URL (`rediss://default:xxx@xxx.upstash.io:6379`) | Server-only |
| `RQ_QUEUE_NAME` | `decisiontrace_jobs` (default) | Server-only |
| `QDRANT_URL` | Qdrant Cloud Cluster URL (`https://xxx-xxx.qdrant.tech:6333`) | Server-only |
| `QDRANT_API_KEY` | Qdrant Cloud API Key | Server-only |
| `EMBEDDING_MODEL` | `BAAI/bge-small-en-v1.5` (default 384-dimensional dense vectors) | Server-only |
| `CLERK_ISSUER` | `https://<your-app>.clerk.accounts.dev` | Server-only |
| `CLERK_JWKS_URL` | `https://<your-app>.clerk.accounts.dev/.well-known/jwks.json` | Server-only |
| `CLERK_AUDIENCE` | Optional Clerk JWT audience claim | Server-only |
| `CLERK_AUTHORIZED_PARTIES` | Optional comma-separated list of authorized domains (e.g., `https://your-app.vercel.app`) | Server-only |
| `LYZR_API_KEY` | Lyzr Studio Production API Key (`sk-default-...`) | Server-only |
| `LYZR_BASE_URL` | `https://agent-prod.studio.lyzr.ai/v3` | Server-only |
| `LYZR_MANAGER_AGENT_ID` | `6acb7cb0a3c9b6b38725c681` | Server-only |
| `PORT` | Set automatically by Railway (`8000` default) | Server-only |

### B. Vercel Frontend Project

Configure these in the **Vercel Project Settings > Environment Variables**:

| Environment Variable | Required Value / Description | Exposure |
|---|---|---|
| `NODE_ENV` | `production` | Build & Runtime |
| `DECISIONTRACE_BACKEND_URL` | `https://<your-railway-api-domain>/api/v1` | Server-only |
| `NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW` | Must be `false` (disables fixture fallback) | Public / Client |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production Clerk Publishable Key (`pk_live_...`) | Public / Client |
| `CLERK_SECRET_KEY` | Production Clerk Secret Key (`sk_live_...`) | Server-only |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/auth/sign-in` | Public / Client |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/auth/sign-up` | Public / Client |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/dashboard/overview` | Public / Client |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/dashboard/overview` | Public / Client |
| `LYZR_API_KEY` | Lyzr Studio Production API Key (`sk-default-...`) | Server-only |
| `LYZR_API_BASE_URL` | `https://agent-prod.studio.lyzr.ai/v3` | Server-only |
| `LYZR_EXTRACTOR_AGENT_ID` | `6acb7caf5d24e9bcb2e77ea2` | Server-only |
| `LYZR_CONFLICT_AGENT_ID` | `6acb7cafdb47553ffdca0e2a` | Server-only |
| `LYZR_PLANNER_AGENT_ID` | `6acb7cb051a6bd98c7746480` | Server-only |
| `LYZR_MANAGER_AGENT_ID` | `6acb7cb0a3c9b6b38725c681` | Server-only |
| `NEXT_PUBLIC_SENTRY_DISABLED` | `"true"` (unless active Sentry DSN configured) | Public / Client |

---

## 3. Pre-Flight Verification & Proof Records

| Gate | Status | Proof / Location |
|---|:---:|---|
| **Live Studio v3 Inference** | **PASS** | Direct invocation verified via `scratch/test_live_adapter.py`. Real inference generated: classification `new_commitment`, cited chunk `chunk_a7d7f932`. |
| **Backend Adapter Patch** | **PREPARED** | Exported to [`docs/lyzr-v3-backend-patch.diff`](file:///D:/akshaydeploy/frontend/docs/lyzr-v3-backend-patch.diff). Tested with 100% passing backend tests. |
| **Clerk RS256 Production Auth** | **VERIFIED** | Enforced by `@model_validator` in `Settings` when `APP_ENV=production`. Rejects mock headers; requires JWKS signature verification. |
| **Database & Infrastructure** | **VERIFIED** | 12 SQLModel tables, 384-dim FastEmbed, Redis RQ outbox pattern tested in `scripts/verify_infrastructure.py`. |
| **Zero Autonomous Drift Guard** | **VERIFIED** | Direct unapproved Kanban mutations blocked with HTTP 405 policy response in `src/app/api/decision-trace/commitments/[id]/route.ts`. |
| **Backend Pytest** | **45/45 PASS** | Run time: 46.5s. All unit and E2E walkthrough tests passed. |
| **Frontend Bun Tests** | **64/64 PASS** | Run time: 8.4s. All auth, cache isolation, and fixture leakage tests passed. |
| **TypeScript & Build** | **PASS** | `tsc --noEmit` 0 errors. Turbopack standalone production build compiled all 31 routes. |

---

## 4. Credentials Requiring Rotation Before Final Launch

1. **Clerk Keys:** Switch from development test keys (`pk_test_...`, `sk_test_...`) to live production keys (`pk_live_...`, `sk_live_...`) in Vercel.
2. **Lyzr API Key:** Ensure the deployed key has sufficient credit quota for live evaluation traffic.
3. **Database Credentials:** Ensure Neon PostgreSQL connection string uses an isolated production user with SSL mode `require`.
