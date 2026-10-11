import { LyzrClient, LyzrConfigurationError } from '../client';
import { getLyzrConfig, isLyzrPreviewAllowed } from '../config';
import { buildConflictUserPrompt } from '../instructions/conflict-detector';
import { ConflictDetectorResultSchema } from '../schemas';
import type { ConflictDetectorResult, DetectedConflictItem, ExtractedDecisionItem } from '../types';
import type { Decision } from '@/features/decision-trace/types';

export interface ConflictDetectorOptions {
  userId?: string;
  orgId?: string;
  sessionId?: string;
  timeoutMs?: number;
}

/**
 * Agent 2: Conflict Detector
 * Compares candidate decisions with previously recorded decisions.
 * Detects contradictions, changed deadlines, and incompatible commitments.
 * Returns supporting evidence from both sources.
 */
export async function detectConflicts(
  newDecisions: ExtractedDecisionItem[],
  existingDecisions: Decision[] = [],
  options?: ConflictDetectorOptions
): Promise<ConflictDetectorResult> {
  if (newDecisions.length === 0 || existingDecisions.length === 0) {
    return {
      conflicts: [],
      hasConflicts: false,
      analyzedComparisonsCount: 0,
      uncertainMatchesCount: 0
    };
  }

  const config = getLyzrConfig();
  const client = new LyzrClient();

  if (config.apiKey && config.conflictAgentId) {
    const userPrompt = buildConflictUserPrompt(
      newDecisions.map((d) => ({
        title: d.title,
        whatWasDecided: d.whatWasDecided,
        evidenceQuote: d.evidenceQuote,
        speaker: d.speaker
      })),
      existingDecisions.map((d) => ({
        id: d.id,
        title: d.title,
        whatWasDecided: d.whatWasDecided,
        evidenceQuote: d.evidence[0]?.quote || d.summary,
        speaker: d.evidence[0]?.speakerOrAuthor || 'System',
        sourceTitle: d.sourceConversation?.title
      }))
    );

    return await client.chatStructured(
      config.conflictAgentId,
      userPrompt,
      ConflictDetectorResultSchema,
      {
        userId: options?.userId,
        orgId: options?.orgId,
        sessionId: options?.sessionId,
        timeoutMs: options?.timeoutMs
      }
    );
  }

  // Strict production guard: never silently substitute deterministic output for unconfigured/failed live inference
  if (!isLyzrPreviewAllowed()) {
    throw new LyzrConfigurationError(
      'Live Lyzr Conflict Detector agent is not configured (missing LYZR_API_KEY or LYZR_CONFLICT_AGENT_ID). Production cannot substitute deterministic preview output.'
    );
  }

  // Deterministic conflict detector engine (permitted only in development preview / test runner)
  return deterministicDetectConflicts(newDecisions, existingDecisions);
}

/**
 * Deterministic semantic comparison engine:
 * Compares topics, numbers, retention periods, deadlines, and direct opposing positions.
 */
