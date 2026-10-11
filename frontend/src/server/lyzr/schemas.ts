import { z } from 'zod';

export const ImpactLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export const PrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

// ============================================================================
// Agent 1: Commitment Extractor Schemas
// ============================================================================

export const ExtractedDecisionSchema = z.object({
  title: z.string().min(3),
  summary: z.string().min(5),
  whatWasDecided: z.string().min(5),
  participants: z.array(z.string()).default([]),
  category: z.string().default('Architecture'),
  impactLevel: ImpactLevelSchema.default('medium'),
  confidenceScore: z.number().min(0).max(100).default(80),
  evidenceQuote: z.string().min(3),
  speaker: z.string().min(1),
  timestamp: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || undefined),
  channelOrSource: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || undefined),
  isAmbiguous: z.boolean().default(false)
});

export const ExtractedCommitmentSchema = z.object({
  title: z.string().min(3),
  task: z.string().min(3),
  owner: z.string().min(1),
  deadline: z.string().min(1),
  priority: PrioritySchema.default('medium'),
  evidenceQuote: z.string().min(3),
  speaker: z.string().min(1),
  decisionReferenceTitle: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || undefined),
  isUncertainDeadline: z.boolean().default(false)
});

export const CommitmentExtractorResultSchema = z.object({
  decisions: z.array(ExtractedDecisionSchema).default([]),
  commitments: z.array(ExtractedCommitmentSchema).default([]),
  participants: z.array(z.string()).default([]),
  ungroundedClaims: z.array(z.string()).default([])
});

// ============================================================================
// Agent 2: Conflict Detector Schemas
// ============================================================================

export const DecisionSideSchema = z.object({
  id: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || ''),
  title: z.string().min(3),
  decisionText: z.string().min(3),
  source: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || 'Slack / Meeting'),
  evidenceQuote: z.string().min(3),
  speaker: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || 'Unknown'),
  timestamp: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || undefined)
});

export const DetectedConflictSchema = z.object({
  title: z.string().min(3),
  severity: ImpactLevelSchema.default('medium'),
  explanation: z.string().min(5),
  confidence: z.number().min(0).max(100).default(85),
  isDefiniteConflict: z.boolean().default(true),
  priorDecision: DecisionSideSchema,
  newDecision: DecisionSideSchema
});

export const ConflictDetectorResultSchema = z.object({
  conflicts: z.array(DetectedConflictSchema).default([]),
  hasConflicts: z.boolean().default(false),
  analyzedComparisonsCount: z.number().default(0),
  uncertainMatchesCount: z.number().default(0)
});

// ============================================================================
// Agent 3: Action Planner Schemas
// ============================================================================

export const ApprovalPayloadSchema = z.object({
  actionType: z.enum([
    'supersede_decision',
    'reassign_commitment',
    'override_conflict',
    'policy_exception',
    'pipeline_execution'
  ]),
  exactActionPreview: z.string().min(10),
  riskLevel: ImpactLevelSchema.default('high')
});

export const RecommendedActionSchema = z.object({
  id: z.string().default(() => `act-${Math.random().toString(36).substring(2, 9)}`),
  title: z.string().min(3),
  description: z.string().min(5),
  type: z.enum(['follow_up', 'unblock', 'deadline_alert', 'external_sync']).default('follow_up'),
  suggestedAssignee: z.string().default('Owner'),
  urgency: z.enum(['low', 'medium', 'high']).default('medium'),
  requiresApproval: z.boolean().default(false),
  targetEntityType: z.enum(['decision', 'commitment', 'conflict']).default('commitment'),
  targetEntityId: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v || undefined),
  approvalPayload: ApprovalPayloadSchema.optional()
});

export const ActionPlannerResultSchema = z.object({
  recommendedActions: z.array(RecommendedActionSchema).default([]),
  overdueCount: z.number().default(0),
  blockedCount: z.number().default(0),
  suggestedFollowUpsCount: z.number().default(0)
});
