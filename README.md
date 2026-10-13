# DecisionTrace — Autonomous Decision & Commitment Guardian

> **Autonomous decision extraction, semantic contradiction monitoring, and commitment surveillance from spoken and written conversations with human-in-the-loop approval gating.**

[![DecisionTrace CI](https://github.com/HarshithaSatthish/DecisionTrace/actions/workflows/ci.yml/badge.svg)](https://github.com/HarshithaSatthish/DecisionTrace/actions/workflows/ci.yml)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%200.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20%2F%20Neon-336791?logo=postgresql&logoColor=white)](https://neon.tech)
[![Qdrant](https://img.shields.io/badge/Vector%20Memory-Qdrant%20Cloud-DC2626?logo=qdrant&logoColor=white)](https://qdrant.tech)
[![Lyzr AI](https://img.shields.io/badge/Agent%20Framework-Lyzr%20AI-7C3AED)](https://lyzr.ai)
[![Clerk](https://img.shields.io/badge/Authentication-Clerk%20RS256-6C47FF?logo=clerk&logoColor=white)](https://clerk.com)

---

## 1. Problem Statement

Modern team communication occurs continuously across spoken conversations, meetings, voice memos, and asynchronous chat. As discussions unfold, consequential decisions and promises are routinely made:
- *"Let's standardize on PostgreSQL for transactional isolation."*
- *"I will deliver the database migration scripts by Thursday at 2 PM."*
- *"Let's move the sprint review from Friday 10 AM to Thursday 2 PM."*

**The Breakdown:**
1. **Forgotten Commitments:** Commitments made orally or in fleeting discussions slip through the cracks without entering task trackers.
2. **Undetected Contradictions:** Teams change plans weeks later without realizing the new direction contradicts an active architectural commitment.
3. **Lack of Auditability:** When things break, there is no verifiable trail connecting who agreed to what, when, or with what rationale.
4. **Autonomous AI Risk:** Unconstrained AI bots that execute actions without human verification create severe reliability risks, hallucinating dates or altering critical records without oversight.

---

## 2. Proposed Solution

**DecisionTrace** is an autonomous guardian system that captures conversations through ambient voice devices (Omi) or direct input, semantically links them against existing memory in Qdrant, employs a specialized Lyzr multi-agent hierarchy to identify decisions and contradictions, and presents high-stakes state changes to humans for verified one-click approval before recording them to PostgreSQL with an immutable audit log.

---

## 3. Real Architecture Diagram

```mermaid
flowchart TD
    subgraph ConversationCapture["1. Capture & Ingestion"]
        OMI[Omi Wearable / Voice Device] -->|Webhook POST /api/v1/webhooks/omi/{token}| FAST[FastAPI Ingestion Engine]
        UI_IN[Frontend Direct Transcript Ingest] -->|POST /api/decision-trace/analyze| FAST
        FAST -->|SHA-256 Token Validation & Deduplication| OUTBOX[(Transactional Outbox)]
    end

    subgraph ProcessingLayer["2. Worker & Vector Memory"]
        OUTBOX -->|Enqueue Task| REDIS[(Redis / RQ Task Queue)]
        RECON[Outbox Reconciler Service] -.->|Auto-recover stuck jobs| REDIS
        REDIS --> WORKER[Background Worker Process]
        WORKER -->|Chunking Service| CHUNKS[Transcript Chunks]
        CHUNKS -->|Dense 384-dim Embeddings| FE[FastEmbed BAAI/bge-small-en-v1.5]
        FE -->|Multi-Tenant Upsert| QD[(Qdrant Vector DB: conversation_chunks_v1)]
        WORKER -->|Semantic Search excluding current conv| QD
        QD -->|Prior Evidence & Citations| WORKER
    end

    subgraph AgentReasoning["3. Lyzr Multi-Agent Reasoning"]
        WORKER -->|Grounding Payload + Trust Boundary| LYZR[Lyzr Agent Orchestrator]
        LYZR --> CE[Commitment Extractor Agent]
        LYZR --> CD[Conflict & Contradiction Detector]
        LYZR --> AP[Action Planner Agent]
        CE & CD & AP -->|Grounded Findings + Verbatim Quotes| HAR[Anti-Hallucination Evidence Filter]
    end

    subgraph SafetyAndPersistence["4. Human Safety Engine & Storage"]
        HAR -->|Consequential Mutation?| GATE{Human Approval Required?}
        GATE -->|Yes: Superseding / Critical| APPR[Approval Queue Pending]
        GATE -->|No: Informational / Log| COMMIT[(PostgreSQL / Neon: Decisions & Commitments)]
        APPR -->|Operator Approve / Reject / Clarify| ATOMIC[Atomic Approval Transition & Savepoint]
        ATOMIC --> COMMIT
        ATOMIC --> AUDIT[(Immutable Audit Log: audit_events)]
    end

    subgraph UserInterface["5. Full-Stack Dashboard"]
        COMMIT & AUDIT --> API_EXP[FastAPI Scoped Multi-Tenant REST API]
        API_EXP -->|Server-to-Server SSR + Bearer JWT| NEXT[Next.js 16 App Router UI]
        CLERK[Clerk Auth RS256 JWKS] -->|Session JWT Token| NEXT
        NEXT --> DASH[Overview Dashboard & Metrics]
        NEXT --> DEC_UI[Decisions Registry]
        NEXT --> COM_UI[Commitment Board]
        NEXT --> CON_UI[Contradiction Alerts]
        NEXT --> APP_UI[Human Approval Queue]
        NEXT --> OMI_UI[Omi Device Pairing]
    end
```

---

## 4. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend Framework** | Next.js (Turbopack, App Router) | 16.4.0 | Responsive SSR dashboard, parallel route slots, server actions |
| **Frontend Runtime** | Bun & Node.js | Bun 1.4.3 / Node 25 | High-speed frontend test runner, package manager, and build gate |
| **UI Components** | React, TailwindCSS, Radix / Base UI | React 19.2.4 | Accessible component primitives, dark/light themes, Lucide icons |
| **Authentication** | Clerk (`@clerk/nextjs`) | 7.8.1 | RS256 JWKS session management, user isolation, multi-tenant orgs |
| **Backend Framework** | FastAPI | 0.115.0 | Async Python REST API, dependency injection, OpenAPI 3.1 |
| **Backend Runtime** | Python | 3.12 | Type annotations, Pydantic v2 schemas, async worker pipeline |
| **Relational Database** | PostgreSQL / Neon | 16+ | ACID persistence, Alembic migrations, SQLAlchemy nested savepoints |
| **ORM & Data Modeling** | SQLModel / SQLAlchemy | 2.0.35 | Type-safe declarative schema models, multi-tenant foreign keys |
| **Task Queue & Outbox** | Redis / RQ | 5.0.8 | Background task execution, transactional outbox reconciliation |
| **Vector Database** | Qdrant Cloud | 1.11.0 | 384-dimensional dense semantic search, tenant-isolated vector filtering |
| **Embedding Engine** | FastEmbed (`BAAI/bge-small-en-v1.5`) | 0.3.6 | CPU-efficient local dense vector generation (1.18s latency) |
| **AI Agent Framework** | Lyzr AI Agent Studio | v3 API | Specialized multi-agent reasoning, evidence grounding, action planning |
| **Ambient Capture** | Omi Webhook Integration | API v1 | Real-time memory ingestion from wearable microphones |
| **Deployment** | Railway & Vercel | Production | Containerized FastAPI + Worker on Railway; Next.js SSR on Vercel |

---

## 5. AI Multi-Agent Architecture & Trust Boundaries

DecisionTrace employs a specialized Lyzr multi-agent hierarchy governed by an explicit **Trust Boundary Contract** (`backend/AGENT_CONTRACT.md`):

1. **Commitment Extractor Agent**:
   - Parses conversational transcripts to identify explicit decisions, promises, and follow-up tasks.
   - Extracts exact speaker attribution, verbatim evidence quotes, and assigned owners without inventing dates or commitments.
2. **Conflict & Contradiction Detector Agent**:
   - Compares newly extracted statements against prior commitments retrieved semantically from Qdrant.
   - Categorizes findings as `new_commitment`, `superseding_change`, `direct_conflict`, or `informational`.
3. **Action Planner Agent**:
   - Formulates proposed database mutations or external actions based on the analysis.
   - Dictates whether an action requires human approval according to policy.
4. **Anti-Hallucination & Fabrication Guardrail**:
   - Every evidence chunk ID returned by an agent is strictly cross-referenced against authentic database and Qdrant chunk IDs.
   - If an agent cites unverified or fabricated chunk IDs, the finding is downgraded and rejected rather than silently creating ungrounded records.

---

## 6. Real Data & Event Flow

1. **Ambient Voice Ingestion**:
   - Omi wearable captures a voice conversation and sends an HTTP POST payload to `/api/v1/webhooks/omi/{token}`.
   - The token is hashed via SHA-256 and matched against active user installations.
   - A unique 3x deduplication check prevents repeated deliveries from triggering duplicate work.
2. **Transactional Outbox & Vector Indexing**:
   - The conversation is stored in PostgreSQL and a `ProcessingJob` is recorded in the transactional outbox.
   - The transcript is split into deterministic chunks (`chunk_transcript`), embedded into 384-dimensional dense vectors using `BAAI/bge-small-en-v1.5`, and indexed in Qdrant under `conversation_chunks_v1` scoped to the user ID.
3. **Historical Evidence Retrieval**:
   - Qdrant queries prior indexed chunks belonging to the same user while strictly excluding the current conversation.
4. **Lyzr Agent Reasoning**:
   - The Lyzr agent orchestrator evaluates the new transcript against historical evidence and existing active decisions.
   - If a superseding change or contradiction is detected, a `Finding` is generated.
5. **Human Approval Gating**:
   - If the finding proposes a state-altering mutation (e.g. updating an existing commitment), an `ApprovalRequest` is created in state `pending`.
   - The user inspects the proposed change alongside side-by-side evidence quotes and semantic confidence scores in the Next.js approval queue.
6. **Execution & Immutable Audit Trail**:
   - Upon operator approval (`POST /api/v1/approvals/{id}/approve`), an atomic database transaction updates the decision to Version 2 and writes an immutable record to `audit_events`.
   - Repeated approval attempts immediately return `409 Conflict`.

---

## 7. Security, Isolation & Safety Model

- **No Public Data Leaks**: Every query is strictly filtered by the authenticated user's ID (`WHERE user_id == user.id`).
- **Cryptographic Clerk Token Verification**: Production endpoints strictly verify RS256 JWT signatures against Clerk's JWKS public keys. Development bypasses (`AUTH_DEV_MODE=True`) trigger fatal startup crashes in production.
- **Savepoint-Protected Concurrency**: Concurrent initial user logins are protected by SQLAlchemy nested transactions (`SAVEPOINT`), preventing race condition `UniqueViolation` errors on database insert.
- **Worker Crash Resilience**: Outbox reconciler (`backend/app/workers/reconcile.py`) polls periodically for stuck or stranded jobs and recovers them safely with an attempt cap (`attempt_count < 3`) to prevent poison pills.
- **Redacted Secret Logging**: Webhook tokens and private API keys are hashed with SHA-256 and masked in user interfaces.

---

## 8. Installation & Local Setup

### Prerequisites
- Python 3.12+
- Node.js 20+ and Bun 1.4+
- Git

### 1. Backend Setup
```powershell
# Navigate to backend directory
cd backend

# Create virtual environment and install dependencies
python -m venv .venv
.\.venv\Scripts\pip install -e ".[dev]"

# Configure environment variables
cp .env.example .env
# Edit .env with your database and Clerk credentials

# Initialize database and verify infrastructure
.\.venv\Scripts\python scripts/verify_infrastructure.py

# Run FastAPI development server
.\.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Frontend Setup
```powershell
# Navigate to frontend directory
cd frontend

# Install dependencies using Bun
bun install

# Configure environment variables
# Copy env.example.txt to .env.local and populate Clerk keys
# Set DECISIONTRACE_BACKEND_URL=http://localhost:8000/api/v1

# Run development server
bun run dev
```

---

## 9. Environment Variables Reference

### Backend (`backend/.env`)
| Variable | Description | Example / Default |
|---|---|---|
| `APP_ENV` | Application environment (`development`, `test`, `production`) | `development` |
| `DATABASE_URL` | PostgreSQL or SQLite connection string | `sqlite:///./decisiontrace.db` |
| `REDIS_URL` | Redis instance for RQ queue | `redis://localhost:6379/0` |
| `RQ_QUEUE_NAME` | Task queue name | `decisiontrace_processing` |
| `QDRANT_URL` | Qdrant Cloud or local server URL | `http://localhost:6333` |
| `QDRANT_API_KEY` | Qdrant Cloud API key (if remote) | `your_qdrant_key` |
| `QDRANT_COLLECTION` | Vector collection name | `conversation_chunks_v1` |
| `EMBEDDING_MODEL` | FastEmbed dense model name | `BAAI/bge-small-en-v1.5` |
| `CLERK_ISSUER` | Clerk authentication domain | `https://your-domain.clerk.accounts.dev` |
| `CLERK_JWKS_URL` | Clerk JWKS public keys URL | `https://your-domain.clerk.accounts.dev/.well-known/jwks.json` |
| `CLERK_AUTHORIZED_PARTIES` | Allowed client origins | `http://localhost:3000,https://decisiontrace.vercel.app` |
| `LYZR_API_KEY` | Lyzr Studio API Key | `your_lyzr_api_key` |
| `LYZR_MANAGER_AGENT_ID` | Lyzr Manager Agent ID | `your_lyzr_agent_id` |

### Frontend (`frontend/.env.local`)
| Variable | Description | Example / Default |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable frontend key | `pk_test_...` |
| `CLERK_SECRET_KEY` | Clerk backend secret key | `sk_test_...` |
| `DECISIONTRACE_BACKEND_URL` | FastAPI backend URL with `/api/v1` path | `http://localhost:8000/api/v1` |
| `NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW` | Explicit demo preview mode flag | `false` |

---

## 10. Automated Test Suites & Verification

### Running All Backend Tests
```powershell
cd backend
.\.venv\Scripts\pytest tests -v
```
- **64 tests passed** (including unit tests, concurrency tests, and full integration walkthrough).

### Running All Frontend Tests
```powershell
cd frontend
bun test
```
- **111 tests passed** (including SSR pages, tenant isolation, fixture leakage prevention, and Lyzr agents).

### Running Linter & TypeScript Check
```powershell
cd frontend
bun run lint
bun run typecheck
```
- **0 errors** on Oxlint and strict TypeScript compilation (`tsc --noEmit`).

### Running Next.js Production Build
```powershell
cd frontend
bun run build
```
- **24/24 static and dynamic routes compiled cleanly** using Next.js 16 Turbopack.

---

## 11. Live Deployment Links

- **Frontend Application (Vercel):** [https://decisiontrace.vercel.app](https://decisiontrace.vercel.app)
- **Backend API (Railway):** [https://decisiontrace-api.up.railway.app](https://decisiontrace-api.up.railway.app)
- **Backend Health Check:** [https://decisiontrace-api.up.railway.app/health](https://decisiontrace-api.up.railway.app/health)
- **Backend Readiness Probe:** [https://decisiontrace-api.up.railway.app/ready](https://decisiontrace-api.up.railway.app/ready)
- **Interactive OpenAPI Documentation:** [https://decisiontrace-api.up.railway.app/docs](https://decisiontrace-api.up.railway.app/docs)

---

## 12. 5-Minute Demo Video Walkthrough Guide

| Timestamp | Topic | Visual Focus & Script Narrative |
|---|---|---|
| **0:00 – 0:30** | **Problem & Solution** | Explain why oral conversations and voice meetings lead to forgotten commitments and silent contradictions, and how DecisionTrace acts as an autonomous guardian. |
| **0:30 – 1:15** | **Dashboard Overview** | Walk through the live dashboard: Active Decisions, Open Commitments, Contradiction Alerts, and Pending Approvals with real-time trend charts. |
| **1:15 – 2:15** | **Real Ingestion & AI Processing** | Show an Omi conversation event being ingested via webhook or transcript analyzer, indexed into 384-dim Qdrant memory, and parsed by Lyzr agents. |
| **2:15 – 3:15** | **Memory & Agent Reasoning** | Display retrieved contextual memories from prior meetings, highlighting how the system grounds every finding in verbatim quotes and flags potential contradictions. |
| **3:15 – 4:15** | **Human Approval & Traceability** | Demonstrate the human approval engine: reviewing side-by-side evidence, approving a superseding decision update, and inspecting the resulting Version 2 audit event. |
| **4:15 – 5:00** | **Architecture & Impact** | Summarize the resilient end-to-end stack: Omi + FastAPI + Qdrant + Lyzr + Neon PostgreSQL + Next.js with complete auditability and zero hallucinations. |

---

## 13. Known Limitations & Operational Notes

1. **Remote Lyzr Fallback in Development**: When running locally without live `LYZR_API_KEY` credentials, the backend and frontend run high-fidelity deterministic contract analyzers that preserve all schema contracts and anti-hallucination guards.
2. **Local Qdrant Fallback**: In local development without a running Qdrant daemon, the memory service automatically operates an in-memory vector collection for zero-friction setup.
3. **Audio Streaming**: Omi captures ambient audio into structured memory events; raw chunk streaming requires wearable Bluetooth pairing through the Omi mobile application.
