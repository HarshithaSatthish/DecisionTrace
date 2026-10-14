"""Approval service: transactional mutations, optimistic concurrency, and audit logging."""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.db.models import (
    ApprovalRequest,
    Decision,
    DecisionEvidence,
    Finding,
    Task,
    utc_now,
)
from app.db.repository import record_audit_event
from app.schemas.approval import ApprovalExecutionResponse
from app.schemas.decision import DecisionRead

logger = logging.getLogger(__name__)

SUPPORTED_ACTION_KINDS = {"create_decision", "request_decision_update", "create_task"}



def _parse_due_date(value: object) -> datetime | None:
    """Parse a stored proposal due_date; naive values (older proposals) are treated as UTC.

    Live PR #16 E2E: Lyzr's bare '2026-10-14' was stored naive and approving it raised
    'Datetime values must have timezone information' (HTTP 500).
    """
    if not value:
        return None
    try:
        parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


class ApprovalService:
    @staticmethod
    def approve(
        session: Session,
        user_id: uuid.UUID,
        approval_id: uuid.UUID,
        execution_key: str,
        note: str | None = None,
        approver_clerk_id: str = "reviewer",
    ) -> ApprovalExecutionResponse:
        """Atomically approve finding and execute requested mutation with row-level locking."""
        # Row-level lock (FOR UPDATE in PostgreSQL) prevents concurrent executions
        statement = (
            select(ApprovalRequest)
            .where(
                ApprovalRequest.id == approval_id,
                ApprovalRequest.user_id == user_id,
            )
            .with_for_update()
        )
        approval_req = session.exec(statement).first()

        if not approval_req:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Approval request not found",
            )

        if approval_req.status != "pending":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Approval request already resolved with status '{approval_req.status}'",
            )

        if approval_req.execution_key != execution_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or mismatched execution key",
            )

        finding = session.get(Finding, approval_req.finding_id)
        if not finding:
            raise HTTPException(status_code=404, detail="Finding not found")
        if finding.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Finding belongs to another user. Cross-tenant mutation forbidden.",
            )

        action_payload = approval_req.action_payload or {}
        kind = action_payload.get("kind")
        if kind not in SUPPORTED_ACTION_KINDS:
            kinds_str = ", ".join(sorted(SUPPORTED_ACTION_KINDS))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported or missing action kind '{kind}'. Supported kinds: {kinds_str}",
            )

        resulting_decision: Decision | None = None
        now = utc_now()

        before_state = None
        after_state = None

        if kind == "create_decision":
            topic = action_payload.get("topic") or finding.topic_key or "general_commitment"
            commitment_val = action_payload.get("new_value") or finding.new_value or ""
            resulting_decision = Decision(
                user_id=user_id,
                topic=topic,
                current_commitment=commitment_val,
                owner=action_payload.get("owner"),
                due_date=_parse_due_date(action_payload.get("due_date")),
                state="active",
                version=1,
                source_provenance={
                    "finding_id": str(finding.id),
                    "conversation_id": str(finding.conversation_id),
                },
                created_at=now,
                updated_at=now,
            )
            session.add(resulting_decision)
            session.flush()

            # Link evidence
            if resulting_decision.owner or resulting_decision.due_date:
                session.add(
                    Task(
                        user_id=user_id,
                        decision_id=resulting_decision.id,
                        title=topic,
                        description=commitment_val,
                        owner=resulting_decision.owner,
                        due_date=resulting_decision.due_date,
                    )
                )
            for ev in finding.evidence_links:
                session.add(
                    DecisionEvidence(
                        decision_id=resulting_decision.id,
                        finding_id=finding.id,
                        chunk_id=ev.chunk_id,
                        created_at=now,
                    )
                )

            after_state = {
                "decision_id": str(resulting_decision.id),
                "topic": topic,
                "current_commitment": commitment_val,
            }

        elif kind == "request_decision_update":
            target_decision_id_raw = action_payload.get("target_decision_id")
            target_dec: Decision | None = None
            if target_decision_id_raw:
                try:
                    target_uuid = uuid.UUID(str(target_decision_id_raw))
                except (ValueError, TypeError):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid target_decision_id format",
                    )
                target_dec = session.exec(select(Decision).where(Decision.id == target_uuid).with_for_update()).first()
                if not target_dec:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Referenced target decision not found",
                    )
                # Verify target decision belongs to authenticated user
                if target_dec.user_id != user_id:
                    logger.warning(
                        f"Cross-user authorization violation: user {user_id} attempted "
                        f"to mutate decision {target_dec.id} of user {target_dec.user_id}"
                    )
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Referenced target decision belongs to another user. Cross-tenant mutation forbidden.",
                    )

            if not target_dec and finding.topic_key:
                # Find by topic strictly scoped to authenticated user with row lock
                target_dec = session.exec(
                    select(Decision)
                    .where(
                        Decision.user_id == user_id,
                        Decision.topic == finding.topic_key,
                        Decision.state == "active",
                    )
                    .with_for_update()
                ).first()

            new_val = action_payload.get("new_value") or finding.new_value or ""

            if target_dec:
                if (
                    action_payload.get("expected_version") is not None
                    and target_dec.version != action_payload["expected_version"]
                ):
                    raise HTTPException(
                        status_code=409, detail="Decision changed after this proposal. Request a new analysis before approving."
                    )
                before_state = {
                    "decision_id": str(target_dec.id),
                    "current_commitment": target_dec.current_commitment,
                    "version": target_dec.version,
                }
                target_dec.current_commitment = new_val
                target_dec.version += 1  # Optimistic version bump
                target_dec.updated_at = now
                target_dec.source_provenance = {"finding_id": str(finding.id), "conversation_id": str(finding.conversation_id)}
                existing_chunks = {ev.chunk_id for ev in target_dec.evidence}
                for ev in finding.evidence_links:
                    if ev.chunk_id not in existing_chunks:
                        session.add(
                            DecisionEvidence(
                                decision_id=target_dec.id, finding_id=finding.id, chunk_id=ev.chunk_id, created_at=now
                            )
                        )
                session.add(target_dec)
                resulting_decision = target_dec
                after_state = {
                    "decision_id": str(target_dec.id),
                    "current_commitment": target_dec.current_commitment,
                    "version": target_dec.version,
                }
            else:
                # Create initial if didn't exist
                topic = finding.topic_key or "general_commitment"
                resulting_decision = Decision(
                    user_id=user_id,
                    topic=topic,
                    current_commitment=new_val,
                    state="active",
                    version=1,
                    source_provenance={"finding_id": str(finding.id)},
                    created_at=now,
                    updated_at=now,
                )
                session.add(resulting_decision)
                session.flush()
                after_state = {
                    "decision_id": str(resulting_decision.id),
                    "current_commitment": new_val,
                }

        elif kind == "create_task":
            task_title = action_payload.get("title") or finding.new_value or "New Actionable Task"
            task = Task(
                user_id=user_id,
                title=task_title,
                description=finding.explanation,
                status="pending",
                owner=action_payload.get("owner"),
                due_date=_parse_due_date(action_payload.get("due_date")),
                created_at=now,
                updated_at=now,
            )
            session.add(task)
            after_state = {"task_id": str(task.id), "title": task_title}

        # Update approval and finding status
        approval_req.status = "approved"
        approval_req.approver = approver_clerk_id
        approval_req.resolution_note = note
        approval_req.resolved_at = now
        finding.status = "approved"

        session.add(approval_req)
        session.add(finding)

        # Append immutable audit entry
        record_audit_event(
            session=session,
            user_id=user_id,
            action="approval_granted",
            actor_type="user",
            actor_id=approver_clerk_id,
            entity_type="approval_request",
            entity_id=str(approval_req.id),
            before_state=before_state,
            after_state=after_state,
        )

        session.commit()
        if resulting_decision:
            session.refresh(resulting_decision)

        return ApprovalExecutionResponse(
            id=approval_req.id,
            status="approved",
            executed_at=now,
            resulting_decision=DecisionRead.model_validate(resulting_decision) if resulting_decision else None,
            message="Approval executed and authoritative record updated successfully",
        )

    @staticmethod
    def reject(
        session: Session,
        user_id: uuid.UUID,
        approval_id: uuid.UUID,
        reason: str | None = None,
        approver_clerk_id: str = "reviewer",
    ) -> ApprovalExecutionResponse:
        """Reject proposed finding without mutating decisions."""
        statement = (
            select(ApprovalRequest)
            .where(
                ApprovalRequest.id == approval_id,
                ApprovalRequest.user_id == user_id,
            )
            .with_for_update()
        )
        approval_req = session.exec(statement).first()
        if not approval_req:
            raise HTTPException(status_code=404, detail="Approval request not found")

        if approval_req.status != "pending":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Approval request already resolved with status '{approval_req.status}'",
            )

        finding = session.get(Finding, approval_req.finding_id)
        now = utc_now()

        approval_req.status = "rejected"
        approval_req.approver = approver_clerk_id
        approval_req.resolution_note = reason
        approval_req.resolved_at = now

        if finding:
            finding.status = "rejected"
            session.add(finding)

        session.add(approval_req)

        record_audit_event(
            session=session,
            user_id=user_id,
            action="approval_rejected",
            actor_type="user",
            actor_id=approver_clerk_id,
            entity_type="approval_request",
            entity_id=str(approval_req.id),
            after_state={"reason": reason},
        )

        session.commit()

        return ApprovalExecutionResponse(
            id=approval_req.id,
            status="rejected",
            executed_at=now,
            resulting_decision=None,
            message="Approval rejected. No state mutations applied.",
        )

    @staticmethod
    def clarify(
        session: Session,
        user_id: uuid.UUID,
        approval_id: uuid.UUID,
        clarification_request: str,
        approver_clerk_id: str = "reviewer",
    ) -> ApprovalExecutionResponse:
        """Mark approval request as requiring clarification."""
        statement = (
            select(ApprovalRequest)
            .where(
                ApprovalRequest.id == approval_id,
                ApprovalRequest.user_id == user_id,
            )
            .with_for_update()
        )
        approval_req = session.exec(statement).first()
        if not approval_req:
            raise HTTPException(status_code=404, detail="Approval request not found")

        if approval_req.status != "pending":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Approval request already resolved with status '{approval_req.status}'",
            )

        finding = session.get(Finding, approval_req.finding_id)
        now = utc_now()

        approval_req.status = "clarified"
        approval_req.approver = approver_clerk_id
        approval_req.resolution_note = clarification_request
        approval_req.resolved_at = now

        if finding:
            finding.status = "clarified"
            session.add(finding)

        session.add(approval_req)

        record_audit_event(
            session=session,
            user_id=user_id,
            action="approval_clarification_requested",
            actor_type="user",
            actor_id=approver_clerk_id,
            entity_type="approval_request",
            entity_id=str(approval_req.id),
            after_state={"clarification_request": clarification_request},
        )

        session.commit()

        return ApprovalExecutionResponse(
            id=approval_req.id,
            status="clarified",
            executed_at=now,
            resulting_decision=None,
            message="Clarification request recorded.",
        )
