# DecisionTrace — Hackathon Demonstration Scenario & Execution Guide

This document specifies the canonical, end-to-end demo scenario for **DecisionTrace — Autonomous Decision & Commitment Guardian**. It traces the complete lifecycle:
**Meeting Transcript → Decision → Commitment → Changed Decision → Contradiction Detection → Suggested Action → Explicit Human Approval Boundary**.

---

## 1. What Is Genuinely Live vs. Architecture Boundaries

| Subsystem | Execution Mode | Details |
| :--- | :--- | :--- |
| **Commitment Extractor** | **LIVE Lyzr Studio Agent** | Agent ID `6acb7caf5d24e9bcb2e77ea2` runs on Lyzr v3 via `gpt-4o-mini` with verbatim quote extraction. |
| **Conflict Detector** | **LIVE Lyzr Studio Agent** | Agent ID `6acb7cafdb47553ffdca0e2a` compares candidate decisions against prior stored registry items. |
| **Action Planner** | **LIVE Lyzr Studio Agent** | Agent ID `6acb7cb051a6bd98c7746480` formulates remediations and enforces human consensus gating. |
| **Manager Agent** | **LIVE Lyzr Studio Agent** | Agent ID `6acb7cb0a3c9b6b38725c681` synthesizes executive summaries and deduplicates entities. |
| **Authenticated API Bridge** | **LIVE Next.js Route** | `/api/decision-trace/analyze` enforces Clerk authentication and dispatches to the live agent pipeline. |
| **Storage & Persistence** | **Person 1 Backend Contract** | Backend handles PostgreSQL, Qdrant vector memory, Redis, and approval execution adapters. |

---

## 2. Phase 1: Initial Architecture Meeting

### Input Transcript
- **Source**: `Architecture Strategy Board Meeting — Q2`
- **Channel**: `Google Meet (Omi Ingestion)`
- **Timestamp**: `2026-05-02T10:00:00Z`

```text
David (VP of Engineering): After evaluating our query latency spikes and multi-region failover, we decided to standardize on PostgreSQL for primary relational storage across all payment and account services.
Sarah (Principal Data Architect): I agree with standardizing on Postgres. I will deliver the initial database migration schema and replication scripts by 2026-05-15.
Alex (Infrastructure Lead): I will provision the RDS Aurora multi-AZ cluster in us-east-1 by 2026-05-18.
```

### Extracted Decision (Grounded in Transcript)
- **ID**: `dec-postgres-standardization`
- **Title**: `Standardize on PostgreSQL for Primary Relational Storage`
- **What Was Decided**: `To standardize on PostgreSQL for primary relational storage across all payment and account services.`
- **Category**: `Architecture`
- **Impact Level**: `high`
- **Confidence**: `95%`
- **Verbatim Evidence Quote**: `"we decided to standardize on PostgreSQL for primary relational storage across all payment and account services."`
- **Speaker**: `David (VP of Engineering)`

### Extracted Commitments
1. **Commitment 1**:
   - **Task**: `Deliver database migration schema and replication scripts`
   - **Owner**: `Sarah (Principal Data Architect)`
   - **Deadline**: `2026-05-15`
   - **Priority**: `high`
   - **Verbatim Evidence**: `"I will deliver the initial database migration schema and replication scripts by 2026-05-15."`
2. **Commitment 2**:
   - **Task**: `Provision RDS Aurora multi-AZ cluster in us-east-1`
   - **Owner**: `Alex (Infrastructure Lead)`
   - **Deadline**: `2026-05-18`
   - **Priority**: `high`
   - **Verbatim Evidence**: `"I will provision the RDS Aurora multi-AZ cluster in us-east-1 by 2026-05-18."`

---

## 3. Phase 2: Contradictory Follow-Up Meeting

### Input Transcript
- **Source**: `Product & Infrastructure Ad-Hoc Sync`
- **Channel**: `Slack #architecture`
- **Timestamp**: `2026-05-04T15:30:00Z`

```text
Marcus (VP of Product): In light of our upcoming mobile release and unstructured catalog data, we decided to migrate all microservices to MongoDB instead of PostgreSQL.
```

### Detected Semantic Conflict
- **Conflict Title**: `Contradiction in Primary Database Standard`
- **Severity**: `critical`
- **Confidence**: `95%`
- **isDefiniteConflict**: `true`
- **Explanation**: `The newer decision to migrate all microservices to MongoDB directly contradicts the established decision to standardize on PostgreSQL across all services.`
- **Dual Evidence Quotes**:
  - **Prior Decision Quote**: `"we decided to standardize on PostgreSQL for primary relational storage across all payment and account services."` (David, Q2 Architecture Review)
  - **Newer Decision Quote**: `"we decided to migrate all microservices to MongoDB instead of PostgreSQL."` (Marcus, Slack #architecture)

---

## 4. Phase 3: Action Planning & Human Approval Boundary

### Action Planner Remediation
- **Suggested Action**: `Override Conflict: Resolve Database Standardization Strategy`
- **Urgency**: `high`
- **Suggested Assignee**: `David (VP of Engineering)`
- **Requires Approval**: **`true`**
- **Action Type**: `override_conflict`

### Exact Action Preview (Gated Behind Human Approval)
```text
Schedule an urgent architecture consensus review between David and Marcus.
Mutate registry state to either confirm MongoDB as an authorized exception or supersede the MongoDB proposal to preserve the PostgreSQL standard.
```

### The Human Approval Boundary (Safety Guarantee)
1. **Zero Autonomous Mutation**: Neither the Commitment Extractor, Conflict Detector, nor Action Planner modifies production registry records or downstream pipelines automatically.
2. **Approval Card Display**: The Guardian dashboard displays a high-visibility Approval Request in the `/dashboard/approvals` queue with risk categorization (`critical`).
3. **Execution Gating**: An authorized administrator must click **"Approve & Execute"** or **"Reject"**, sending an authenticated `POST /api/decision-trace/approvals/[id]` payload with their Clerk credentials.

---

## 5. How to Reproduce This Demo Locally

Run the automated live smoke test with real inference:

```bash
bun scripts/ai-smoke-test.ts
```

This script will run through all 6 phases:
1. Extracting the PostgreSQL decision and Sarah's/Alex's commitments.
2. Detecting the MongoDB conflict against the live decision registry.
3. Generating the gated approval item with exact action preview.
4. Testing an ambiguous conversation to verify zero hallucinated commitments.
5. Testing empty input to verify immediate exit in 1ms.
6. Testing repeat input to verify in-memory cache hit in 0ms.
