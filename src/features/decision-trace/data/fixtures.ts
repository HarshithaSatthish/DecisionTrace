import {
  Decision,
  Commitment,
  Conflict,
  ApprovalRequest,
  ActivityItem,
  DashboardMetrics
} from '../types';

export const IS_DEVELOPMENT_PREVIEW = true;

export const FIXTURE_DECISIONS: Decision[] = [
  {
    id: 'DEC-104',
    title: 'Default Batch Export Retention Window (90 Days)',
    summary:
      'Standardized lifecycle policy for all analytics raw parquet dumps across cloud buckets.',
    whatWasDecided:
      'All automated batch exports and data lake raw partitions shall be stored under a 90-day cold-tier retention lifecycle rule before automated archival.',
    participants: ['Sarah Chen', 'Marcus Rivera', 'Alex Turner'],
    createdAt: '2026-03-15T14:30:00Z',
    updatedAt: '2026-03-15T14:30:00Z',
    status: 'superseded',
    sourceConversation: {
      id: 'conv-slack-8821',
      title: 'Infra Storage Sync & Cost Architecture',
      channel: '#infra-core',
      timestamp: '2026-03-15T14:15:00Z',
      url: 'slack://channel?id=C048821&msg=1742048520'
    },
    evidence: [
      {
        id: 'ev-104-1',
        sourceType: 'slack',
        sourceTitle: '#infra-core Thread 8821',
        channelOrLocation: '#infra-core',
        speakerOrAuthor: 'Marcus Rivera',
        timestamp: '2026-03-15T14:22:10Z',
        quote:
          'Let us standardize cold storage lifecycle to 90 days for all raw parquet batches to balance cost against backfill needs.',
        vectorSimilarity: 0.96
      },
      {
        id: 'ev-104-2',
        sourceType: 'meeting',
        sourceTitle: 'Infrastructure Quarterly Cost Review',
        channelOrLocation: 'Google Meet Audio Recording',
        speakerOrAuthor: 'Sarah Chen',
        timestamp: '2026-03-15T14:28:45Z',
        quote:
          'Agreed. 90 days is safe for analytics teams to replay jobs without asking devops for Glacier restores.',
        vectorSimilarity: 0.91
      }
    ],
    confidence: 96,
    confidenceLevel: 'high',
    relatedCommitmentIds: ['COM-301'],
    category: 'Infrastructure & Storage',
    impactLevel: 'medium'
  },
  {
    id: 'DEC-188',
    title: 'GDPR Article 17 Mandate: 30-Day Export Auto-Purge',
    summary:
      'Strict regulatory data minimization policy overriding legacy retention for user data exports.',
    whatWasDecided:
      'All export files containing user-identifiable data, audit transcripts, or customer telemetry must be automatically purged within 30 days maximum.',
    participants: ['Elena Rostova', 'Sarah Chen', 'Jordan Kim'],
    createdAt: '2026-04-07T11:00:00Z',
    updatedAt: '2026-04-07T11:00:00Z',
    status: 'under_review',
    sourceConversation: {
      id: 'conv-meet-409',
      title: 'Q2 Compliance & Legal Security Sign-off',
      channel: 'Executive Security Review',
      timestamp: '2026-04-07T10:30:00Z',
      url: 'gmeet://meeting-id-sec-q2'
    },
    evidence: [
      {
        id: 'ev-188-1',
        sourceType: 'meeting',
        sourceTitle: 'Q2 Compliance & Legal Security Sign-off',
        speakerOrAuthor: 'Elena Rostova',
        timestamp: '2026-04-07T10:45:18Z',
        quote:
          'Customer PII export lifecycle cannot exceed 30 days under the updated GDPR Article 17 interpretation without exposing us to significant regulatory liability.',
        vectorSimilarity: 0.98
      }
    ],
    confidence: 94,
    confidenceLevel: 'high',
    relatedCommitmentIds: ['COM-302'],
    category: 'Compliance & Security',
    impactLevel: 'critical'
  },
  {
    id: 'DEC-205',
    title: 'Production Database Connection Pooling Limit (Max 120)',
    summary: 'Connection pool headroom adjustment for distributed container replicas.',
    whatWasDecided:
      'PgBouncer max client connections configured to 120 per replica with statement-level pooling and 500ms connection timeout.',
    participants: ['Alex Turner', 'Marcus Rivera'],
    createdAt: '2026-04-02T16:10:00Z',
    updatedAt: '2026-04-02T16:10:00Z',
    status: 'active',
    sourceConversation: {
      id: 'conv-slack-9904',
      title: 'DB Performance Degradation Post-Mortem',
      channel: '#eng-database',
      timestamp: '2026-04-02T15:40:00Z'
    },
    evidence: [
      {
        id: 'ev-205-1',
        sourceType: 'slack',
        sourceTitle: '#eng-database Channel Discussion',
        speakerOrAuthor: 'Alex Turner',
        timestamp: '2026-04-02T16:05:30Z',
        quote:
          'Increasing PgBouncer pool ceiling to 120 per container handled the synthetic load spike without starving master socket handles.',
        vectorSimilarity: 0.93
      }
    ],
    confidence: 91,
    confidenceLevel: 'high',
    relatedCommitmentIds: ['COM-303'],
    category: 'Database Architecture',
    impactLevel: 'high'
  },
  {
    id: 'DEC-219',
    title: 'Passkey & WebAuthn Primary Authentication Standard',
    summary: 'Deprecation of SMS OTP in favor of FIDO2 passkeys for enterprise SSO tiers.',
    whatWasDecided:
      'Phase out SMS two-factor verification by end of Q2; require WebAuthn/FIDO2 hardware passkeys or authenticator app TOTP for all organization admins.',
    participants: ['Jordan Kim', 'Elena Rostova', 'Priya Sharma'],
    createdAt: '2026-03-29T10:00:00Z',
    updatedAt: '2026-04-05T09:20:00Z',
    status: 'active',
    sourceConversation: {
      id: 'conv-doc-auth-rfc',
      title: 'RFC-44: Enterprise Zero-Trust Auth Architecture',
      channel: 'RFC Document Comments',
      timestamp: '2026-03-29T09:30:00Z'
    },
    evidence: [
      {
        id: 'ev-219-1',
        sourceType: 'document',
        sourceTitle: 'RFC-44 Sign-off Log',
        speakerOrAuthor: 'Jordan Kim',
        timestamp: '2026-03-29T09:55:00Z',
        quote:
          'SMS verification will be formally discontinued for tier-1 orgs. Passkey enrollment becomes default at next session re-auth.',
        vectorSimilarity: 0.97
      }
    ],
    confidence: 98,
    confidenceLevel: 'high',
    relatedCommitmentIds: ['COM-304'],
    category: 'Identity & Access',
    impactLevel: 'high'
  },
  {
    id: 'DEC-224',
    title: 'API Gateway Rate Limiting: 2,500 req/min for Standard API Keys',
    summary:
      'Token-bucket rate governor to protect public webhook endpoints from unthrottled bursts.',
    whatWasDecided:
      'Standard tier public API tokens capped at 2,500 requests per sliding 60-second window, with 429 response returning standard Retry-After headers.',
    participants: ['Marcus Rivera', 'Priya Sharma'],
    createdAt: '2026-04-09T13:45:00Z',
    updatedAt: '2026-04-09T13:45:00Z',
    status: 'active',
    sourceConversation: {
      id: 'conv-slack-api-88',
      title: 'API Gateway Quota Planning',
      channel: '#api-platform',
      timestamp: '2026-04-09T13:10:00Z'
    },
    evidence: [
      {
        id: 'ev-224-1',
        sourceType: 'slack',
        sourceTitle: '#api-platform Slack Discussion',
        speakerOrAuthor: 'Priya Sharma',
        timestamp: '2026-04-09T13:40:12Z',
        quote:
          '2,500 rpm accommodates 99.4% of legitimate enterprise traffic while throttling erratic loops before Redis CPU breaches 40%.',
        vectorSimilarity: 0.92
      }
    ],
    confidence: 89,
    confidenceLevel: 'medium',
    relatedCommitmentIds: ['COM-305'],
    category: 'API Platform',
    impactLevel: 'medium'
  }
];

