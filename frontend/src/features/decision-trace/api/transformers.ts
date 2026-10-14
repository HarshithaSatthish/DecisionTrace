import { mapBackendEvidence } from '@/lib/evidence-mapping';
import { mapAuditActionToActivityType } from '@/lib/activity-mapping';
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
  ConfidenceLevel,
  OmiConversation,
  OmiConversationDetail,
  OmiIntegrationStatus
} from '../types';

interface BackendOverviewRaw {
  active_decisions?: number;
  activeDecisionsCount?: number;
  pending_approvals?: number;
  pendingApprovalsCount?: number;
  recent_findings?: number;
  detected_conflicts?: number;
  open_commitments?: number;
  overdue_commitments?: number;
  overdueCommitmentsCount?: number;
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
    timestamp?: string;
    url?: string;
  };
  source_event_id?: string;
  evidence?: EvidenceReference[];
  source_evidence?: { chunk_id: string; excerpt: string; source_time?: string }[];
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
  decision_id?: string;
  readOnly?: boolean;
  overdue?: boolean;
  needsFollowUp?: boolean;
}

interface BackendFindingRaw {
  id: string | number;
  conversation_id?: string;
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
    conversation_id?: string;
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
    impact?: string;
    owner?: string;
    due_date?: string;
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
  created_at?: string;
}

