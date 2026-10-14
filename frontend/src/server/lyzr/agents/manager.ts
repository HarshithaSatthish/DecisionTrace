import { extractCommitments } from './commitment-extractor';
import { detectConflicts } from './conflict-detector';
import { planActions } from './action-planner';
import {
  LyzrClient,
  LyzrApiError,
  LyzrTimeoutError,
  LyzrParseError,
  extractJsonFromResponse
} from '../client';
import { getLyzrConfig, isLyzrPreviewAllowed } from '../config';
import { createHash } from 'node:crypto';
import { buildManagerUserPrompt } from '../instructions/manager-agent';
import type {
  AnalysisInput,
  ManagerAnalysisResult,
  ExtractedDecisionItem,
  ExtractedCommitmentItem
} from '../types';
import type {
  Decision,
  Commitment,
  Conflict,
  ApprovalRequest,
  ActivityItem,
  EvidenceReference
} from '@/features/decision-trace/types';

export interface ManagerOptions {
  userId?: string;
  orgId?: string;
  sessionId?: string;
  timeoutMs?: number;
  skipCache?: boolean;
}

interface AnalysisCacheEntry {
  result: ManagerAnalysisResult;
  expiresAt: number;
}

const ANALYSIS_CACHE = new Map<string, AnalysisCacheEntry>();
const ANALYSIS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ANALYSIS_CACHE_SIZE = 100;

export function clearAnalysisCache(): void {
  ANALYSIS_CACHE.clear();
}

/**
 * Agent 4: Manager Agent
 * Coordinates the three worker agents (Commitment Extractor, Conflict Detector, Action Planner).
 * Validates structured responses, merges results, and removes duplicates.
 * Returns unified DecisionTrace analysis matching core domain types.
 */