export const FIXTURE_COMMITMENTS: Commitment[] = [
  {
    id: 'COM-301',
    title: 'Update S3 bucket lifecycle configurations to 90 days',
    task: 'Deploy Terraform module updating lifecycle policies for staging and production analytics buckets.',
    owner: 'Marcus Rivera',
    ownerAvatar: 'MR',
    deadline: '2026-04-14',
    status: 'completed',
    priority: 'medium',
    relatedDecisionId: 'DEC-104',
    relatedDecisionTitle: 'Default Batch Export Retention Window (90 Days)',
    evidence: [
      {
        id: 'ev-com-301',
        sourceType: 'slack',
        sourceTitle: '#infra-core',
        speakerOrAuthor: 'Marcus Rivera',
        timestamp: '2026-03-15T14:35:00Z',
        quote: 'I will push the Terraform PR to adjust the bucket lifecycle rule by Tuesday.'
      }
    ],
    progressPercentage: 100
  },
  {
    id: 'COM-302',
    title: 'Implement automated 30-day purge worker for GDPR export compliance',
    task: 'Write and schedule scheduled cron lambda to hard-delete customer export ZIPs older than 30 days.',
    owner: 'Sarah Chen',
    ownerAvatar: 'SC',
    deadline: '2026-04-18',
    status: 'in_progress',
    priority: 'critical',
    relatedDecisionId: 'DEC-188',
    relatedDecisionTitle: 'GDPR Article 17 Mandate: 30-Day Export Auto-Purge',
    evidence: [
      {
        id: 'ev-com-302',
        sourceType: 'meeting',
        sourceTitle: 'Compliance Review',
        speakerOrAuthor: 'Sarah Chen',
        timestamp: '2026-04-07T10:55:00Z',
        quote: 'I take ownership of shipping the automated purge job before next audit checkpoint.'
      }
    ],
    progressPercentage: 65
  },
  {
    id: 'COM-303',
    title: 'Benchmarking PgBouncer connection ceiling with 120 sockets',
    task: 'Execute synthetic load tests with k6 against pooler cluster to verify memory overhead.',
    owner: 'Alex Turner',
    ownerAvatar: 'AT',
    deadline: '2026-04-16',
    status: 'in_progress',
    priority: 'high',
    relatedDecisionId: 'DEC-205',
    relatedDecisionTitle: 'Production Database Connection Pooling Limit (Max 120)',
    evidence: [
      {
        id: 'ev-com-303',
        sourceType: 'slack',
        sourceTitle: '#eng-database',
        speakerOrAuthor: 'Alex Turner',
        timestamp: '2026-04-02T16:12:00Z',
        quote:
          'I will run the synthetic k6 load tests tomorrow morning to confirm socket memory overhead.'
      }
    ],
    progressPercentage: 40
  },
  {
    id: 'COM-304',
    title: 'Migrate enterprise admin users to FIDO2 WebAuthn authentication',
    task: 'Implement Clerk WebAuthn enforcement policy for organizations with SOC2 flag enabled.',
    owner: 'Jordan Kim',
    ownerAvatar: 'JK',
    deadline: '2026-04-20',
    status: 'backlog',
    priority: 'high',
    relatedDecisionId: 'DEC-219',
    relatedDecisionTitle: 'Passkey & WebAuthn Primary Authentication Standard',
    evidence: [
      {
        id: 'ev-com-304',
        sourceType: 'document',
        sourceTitle: 'RFC-44 Sign-off',
        speakerOrAuthor: 'Jordan Kim',
        timestamp: '2026-03-29T10:15:00Z',
        quote:
          'Jordan Kim committed to building the frontend enrollment prompt and fallback bypass flow.'
      }
    ],
    progressPercentage: 10
  },
  {
    id: 'COM-305',
    title: 'Deploy Redis rate-limiting cluster configs for 2,500 req/min rule',
    task: 'Configure envoy rate limiter filter with sliding window key partitions.',
    owner: 'Priya Sharma',
    ownerAvatar: 'PS',
    deadline: '2026-04-12',
    status: 'blocked',
    priority: 'medium',
    relatedDecisionId: 'DEC-224',
    relatedDecisionTitle: 'API Gateway Rate Limiting: 2,500 req/min',
    evidence: [
      {
        id: 'ev-com-305',
        sourceType: 'slack',
        sourceTitle: '#api-platform',
        speakerOrAuthor: 'Priya Sharma',
        timestamp: '2026-04-09T13:50:00Z',
        quote:
          'I will apply the rate limit Envoy filter once the Redis cluster replica sync finishes.'
      }
    ],
    blockerNotes: 'Waiting on Redis replica cluster network peering resolution in us-east-2.',
    progressPercentage: 30
  }
];

