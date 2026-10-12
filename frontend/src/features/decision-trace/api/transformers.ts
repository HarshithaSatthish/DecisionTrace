import {
  Decision,
  Commitment,
  Conflict,
  ApprovalRequest,
  ActivityItem,
  DashboardMetrics,
  AttentionItem,
  DecisionStatus,
  CommitmentStatus,
  ConflictResolutionStatus,
  ApprovalStatus,
  ActivityType,
  ImpactLevel,
  EvidenceReference,
  ConfidenceLevel
} from '../types';

interface BackendOverviewRaw {
  active_decisions?: number;
  activeDecisionsCount?: number;
  pending_approvals?: number;
  pendingApprovalsCount?: number;
  recent_findings?: number;
  detectedConflictsCount?: number;
  openCommitmentsCount?: number;
  attentionItems?: AttentionItem[];
  decisionTrend?: Array<{ period: string; decisions: number; commitments: number }>;
  recentActivity?: ActivityItem[];
  isProductionOffline?: boolean;
}

interface BackendDecisionRaw {
  id: string | number;
  title?: string;
  topic?: string;
  summary?: string;
  whatWasDecided?: string;
  current_commitment?: string;
  participants?: string[];
  owner?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  status?: string;
  state?: string;
  sourceConversation?: {
    id: string;
    title: string;
    channel: string;
    timestamp: string;
    url?: string;
  };
  source_event_id?: string;
  evidence?: EvidenceReference[];
  confidence?: number;
  confidenceLevel?: ConfidenceLevel;
  relatedCommitmentIds?: string[];
  category?: string;
  impactLevel?: ImpactLevel;
}

interface BackendCommitmentRaw {
  id: string | number;
  title?: string;
  topic?: string;
  task?: string;
  current_commitment?: string;
  owner?: string;
  ownerAvatar?: string;
  due_date?: string;
  deadline?: string;
  status?: string;
  state?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  evidence?: EvidenceReference[];
  progressPercentage?: number;
}

interface BackendFindingRaw {
  id: string | number;
  topic_key?: string;
  classification?: string;
  severity?: string;
  confidence?: string;
  explanation?: string;
  status?: string;
  created_at?: string;
  previous_value?: string;
  new_value?: string;
  previousDecision?: Conflict['previousDecision'];
  newerDecision?: Conflict['newerDecision'];
  evidence?: Array<{
    chunk_id?: string;
    source_time?: string;
    excerpt?: string;
    vectorSimilarity?: number;
    similarity?: number;
  }>;
}

interface BackendApprovalRaw {
  id: string | number;
  title?: string;
  exactActionPreview?: string;
  requester?: string;
  created_at?: string;
  status?: string;
  action_payload?: {
    topic?: string;
    new_value?: string;
    kind?: string;
  };
  execution_key?: string;
  finding_id?: string | number;
  evidence?: EvidenceReference[];
}

interface BackendActivityRaw {
  id: string | number;
  title?: string;
  description?: string;
  type?: ActivityType;
  action?: string;
  actor_type?: string;
  actor_id?: string;
  actor?: string;
  entity_type?: 'decision' | 'commitment' | 'conflict' | 'approval' | 'conversation';
  entity_id?: string;
  timestamp?: string;
}

export function transformBackendOverview(raw: BackendOverviewRaw = {}): DashboardMetrics {
  const activeCount = Number(raw.active_decisions ?? raw.activeDecisionsCount ?? 0);
  const pendingCount = Number(raw.pending_approvals ?? raw.pendingApprovalsCount ?? 0);
  const findingsCount = Number(raw.recent_findings ?? raw.detectedConflictsCount ?? 0);
  const openCommitments = Number(raw.openCommitmentsCount ?? activeCount);

  const attentionItems: AttentionItem[] = [];
  if (Array.isArray(raw.attentionItems) && raw.attentionItems.length > 0) {
    attentionItems.push(...raw.attentionItems);
  } else {
    if (pendingCount > 0) {
      attentionItems.push({
        id: 'attn-approvals',
        type: 'approval',
        title: `${pendingCount} decision proposal(s) require human consensus`,
        severity: 'high',
        actionUrl: '/dashboard/approvals',
        time: 'Awaiting Review'
      });
    }
    if (findingsCount > 0) {
      attentionItems.push({
        id: 'attn-conflicts',
        type: 'conflict',
        title: `${findingsCount} conflicting finding(s) detected across conversations`,
        severity: 'medium',
        actionUrl: '/dashboard/conflicts',
        time: 'Recent Ingestion'
      });
    }
  }

  // Display unavailable trends honestly as empty array — never fabricate historical data points
  const decisionTrend =
    Array.isArray(raw.decisionTrend) && raw.decisionTrend.length > 0
      ? raw.decisionTrend
      : [];

  return {
    activeDecisionsCount: activeCount,
    openCommitmentsCount: openCommitments,
    detectedConflictsCount: findingsCount,
    pendingApprovalsCount: pendingCount,
    decisionTrend,
    attentionItems,
    recentActivity: Array.isArray(raw.recentActivity) ? raw.recentActivity : [],
    isProductionOffline: Boolean(raw.isProductionOffline ?? false)
  };
}