export async function orchestrateDecisionTraceAnalysis(
  input: AnalysisInput,
  options?: ManagerOptions
): Promise<ManagerAnalysisResult> {
  const config = getLyzrConfig();
  const cacheKey = JSON.stringify({
    orgId: options?.orgId || input.orgId,
    userId: options?.userId || input.userId,
    credential: createHash('sha256')
      .update(config.apiKey || '')
      .digest('hex'),
    previewAllowed: isLyzrPreviewAllowed(),
    config: [
      config.baseUrl,
      config.extractorAgentId,
      config.conflictAgentId,
      config.plannerAgentId,
      config.managerAgentId
    ],
    sourceTitle: input.sourceTitle,
    channel: input.channel,
    timestamp: input.timestamp,
    existingDecisions: input.existingDecisions || [],
    conversationText: input.conversationText.trim()
  });

  if (!options?.skipCache && input.conversationText.trim()) {
    const cached = ANALYSIS_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
  }

  const sessionId = options?.sessionId || `trace-${Date.now()}`;
  const userId = options?.userId || input.userId || 'decisiontrace-operator';
  const orgId = options?.orgId || input.orgId;

  // 1. Run Worker Agent 1: Commitment Extractor
  const extractorOutput = await extractCommitments(
    input.conversationText,
    {
      sourceTitle: input.sourceTitle,
      channel: input.channel,
      timestamp: input.timestamp
    },
    { userId, orgId, sessionId, timeoutMs: options?.timeoutMs }
  );

  // 2. Run Worker Agent 2: Conflict Detector
  const conflictOutput = await detectConflicts(
    extractorOutput.decisions,
    input.existingDecisions || [],
    { userId, orgId, sessionId, timeoutMs: options?.timeoutMs }
  );

  // 3. Run Worker Agent 3: Action Planner
  const plannerOutput = await planActions(
    extractorOutput.decisions,
    extractorOutput.commitments,
    conflictOutput.conflicts,
    { userId, orgId, sessionId, timeoutMs: options?.timeoutMs }
  );

  // 4. If Lyzr Manager Agent is configured and items exist, delegate merging/refining to Manager LLM
  const hasExtractedItems =
    extractorOutput.decisions.length > 0 ||
    extractorOutput.commitments.length > 0 ||
    conflictOutput.conflicts.length > 0 ||
    extractorOutput.ungroundedClaims.length > 0;

  if (config.apiKey && config.managerAgentId && hasExtractedItems) {
    try {
      const client = new LyzrClient();
      const managerPrompt = buildManagerUserPrompt(
        input.conversationText.substring(0, 500),
        extractorOutput,
        conflictOutput,
        plannerOutput
      );

      const managerRes = await client.chat(config.managerAgentId, managerPrompt, {
        userId,
        orgId,
        sessionId,
        timeoutMs: options?.timeoutMs
      });

      // If manager successfully returns a synthesized response, parse executive summary cleanly
      let summaryText =
        'Lyzr Manager orchestrated and verified analysis across all 3 worker agents.';
      if (typeof managerRes.response === 'string') {
        try {
          const parsed = extractJsonFromResponse(managerRes.response) as Record<string, unknown>;
          if (parsed && typeof parsed.summary === 'string' && parsed.summary.trim().length > 0) {
            summaryText = parsed.summary.trim();
          } else {
            summaryText = managerRes.response.trim();
          }
        } catch {
          summaryText = managerRes.response.trim();
        }
      }

      const liveResult = synthesizeAnalysisResult(
        input,
        extractorOutput.decisions,
        extractorOutput.commitments,
        conflictOutput.conflicts,
        plannerOutput.recommendedActions,
        extractorOutput.ungroundedClaims,
        summaryText,
        'live-lyzr-agent',
        config.managerAgentId
      );

      if (!options?.skipCache && input.conversationText.trim()) {
        if (ANALYSIS_CACHE.size >= MAX_ANALYSIS_CACHE_SIZE) {
          const oldest = ANALYSIS_CACHE.keys().next().value;
          if (oldest) ANALYSIS_CACHE.delete(oldest);
        }
        ANALYSIS_CACHE.set(cacheKey, {
          result: liveResult,
          expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS
        });
      }

      return liveResult;
    } catch (err: unknown) {
      if (!isLyzrPreviewAllowed()) {
        if (
          err instanceof LyzrApiError ||
          err instanceof LyzrTimeoutError ||
          err instanceof LyzrParseError
        ) {
          throw err;
        }
        throw new LyzrApiError(
          `Lyzr Manager Agent chat inference failed: ${err instanceof Error ? err.message : String(err)}`,
          502
        );
      }
      console.warn(
        'Lyzr Manager Agent chat inference failed, using deterministic merge fallback:',
        err instanceof Error ? err.name : 'Unknown provider error'
      );
    }
  }

  // 5. Deterministic Orchestration & Merging
  const summary = generateSummary(
    extractorOutput.decisions.length,
    extractorOutput.commitments.length,
    conflictOutput.conflicts.length,
    plannerOutput.recommendedActions.length,
    extractorOutput.ungroundedClaims.length
  );

  const fallbackResult = synthesizeAnalysisResult(
    input,
    extractorOutput.decisions,
    extractorOutput.commitments,
    conflictOutput.conflicts,
    plannerOutput.recommendedActions,
    extractorOutput.ungroundedClaims,
    summary,
    'deterministic-verified-engine'
  );

  if (!options?.skipCache && input.conversationText.trim()) {
    if (ANALYSIS_CACHE.size >= MAX_ANALYSIS_CACHE_SIZE) {
      const oldest = ANALYSIS_CACHE.keys().next().value;
      if (oldest) ANALYSIS_CACHE.delete(oldest);
    }
    ANALYSIS_CACHE.set(cacheKey, {
      result: fallbackResult,
      expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS
    });
  }

  return fallbackResult;
}

// Helper to normalize core text for semantic deduplication
function normalizeDecisionKey(text: string): string {
  return text
    .toLowerCase()
    .replace(
      /^.*?(?:we decided|decision:|agreed to|agreed on|finalized that|mandate)\s*(?:to|that)?/i,
      ''
    )
    .replace(/[^a-z0-9]/g, ' ')
    .trim();
}