export const FIXTURE_CONFLICTS: Conflict[] = [
  {
    id: 'CONF-001',
    title: 'Contradictory Export Data Retention: 90 Days vs 30 Days Compliance Window',
    severity: 'critical',
    explanation:
      'Decision #DEC-104 established a 90-day cold storage retention window for all analytics export files to facilitate quarterly team backfills. Newer Decision #DEC-188 mandates strict automated deletion of all customer exports within 30 days under GDPR Article 17 data minimization regulations.',
    status: 'unresolved',
    detectedAt: '2026-04-08T09:15:00Z',
    previousDecision: {
      id: 'DEC-104',
      title: 'Default Batch Export Retention Window (90 Days)',
      timestamp: '2026-03-15T14:30:00Z',
      decisionText:
        'All team analytics export archives and raw parquet dumps shall be retained for 90 days before automated lifecycle purging.',
      source: '#infra-core Slack Thread 8821',
      evidence: {
        id: 'ev-conf-old',
        sourceType: 'slack',
        sourceTitle: '#infra-core Slack Thread',
        speakerOrAuthor: 'Marcus Rivera',
        timestamp: '2026-03-15T14:22:10Z',
        quote:
          'Standardize cold storage lifecycle to 90 days for all raw parquet batches to balance cost against backfill needs.',
        vectorSimilarity: 0.96
      }
    },
    newerDecision: {
      id: 'DEC-188',
      title: 'GDPR Article 17 Mandate: 30-Day Export Auto-Purge',
      timestamp: '2026-04-07T11:00:00Z',
      decisionText:
        'All export files containing user-identifiable data must be permanently erased after 30 days without exception.',
      source: 'Q2 Compliance & Legal Security Sign-off',
      evidence: {
        id: 'ev-conf-new',
        sourceType: 'meeting',
        sourceTitle: 'Executive Security Review',
        speakerOrAuthor: 'Elena Rostova',
        timestamp: '2026-04-07T10:45:18Z',
        quote:
          'Customer PII export lifecycle cannot exceed 30 days under the updated GDPR Article 17 interpretation without exposing us to significant regulatory liability.',
        vectorSimilarity: 0.98
      }
    }
  },
  {
    id: 'CONF-002',
    title: 'Discrepancy in Enterprise Admin MFA Policy Enforcement Timeline',
    severity: 'high',
    explanation:
      'Security RFC-44 specified immediate enforcement of hardware passkeys upon next login, whereas Organization Settings roadmap had scheduled a 60-day customer grace period before hard lockout.',
    status: 'unresolved',
    detectedAt: '2026-04-10T14:20:00Z',
    previousDecision: {
      id: 'DEC-192',
      title: 'Enterprise Customer MFA 60-Day Grace Period Transition',
      timestamp: '2026-03-20T16:00:00Z',
      decisionText:
        'Provide enterprise orgs a 60-day transition grace window with banner reminders.',
      source: 'Product Roadmap Sync',
      evidence: {
        id: 'ev-conf-002-old',
        sourceType: 'meeting',
        sourceTitle: 'Product Operations Sync',
        speakerOrAuthor: 'Sarah Chen',
        timestamp: '2026-03-20T16:15:00Z',
        quote:
          'Give customers 60 days to distribute hardware keys before locking out admin accounts.'
      }
    },
    newerDecision: {
      id: 'DEC-219',
      title: 'Passkey & WebAuthn Immediate Enforcement Standard',
      timestamp: '2026-03-29T10:00:00Z',
      decisionText:
        'Immediate mandatory passkey enrollment required on first session re-auth for all tier-1 administrators.',
      source: 'RFC-44 Sign-off Log',
      evidence: {
        id: 'ev-conf-002-new',
        sourceType: 'document',
        sourceTitle: 'RFC-44 Security Architecture',
        speakerOrAuthor: 'Jordan Kim',
        timestamp: '2026-03-29T09:55:00Z',
        quote:
          'Passkey enrollment becomes mandatory immediately upon next authentication to remediate penetration test findings.'
      }
    }
  }
];

