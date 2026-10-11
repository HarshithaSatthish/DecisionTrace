# DecisionTrace — API Contract

**Version:** `1.0.0`  
**Base URL:** `http://localhost:8000` (Local) / Configured Railway Backend Domain (Production)  
**Authentication Scheme:** `Bearer <clerk_jwt>` (Clerk Session JWT) on all `/api/v1/*` endpoints except the webhook ingestion endpoint.  
**Webhook Authentication:** `POST /api/v1/webhooks/omi/{opaque_token}` where `{opaque_token}` is the high-entropy token generated upon Omi integration creation.

---

## 1. System Health & Readiness

### `GET /health`
- **Purpose**: Liveness probe (Kubernetes / Railway process alive check).
- **Auth**: None
- **Response `200 OK`**:
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2026-10-11T12:00:00Z"
}
```

### `GET /ready`
- **Purpose**: Dependency readiness check (Database, Redis, Qdrant). Does not expose secrets.
- **Auth**: None
- **Response `200 OK`**:
```json
{
  "status": "ready",
  "dependencies": {
    "database": "connected",
    "redis": "connected",
    "qdrant": "connected"
  },
  "timestamp": "2026-10-11T12:00:00Z"
}
```
- **Response `503 Service Unavailable`** if any critical dependency is offline.

---

## 2. Omi Webhook Ingestion

### `POST /api/v1/webhooks/omi/{opaque_token}`
- **Purpose**: Receive completed voice conversation/memory events from Omi devices/apps.
- **Auth**: `{opaque_token}` path parameter (hashed and compared against active `omi_integrations.webhook_token_hash`).
- **Headers**: `Content-Type: application/json`
- **Request Body (Omi Memory Created)**:
```json
{
  "id": "omi-mem-12345-uuid",
  "created_at": "2026-10-11T11:45:00Z",
  "started_at": "2026-10-11T11:40:00Z",
  "finished_at": "2026-10-11T11:45:00Z",
  "transcript_segments": [
    {
      "text": "The prototype review moved to Thursday 2 PM.",
      "speaker": "SPEAKER_00",
      "is_user": true,
      "start": 0.0,
      "end": 3.5
    }
  ],
  "structured": {
    "title": "Weekly Planning Discussion",
    "overview": "Discussion regarding rescheduling prototype review",
    "category": "work"
  },
  "discarded": false
}
```
- **Response `202 Accepted`** (New event queued):
```json
{
  "status": "queued",
  "conversation_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "job_id": "7ca12f88-4412-4211-a83d-3a789a42be41",
  "message": "Memory queued for processing"
}
```
- **Response `200 OK`** (Duplicate event deduplicated):
```json
{
  "status": "duplicate",
  "conversation_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "message": "Event already recorded, no duplicate work queued"
}
```
- **Response `401 Unauthorized`**: Invalid, inactive, or revoked token.
- **Response `400 Bad Request`**: Malformed JSON or discarded/empty content.

---

## 3. Integrations Management

### `GET /api/v1/integrations/omi/status`
- **Purpose**: Get current user's Omi connection status.
- **Auth**: `Bearer <clerk_jwt>`
- **Response `200 OK`**:
```json
{
  "connected": true,
  "installation_id": "inst_987654",
  "external_omi_uid": "omi_usr_4321",
  "created_at": "2026-10-11T10:00:00Z",
  "webhook_url": "https://api.yourdomain.com/api/v1/webhooks/omi/REDACTED"
}
```

### `POST /api/v1/integrations/omi`
- **Purpose**: Link or provision a new Omi integration for the authenticated user. Generates one-time high-entropy webhook token.
- **Auth**: `Bearer <clerk_jwt>`
- **Request Body**:
```json
{
  "external_omi_uid": "omi_usr_4321"
}
```
- **Response `201 Created`**:
```json
{
  "installation_id": "inst_987654",
  "webhook_token": "omi_sec_89df7a6b29e01f...",
  "webhook_url": "https://api.yourdomain.com/api/v1/webhooks/omi/omi_sec_89df7a6b29e01f...",
  "message": "Store this webhook URL in the Omi App developer integrations panel. The raw token is shown only once."
}
```

---

## 4. Dashboard Overview & Activity

### `GET /api/v1/overview`
- **Purpose**: Dashboard summary statistics for Akshay's Next.js UI.
- **Auth**: `Bearer <clerk_jwt>`
- **Response `200 OK`**:
```json
{
  "total_conversations": 42,
  "active_decisions": 15,
  "pending_approvals": 2,
  "recent_findings": 5,
  "system_status": "healthy"
}
```

### `GET /api/v1/activity`
- **Purpose**: Paginated audit activity stream for user actions and agent findings.
- **Auth**: `Bearer <clerk_jwt>`
- **Query Params**: `limit=20&offset=0`
- **Response `200 OK`**:
```json
{
  "items": [
    {
      "id": "aud_123",
      "action": "decision_updated",
      "actor_type": "user",
      "actor_id": "user_2aBcDeFgHi",
      "entity_type": "decision",
      "entity_id": "dec_456",
      "before_state": {"value": "Friday at 10 AM"},
      "after_state": {"value": "Thursday at 2 PM"},
      "timestamp": "2026-10-11T12:05:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

---

## 5. Conversations & Chunks

### `GET /api/v1/conversations`
- **Purpose**: List ingested conversations for the authenticated user.
- **Auth**: `Bearer <clerk_jwt>`
- **Query Params**: `limit=20&offset=0`
- **Response `200 OK`**:
```json
{
  "items": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "source_event_id": "omi-mem-12345-uuid",
      "title": "Weekly Planning Discussion",
      "transcript_preview": "The prototype review moved to Thursday 2 PM...",
      "source_time": "2026-10-11T11:45:00Z",
      "created_at": "2026-10-11T11:45:02Z",
      "status": "processed"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### `GET /api/v1/conversations/{id}`
- **Purpose**: Full conversation detail with raw segments and chunk vector points.
- **Auth**: `Bearer <clerk_jwt>`
- **Response `200 OK`**:
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "source_event_id": "omi-mem-12345-uuid",
  "title": "Weekly Planning Discussion",
  "overview": "Discussion regarding rescheduling prototype review",
  "raw_segments": [
    {
      "text": "The prototype review moved to Thursday 2 PM.",
      "speaker": "SPEAKER_00",
      "is_user": true,
      "start": 0.0,
      "end": 3.5
    }
  ],
  "chunks": [
    {
      "id": "chk_abc123",
      "excerpt": "The prototype review moved to Thursday 2 PM.",
      "vector_point_id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
      "source_time": "2026-10-11T11:45:00Z"
    }
  ],
  "status": "processed",
  "created_at": "2026-10-11T11:45:02Z"
}
```

---

## 6. Decisions & Commitments

### `GET /api/v1/decisions`
- **Purpose**: List active and past commitments / decisions.
- **Auth**: `Bearer <clerk_jwt>`
- **Query Params**: `status=active&limit=20&offset=0`
- **Response `200 OK`**:
```json
{
  "items": [
    {
      "id": "dec_456",
      "topic": "prototype_review",
      "current_commitment": "Thursday at 2 PM",
      "owner": "Harshitha",
      "due_date": "2026-10-15T14:00:00Z",
      "state": "active",
      "version": 2,
      "updated_at": "2026-10-11T12:05:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### `GET /api/v1/decisions/{id}`
- **Purpose**: Get decision details including provenance links to conversation chunks.
- **Auth**: `Bearer <clerk_jwt>`

---

## 7. Findings & AI Agent Detections

### `GET /api/v1/findings`
- **Purpose**: List detected commitment findings (new commitments, conflicts, superseding changes).
- **Auth**: `Bearer <clerk_jwt>`
- **Query Params**: `status=pending&limit=20&offset=0`
- **Response `200 OK`**:
```json
{
  "items": [
    {
      "id": "fnd_789",
      "conversation_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "classification": "superseding_change",
      "topic_key": "prototype_review",
      "previous_value": "Friday at 10 AM",
      "new_value": "Thursday at 2 PM",
      "explanation": "The later conversation explicitly changes the review time.",
      "confidence": "high",
      "status": "pending_approval",
      "evidence": [
        {
          "chunk_id": "chk_older_999",
          "excerpt": "The prototype review is Friday at 10 AM",
          "conversation_id": "conv_old_001",
          "source_time": "2026-10-11T09:00:00Z"
        },
        {
          "chunk_id": "chk_abc123",
          "excerpt": "The prototype review moved to Thursday 2 PM.",
          "conversation_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          "source_time": "2026-10-11T11:45:00Z"
        }
      ],
      "created_at": "2026-10-11T11:45:10Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

---

## 8. Human Approvals (Zero Autonomous Drift)

### `GET /api/v1/approvals`
- **Purpose**: List pending, approved, or rejected approval requests.
- **Auth**: `Bearer <clerk_jwt>`
- **Query Params**: `status=pending&limit=20&offset=0`
- **Response `200 OK`**:
```json
{
  "items": [
    {
      "id": "appr_101",
      "finding_id": "fnd_789",
      "status": "pending",
      "action_payload": {
        "kind": "request_decision_update",
        "topic": "prototype_review",
        "new_value": "Thursday at 2 PM"
      },
      "execution_key": "exec_key_a8d79f01e2",
      "created_at": "2026-10-11T11:45:10Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### `GET /api/v1/approvals/{id}`
- **Purpose**: Get detail of a specific approval request.
- **Auth**: `Bearer <clerk_jwt>`
- **Response `200 OK`**:
```json
{
  "id": "appr_101",
  "finding_id": "fnd_789",
  "status": "pending",
  "action_payload": {
    "kind": "request_decision_update",
    "topic": "prototype_review",
    "new_value": "Thursday at 2 PM"
  },
  "requester": "agent",
  "execution_key": "exec_key_a8d79f01e2",
  "created_at": "2026-10-11T11:45:10Z"
}
```
- **Response `404 Not Found`**: Request not found or belongs to another user.

### `POST /api/v1/approvals/{id}/approve`
- **Purpose**: Human approves the finding. Executes the atomic DB mutation (creates/updates decision, creates task if requested, records audit log).
- **Auth**: `Bearer <clerk_jwt>`
- **Request Body**:
```json
{
  "execution_key": "exec_key_a8d79f01e2",
  "note": "Confirmed by team lead."
}
```
- **Response `200 OK`**:
```json
{
  "id": "appr_101",
  "status": "approved",
  "executed_at": "2026-10-11T12:05:00Z",
  "resulting_decision": {
    "id": "dec_456",
    "topic": "prototype_review",
    "current_commitment": "Thursday at 2 PM",
    "version": 2,
    "state": "active"
  }
}
```
- **Response `409 Conflict`**: If already executed or execution key mismatch or concurrent modification.

### `POST /api/v1/approvals/{id}/reject`
- **Purpose**: Human rejects the change. Decision remains untouched; audit log records rejection.
- **Auth**: `Bearer <clerk_jwt>`
- **Request Body**:
```json
{
  "reason": "Not an authoritative decision."
}
```

### `POST /api/v1/approvals/{id}/clarify`
- **Purpose**: Human flags that further conversation is required.
- **Auth**: `Bearer <clerk_jwt>`
- **Request Body**:
```json
{
  "clarification_request": "Need to check if Akshay is also available."
}
```

---

## 9. Background Job Status

### `GET /api/v1/jobs/{id}`
- **Purpose**: Track ingestion & worker processing pipeline status.
- **Auth**: `Bearer <clerk_jwt>`
- **Response `200 OK`**:
```json
{
  "id": "7ca12f88-4412-4211-a83d-3a789a42be41",
  "conversation_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "state": "awaiting_approval",
  "attempt_count": 1,
  "milestones": [
    {"state": "received", "timestamp": "2026-10-11T11:45:00Z"},
    {"state": "saved", "timestamp": "2026-10-11T11:45:01Z"},
    {"state": "queued", "timestamp": "2026-10-11T11:45:02Z"},
    {"state": "embedded", "timestamp": "2026-10-11T11:45:04Z"},
    {"state": "retrieved", "timestamp": "2026-10-11T11:45:05Z"},
    {"state": "agent_processing", "timestamp": "2026-10-11T11:45:06Z"},
    {"state": "proposed", "timestamp": "2026-10-11T11:45:09Z"},
    {"state": "awaiting_approval", "timestamp": "2026-10-11T11:45:10Z"}
  ]
}
```
