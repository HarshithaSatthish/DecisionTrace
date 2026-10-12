"""Background worker jobs for processing conversations through the Lyzr pipeline."""

import asyncio
import logging
import secrets
import uuid
from typing import Any

from sqlmodel import Session, select

from app.db.models import (
    AgentRun,
    ApprovalRequest,
    Conversation,
    Decision,
    DecisionEvidence,
    Finding,
    ProcessingJob,
    utc_now,
)
from app.db.session import get_session_context
from app.schemas.agent import (
    AgentInvocationPayload,
    ExistingDecisionInput,
)
from app.services.agent_adapter import LyzrAgentAdapter
from app.services.chunking import chunk_transcript
from app.services.memory import upsert_chunks
from app.services.retrieval import retrieve_prior_evidence

logger = logging.getLogger(__name__)


def process_conversation_job(
    conversation_id_str: str,
    job_id_str: str,
    db_session: Session | None = None,
) -> dict[str, Any]:
    """Execute end-to-end conversation extraction, indexing, Lyzr multi-agent analysis."""
    conv_id = uuid.UUID(conversation_id_str)
    job_id = uuid.UUID(job_id_str)

    if db_session is not None:
        return _execute_job_pipeline(conv_id, job_id, db_session)

    with get_session_context() as session:
        return _execute_job_pipeline(conv_id, job_id, session)