export function deterministicDetectConflicts(
  newDecisions: ExtractedDecisionItem[],
  existingDecisions: Decision[]
): ConflictDetectorResult {
  const conflicts: DetectedConflictItem[] = [];
  let analyzedCount = 0;
  let uncertainMatchesCount = 0;

  for (const nd of newDecisions) {
    const newText = `${nd.title} ${nd.whatWasDecided}`.toLowerCase();

    for (const ed of existingDecisions) {
      analyzedCount++;
      const oldText = `${ed.title} ${ed.whatWasDecided}`.toLowerCase();

      // Check 1: Retention Period / Days Contradiction
      // e.g. "90 days" vs "30 days"
      const newDaysMatch = newText.match(/(\d+)\s*(?:day|days|month|months|year|years)/);
      const oldDaysMatch = oldText.match(/(\d+)\s*(?:day|days|month|months|year|years)/);

      if (
        newDaysMatch &&
        oldDaysMatch &&
        newDaysMatch[0] !== oldDaysMatch[0] &&
        (newText.includes('retention') ||
          newText.includes('retain') ||
          newText.includes('audit') ||
          newText.includes('log') ||
          newText.includes('gdpr') ||
          newText.includes('purge')) &&
        (oldText.includes('retention') ||
          oldText.includes('retain') ||
          oldText.includes('audit') ||
          oldText.includes('log') ||
          oldText.includes('gdpr') ||
          oldText.includes('purge'))
      ) {
        conflicts.push({
          title: `Data Retention Contradiction: ${newDaysMatch[0]} vs ${oldDaysMatch[0]}`,
          severity: 'critical',
          explanation: `New decision states "${newDaysMatch[0]}" whereas established decision ${ed.id} mandates "${oldDaysMatch[0]}". These requirements are mutually incompatible.`,
          confidence: 96,
          isDefiniteConflict: true,
          priorDecision: {
            id: ed.id,
            title: ed.title,
            decisionText: ed.whatWasDecided,
            source: ed.sourceConversation?.title || 'Prior Architectural Registry',
            evidenceQuote: ed.evidence[0]?.quote || ed.whatWasDecided,
            speaker: ed.evidence[0]?.speakerOrAuthor || 'Architecture Board',
            timestamp: ed.createdAt
          },
          newDecision: {
            title: nd.title,
            decisionText: nd.whatWasDecided,
            source: nd.channelOrSource || 'Current Discussion',
            evidenceQuote: nd.evidenceQuote,
            speaker: nd.speaker,
            timestamp: nd.timestamp
          }
        });
        continue;
      }

      // Check 2: Contradictory Architecture / Technology Stack
      // e.g. "MongoDB" vs "PostgreSQL", "REST" vs "gRPC"
      const stackKeywords = [
        ['postgresql', 'mongodb'],
        ['mysql', 'dynamodb'],
        ['rest', 'graphql'],
        ['aws', 'azure'],
        ['gcp', 'aws']
      ];

      let detectedTechContradiction = false;
      for (const [techA, techB] of stackKeywords) {
        if (
          (newText.includes(techA) && oldText.includes(techB)) ||
          (newText.includes(techB) && oldText.includes(techA))
        ) {
          detectedTechContradiction = true;
          conflicts.push({
            title: `Technology Standard Contradiction: ${techA.toUpperCase()} vs ${techB.toUpperCase()}`,
            severity: 'high',
            explanation: `Discussion proposed adopting ${newText.includes(techA) ? techA.toUpperCase() : techB.toUpperCase()}, contradicting approved baseline ${ed.id} adopting ${oldText.includes(techA) ? techA.toUpperCase() : techB.toUpperCase()}.`,
            confidence: 91,
            isDefiniteConflict: true,
            priorDecision: {
              id: ed.id,
              title: ed.title,
              decisionText: ed.whatWasDecided,
              source: ed.sourceConversation?.title || 'Architecture Registry',
              evidenceQuote: ed.evidence[0]?.quote || ed.whatWasDecided,
              speaker: ed.evidence[0]?.speakerOrAuthor || 'System',
              timestamp: ed.createdAt
            },
            newDecision: {
              title: nd.title,
              decisionText: nd.whatWasDecided,
              source: nd.channelOrSource || 'Current Discussion',
              evidenceQuote: nd.evidenceQuote,
              speaker: nd.speaker,
              timestamp: nd.timestamp
            }
          });
          break;
        }
      }

      if (detectedTechContradiction) continue;

      // Check 3: General contradiction with opposing polarity (e.g., mandate vs deprecate / forbid)
      if (
        (newText.includes('deprecat') ||
          newText.includes('forbid') ||
          newText.includes('disallow')) &&
        (oldText.includes('mandat') ||
          oldText.includes('require') ||
          oldText.includes('standard')) &&
        ed.category === nd.category
      ) {
        conflicts.push({
          title: `Policy Conflict in ${nd.category}`,
          severity: 'high',
          explanation: `New decision prohibits or deprecates a workflow previously mandated by decision ${ed.id}.`,
          confidence: 88,
          isDefiniteConflict: true,
          priorDecision: {
            id: ed.id,
            title: ed.title,
            decisionText: ed.whatWasDecided,
            source: ed.sourceConversation?.title || 'Corporate Guidelines',
            evidenceQuote: ed.evidence[0]?.quote || ed.whatWasDecided,
            speaker: ed.evidence[0]?.speakerOrAuthor || 'Board',
            timestamp: ed.createdAt
          },
          newDecision: {
            title: nd.title,
            decisionText: nd.whatWasDecided,
            source: nd.channelOrSource || 'Current Discussion',
            evidenceQuote: nd.evidenceQuote,
            speaker: nd.speaker,
            timestamp: nd.timestamp
          }
        });
        continue;
      }

      // Check 4: Uncertain similarity (same category, high lexical overlap, but no explicit contradiction)
      if (ed.category === nd.category && nd.confidenceScore < 60) {
        uncertainMatchesCount++;
      }
    }
  }

  return {
    conflicts,
    hasConflicts: conflicts.length > 0,
    analyzedComparisonsCount: analyzedCount,
    uncertainMatchesCount
  };
}