export function transformBackendDecisions(items: unknown[]): Decision[] {
  if (!Array.isArray(items)) return [];
  return items.map((rawItem: unknown) => {
    const d = rawItem as BackendDecisionRaw;
    if (d.whatWasDecided && d.title && d.sourceConversation) {
      return d as Decision;
    }
    const topicTitle = (d.topic || 'Decision')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
    const commitmentText = d.current_commitment || topicTitle;

    // Honest confidence handling: only set when provided by backend, never fabricate 95%
    const confidenceVal = d.confidence != null ? Number(d.confidence) : undefined;
    const confidenceLevelVal =
      d.confidenceLevel ||
      (confidenceVal != null
        ? confidenceVal >= 80
          ? 'high'
          : confidenceVal >= 50
            ? 'medium'
            : 'low'
        : undefined);

    return {
      id: String(d.id),
      title: d.title || topicTitle,
      summary: d.summary || commitmentText,
      whatWasDecided: d.whatWasDecided || commitmentText,
      participants: Array.isArray(d.participants)
        ? d.participants
        : d.owner
          ? [d.owner]
          : ['Team'],
      createdAt: d.created_at || d.createdAt || new Date().toISOString(),
      updatedAt: d.updated_at || d.updatedAt || new Date().toISOString(),
      status: (d.status || (d.state === 'active' ? 'active' : 'superseded')) as DecisionStatus,
      sourceConversation: d.sourceConversation || {
        id: d.source_event_id || 'conv-omi',
        title: topicTitle,
        channel: 'Voice (Omi)',
        timestamp: d.updated_at || d.created_at || new Date().toISOString()
      },
      evidence: Array.isArray(d.evidence) ? d.evidence : [],
      confidence: confidenceVal,
      confidenceLevel: confidenceLevelVal,
      relatedCommitmentIds: d.relatedCommitmentIds || [String(d.id)],
      category: d.category || d.topic || 'Engineering',
      impactLevel: (d.impactLevel || 'high') as ImpactLevel
    };
  });
}

export function transformBackendDecisionsToCommitments(items: unknown[]): Commitment[] {
  if (!Array.isArray(items)) return [];
  return items.map((rawItem: unknown) => {
    const d = rawItem as BackendCommitmentRaw;
    if (d.task && d.owner && d.deadline) {
      return d as Commitment;
    }
    const topicTitle = (d.topic || 'Commitment')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
    const commitmentText = d.current_commitment || d.task || topicTitle;

    // Honest progress handling: only set when provided, never fabricate 50%
    const progressVal =
      d.progressPercentage != null
        ? Number(d.progressPercentage)
        : d.status === 'completed'
          ? 100
          : undefined;

    return {
      id: String(d.id),
      title: d.title || topicTitle,
      task: commitmentText,
      owner: d.owner || 'Unassigned',
      ownerAvatar: d.ownerAvatar,
      deadline: d.due_date || d.deadline || new Date().toISOString(),
      status: (d.status || (d.state === 'active' ? 'in_progress' : 'completed')) as CommitmentStatus,
      priority: d.priority || 'high',
      relatedDecisionId: String(d.id),
      relatedDecisionTitle: topicTitle,
      evidence: Array.isArray(d.evidence) ? d.evidence : [],
      progressPercentage: progressVal
    };
  });
}

