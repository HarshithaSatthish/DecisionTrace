// ============================================================================
// DecisionTrace Core Domain Model Types
// Strict contract for Decisions, Commitments, Conflicts, Approvals, and Evidence
// ============================================================================

export type SourceType = 'slack' | 'teams' | 'meeting' | 'document' | 'email';

export interface AgentInsight {
  id: string;
  topic_key: string | null;
  classification: string;
  explanation: string;
  status: string;
  evidence: { chunk_id: string; excerpt: string }[];
}

export interface OmiConnection {
  connected: boolean;
  external_omi_uid?: string;
  webhook_url?: string;
}

export interface IntegrationStatus {
  status: string;
  connected: boolean;
  details?: { readiness?: { dependencies?: Record<string, string> } };
}

export interface EvidenceReference {
  id: string;
  sourceType: SourceType;
  sourceTitle: string;
  channelOrLocation?: string;
  speakerOrAuthor: string;
  timestamp: string;
  quote: string;
  messageId?: string;
  url?: string;
  vectorSimilarity?: number; // Qdrant semantic similarity (e.g. 0.94)
}

export type DecisionStatus = 'active' | 'superseded' | 'under_review' | 'deprecated';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Decision {
  id: string;
  title: string;
  summary: string;
  whatWasDecided: string;
  participants: string[];
  createdAt: string;
  updatedAt: string;
  status: DecisionStatus;
  sourceConversation: {
    id: string;
    title: string;
    channel: string;
    timestamp: string;
    url?: string;
  };
  evidence: EvidenceReference[];
  confidence: number; // 0-100 percentage
  confidenceLevel: ConfidenceLevel;
  confidenceAvailable?: boolean;
  relatedCommitmentIds: string[];
  category: string;
  impactLevel: ImpactLevel;
}

export type CommitmentStatus = 'backlog' | 'in_progress' | 'blocked' | 'completed';
export type CommitmentPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Commitment {
  id: string;
  title: string;
  task: string;
  owner: string;
  ownerAvatar?: string;
  deadline: string;
  status: CommitmentStatus;
  priority: CommitmentPriority;
  relatedDecisionId: string;
  relatedDecisionTitle: string;
  evidence: EvidenceReference[];
  progressPercentage?: number;
  blockerNotes?: string;
  readOnly?: boolean;
  overdue?: boolean;
  needsFollowUp?: boolean;
}

export type ConflictResolutionStatus = 'unresolved' | 'resolved' | 'escalated' | 'dismissed';
export type ConflictSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ConflictDecisionSide {
  id: string;
  title: string;
  timestamp: string;
  decisionText: string;
  source: string;
  evidence: EvidenceReference;
}

export interface Conflict {
  id: string;
  title: string;
  severity: ConflictSeverity;
  explanation: string;
  status: ConflictResolutionStatus;
  detectedAt: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  previousDecision: ConflictDecisionSide;
  newerDecision: ConflictDecisionSide;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'clarified';
export type ApprovalActionType =
  | 'create_decision'
  | 'create_task'
  | 'request_clarification'
  | 'supersede_decision'
  | 'reassign_commitment'
  | 'override_conflict'
  | 'policy_exception'
  | 'pipeline_execution';

export interface ApprovalRequest {
  id: string;
  title: string;
  description: string;
  actionType: ApprovalActionType;
  proposedBy: string;
  requestedAt: string;
  status: ApprovalStatus;
  impactLevel: ImpactLevel;
  exactActionPreview: string; // Explains exactly what state mutation will occur upon execution
  targetEntityId: string;
  targetEntityType: 'decision' | 'commitment' | 'conflict';
  evidence: EvidenceReference[];
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
}

export type ActivityType =
  | 'conversation_processed'
  | 'decision_extracted'
  | 'conflict_detected'
  | 'approval_requested'
  | 'approval_executed'
  | 'commitment_updated';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  actor?: string;
  entityId?: string;
  entityType?: 'decision' | 'commitment' | 'conflict' | 'approval' | 'conversation';
  evidence?: EvidenceReference[];
  statusBadge?: string;
}

export type AttentionItem = {
  id: string;
  type: 'conflict' | 'approval' | 'commitment';
  title: string;
  severity: ImpactLevel;
  actionUrl: string;
  time: string;
};

export interface DashboardMetrics {
  overdueCommitmentsCount?: number;
  activeDecisionsCount: number;
  openCommitmentsCount: number;
  detectedConflictsCount: number;
  pendingApprovalsCount: number;
  decisionTrend: {
    period: string;
    decisions: number;
    commitments: number;
  }[];
  attentionItems: AttentionItem[];
  recentActivity: ActivityItem[];
  isProductionOffline?: boolean;
  message?: string;
}

// Filter Contracts
export interface DecisionFilters {
  search?: string;
  status?: string;
  confidence?: string;
  category?: string;
  page?: number;
  limit?: number;
}

export interface CommitmentFilters {
  search?: string;
  status?: string;
  owner?: string;
  priority?: string;
}

export interface ConflictFilters {
  status?: string;
  severity?: string;
  search?: string;
}

export interface ApprovalFilters {
  status?: string;
  impactLevel?: string;
  search?: string;
}

export interface ActivityFilters {
  type?: string;
  search?: string;
}

// Action Payloads
export interface ApprovalActionPayload {
  action: 'approve' | 'reject' | 'clarify';
  rationale: string;
}

export interface ConflictResolvePayload {
  action: 'resolve' | 'escalate' | 'dismiss';
  rationale: string;
}