def _execute_job_pipeline(
    conv_id: uuid.UUID, job_id: uuid.UUID, session: Session
) -> dict[str, Any]:
    job = session.get(ProcessingJob, job_id)
    conv = session.get(Conversation, conv_id)

    if not job or not conv:
        logger.error(f"Job {job_id} or Conv {conv_id} not found in database")
        raise ValueError(f"Job {job_id} or Conv {conv_id} not found in database")

    # Idempotency: treat both 'completed' and 'awaiting_approval' as already processed
    if job.state in ("completed", "awaiting_approval"):
        logger.info(
            f"Job {job_id} for conversation {conv_id} is already in state '{job.state}'. Skipping."
        )
        return {
            "status": "success",
            "conversation_id": str(conv.id),
            "state": job.state,
            "already_completed": True,
        }

    # Preserve retry limits: refuse execution if maximum attempts exceeded
    if job.attempt_count >= 3:
        logger.warning(
            f"Job {job_id} has exceeded maximum retry attempts ({job.attempt_count})."
        )
        job.state = "failed"
        conv.status = "failed"
        session.add(job)
        session.add(conv)
        session.commit()
        raise RuntimeError(
            f"Job {job_id} has exceeded maximum retry attempts ({job.attempt_count})"
        )

    now = utc_now()
    job.state = "running"
    job.started_at = now
    job.attempt_count += 1
    job.milestones.append({"state": "running", "timestamp": now.isoformat()})
    session.add(job)
    session.commit()

    try:
        # 1. Chunk transcript
        chunks = chunk_transcript(
            conversation_id=conv.id,
            user_id=conv.user_id,
            transcript=conv.normalized_transcript,
            source_time=conv.source_time,
        )
        for chk in chunks:
            session.merge(chk)
        session.commit()

        # 2. Vector indexing into Qdrant
        upsert_chunks(chunks)
        now = utc_now()
        job.milestones.append({"state": "embedded", "timestamp": now.isoformat()})
        session.add(job)
        session.commit()

        # 3. Retrieve prior evidence (multitenant scoped to user, excluding current conversation)
        historical_evidence = retrieve_prior_evidence(
            user_id=conv.user_id,
            exclude_conversation_id=conv.id,
            query_text=conv.normalized_transcript,
            top_k=5,
        )
        now = utc_now()
        job.milestones.append({"state": "retrieved", "timestamp": now.isoformat()})
        session.add(job)
        session.commit()

        # 4. Fetch existing active decisions for user
        existing_decisions_db = session.exec(
            select(Decision).where(
                Decision.user_id == conv.user_id,
                Decision.state == "active",
            )
        ).all()

        existing_decisions_input = [
            ExistingDecisionInput(
                decision_id=d.id,
                topic=d.topic,
                current_commitment=d.current_commitment,
                version=d.version,
            )
            for d in existing_decisions_db
        ]

        # 5. Build Agent Invocation Payload
        new_chunk_ids = [c.id for c in chunks]
        agent_payload = AgentInvocationPayload(
            user_id=str(conv.user_id),
            conversation_id=conv.id,
            new_transcript=conv.normalized_transcript,
            new_evidence_ids=new_chunk_ids,
            historical_evidence=historical_evidence,
            existing_decisions=existing_decisions_input,
        )

        # 6. Invoke Lyzr Adapter
        now = utc_now()
        job.milestones.append({"state": "agent_processing", "timestamp": now.isoformat()})
        session.add(job)
        session.commit()

        adapter = LyzrAgentAdapter()
        analysis_result = asyncio.run(adapter.analyze_conversation(agent_payload))

        # 7. Deduplication Guard: Clean up any pending findings and approval requests
        # from interrupted previous attempts of this conversation before persisting new ones
        existing_findings = session.exec(
            select(Finding).where(Finding.conversation_id == conv.id)
        ).all()
        for ef in existing_findings:
            if ef.status == "pending_approval":
                existing_approvals = session.exec(
                    select(ApprovalRequest).where(ApprovalRequest.finding_id == ef.id)
                ).all()
                for ea in existing_approvals:
                    session.delete(ea)
                existing_ev = session.exec(
                    select(DecisionEvidence).where(DecisionEvidence.finding_id == ef.id)
                ).all()
                for ev in existing_ev:
                    session.delete(ev)
                session.delete(ef)
        session.flush()

        # 8. Record AgentRun with genuine run reference & stages if available
        run_reference = (
            analysis_result.run_reference
            if analysis_result.run_reference
            else f"run_{secrets.token_hex(8)}"
        )
        stage_events = (
            analysis_result.stage_events
            if analysis_result.stage_events
            else [
                {"stage": "analysis_completed", "classification": analysis_result.classification}
            ]
        )
        agent_run = AgentRun(
            conversation_id=conv.id,
            provider="lyzr",
            agent_id=adapter.manager_agent_id or "lyzr-eval-engine",
            run_reference=run_reference,
            outcome="success",
            started_at=now,
            finished_at=utc_now(),
            stage_events=stage_events,
        )
        session.add(agent_run)
        session.flush()

        # 9. Record Finding and Evidence links
        now = utc_now()
        finding = Finding(
            user_id=conv.user_id,
            conversation_id=conv.id,
            agent_run_id=agent_run.id,
            classification=analysis_result.classification,
            topic_key=analysis_result.topic_key,
            previous_value=analysis_result.previous_value,
            new_value=analysis_result.new_value,
            explanation=analysis_result.explanation,
            confidence=analysis_result.confidence,
            status="pending_approval"
            if analysis_result.requires_human_approval and analysis_result.proposed_action
            else "processed",
            created_at=now,
        )
        session.add(finding)
        session.flush()

        for cid in analysis_result.evidence_chunk_ids:
            session.add(
                DecisionEvidence(
                    finding_id=finding.id,
                    chunk_id=cid,
                    created_at=now,
                )
            )

        # 10. Create Approval Request if mutation proposed
        final_state = "completed"
        if analysis_result.requires_human_approval and analysis_result.proposed_action:
            exec_key = f"exec_key_{secrets.token_urlsafe(16)}"
            approval_req = ApprovalRequest(
                user_id=conv.user_id,
                finding_id=finding.id,
                status="pending",
                action_payload=analysis_result.proposed_action.model_dump(mode="json"),
                requester="agent",
                execution_key=exec_key,
                created_at=now,
            )
            session.add(approval_req)
            final_state = "awaiting_approval"
            job.milestones.append({"state": "proposed", "timestamp": now.isoformat()})
            job.milestones.append({"state": "awaiting_approval", "timestamp": now.isoformat()})

        # Finish job
        job.state = final_state
        job.finished_at = utc_now()
        conv.status = "processed"
        session.add(job)
        session.add(conv)
        session.commit()

        logger.info(f"Successfully processed conversation {conv.id} with outcome '{final_state}'")
        return {
            "status": "success",
            "conversation_id": str(conv.id),
            "finding_id": str(finding.id),
            "state": final_state,
        }

    except Exception as e:
        logger.exception(f"Processing error in conversation {conv.id}: {e}")
        now_err = utc_now()
        is_terminal = job.attempt_count >= 3
        job.state = "failed" if is_terminal else "retrying"
        job.error = str(e)
        job.finished_at = now_err
        job.milestones.append(
            {"state": job.state, "timestamp": now_err.isoformat(), "error": str(e)}
        )
        conv.status = "failed" if is_terminal else "retrying"
        session.add(job)
        session.add(conv)
        session.commit()
        # Propagate error so RQ accurately marks job as failed and triggers retry limits
        raise
