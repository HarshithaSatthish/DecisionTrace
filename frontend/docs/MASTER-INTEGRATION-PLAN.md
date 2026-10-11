# DecisionTrace — Master Integration & Merge Plan

**Project:** DecisionTrace — Autonomous Decision & Commitment Guardian  
**Repository / Workspace:** `D:\akshaydeploy\frontend`  
**Master Implementation:** Antigravity Frontend + Live Lyzr Multi-Agent System  
**Branch:** `feature/decisiontrace-ui`  
**Date:** 2026-10-11  

---

## 1. Master System Architecture

DecisionTrace consolidates multiple specialized engineering streams into a single, cohesive, production-grade AI platform. The **Antigravity frontend and Lyzr Multi-Agent pipeline** form the authoritative **MASTER** core.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 LOVABLE PRESENTATION                                   │
│  Marketing & Showcase Website (decisiontrace.ai) ──► Deep Links (/auth/sign-in, etc.)   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              DECISIONTRACE MASTER APP                                  │
│                               (D:\akshaydeploy\frontend)                               │
│                                                                                        │
│   ┌───────────────────────────┐                     ┌──────────────────────────────┐   │
│   │   MINIMAX SAFE POLISH     │                     │     CLERK AUTHENTICATION     │   │
│   │  Responsive layouts & CSS │                     │  Multi-tenant, orgs, RBAC    │   │
│   └─────────────┬─────────────┘                     └──────────────┬───────────────┘   │
│                 │                                                  │                   │
│                 ▼                                                  ▼                   │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                 6 OPERATIONAL SCREENS (App Router & Tailwind v4)               │   │
│   │  Overview • Decisions • Commitments • Conflicts • Approvals • Activity Audit   │   │
│   └───────────────────────────────────────┬────────────────────────────────────────┘   │
│                                           │                                            │
│                 ┌─────────────────────────┴─────────────────────────┐                  │
│                 ▼                                                   ▼                  │
│   ┌───────────────────────────────┐               ┌────────────────────────────────┐   │
│   │  LYZR MULTI-AGENT INTELLIGENCE│               │  SERVER API PROXY ROUTE LAYER  │   │
│   │  • Commitment Extractor       │               │  src/app/api/decision-trace/*  │   │
│   │  • Conflict Detector          │               │  • Clerk JWT Header Injection  │   │
│   │  • Action Planner             │               │  • 50k Request Size Limit      │   │
│   │  • Manager Agent              │               │  • Timeout & Circuit Breaker   │   │
│   │  • Multi-Tenant Isolation     │               │  • Truthful Fallback Mode      │   │
│   └───────────────────────────────┘               └────────────────┬───────────────┘   │
└────────────────────────────────────────────────────────────────────┼───────────────────┘
                                                                     │
                         ┌───────────────────────────────────────────┴─────────────────┐
                         │                                                             │
                         ▼                                                             ▼
┌─────────────────────────────────────────────────┐   ┌──────────────────────────────────────────────────┐
│          REPLIT INTEGRATION SIMULATOR           │   │            PERSON 1 PRODUCTION BACKEND           │
│   (Isolated in integrations/replit-simulator)   │   │          FastAPI • PostgreSQL • Qdrant           │
│   • Mock edge-case testing & regression         │   │   • Omi audio transcript ingestion               │
│   • NEVER exposed as production backend         │   │   • Top-5 vector search for conflict detection   │
└─────────────────────────────────────────────────┘   └──────────────────────────────────────────────────┘
```

---

## 2. Component Ownership & Boundary Matrix

| Component Stream | Owner | Responsibility | Protected Boundaries (Do NOT Change) |
|---|---|---|---|
| **Master Dashboard & Agents** | **Antigravity** | Core App Router layouts, Lyzr 4-agent orchestration, Clerk auth verification, proxy routing, state machines. | Canonical baseline. All merges must pass through Master CI gates. |
| **Frontend QA & Polish** | **MiniMax** | Accessibility (ARIA), responsive layout margins, chart tooltips, CSS styling, typography polish. | Strictly limited to presentation components. Must NOT alter auth, API routes, or types. |
| **Integration Simulator** | **Replit** | E2E test harness, contract simulation, failure mode testing. | Must remain strictly in `integrations/replit-simulator/`. NEVER mounted as production backend. |
| **Marketing Website** | **Lovable** | Standalone landing page, product narrative, interactive feature showcases. | Standalone deployment; links to Master via `/auth/sign-in`, `/auth/sign-up`, and `/dashboard/*`. |
| **Production Backend** | **Person 1** | FastAPI service, PostgreSQL database, Qdrant vector collection, Omi hardware transcription pipeline. | Must conform to `docs/backend-integration-contract.md` and pass `scripts/verify-backend-compatibility.ts`. |

---

## 3. Integration Directory Structure

```
D:\akshaydeploy\frontend/
├── integrations/
│   ├── minimax-qa/
│   │   └── README.md              # Rules of engagement & permitted file whitelist
│   ├── replit-simulator/
│   │   └── README.md              # Isolated testing sandbox instructions
│   ├── lovable-website/
│   │   └── README.md              # Deep linking, domain topology, and UTM guide
│   └── person-1-backend/
│       └── README.md              # Pre-flight checklist & FastAPI specifications
│
├── docs/
│   ├── MASTER-INTEGRATION-PLAN.md # This document
│   ├── VERIFICATION-REPORT.md     # Phase 5 verification baseline
│   ├── ENV-VARIABLES-GUIDE.md     # Sanitized environment variable reference
│   ├── backend-integration-contract.md
│   ├── person-1-integration-handoff.md
│   ├── lyzr-studio-agent-specs.md
│   └── demo-scenario.md
│
└── scripts/
    ├── ai-smoke-test.ts                  # Live Lyzr multi-agent smoke test
    └── verify-backend-compatibility.ts   # Automated Person 1 FastAPI pre-flight probe
```

---

## 4. Master Merge Checklist & Ingestion Procedure

When external code files are provided for review and integration, follow this strict 6-step merge workflow:

### Step 1: Pre-Merge Safety Isolation
- Verify that the target working tree is clean: `git status`.
- Do NOT overwrite existing working files without creating an isolated branch:
  ```bash
  git checkout -b integrate/<stream-name>
  ```

### Step 2: Secret & Credentials Audit
- Inspect incoming files to verify that **NO API KEYS, TOKENS, OR CREDENTIALS** are included.
- Verify that `.env*` files remain ignored and are not committed.

### Step 3: Scope & Boundary Verification
- If receiving **MiniMax** changes: Check that only files in `integrations/minimax-qa/README.md` are touched. Reject any modifications to `src/lib/decision-trace-auth.ts`, `src/app/api/*`, or `src/server/lyzr/*`.
- If receiving **Replit** changes: Ensure all simulator scripts are placed strictly within `integrations/replit-simulator/`.
- If receiving **Person 1** updates: Run `bun run scripts/verify-backend-compatibility.ts` against their running endpoint.

### Step 4: Automated CI Quality Gates (Zero Tolerance)
Run all quality gates in sequence:
1. **Unit & Regression Tests**:
   ```bash
   bun test
   # Requirement: 49/49 tests pass
   ```
2. **TypeScript Strict Typecheck**:
   ```bash
   bun run typecheck
   # Requirement: 0 errors
   ```
3. **Linter & Code Standards**:
   ```bash
   bun run lint
   # Requirement: 0 errors
   ```
4. **Production Build**:
   ```bash
   bun run build
   # Requirement: Clean compilation of all 31 routes
   ```
5. **Dependency Audit**:
   ```bash
   npm audit --omit=dev
   # Requirement: 0 high/critical vulnerabilities
   ```

### Step 5: Master Integration Commit
- Merge verified feature branch into `feature/decisiontrace-ui`:
  ```bash
  git commit -m "feat(integrate): merge verified <stream-name> improvements"
  ```
- Do not push or deploy without explicit operator authorization.

---

## 5. Master Baseline Status

The Master workspace has been verified and establishes the following baseline:

- **Automated Tests**: 49 passed, 0 failed (311 assertions across 5 suites).
- **TypeScript**: `tsc --noEmit` exited with code 0 (strict mode enabled).
- **Linting**: 0 errors across 335 files.
- **Production Build**: Next.js 16.4.0 (Turbopack) successfully compiled all routes in 17.5s.
- **AI Security**: Multi-tenant partitioned cache, prompt injection boundaries, verbatim quotation grounding, mandatory human approval gating, 50k character payload limits.
- **Backend Status**: Running with truthful fallback preview mode; ready for live switch upon Person 1 backend deployment.