export const FIXTURE_APPROVALS: ApprovalRequest[] = [
  {
    id: 'APP-042',
    title: 'Supersede Retention Policy DEC-104 with 30-Day GDPR Rule DEC-188',
    description:
      'Formal consensus approval to mark Decision #DEC-104 as superseded and enact the strict 30-day export bucket lifecycle rule.',
    actionType: 'supersede_decision',
    proposedBy: 'Elena Rostova (Compliance Lead)',
    requestedAt: '2026-04-08T10:00:00Z',
    status: 'pending',
    impactLevel: 'critical',
    exactActionPreview:
      'Executing this approval will update Decision #DEC-104 to status "superseded", activate Decision #DEC-188 across production policies, and trigger S3 lifecycle configuration updates reducing object TTL from 90 to 30 days.',
    targetEntityId: 'DEC-104',
    targetEntityType: 'decision',
    evidence: [
      {
        id: 'ev-app-042-1',
        sourceType: 'meeting',
        sourceTitle: 'Q2 Compliance & Legal Security Sign-off',
        speakerOrAuthor: 'Elena Rostova',
        timestamp: '2026-04-07T10:45:18Z',
        quote:
          'Customer PII export lifecycle cannot exceed 30 days under the updated GDPR Article 17 interpretation without exposing us to significant regulatory liability.',
        vectorSimilarity: 0.98
      }
    ]
  },
  {
    id: 'APP-043',
    title: 'Approve Database PgBouncer Pool Scaling to 120 per Container',
    description:
      'Authorize deployment of PgBouncer max client connections increase from 50 to 120 across all Kubernetes production pods.',
    actionType: 'pipeline_execution',
    proposedBy: 'Alex Turner (Infrastructure Engineer)',
    requestedAt: '2026-04-10T11:30:00Z',
    status: 'pending',
    impactLevel: 'high',
    exactActionPreview:
      'Executing this approval triggers GitOps pipeline deploy to production cluster, applying ConfigMap pgbouncer-config max_client_conn=120 and rolling restart of 6 stateful database proxy pods.',
    targetEntityId: 'DEC-205',
    targetEntityType: 'decision',
    evidence: [
      {
        id: 'ev-app-043-1',
        sourceType: 'slack',
        sourceTitle: '#eng-database Channel Discussion',
        speakerOrAuthor: 'Alex Turner',
        timestamp: '2026-04-02T16:05:30Z',
        quote:
          'Increasing PgBouncer pool ceiling to 120 per container handled the synthetic load spike without starving master socket handles.',
        vectorSimilarity: 0.93
      }
    ]
  },
  {
    id: 'APP-044',
    title: 'Authorize Reassignment of Blocker Commitment COM-305',
    description:
      'Reassign Envoy Rate Limiter deployment from Priya Sharma to Alex Turner due to Redis VPC peering dependencies.',
    actionType: 'reassign_commitment',
    proposedBy: 'Marcus Rivera (Engineering Manager)',
    requestedAt: '2026-04-11T09:15:00Z',
    status: 'pending',
    impactLevel: 'medium',
    exactActionPreview:
      'Executing this approval updates owner of Commitment #COM-305 to Alex Turner, unblocks the task status, and notifies relevant Slack channels.',
    targetEntityId: 'COM-305',
    targetEntityType: 'commitment',
    evidence: [
      {
        id: 'ev-app-044-1',
        sourceType: 'slack',
        sourceTitle: '#api-platform',
        speakerOrAuthor: 'Marcus Rivera',
        timestamp: '2026-04-11T09:05:00Z',
        quote:
          'Alex has network admin permissions for us-east-2 VPC peering and can unblock COM-305 immediately.'
      }
    ]
  }
];

