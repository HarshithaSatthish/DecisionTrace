# DecisionTrace — Backend Integration Compatibility Matrix

**Master Frontend:** `D:\akshaydeploy\frontend` (`feature/decisiontrace-ui`)  
**Person 1 Backend:** `D:\akshaydeploy\backend-review` (`feature/harshitha-backend`)  
**Date:** 2026-10-11  
**Status:** AUDITED & COMPATIBILITY MAPPED

---

## 1. Architecture & Service Boundaries

```
[ Omi / Audio Ingestion ] ─────────► [ FastAPI: POST /api/v1/webhooks/omi/{token} ]
                                                │
                                                ▼
                                    [ FastEmbed & Qdrant Memory ]
                                                │
                                                ▼
[ Lyzr Studio v3 Agents ] ◄─────────► [ Backend LyzrAgentAdapter ]
(Extractor, Conflict, Planner, Manager)         │
                                                ▼
                                    [ Findings & Pending Approvals ] (PostgreSQL)
                                                │
                                                ▼
[ Next.js 16 UI ] ◄── Proxy Layer ──► [ FastAPI Core Endpoints ]
(Overview, Decisions, Commitments,      (/api/v1/overview, /decisions,
 Conflicts, Approvals, Activity)         /findings, /approvals, /activity)
```

**Authoritative Execution Path**:
- **Ingestion & Storage Authority**: Person 1's FastAPI backend owns database persistence (PostgreSQL/Neon), vector embeddings (Qdrant), background queue (Redis/RQ), and atomic approval mutations.
- **Agent Intelligence**: Lyzr Manager & Specialist Agents analyze transcripts with evidence grounding and propose findings.
- **Reviewer Interface**: Next.js UI queries the FastAPI backend via Next.js proxy route handlers with authenticated Clerk JWT forwarding.

---

## 2. Endpoint Compatibility & Field Mapping Matrix

| Frontend UI Need | Next.js Route Handler | Harshitha's FastAPI Endpoint | Status | Field / Payload Transformation |
|---|---|---|---|---|
| **Health Indicator** | `GET /api/decision-trace/health` | `GET /health`<br>`GET /ready` | **COMPATIBLE** | Backend returns `{"status": "healthy"}` and `{"status": "ready"}` on root URLs. Health check strips `/api/v1` prefix to probe root `/health` & `/ready`. |
| **Dashboard Metrics** | `GET /api/decision-trace/metrics` | `GET /api/v1/overview` | **ADAPTED** | Map `active_decisions` -> `activeDecisionsCount`, `active_decisions` -> `openCommitmentsCount`, `recent_findings` -> `detectedConflictsCount`, `pending_approvals` -> `pendingApprovalsCount`. Provide trend and attention items. |
| **Decisions Table** | `GET /api/decision-trace/decisions` | `GET /api/v1/decisions` | **ADAPTED** | Backend returns paginated `{ items: DecisionRead[], total, limit, offset }`. Map `items` to `Decision`: `topic` -> `title`/`category`, `current_commitment` -> `whatWasDecided`/`summary`, `owner` -> `participants`, `state` -> `status`. |
| **Commitments Kanban** | `GET /api/decision-trace/commitments` | `GET /api/v1/decisions` | **ADAPTED** | Map `items` where `state == 'active'` to `Commitment`: `topic` -> `title`, `current_commitment` -> `task`, `owner` -> `owner`, `due_date` -> `deadline`. |
| **Commitment Status Update** | `PATCH /api/decision-trace/commitments/{id}` | Internal / Local safe fallback | **GUARDED** | In backend architecture, mutations require approval. Proxy provides safe response preserving state. |
| **Conflicts View** | `GET /api/decision-trace/conflicts` | `GET /api/v1/findings` | **ADAPTED** | Backend returns `{ items: FindingRead[] }`. Filter `classification in ('possible_conflict', 'superseding_change')`. Map `previous_value` -> `previousDecision`, `new_value` -> `newerDecision`, and include chunk excerpts as `evidence`. |
| **Conflict Resolution** | `POST /api/decision-trace/conflicts/{id}/resolve` | `POST /api/v1/approvals/{id}/approve` or `reject` | **ADAPTED** | Forward to corresponding approval endpoint if linked, or record resolution. |
| **Approvals List** | `GET /api/decision-trace/approvals` | `GET /api/v1/approvals` | **ADAPTED** | Backend returns `{ items: ApprovalRequestRead[] }`. Map `action_payload` (`kind`, `topic`, `new_value`), `finding_id`, and `execution_key` to `ApprovalRequest` cards. |
| **Approval Execution** | `POST /api/decision-trace/approvals/{id}` | `POST /api/v1/approvals/{id}/approve`<br>`POST /api/v1/approvals/{id}/reject`<br>`POST /api/v1/approvals/{id}/clarify` | **ADAPTED** | Route handler inspects `{ action: 'approve' | 'reject' | 'clarify' }`. If approve, acquires `execution_key` and calls `/approve`. If reject, calls `/reject` with `{ reason }`. If clarify, calls `/clarify` with `{ clarification_request }`. |
| **Audit Activity Log** | `GET /api/decision-trace/activity` | `GET /api/v1/activity` | **ADAPTED** | Backend returns `{ items: AuditEventRead[], total }`. Map `action`, `actor_id`, `entity_type`, `entity_id`, `timestamp` to `ActivityItem[]`. |

---

## 3. Authentication & Tenant Isolation

- **Clerk JWT Verification**: Next.js server route handlers forward `Authorization: Bearer <clerk_token>`.
- In production, FastAPI verifies JWT against Clerk JWKS (`CLERK_JWKS_URL`).
- In local dev/test mode (`AUTH_DEV_MODE=True`), tokens beginning with `test_user_` or `user_` resolve deterministically.

---

## 4. Single Authoritative Agent Pipeline

To avoid duplicate record creation and double processing:
1. **Omi Webhook (`/api/v1/webhooks/omi/{token}`)** is the single entry point for live conversation transcripts.
2. The worker generates chunks, vectors, retrieves historical evidence, and queries the Lyzr agent.
3. The finding is saved to PostgreSQL and an `ApprovalRequest` is generated.
4. Human reviewers approve or reject proposals via the Next.js UI, atomically mutating the PostgreSQL `decisions` table with zero autonomous drift.
