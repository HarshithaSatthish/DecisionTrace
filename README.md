# DecisionTrace — Autonomous Decision & Commitment Guardian

> **Autonomous extraction, semantic conflict detection, and human-in-the-loop governance for spoken decisions and commitments.**

[![Tests: Passing](https://img.shields.io/badge/Tests-137%20Passing-brightgreen.svg)]()
[![Frontend: Vercel](https://img.shields.io/badge/Frontend-Vercel%20Deployed-black.svg?logo=vercel)](https://decisiontrace-orcin.vercel.app)
[![Backend: Railway](https://img.shields.io/badge/Backend-Railway%20Online-0B0D0E.svg?logo=railway)](https://decisiontrace-production.up.railway.app)
[![Auth: Clerk](https://img.shields.io/badge/Auth-Clerk%20RS256-6C47FF.svg?logo=clerk)](https://clerk.com)
[![Agents: Lyzr v3](https://img.shields.io/badge/Agents-Lyzr%20Studio%20v3-FF5A5F.svg)](https://lyzr.ai)

---

## 🌐 Live Production Deployments

| Component | Platform | Live URL / Endpoint | Status |
|---|---|---|---|
| **Production Frontend** | Vercel | [https://decisiontrace-orcin.vercel.app](https://decisiontrace-orcin.vercel.app) | 🟢 Live (Clerk Protected) |
| **Production Backend API** | Railway | [https://decisiontrace-production.up.railway.app](https://decisiontrace-production.up.railway.app) | 🟢 Live (`/health`: healthy) |
| **Interactive API Documentation** | Swagger/OpenAPI | [https://decisiontrace-production.up.railway.app/docs](https://decisiontrace-production.up.railway.app/docs) | 🟢 Live |
| **System Readiness Probe** | Railway | [https://decisiontrace-production.up.railway.app/ready](https://decisiontrace-production.up.railway.app/ready) | 🟢 Live (DB & Redis Active) |
| **Background RQ Worker** | Railway | `decisiontrace-worker` service | 🟢 Online |
| **Outbox Reconciler Cron** | Railway | `decisiontrace-reconciler` service (`*/5 * * * *`) | 🟢 Online |

---

## 🏛️ System Architecture & Trust Boundaries

DecisionTrace implements an uncompromising **Zero Autonomous Drift** governance policy. Spoken statements from meetings or chats cannot directly alter production commitments without cryptographic evidence grounding and explicit, human-gated approval.

```mermaid
flowchart TD
    subgraph AudioIngestion["🎙️ Audio & Ingestion Layer"]
        Omi["Omi Wearable / Google Meet / Slack"] -->|POST /api/v1/webhooks/omi/{token}| IngestAPI["FastAPI Ingest Route"]
        IngestAPI -->|Transactional Outbox| DBOutbox[("PostgreSQL Outbox")]
        DBOutbox -->|Redis Queue| RQWorker["Railway Background Worker"]
    end

    subgraph MemoryLayer["🧠 Semantic Memory & Grounding"]
        RQWorker -->|384-dim Dense Embeddings| FastEmbed["FastEmbed (BAAI/bge-small-en-v1.5)"]
        FastEmbed --> Qdrant[("Qdrant Vector DB (Chunk Registry)")]
        Qdrant -->|Verbatim Semantic Retrieval| ContextEngine["Context Builder"]
    end

    subgraph AgentSwarm["🤖 Lyzr Studio v3 Multi-Agent Swarm"]
        ContextEngine -->|Agent 1: Extraction| Extractor["Commitment Extractor (6acb7caf5d24e9bcb2e77ea2)"]
        Extractor -->|Agent 2: Conflict Guard| ConflictDetector["Conflict Detector (6acb7cafdb47553ffdca0e2a)"]
        ConflictDetector -->|Agent 3: Remediation| ActionPlanner["Action Planner (6acb7cb051a6bd98c7746480)"]
        ActionPlanner -->|Agent 4: Synthesis| ManagerAgent["Manager Agent (6acb7cb0a3c9b6b38725c681)"]
    end

    subgraph Governance["🛡️ Human Approval Trust Boundary"]
        ManagerAgent -->|Proposed Mutation + Execution Key| ApprovalQueue[("Pending Approvals Queue")]
        ApprovalQueue -->|Real-Time Dashboard Stream| WebUI["Next.js 16 Guardian UI"]
        Reviewer(["Lead Engineer / Approver"]) -->|Clerk RS256 Auth + Approve Action| WebUI
        WebUI -->|POST /approvals/{id}/approve| CoreEngine["FastAPI Approval Service"]
        CoreEngine -->|Row Lock FOR UPDATE + Savepoint| DBCommitment[("PostgreSQL Canonical Decisions v1 → v2")]
        CoreEngine -->|Immutable Audit Log| AuditTrail[("Immutable Audit Trail")]
    end
```

---

## ⚡ Core Innovations & Safety Guarantees

1. **Zero Autonomous Mutation**: AI agents propose remediations, but *never* execute them directly. All state-changing operations require a single-use `execution_key` verified by human sign-off.
2. **Double-Approval & Concurrency Guards**: Atomic SQLModel row-level `SELECT ... FOR UPDATE` locking and transaction savepoints prevent double-execution, returning HTTP 409 Conflict if collision occurs.
3. **Verbatim Evidence Grounding**: The system rejects hallucinated or ungrounded claims. Every decision and commitment links to verbatim speaker quotes and timestamped audio excerpts.
4. **Cryptographic Authentication**: Zero mock-tokens in production. Clerk RS256 JWT tokens are verified against dynamic JWKS endpoints (`https://deciding-dogfish-8046.clerk.accounts.dev/.well-known/jwks.json`) with strict issuer and audience validation.
5. **Worker Crash & Outbox Recovery**: Stalled or interrupted jobs are automatically re-enqueued by the reconciler cron service (`attempt_count < 3` poison pill guard).

---

## 🧪 Comprehensive Verification & Test Results

| Test Suite | Environment | Tests Passed | Status | Coverage / Verification Details |
|---|---|---|---|---|
| **Backend Unit & E2E Pytest** | Python 3.14 + FastAPI | **61 Passed** (2 live-only skipped) | 🟢 100% Pass Rate | Full walkthrough, outbox recovery, Clerk JWKS, Lyzr adapter, API isolation |
| **Frontend Bun Test Suite** | Bun + React 19 + Next.js 16 | **64 Passed** (0 failed) | 🟢 100% Pass Rate | Fixture leakage prevention, Lyzr client, multi-tenant cache isolation |
| **Integration Test Harness** | FastAPI + JSONSchema | **12 Passed** (0 failed) | 🟢 100% Pass Rate | Proposed contract validation, fault injection, read/write routes |
| **Live Lyzr Studio v3 AI Suite** | Real Lyzr Studio v3 Cloud | **6 / 6 Passed** | 🟢 Verified | Extraction (18.4s), Contradiction (22.8s), Approval Gating (0ms), Cache Hit (0ms) |
| **Production Build Compilation** | Next.js Turbopack | **31 Routes Compiled** | 🟢 Zero Errors | Standalone output, TypeScript strict mode zero warnings |
| **TOTAL VERIFIED SUITE** | Fullstack | **137 Tests Passed** | 🟢 Ready | Complete regression and integration verification |

---

## 🎬 Canonical Hackathon Demo Scenario

### Phase 1: Initial Architecture Consensus
- **Input Transcript**: Meeting audio establishes commitment: *"We decided to standardize on PostgreSQL for primary storage. Sarah will deliver migration scripts by May 15."*
- **Guardian Extraction**: Lyzr Agent 1 extracts decision `dec-postgres-standardization` and commitment `com-sarah-migration` with 95% confidence and verbatim quotation.
- **Human Approval**: Team lead approves via `/dashboard/approvals`. Decision Version 1 enters the authoritative PostgreSQL registry.

### Phase 2: Contradictory Ad-Hoc Decision
- **Input Transcript**: Follow-up audio: *"In light of mobile release, we decided to migrate all microservices to MongoDB instead of PostgreSQL."*
- **Conflict Detection**: Lyzr Agent 2 performs semantic retrieval against the decision registry, flags direct policy contradiction, and surfaces dual comparative evidence quotes.
- **Action Planner Formulation**: Lyzr Agent 3 proposes an `override_conflict` remediation with high urgency, requiring human consensus.

### Phase 3: Human-Gated Approval Execution
- **Pending Review**: The high-impact approval card appears on the Guardian dashboard with full action preview.
- **Execution**: The authorized admin clicks **"Approve & Execute"**. The backend locks the record, generates an immutable audit event (`approval_granted`), and atomically bumps the decision to Version 2 in PostgreSQL.

---

## 🛠️ Technology Stack

- **Frontend**: Next.js 16.4 (App Router, Turbopack), React 19, Tailwind CSS v4, shadcn/ui, TanStack Table, Recharts.
- **Authentication**: Clerk (JWKS RS256 token verification, Organizations, User Management).
- **Backend API**: FastAPI 0.115, SQLModel 0.0.22, SQLAlchemy 2.0, Pydantic v2.
- **Background Worker**: Python RQ, Redis TCP Queue, Transactional Outbox Pattern.
- **AI & Multi-Agent**: Lyzr Studio v3 Inference API, OpenAI GPT-4o-mini foundation models.
- **Vector Memory**: FastEmbed (`BAAI/bge-small-en-v1.5`, 384 dimensions), Qdrant Client.
- **Hosting**: Vercel (Frontend Serverless), Railway (API, Worker, PostgreSQL, Redis, Reconciler).

---

## 👥 Contributor Roles

- **Harshitha Satthish (Person 1)**: Backend API, PostgreSQL database models, Alembic migrations, Omi webhook ingest, RQ background workers, Qdrant vector memory, transactional outbox reconciler, and Railway deployment.
- **Akshay Kammar (Person 2)**: Next.js 16 frontend, Clerk authentication integration, Lyzr Studio v3 multi-agent system (Extractor, Conflict, Planner, Manager), test suites, and Vercel deployment.