export const FIXTURE_ACTIVITY: ActivityItem[] = [
  {
    id: 'ACT-901',
    type: 'conflict_detected',
    title: 'Contradiction Detected: Export Retention Rule',
    description:
      'Lyzr Guardian identified contradiction between DEC-104 (90 days) and DEC-188 (30 days GDPR Article 17 mandate).',
    timestamp: '2026-04-11T09:15:00Z',
    actor: 'DecisionTrace Guardian (Autonomous)',
    entityId: 'CONF-001',
    entityType: 'conflict',
    evidence: [
      {
        id: 'ev-act-1',
        sourceType: 'meeting',
        sourceTitle: 'Security Review & #infra-core cross-analysis',
        speakerOrAuthor: 'Elena Rostova vs Marcus Rivera',
        timestamp: '2026-04-08T09:15:00Z',
        quote:
          'Conflict similarity threshold breached (0.97 contradiction score in Qdrant cluster).'
      }
    ],
    statusBadge: 'Critical Conflict'
  },
  {
    id: 'ACT-902',
    type: 'approval_requested',
    title: 'Consensus Approval Requested for Policy Supersession',
    description:
      'Approval #APP-042 submitted to supersede DEC-104 in favor of GDPR 30-day compliance.',
    timestamp: '2026-04-10T16:45:00Z',
    actor: 'Elena Rostova',
    entityId: 'APP-042',
    entityType: 'approval',
    statusBadge: 'Pending Review'
  },
  {
    id: 'ACT-903',
    type: 'decision_extracted',
    title: 'Extracted Decision: API Gateway Rate Limiting at 2,500 rpm',
    description:
      'Autonomous extraction from #api-platform conversation verified with 89% confidence against Qdrant vector index.',
    timestamp: '2026-04-09T13:45:00Z',
    actor: 'Lyzr Decision Extractor',
    entityId: 'DEC-224',
    entityType: 'decision',
    statusBadge: 'Active Decision'
  },
  {
    id: 'ACT-904',
    type: 'commitment_updated',
    title: 'Commitment #COM-301 Marked Completed',
    description:
      'Marcus Rivera finished Terraform S3 bucket lifecycle module deployment with verification hash 9f8a2c.',
    timestamp: '2026-04-08T17:20:00Z',
    actor: 'Marcus Rivera',
    entityId: 'COM-301',
    entityType: 'commitment',
    statusBadge: 'Completed'
  },
  {
    id: 'ACT-905',
    type: 'conversation_processed',
    title: 'Processed Audio & Transcript: Executive Security Review',
    description:
      'Processed 42 minutes of Google Meet audio. Extracted 1 high-confidence decision and 2 action commitments.',
    timestamp: '2026-04-07T11:15:00Z',
    actor: 'Audio Ingestion Pipeline',
    entityId: 'conv-meet-409',
    entityType: 'conversation',
    statusBadge: 'Ingestion Verified'
  }
];