export function transformBackendOverview(raw: BackendOverviewRaw = {}): DashboardMetrics {
  const activeCount = Number(raw.active_decisions ?? raw.activeDecisionsCount ?? 0);
  const pendingCount = Number(raw.pending_approvals ?? raw.pendingApprovalsCount ?? 0);
  const findingsCount = Number(raw.detected_conflicts ?? raw.detectedConflictsCount ?? 0);
  const openCommitments = Number(raw.open_commitments ?? raw.openCommitmentsCount ?? activeCount);

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

  // Honest trends: empty array when unavailable, never fabricated
  const decisionTrend =
    Array.isArray(raw.decisionTrend) && raw.decisionTrend.length > 0 ? raw.decisionTrend : [];

  return {
    activeDecisionsCount: activeCount,
    openCommitmentsCount: openCommitments,
    detectedConflictsCount: findingsCount,
    pendingApprovalsCount: pendingCount,
    overdueCommitmentsCount: Number(raw.overdue_commitments ?? raw.overdueCommitmentsCount ?? 0),
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

    // Honest confidence handling: only set when provided by backend, never fabricate
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

    const createdTime = d.created_at || d.createdAt || '';
    const updatedTime = d.updated_at || d.updatedAt || createdTime;

    return {
      id: String(d.id),
      title: d.title || topicTitle,
      summary: d.summary || commitmentText,
      whatWasDecided: d.whatWasDecided || commitmentText,
      participants:
        Array.isArray(d.participants) && d.participants.length > 0
          ? d.participants
          : d.owner
            ? [d.owner]
            : [],
      createdAt: createdTime,
      updatedAt: updatedTime,
      status: (d.status || (d.state === 'active' ? 'active' : 'superseded')) as DecisionStatus,
      sourceConversation: d.sourceConversation || {
        id: d.source_event_id || 'conv-omi',
        title: topicTitle,
        channel: 'Voice (Omi)',
        timestamp: updatedTime || createdTime || ''
      },
      // Prefer Codex source_evidence; fall back to PR #15 `evidence` (raw backend excerpts or
      // already-mapped references), normalised by mapBackendEvidence.
      evidence:
        d.source_evidence && d.source_evidence.length > 0
          ? d.source_evidence.map((item) => ({
              id: item.chunk_id,
              sourceType: 'meeting' as const,
              sourceTitle: 'Omi conversation',
              speakerOrAuthor: 'Unattributed',
              timestamp: item.source_time || '',
              quote: item.excerpt
            }))
          : mapBackendEvidence(d.evidence, topicTitle),
      confidence: confidenceVal,
      confidenceLevel: confidenceLevelVal,
      relatedCommitmentIds: d.relatedCommitmentIds || [String(d.id)],
      category: d.category || d.topic || 'Engineering',
      impactLevel: (d.impactLevel || 'medium') as ImpactLevel
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

    // Honest progress handling: only set when provided by backend
    const progressVal = d.progressPercentage != null ? Number(d.progressPercentage) : undefined;

    return {
      id: String(d.id),
      title: d.title || topicTitle,
      task: commitmentText,
      owner: d.owner || '',
      ownerAvatar: d.ownerAvatar,
      deadline: d.due_date || d.deadline || '',
      status: (d.status ||
        (d.state === 'active' ? 'in_progress' : 'completed')) as CommitmentStatus,
      priority: d.priority || undefined,
      relatedDecisionId: d.decision_id || String(d.id),
      relatedDecisionTitle: topicTitle,
      evidence: mapBackendEvidence(d.evidence, topicTitle),
      progressPercentage: progressVal,
      readOnly: d.readOnly ?? false,
      overdue: d.overdue ?? false,
      needsFollowUp: d.needsFollowUp ?? false
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
      const ev1 = f.conversation_id
        ? f.evidence?.find(
            (item) => item.conversation_id && item.conversation_id !== f.conversation_id
          )
        : f.evidence?.[0];
      const ev2 = f.conversation_id
        ? f.evidence?.find((item) => item.conversation_id === f.conversation_id)
        : f.evidence?.[1];

      // Honest vector similarity: only set when provided by Qdrant/backend
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

      const detectedTime = f.created_at || '';
      const prevTime = ev1?.source_time || detectedTime;
      const newerTime = ev2?.source_time || detectedTime;

      return {
        id: String(f.id),
        title: `Contradiction: ${topic}`,
        severity: ((f.severity as ImpactLevel) ||
          (f.confidence === 'high' ? 'high' : 'medium')) as ImpactLevel,
        explanation:
          f.explanation ||
          `Contradiction between historical agreement and new statement on ${topic}.`,
        status: (f.status === 'pending_approval'
          ? 'unresolved'
          : 'resolved') as ConflictResolutionStatus,
        detectedAt: detectedTime,
        previousDecision: {
          id: `prev-${f.id}`,
          title: `Prior Agreement: ${topic}`,
          timestamp: prevTime,
          decisionText: f.previous_value || ev1?.excerpt || 'Original agreement',
          source: 'Omi Memory',
          evidence: {
            id: ev1?.chunk_id || 'ev-1',
            sourceType: 'meeting',
            sourceTitle: 'Prior Conversation',
            speakerOrAuthor: 'Unattributed',
            timestamp: prevTime,
            quote: ev1?.excerpt || '',
            vectorSimilarity: sim1
          }
        },
        newerDecision: {
          id: `new-${f.id}`,
          title: `New Revision: ${topic}`,
          timestamp: newerTime,
          decisionText: f.new_value || ev2?.excerpt || 'Proposed change',
          source: 'Omi Memory',
          evidence: {
            id: ev2?.chunk_id || 'ev-2',
            sourceType: 'meeting',
            sourceTitle: 'Recent Meeting',
            speakerOrAuthor: 'Unattributed',
            timestamp: newerTime,
            quote: ev2?.excerpt || '',
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
          : r.action_payload?.kind === 'create_decision'
            ? 'create_decision'
            : r.action_payload?.kind === 'create_task'
              ? 'create_task'
              : 'request_clarification',
      proposedBy: `Lyzr Autonomous Guardian (${r.requester || 'Agent'})`,
      requestedAt: r.created_at || '',
      status: (r.status === 'pending'
        ? 'pending'
        : r.status === 'approved'
          ? 'approved'
          : r.status === 'clarified'
            ? 'clarified'
            : 'rejected') as ApprovalStatus,
      impactLevel: ((r.action_payload?.impact as ImpactLevel) || 'medium') as ImpactLevel,
      exactActionPreview: `${(r.action_payload?.kind || 'request clarification').replaceAll('_', ' ')}: '${r.action_payload?.topic || topic}' -> '${r.action_payload?.new_value || ''}'. Owner: ${r.action_payload?.owner || 'not specified'}. Due: ${r.action_payload?.due_date || 'not specified'}.`,
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
    const actType: ActivityType = mapAuditActionToActivityType(a.action, a.entity_type);

    const actionLabel = (a.action || 'event').replace(/_/g, ' ');
    return {
      id: String(a.id),
      type: actType,
      title: a.title || `Audit: ${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)}`,
      description:
        a.description ||
        `${a.actor_type || 'User'} recorded ${actionLabel} on ${a.entity_type || 'system'}`,
      timestamp: a.timestamp || a.created_at || '',
      actor: a.actor_id || a.actor || '',
      entityId: a.entity_id,
      entityType: a.entity_type,
      statusBadge: a.action
    };
  });
}

export interface BackendConversationRaw {
  id: string;
  source_event_id?: string;
  title?: string;
  overview?: string;
  transcript_preview?: string;
  normalized_transcript?: string;
  source_time?: string;
  created_at?: string;
  status?: string;
  chunks?: Array<{ id: string; excerpt: string; vector_point_id?: string; source_time?: string }>;
}

export function transformBackendConversations(items: unknown[]): OmiConversation[] {
  if (!Array.isArray(items)) return [];
  return items.map((rawItem: unknown) => {
    const c = rawItem as BackendConversationRaw;
    return {
      id: String(c.id),
      sourceEventId: c.source_event_id,
      title: c.title,
      overview: c.overview,
      transcriptPreview:
        c.transcript_preview ||
        (c.normalized_transcript
          ? c.normalized_transcript.slice(0, 140) + '...'
          : 'No transcript available'),
      sourceTime: c.source_time || '',
      createdAt: c.created_at || '',
      status: (c.status || 'pending') as OmiConversation['status']
    };
  });
}

export function transformBackendConversationDetail(raw: unknown): OmiConversationDetail {
  const c = (raw || {}) as BackendConversationRaw;
  const chunks = Array.isArray(c.chunks)
    ? c.chunks.map((chk) => ({
        id: String(chk.id),
        excerpt: chk.excerpt || '',
        vectorPointId: chk.vector_point_id,
        sourceTime: chk.source_time
      }))
    : [];

  return {
    id: String(c.id || ''),
    sourceEventId: c.source_event_id,
    title: c.title,
    overview: c.overview,
    transcriptPreview:
      c.transcript_preview ||
      (c.normalized_transcript ? c.normalized_transcript.slice(0, 140) + '...' : ''),
    normalizedTranscript: c.normalized_transcript || '',
    sourceTime: c.source_time || '',
    createdAt: c.created_at || '',
    status: (c.status || 'pending') as OmiConversation['status'],
    chunks
  };
}
