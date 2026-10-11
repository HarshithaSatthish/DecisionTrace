# DecisionTrace — Production Cloud Deployment Guide

**Target Deployment Platforms:**
- **Frontend & Lyzr Server Orchestration:** Vercel (Next.js 16 App Router)
- **API & Background Worker:** Railway (FastAPI + RQ)
- **Database:** PostgreSQL (Neon / Railway Postgres)
- **Memory & Ingestion Queue:** Redis (Upstash / Railway Redis)
- **Vector Memory:** Qdrant Cloud Cluster

---

## 1. Cloud Architecture & Data Flow

```
[ User Browser / Reviewer ]
        │
        ▼ (HTTPS)
[ Vercel: Next.js 16 UI ] ──(Clerk Session JWT)──► [ Railway: FastAPI API Service ]
   │                                                         │
   │ (Server-side Lyzr Orchestration)                        ├─► [ PostgreSQL / Neon ]
   ▼                                                         ├─► [ Redis / RQ Queue ]
[ Lyzr Studio v3 Cloud ]                                      └─► [ Qdrant Cloud ]
                                                                      ▲
[ Omi Audio / Meet ] ──► Webhook (/api/v1/webhooks/omi/{token}) ──────┘
                               │
                               ▼
                   [ Railway: RQ Worker Service ]
                   (FastEmbed -> Qdrant -> Lyzr -> Findings -> Approvals)
```

---

## 2. Service Specifications & Resource Requirements

### A. Vercel (Next.js Frontend)
- **Framework Preset**: Next.js
- **Node.js Version**: 20.x
- **Build Command**: `bun run build` (or `npm run build`)
- **Output**: Standalone / App Router Serverless Functions
- **Function Region**: `iad1` (US East) or closest to Neon/Railway database
- **Execution Limits**:
  - Max Duration: 30 seconds (Vercel Pro/Enterprise recommended for multi-agent chains)
  - Memory: 1024 MB

### B. Railway (FastAPI API Service)
- **Source**: `Dockerfile` in `backend/` directory
- **Start Command**: `python scripts/start_api.py` (via Procfile `web`)
- **Port**: Auto-assigned `$PORT` (default 8000)
- **Healthcheck Path**: `/health` (Timeout: 30s)
- **Resource Sizing**:
  - CPU: 1 vCPU
  - RAM: 1 GB

### C. Railway (Background Worker Service)
- **Source**: Same Docker image as API service
- **Start Command**: `python scripts/start_worker.py` (via Procfile `worker`)
- **Worker Concurrency**: 1 worker per container (single-threaded async event loop)
- **Resource Sizing (FastEmbed Requirement)**:
  - FastEmbed Model: `BAAI/bge-small-en-v1.5` (~133 MB ONNX model)
  - Memory: **Minimum 2 GB RAM** (required for ONNX Runtime inference & dense embedding generation without OOM)
  - Ephemeral Disk: 2 GB for FastEmbed model cache (`/tmp/fastembed_cache`)

---

## 3. Environment Variables Configuration

### Vercel (Next.js Environment)
```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..."
CLERK_SECRET_KEY="sk_live_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/auth/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/auth/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/dashboard/overview"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/dashboard/overview"

# Backend FastAPI Service (Railway Public Domain)
DECISIONTRACE_BACKEND_URL="https://decisiontrace-api.up.railway.app/api/v1"

# Production Guard (Strictly disable fictional fixtures)
NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW="false"

# Lyzr Studio v3 (Server-Only)
LYZR_API_KEY="sk-..."
LYZR_API_BASE_URL="https://agent-prod.studio.lyzr.ai/v3"
LYZR_MANAGER_AGENT_ID="67f...mgr"
LYZR_EXTRACTOR_AGENT_ID="67f...ext"
LYZR_CONFLICT_AGENT_ID="67f...cnf"
LYZR_PLANNER_AGENT_ID="67f...pln"
```

### Railway (FastAPI & Worker Environment)
```env
# Application Settings
APP_NAME="DecisionTrace Backend"
APP_ENV="production"
PORT="8000"
LOG_LEVEL="INFO"

# Database (PostgreSQL / Neon)
DATABASE_URL="postgresql+psycopg://user:password@ep-neon-host.us-east-2.aws.neon.tech/decisiontrace?sslmode=require"

# Redis Queue
REDIS_URL="redis://default:token@railway-redis.railway.internal:6379/0"
RQ_QUEUE_NAME="decisiontrace_processing"

# Vector Store (Qdrant Cloud)
QDRANT_URL="https://your-cluster-id.us-east-1.aws.cloud.qdrant.io:6333"
QDRANT_API_KEY="qdrant_api_key_..."
QDRANT_COLLECTION="conversation_chunks_v1"
EMBEDDING_MODEL="BAAI/bge-small-en-v1.5"
EMBEDDING_DIMENSION="384"
FASTEMBED_CACHE_PATH="/tmp/fastembed_cache"

# Clerk Cryptographic Verification
CLERK_ISSUER="https://your-instance.clerk.accounts.dev"
CLERK_JWKS_URL="https://your-instance.clerk.accounts.dev/.well-known/jwks.json"
CLERK_AUTHORIZED_PARTIES="https://decisiontrace.vercel.app"
AUTH_DEV_MODE="False"

# CORS Configuration
CORS_ORIGINS="https://decisiontrace.vercel.app,http://localhost:3000"

# Lyzr Manager Integration
LYZR_API_KEY="sk-..."
LYZR_BASE_URL="https://agent-prod.studio.lyzr.ai/v3"
LYZR_MANAGER_AGENT_ID="67f...mgr"
```

---

## 4. Step-by-Step GitHub & Cloud Setup

### Step 1: Push Repositories to GitHub (When Authorized)
1. Push `master` frontend:
   ```bash
   git remote add origin https://github.com/<org>/decisiontrace-frontend.git
   git push -u origin feature/decisiontrace-ui
   ```
2. Push `backend`:
   ```bash
   git push -u origin feature/harshitha-backend
   ```

### Step 2: Deploy Database & Redis on Railway
1. Create a new Railway project: **DecisionTrace Production**.
2. Add a **PostgreSQL** service (or connect Neon DB connection string).
3. Add a **Redis** service.
4. Run Alembic migrations:
   ```bash
   alembic upgrade head
   ```

### Step 3: Deploy FastAPI API & Worker on Railway
1. Add new Service -> **GitHub Repo** -> `DecisionTrace` (backend folder).
2. Configure **API Service**:
   - Variables: set all Railway environment variables above.
   - Start Command: `python scripts/start_api.py`.
   - Healthcheck: `/health`.
3. Add second Service -> same repo -> configure **Worker Service**:
   - Start Command: `python scripts/start_worker.py`.
   - Set memory allocation to 2 GB.
4. Generate public domain for the API service (e.g. `https://decisiontrace-api.up.railway.app`).

### Step 4: Deploy Next.js Frontend on Vercel
1. Import `decisiontrace-frontend` repository in Vercel.
2. Set Environment Variables:
   - `DECISIONTRACE_BACKEND_URL`: `https://decisiontrace-api.up.railway.app/api/v1`
   - `NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW`: `false`
   - Clerk and Lyzr API keys.
3. Deploy! Vercel compiles the production bundle and links to the Railway API.