export const FIXTURE_METRICS: DashboardMetrics = {
  activeDecisionsCount: 4,
  openCommitmentsCount: 4,
  detectedConflictsCount: 2,
  pendingApprovalsCount: 3,
  decisionTrend: [
    { period: 'Jan 2026', decisions: 14, commitments: 10 },
    { period: 'Feb 2026', decisions: 19, commitments: 16 },
    { period: 'Mar 2026', decisions: 26, commitments: 22 },
    { period: 'Apr 2026', decisions: 31, commitments: 28 }
  ],
  attentionItems: [
    {
      id: 'CONF-001',
      type: 'conflict',
      title: 'Export Retention Contradiction: 90 Days vs 30 Days GDPR Rule',
      severity: 'critical',
      actionUrl: '/dashboard/conflicts',
      time: 'Detected 2d ago'
    },
    {
      id: 'APP-042',
      type: 'approval',
      title: 'Supersede DEC-104 with 30-Day GDPR Compliance Rule',
      severity: 'critical',
      actionUrl: '/dashboard/approvals',
      time: 'Awaiting consensus'
    },
    {
      id: 'CONF-002',
      type: 'conflict',
      title: 'Enterprise Admin MFA Grace Period vs Immediate Lockout',
      severity: 'high',
      actionUrl: '/dashboard/conflicts',
      time: 'Detected 1d ago'
    },
    {
      id: 'COM-305',
      type: 'commitment',
      title: 'Deploy Redis Rate-Limiting Cluster Configs (Blocked)',
      severity: 'medium',
      actionUrl: '/dashboard/commitments',
      time: 'Blocked in us-east-2'
    }
  ],
  recentActivity: FIXTURE_ACTIVITY
};
