// ============================================================================
// DecisionTrace Core Domain Model Types
// Strict contract for Decisions, Commitments, Conflicts, Approvals, and Evidence
// ============================================================================

export type SourceType = 'slack' | 'teams' | 'meeting' | 'document' | 'email';

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
    timestamp?: string;
    url?: string;
  };
  evidence: EvidenceReference[];
  confidence?: number; // 0-100 percentage, optional when unscored
  confidenceLevel?: ConfidenceLevel;
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
  priority?: CommitmentPriority;
  relatedDecisionId: string;
  relatedDecisionTitle: string;
  evidence: EvidenceReference[];
  progressPercentage?: number;
  blockerNotes?: string;
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

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalActionType =
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
  action: 'approve' | 'reject';
  rationale: string;
}

export interface ConflictResolvePayload {
  action: 'resolve' | 'escalate' | 'dismiss';
  rationale: string;
}


// ============================================================================
// Omi Conversations & Integration Types
// ============================================================================
export type ConversationProcessingStatus = 'pending' | 'processing' | 'processed' | 'failed';

export interface OmiConversation {
  id: string;
  sourceEventId?: string;
  title?: string;
  overview?: string;
  transcriptPreview: string;
  sourceTime: string;
  createdAt: string;
  status: ConversationProcessingStatus;
}

export interface OmiConversationChunk {
  id: string;
  excerpt: string;
  vectorPointId?: string;
  sourceTime?: string;
}

export interface OmiConversationDetail extends OmiConversation {
  normalizedTranscript: string;
  chunks: OmiConversationChunk[];
}

export interface OmiIntegrationStatus {
  connected: boolean;
  installationId?: string;
  externalOmiUid?: string;
  createdAt?: string;
  webhookUrl?: string;
}

export interface OmiLinkResult {
  installationId: string;
  webhookToken: string;
  webhookUrl: string;
  message: string;
}
