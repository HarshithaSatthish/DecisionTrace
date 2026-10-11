import type {
  Decision,
  Commitment,
  Conflict,
  ApprovalRequest,
  ActivityItem,
  ImpactLevel
} from '@/features/decision-trace/types';

// ============================================================================
// Lyzr Inference Endpoint Contract
// ============================================================================

export interface LyzrChatRequest {
  user_id: string;
  agent_id: string;
  session_id: string;
  message: string;
}

export interface LyzrChatResponse {
  response: string | Record<string, unknown>;
  session_id?: string;
  agent_id?: string;
  [key: string]: unknown;
}

// ============================================================================
// Agent 1: Commitment Extractor Types
// ============================================================================

export interface ExtractedDecisionItem {
  id?: string;
  title: string;
  summary: string;
  whatWasDecided: string;
  participants: string[];
  category: string;
  impactLevel: ImpactLevel;
  confidenceScore: number; // 0-100 percentage
  evidenceQuote: string;
  speaker: string;
  timestamp?: string;
  channelOrSource?: string;
  isAmbiguous?: boolean;
}

export interface ExtractedCommitmentItem {
  id?: string;
  title: string;
  task: string;
  owner: string; // Must be an identified individual or explicit team role, never invented
  deadline: string; // ISO date string or explicit quoted phrase; never hallucinated
  priority: 'low' | 'medium' | 'high' | 'critical';
  evidenceQuote: string;
  speaker: string;
  decisionReferenceTitle?: string;
  isUncertainDeadline?: boolean;
}

export interface CommitmentExtractorResult {
  decisions: ExtractedDecisionItem[];
  commitments: ExtractedCommitmentItem[];
  participants: string[];
  ungroundedClaims: string[]; // Ambiguous or unsubstantiated statements detected in text
  rawResponseText?: string;
}

// ============================================================================
// Agent 2: Conflict Detector Types
// ============================================================================

export interface DetectedConflictItem {
  id?: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  explanation: string;
  confidence: number; // 0-100
  isDefiniteConflict: boolean; // Distinguishes real conflicts from uncertain matches
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
}

export interface ConflictDetectorResult {
  conflicts: DetectedConflictItem[];
  hasConflicts: boolean;
  analyzedComparisonsCount: number;
  uncertainMatchesCount: number;
  rawResponseText?: string;
}

// ============================================================================
// Agent 3: Action Planner Types
// ============================================================================

export interface RecommendedActionItem {
  id: string;
  title: string;
  description: string;
  type: 'follow_up' | 'unblock' | 'deadline_alert' | 'external_sync';
  suggestedAssignee: string;
  urgency: 'low' | 'medium' | 'high';
  requiresApproval: boolean; // All external system actions must require explicit approval
  targetEntityType: 'decision' | 'commitment' | 'conflict';
  targetEntityId?: string;
  approvalPayload?: {
    actionType:
      | 'supersede_decision'
      | 'reassign_commitment'
      | 'override_conflict'
      | 'policy_exception'
      | 'pipeline_execution';
    exactActionPreview: string;
    riskLevel: ImpactLevel;
  };
}

export interface ActionPlannerResult {
  recommendedActions: RecommendedActionItem[];
  overdueCount: number;
  blockedCount: number;
  suggestedFollowUpsCount: number;
  rawResponseText?: string;
}

// ============================================================================
// Agent 4: Manager Agent Types (Orchestrated Output)
// ============================================================================

export interface AnalysisInput {
  conversationText: string;
  sourceTitle?: string;
  channel?: string;
  timestamp?: string;
  existingDecisions?: Decision[];
  existingCommitments?: Commitment[];
  userId?: string;
  orgId?: string;
  sessionId?: string;
}

export interface ManagerAnalysisResult {
  summary: string;
  decisions: Decision[];
  commitments: Commitment[];
  conflicts: Conflict[];
  pendingApprovals: ApprovalRequest[];
  activityEvents: ActivityItem[];
  stats: {
    extractedDecisionsCount: number;
    extractedCommitmentsCount: number;
    detectedConflictsCount: number;
    actionsPlannedCount: number;
    ungroundedClaimsCount: number;
  };
  provenance: {
    orchestrator: 'lyzr-manager-agent-v1';
    executionTimestamp: string;
    mode: 'live-lyzr-agent' | 'deterministic-verified-engine';
    rawAgentId?: string;
  };
}