export function transformBackendFindingsToConflicts(items: unknown[]): Conflict[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((rawItem: unknown) => {
      const f = rawItem as BackendFindingRaw;
      return (
        f.previous_value != null ||
        f.classification === 'possible_conflict' ||
        f.classification === 'superseding_change' ||
        f.previousDecision != null
      );
    })
    .map((rawItem: unknown) => {
      const f = rawItem as BackendFindingRaw;
      if (f.previousDecision && f.newerDecision) {
        return f as Conflict;
      }
      const topic = (f.topic_key || 'Commitment')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
      const ev1 = f.evidence?.[0];
      const ev2 = f.evidence?.[1] || ev1;

      // Honest vector similarity: only set when provided by Qdrant/backend, never fabricate 0.94 / 0.96
      const sim1 =
        ev1?.vectorSimilarity != null
          ? Number(ev1.vectorSimilarity)
          : ev1?.similarity != null
            ? Number(ev1.similarity)
            : undefined;
      const sim2 =
        ev2?.vectorSimilarity != null
          ? Number(ev2.vectorSimilarity)
          : ev2?.similarity != null
            ? Number(ev2.similarity)
            : undefined;

      return {
        id: String(f.id),
        title: `Contradiction: ${topic}`,
        severity: (f.confidence === 'high' ? 'high' : 'medium') as ImpactLevel,
        explanation:
          f.explanation ||
          `Contradiction between historical agreement and new statement on ${topic}.`,
        status: (f.status === 'pending_approval' ? 'unresolved' : 'resolved') as ConflictResolutionStatus,
        detectedAt: f.created_at || new Date().toISOString(),
        previousDecision: {
          id: `prev-${f.id}`,
          title: `Prior Agreement: ${topic}`,
          timestamp: ev1?.source_time || f.created_at || new Date().toISOString(),
          decisionText: f.previous_value || ev1?.excerpt || 'Original agreement',
          source: 'Omi Memory',
          evidence: {
            id: ev1?.chunk_id || 'ev-1',
            sourceType: 'meeting',
            sourceTitle: 'Prior Conversation',
            speakerOrAuthor: 'Team Member',
            timestamp: ev1?.source_time || f.created_at || new Date().toISOString(),
            quote: ev1?.excerpt || f.previous_value || 'Original agreement quote',
            vectorSimilarity: sim1
          }
        },
        newerDecision: {
          id: `new-${f.id}`,
          title: `New Revision: ${topic}`,
          timestamp: ev2?.source_time || f.created_at || new Date().toISOString(),
          decisionText: f.new_value || ev2?.excerpt || 'Proposed change',
          source: 'Omi Memory',
          evidence: {
            id: ev2?.chunk_id || 'ev-2',
            sourceType: 'meeting',
            sourceTitle: 'Recent Meeting',
            speakerOrAuthor: 'Team Member',
            timestamp: ev2?.source_time || f.created_at || new Date().toISOString(),
            quote: ev2?.excerpt || f.new_value || 'New statement quote',
            vectorSimilarity: sim2
          }
        }
      };
    });
}

export function transformBackendApprovals(items: unknown[]): ApprovalRequest[] {
  if (!Array.isArray(items)) return [];
  return items.map((rawItem: unknown) => {
    const r = rawItem as BackendApprovalRaw;
    if (r.exactActionPreview && r.title) {
      return r as ApprovalRequest;
    }
    const topic = (r.action_payload?.topic || 'Decision')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
    return {
      id: String(r.id),
      title: `Approve Update: ${topic}`,
      description: `Agent proposes updating ${topic} to "${r.action_payload?.new_value || ''}".`,
      actionType:
        r.action_payload?.kind === 'request_decision_update'
          ? 'supersede_decision'
          : 'override_conflict',
      proposedBy: `Lyzr Autonomous Guardian (${r.requester || 'Agent'})`,
      requestedAt: r.created_at || new Date().toISOString(),
      status: (r.status === 'pending' ? 'pending' : r.status === 'approved' ? 'approved' : 'rejected') as ApprovalStatus,
      impactLevel: 'high' as ImpactLevel,
      exactActionPreview: `Execute atomic mutation on decision '${r.action_payload?.topic}' -> '${r.action_payload?.new_value}' (Key: ${r.execution_key})`,
      targetEntityId: String(r.finding_id || r.id),
      targetEntityType: 'decision',
      evidence: r.evidence || []
    };
  });
}

export function transformBackendActivity(items: unknown[]): ActivityItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((rawItem: unknown) => {
    const a = rawItem as BackendActivityRaw;
    if (a.title && a.description && a.type) {
      return a as ActivityItem;
    }
    let actType: ActivityType = 'conversation_processed';
    if (a.action?.includes('decision')) actType = 'decision_extracted';
    else if (a.action?.includes('conflict') || a.action?.includes('finding'))
      actType = 'conflict_detected';
    else if (a.action?.includes('approve') || a.action?.includes('executed'))
      actType = 'approval_executed';
    else if (a.action?.includes('request')) actType = 'approval_requested';
    else if (a.action?.includes('update')) actType = 'commitment_updated';

    const actionLabel = (a.action || 'event').replace(/_/g, ' ');
    return {
      id: String(a.id),
      type: actType,
      title: a.title || `Audit: ${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)}`,
      description:
        a.description ||
        `${a.actor_type || 'User'} recorded ${actionLabel} on ${a.entity_type || 'system'}`,
      timestamp: a.timestamp || new Date().toISOString(),
      actor: a.actor_id || a.actor || 'System',
      entityId: a.entity_id,
      entityType: a.entity_type,
      statusBadge: a.action
    };
  });
}
