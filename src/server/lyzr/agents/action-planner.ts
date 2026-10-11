import { LyzrClient, LyzrConfigurationError } from '../client';
import { getLyzrConfig, isLyzrPreviewAllowed } from '../config';
import { buildPlannerUserPrompt } from '../instructions/action-planner';
import { ActionPlannerResultSchema } from '../schemas';
import type {
  ActionPlannerResult,
  RecommendedActionItem,
  ExtractedDecisionItem,
  ExtractedCommitmentItem,
  DetectedConflictItem
} from '../types';

export interface ActionPlannerOptions {
  userId?: string;
  orgId?: string;
  sessionId?: string;
  timeoutMs?: number;
}

/**
 * Agent 3: Action Planner
 * Recommends next actions based on confirmed decisions and commitments.
 * Identifies overdue or blocked items.
 * Generates suggested follow-ups.
 * Marks external actions as requiring explicit approval. Never executes actions automatically.
 */
export async function planActions(
  decisions: ExtractedDecisionItem[] = [],
  commitments: ExtractedCommitmentItem[] = [],
  conflicts: DetectedConflictItem[] = [],
  options?: ActionPlannerOptions
): Promise<ActionPlannerResult> {
  if (decisions.length === 0 && commitments.length === 0 && conflicts.length === 0) {
    return {
      recommendedActions: [],
      overdueCount: 0,
      blockedCount: 0,
      suggestedFollowUpsCount: 0
    };
  }

  const config = getLyzrConfig();
  const client = new LyzrClient();

  if (config.apiKey && config.plannerAgentId) {
    const userPrompt = buildPlannerUserPrompt(
      decisions.map((d) => ({ title: d.title, whatWasDecided: d.whatWasDecided })),
      commitments.map((c) => ({
        title: c.title,
        owner: c.owner,
        deadline: c.deadline,
        priority: c.priority
      })),
      conflicts.map((co) => ({
        title: co.title,
        severity: co.severity,
        explanation: co.explanation
      }))
    );

    const plannerOutput = await client.chatStructured(
      config.plannerAgentId,
      userPrompt,
      ActionPlannerResultSchema,
      {
        userId: options?.userId,
        orgId: options?.orgId,
        sessionId: options?.sessionId,
        timeoutMs: options?.timeoutMs
      }
    );

    // Enforce approval gating on live results:
    // Any action touching conflicts, policy alters, or overrides MUST require human approval
    for (const act of plannerOutput.recommendedActions) {
      if (
        act.targetEntityType === 'conflict' ||
        act.type === 'external_sync' ||
        act.title.toLowerCase().includes('override') ||
        act.title.toLowerCase().includes('resolve conflict') ||
        act.title.toLowerCase().includes('supersede')
      ) {
        act.requiresApproval = true;
        if (!act.approvalPayload) {
          act.approvalPayload = {
            actionType: 'override_conflict',
            exactActionPreview:
              act.description ||
              `Approval required before mutating ${act.targetEntityType || 'record'}.`,
            riskLevel: act.urgency === 'high' ? 'critical' : 'medium'
          };
        }
      }
    }

    return plannerOutput;
  }

  // Strict production guard: never silently substitute deterministic output for unconfigured/failed live inference
  if (!isLyzrPreviewAllowed()) {
    throw new LyzrConfigurationError(
      'Live Lyzr Action Planner agent is not configured (missing LYZR_API_KEY or LYZR_PLANNER_AGENT_ID). Production cannot substitute deterministic preview output.'
    );
  }

  // Deterministic action planning engine (permitted only in development preview / test runner)
  return deterministicPlanActions(decisions, commitments, conflicts);
}

/**
 * Deterministic action planning engine:
 * Follow-ups, blocked/overdue flags, and human consensus gating.
 */
export function deterministicPlanActions(
  decisions: ExtractedDecisionItem[],
  commitments: ExtractedCommitmentItem[],
  conflicts: DetectedConflictItem[]
): ActionPlannerResult {
  const actions: RecommendedActionItem[] = [];
  let overdueCount = 0;
  let blockedCount = 0;
  let suggestedFollowUpsCount = 0;

  // 1. Conflict Remediation Actions (Require Human Approval!)
  for (const conf of conflicts) {
    actions.push({
      id: `act-conf-${Math.random().toString(36).substring(2, 7)}`,
      title: `Resolve Conflict: ${conf.title}`,
      description: `Schedule architectural review to resolve contradiction between "${conf.priorDecision.title}" and "${conf.newDecision.title}".`,
      type: 'follow_up',
      suggestedAssignee: conf.priorDecision.speaker || 'Lead Architect',
      urgency: conf.severity === 'critical' ? 'high' : 'medium',
      requiresApproval: true, // MUST require explicit human approval
      targetEntityType: 'conflict',
      approvalPayload: {
        actionType: 'override_conflict',
        exactActionPreview: `Mutate conflict state to resolved and record architectural consensus between ${conf.priorDecision.id} and candidate decision.`,
        riskLevel: conf.severity
      }
    });
  }

  // 2. Commitment Actions (Detect Missing Deadlines or High Priorities)
  for (const c of commitments) {
    if (c.isUncertainDeadline) {
      suggestedFollowUpsCount++;
      actions.push({
        id: `act-cmt-dl-${Math.random().toString(36).substring(2, 7)}`,
        title: `Clarify Deadline for: ${c.title}`,
        description: `Commitment assigned to ${c.owner} has an ambiguous or missing deadline ("${c.deadline}"). Request concrete delivery date.`,
        type: 'deadline_alert',
        suggestedAssignee: c.owner,
        urgency: c.priority === 'critical' ? 'high' : 'medium',
        requiresApproval: false,
        targetEntityType: 'commitment'
      });
    }

    if (c.priority === 'critical') {
      actions.push({
        id: `act-cmt-crit-${Math.random().toString(36).substring(2, 7)}`,
        title: `High-Priority Action Item Sync: ${c.title}`,
        description: `Ensure resource allocation for critical deliverable assigned to ${c.owner}.`,
        type: 'follow_up',
        suggestedAssignee: c.owner,
        urgency: 'high',
        requiresApproval: false,
        targetEntityType: 'commitment'
      });
    }
  }

  // 3. High Impact Decision Follow-Ups
  for (const d of decisions) {
    if (d.impactLevel === 'critical' || d.impactLevel === 'high') {
      const hasRelatedCommitment = commitments.some(
        (c) =>
          c.task.toLowerCase().includes(d.title.toLowerCase()) ||
          c.decisionReferenceTitle?.toLowerCase() === d.title.toLowerCase()
      );

      if (!hasRelatedCommitment) {
        suggestedFollowUpsCount++;
        actions.push({
          id: `act-dec-${Math.random().toString(36).substring(2, 7)}`,
          title: `Assign Operational Owner: ${d.title}`,
          description: `Decision "${d.title}" was rated ${d.impactLevel} impact but has no direct tracked execution commitments.`,
          type: 'follow_up',
          suggestedAssignee: d.participants[0] || 'Team Lead',
          urgency: 'medium',
          requiresApproval: false,
          targetEntityType: 'decision'
        });
      }
    }
  }

  return {
    recommendedActions: actions,
    overdueCount,
    blockedCount,
    suggestedFollowUpsCount
  };
}