function normalizeCommitmentKey(task: string, owner: string): string {
  let lower = task.toLowerCase();
  if (lower.includes('i will')) {
    lower = lower.substring(lower.indexOf('i will') + 6);
  } else if (lower.includes('action item:')) {
    lower = lower.substring(lower.indexOf('action item:') + 12);
  }
  const clean = lower
    .replace(/^(?:deliver|configure|implement|take care of|handle|build)\s+/i, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim();
  return `${owner.toLowerCase()}_${clean}`;
}

/**
 * Deduplicates, links entities, and maps to DecisionTrace core domain types.
 */
function synthesizeAnalysisResult(
  input: AnalysisInput,
  rawDecisions: ExtractedDecisionItem[],
  rawCommitments: ExtractedCommitmentItem[],
  rawConflicts: Array<{
    title: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    explanation: string;
    priorDecision: {
      id: string;
      title: string;
      decisionText: string;
      source: string;
      evidenceQuote: string;
      speaker: string;
      timestamp?: string;
    };
    newDecision: {
      id?: string;
      title: string;
      decisionText: string;
      source: string;
      evidenceQuote: string;
      speaker: string;
      timestamp?: string;
    };
  }>,
  rawActions: Array<{
    id: string;
    title: string;
    description: string;
    type: string;
    suggestedAssignee: string;
    urgency: string;
    requiresApproval: boolean;
    targetEntityType: string;
    targetEntityId?: string;
    approvalPayload?: {
      actionType:
        | 'supersede_decision'
        | 'reassign_commitment'
        | 'override_conflict'
        | 'policy_exception'
        | 'pipeline_execution';
      exactActionPreview: string;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
    };
  }>,
  ungroundedClaims: string[],
  summaryText: string,
  mode: 'live-lyzr-agent' | 'deterministic-verified-engine',
  managerAgentId?: string
): ManagerAnalysisResult {
  const timestamp = input.timestamp || new Date().toISOString();
  const sourceTitle = input.sourceTitle || 'Discussion Transcript';
  const channel = input.channel || '#general';

  // 1. Deduplicate & Map Decisions
  const decisions: Decision[] = [];
  rawDecisions.forEach((rd, idx) => {
    const normKey = normalizeDecisionKey(rd.whatWasDecided || rd.title);
    const existing = decisions.find((d) => {
      const dNorm = normalizeDecisionKey(d.whatWasDecided || d.title);
      return (
        dNorm === normKey ||
        (dNorm.length > 10 &&
          normKey.length > 10 &&
          (dNorm.includes(normKey) || normKey.includes(dNorm)))
      );
    });

    if (existing) {
      // Merge participants and evidence
      rd.participants.forEach((p) => {
        if (!existing.participants.includes(p)) existing.participants.push(p);
      });
      return;
    }

    const decId = `dec-${Date.now().toString().slice(-4)}${idx + 1}`;
    const evidence: EvidenceReference[] = [
      {
        id: `ev-dec-${decId}`,
        sourceType: 'slack',
        sourceTitle,
        channelOrLocation: channel,
        speakerOrAuthor: rd.speaker,
        timestamp,
        quote: rd.evidenceQuote
      }
    ];

    decisions.push({
      id: decId,
      title: rd.title,
      summary: rd.summary,
      whatWasDecided: rd.whatWasDecided,
      participants: rd.participants.length > 0 ? rd.participants : [rd.speaker],
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'active',
      sourceConversation: {
        id: `conv-${Date.now()}`,
        title: sourceTitle,
        channel,
        timestamp
      },
      evidence,
      confidence: rd.confidenceScore,
      confidenceLevel:
        rd.confidenceScore >= 85 ? 'high' : rd.confidenceScore >= 70 ? 'medium' : 'low',
      relatedCommitmentIds: [],
      category: rd.category,
      impactLevel: rd.impactLevel
    });
  });

  // 2. Deduplicate & Map Commitments (Link to decisions)
  const commitments: Commitment[] = [];
  rawCommitments.forEach((rc, idx) => {
    const normKey = normalizeCommitmentKey(rc.task, rc.owner);
    const existing = commitments.find((c) => {
      const cNorm = normalizeCommitmentKey(c.task, c.owner);
      return (
        cNorm === normKey ||
        (cNorm.length > 10 &&
          normKey.length > 10 &&
          (cNorm.includes(normKey) || normKey.includes(cNorm)))
      );
    });

    if (existing) {
      return;
    }

    const cmtId = `cmt-${Date.now().toString().slice(-4)}${idx + 1}`;
    const matchedDecision =
      decisions.find(
        (d) =>
          rc.task.toLowerCase().includes(d.title.toLowerCase()) ||
          rc.decisionReferenceTitle?.toLowerCase() === d.title.toLowerCase()
      ) || decisions[0];

    const relatedDecisionId = matchedDecision ? matchedDecision.id : 'dec-general';
    const relatedDecisionTitle = matchedDecision ? matchedDecision.title : 'General Initiative';

    if (matchedDecision) {
      matchedDecision.relatedCommitmentIds.push(cmtId);
    }

    const evidence: EvidenceReference[] = [
      {
        id: `ev-cmt-${cmtId}`,
        sourceType: 'slack',
        sourceTitle,
        channelOrLocation: channel,
        speakerOrAuthor: rc.speaker,
        timestamp,
        quote: rc.evidenceQuote
      }
    ];

    commitments.push({
      id: cmtId,
      title: rc.title,
      task: rc.task,
      owner: rc.owner,
      deadline: rc.deadline,
      status: 'in_progress',
      priority: rc.priority,
      relatedDecisionId,
      relatedDecisionTitle,
      evidence
    });
  });

  // 3. Deduplicate & Map Conflicts
  const conflictsMap = new Map<string, Conflict>();
  rawConflicts.forEach((rconf, idx) => {
    const key = rconf.title.toLowerCase().trim();
    if (!conflictsMap.has(key)) {
      const confId = `conf-${Date.now().toString().slice(-4)}${idx + 1}`;
      conflictsMap.set(key, {
        id: confId,
        title: rconf.title,
        severity: rconf.severity,
        explanation: rconf.explanation,
        status: 'unresolved',
        detectedAt: timestamp,
        previousDecision: {
          id: rconf.priorDecision.id,
          title: rconf.priorDecision.title,
          timestamp: rconf.priorDecision.timestamp || timestamp,
          decisionText: rconf.priorDecision.decisionText,
          source: rconf.priorDecision.source,
          evidence: {
            id: `ev-prior-${confId}`,
            sourceType: 'meeting',
            sourceTitle: rconf.priorDecision.source,
            speakerOrAuthor: rconf.priorDecision.speaker,
            timestamp: rconf.priorDecision.timestamp || timestamp,
            quote: rconf.priorDecision.evidenceQuote
          }
        },
        newerDecision: {
          id: decisions[0]?.id || `dec-new-${confId}`,
          title: rconf.newDecision.title,
          timestamp,
          decisionText: rconf.newDecision.decisionText,
          source: sourceTitle,
          evidence: {
            id: `ev-newer-${confId}`,
            sourceType: 'slack',
            sourceTitle,
            channelOrLocation: channel,
            speakerOrAuthor: rconf.newDecision.speaker,
            timestamp,
            quote: rconf.newDecision.evidenceQuote
          }
        }
      });
    }
  });

  const conflicts = Array.from(conflictsMap.values());

  // 4. Map Approvals (Only for actions requiring human consensus)
  const approvals: ApprovalRequest[] = [];
  rawActions
    .filter((act) => act.requiresApproval && act.approvalPayload)
    .forEach((act, idx) => {
      const apprId = `appr-${Date.now().toString().slice(-4)}${idx + 1}`;
      approvals.push({
        id: apprId,
        title: act.title,
        description: act.description,
        actionType: act.approvalPayload!.actionType,
        proposedBy: 'Lyzr Action Planner',
        requestedAt: timestamp,
        status: 'pending',
        impactLevel: act.approvalPayload!.riskLevel,
        exactActionPreview: act.approvalPayload!.exactActionPreview,
        targetEntityId: act.targetEntityId || (conflicts[0] ? conflicts[0].id : 'entity-1'),
        targetEntityType:
          (act.targetEntityType as 'decision' | 'commitment' | 'conflict') || 'conflict',
        evidence: conflicts[0]?.previousDecision?.evidence
          ? [conflicts[0].previousDecision.evidence]
          : []
      });
    });

  // 5. Generate Activity Events
  const activityEvents: ActivityItem[] = [
    {
      id: `act-conv-${Date.now()}`,
      type: 'conversation_processed',
      title: `Processed Conversation: ${sourceTitle}`,
      description: `Lyzr Guardian analyzed transcript from ${channel} containing ${decisions.length} decision(s) and ${commitments.length} commitment(s).`,
      timestamp,
      actor: 'Lyzr Commitment Extractor',
      statusBadge: 'Processed'
    }
  ];

  decisions.forEach((d) => {
    activityEvents.push({
      id: `act-dec-${d.id}`,
      type: 'decision_extracted',
      title: `Decision Extracted: ${d.title}`,
      description: d.whatWasDecided,
      timestamp: d.createdAt,
      actor: 'Lyzr Decision Extractor',
      entityId: d.id,
      entityType: 'decision',
      evidence: d.evidence,
      statusBadge: (d.confidenceLevel || 'high').toUpperCase()
    });
  });

  conflicts.forEach((c) => {
    activityEvents.push({
      id: `act-conf-${c.id}`,
      type: 'conflict_detected',
      title: `Contradiction Detected: ${c.title}`,
      description: c.explanation,
      timestamp: c.detectedAt,
      actor: 'Lyzr Conflict Detector',
      entityId: c.id,
      entityType: 'conflict',
      evidence: [c.previousDecision.evidence, c.newerDecision.evidence],
      statusBadge: c.severity.toUpperCase()
    });
  });

  approvals.forEach((a) => {
    activityEvents.push({
      id: `act-appr-${a.id}`,
      type: 'approval_requested',
      title: `Approval Required: ${a.title}`,
      description: a.exactActionPreview,
      timestamp: a.requestedAt,
      actor: 'Lyzr Action Planner',
      entityId: a.id,
      entityType: 'approval',
      evidence: a.evidence,
      statusBadge: 'PENDING'
    });
  });

  return {
    summary: summaryText,
    decisions,
    commitments,
    conflicts,
    pendingApprovals: approvals,
    activityEvents,
    stats: {
      extractedDecisionsCount: decisions.length,
      extractedCommitmentsCount: commitments.length,
      detectedConflictsCount: conflicts.length,
      actionsPlannedCount: rawActions.length,
      ungroundedClaimsCount: ungroundedClaims.length
    },
    provenance: {
      orchestrator: 'lyzr-manager-agent-v1',
      executionTimestamp: timestamp,
      mode,
      rawAgentId: managerAgentId
    }
  };
}

function generateSummary(
  decisionsCount: number,
  commitmentsCount: number,
  conflictsCount: number,
  actionsCount: number,
  ungroundedCount: number
): string {
  if (decisionsCount === 0 && commitmentsCount === 0 && conflictsCount === 0) {
    return 'Lyzr Guardian processed conversation: No actionable decisions or commitments were identified. Transcript preserved in audit log.';
  }

  const parts: string[] = [
    `Lyzr Guardian analyzed conversation: identified ${decisionsCount} decision(s) and ${commitmentsCount} commitment(s).`
  ];

  if (conflictsCount > 0) {
    parts.push(
      `CRITICAL: Detected ${conflictsCount} contradiction(s) against active policies requiring human consensus.`
    );
  }

  if (actionsCount > 0) {
    parts.push(`Generated ${actionsCount} recommended follow-up action(s).`);
  }

  if (ungroundedCount > 0) {
    parts.push(`Flagged ${ungroundedCount} ungrounded or ambiguous proposal(s) lacking consensus.`);
  }

  return parts.join(' ');
}
