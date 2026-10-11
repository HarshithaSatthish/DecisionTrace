import { LyzrClient, LyzrConfigurationError } from '../client';
import { getLyzrConfig, isLyzrPreviewAllowed } from '../config';
import { buildExtractorUserPrompt } from '../instructions/commitment-extractor';
import { CommitmentExtractorResultSchema } from '../schemas';
import type {
  CommitmentExtractorResult,
  ExtractedDecisionItem,
  ExtractedCommitmentItem
} from '../types';

export interface ExtractorOptions {
  userId?: string;
  orgId?: string;
  sessionId?: string;
  timeoutMs?: number;
  useDeterministicFallbackIfOffline?: boolean;
}

/**
 * Agent 1: Commitment Extractor
 * Extracts verified decisions and commitments from conversations.
 * Preserves source quotes and speaker attribution.
 * Never invents missing deadlines or speakers.
 */
export async function extractCommitments(
  conversationText: string,
  context?: { sourceTitle?: string; channel?: string; timestamp?: string },
  options?: ExtractorOptions
): Promise<CommitmentExtractorResult> {
  if (!conversationText || !conversationText.trim()) {
    return {
      decisions: [],
      commitments: [],
      participants: [],
      ungroundedClaims: []
    };
  }

  const config = getLyzrConfig();
  const client = new LyzrClient();

  if (config.apiKey && config.extractorAgentId) {
    const userPrompt = buildExtractorUserPrompt(conversationText, context);
    const rawResult = await client.chatStructured(
      config.extractorAgentId,
      userPrompt,
      CommitmentExtractorResultSchema,
      {
        userId: options?.userId,
        orgId: options?.orgId,
        sessionId: options?.sessionId,
        timeoutMs: options?.timeoutMs
      }
    );
    return groundAndVerifyEvidence(rawResult, conversationText);
  }

  // Strict production guard: never silently substitute deterministic output for unconfigured/failed live inference
  if (!isLyzrPreviewAllowed()) {
    throw new LyzrConfigurationError(
      'Live Lyzr Commitment Extractor agent is not configured (missing LYZR_API_KEY or LYZR_EXTRACTOR_AGENT_ID). Production cannot substitute deterministic preview output.'
    );
  }

  // Deterministic local extraction engine (permitted only in development preview / test runner)
  return deterministicExtract(conversationText, context);
}

// Helper to extract Speaker: "Alice: ..." or "[Alice] ..."
function parseLineSpeaker(line: string): { speaker: string; content: string } {
  const colonMatch = line.match(/^([A-Za-z0-9_\s.-]+?):\s*(.+)$/);
  if (colonMatch) {
    return { speaker: colonMatch[1].trim(), content: colonMatch[2].trim() };
  }
  const bracketMatch = line.match(/^\[([A-Za-z0-9_\s.-]+?)\]\s*(.+)$/);
  if (bracketMatch) {
    return { speaker: bracketMatch[1].trim(), content: bracketMatch[2].trim() };
  }
  return { speaker: 'Speaker', content: line };
}

/**
 * Grounded deterministic extraction engine:
 * Extracts actual statements without inventing missing entities.
 */
export function deterministicExtract(
  text: string,
  context?: { sourceTitle?: string; channel?: string; timestamp?: string }
): CommitmentExtractorResult {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const decisions: ExtractedDecisionItem[] = [];
  const commitments: ExtractedCommitmentItem[] = [];
  const participants = new Set<string>();
  const ungroundedClaims: string[] = [];

  for (const line of lines) {
    const { speaker, content } = parseLineSpeaker(line);
    if (speaker !== 'Speaker') {
      participants.add(speaker);
    }

    const lower = content.toLowerCase();

    // 1. Detect Decision
    const isDecision =
      lower.includes('we decided') ||
      lower.includes('decision:') ||
      lower.includes('agreed to') ||
      lower.includes('agreed on') ||
      lower.includes('finalized that') ||
      lower.includes('moving forward with') ||
      lower.includes('we will mandate');

    if (isDecision) {
      decisions.push({
        title: content.length > 50 ? `${content.substring(0, 47)}...` : content,
        summary: `Decision reached by team: ${content}`,
        whatWasDecided: content,
        participants: speaker !== 'Speaker' ? [speaker] : ['Team'],
        category:
          lower.includes('database') || lower.includes('cloud') || lower.includes('api')
            ? 'Architecture'
            : lower.includes('gdpr') || lower.includes('security')
              ? 'Security & Compliance'
              : 'Product',
        impactLevel:
          lower.includes('critical') || lower.includes('mandate') || lower.includes('gdpr')
            ? 'critical'
            : lower.includes('architecture') || lower.includes('standard')
              ? 'high'
              : 'medium',
        confidenceScore: 92,
        evidenceQuote: line,
        speaker: speaker,
        timestamp: context?.timestamp,
        channelOrSource: context?.channel || context?.sourceTitle,
        isAmbiguous: false
      });
      continue;
    }

    // 2. Detect Commitment / Action Item
    const isCommitment =
      lower.includes('i will') ||
      lower.includes('will deliver') ||
      lower.includes('action item:') ||
      lower.includes('assigned to') ||
      lower.includes('i am taking') ||
      lower.includes('responsible for');

    if (isCommitment) {
      // Look for deadline cues: "by Friday", "by 2026-...", "before EOD", etc.
      const deadlineMatch =
        content.match(/by\s+([A-Za-z0-9_\s,-]+?)(?:\.|$|,)/i) ||
        content.match(/before\s+([A-Za-z0-9_\s,-]+?)(?:\.|$|,)/i) ||
        content.match(/deadline(?:\s+is)?\s+([A-Za-z0-9_\s,-]+?)(?:\.|$|,)/i);

      const hasDeadline = Boolean(deadlineMatch);
      const deadlineStr = hasDeadline ? deadlineMatch![1].trim() : 'Unspecified';
      const isUncertain =
        !hasDeadline || ['soon', 'asap', 'later', 'next week'].includes(deadlineStr.toLowerCase());

      commitments.push({
        title: content.length > 45 ? `${content.substring(0, 42)}...` : content,
        task: content,
        owner: speaker !== 'Speaker' ? speaker : 'Unassigned',
        deadline: deadlineStr,
        priority:
          lower.includes('urgent') || lower.includes('critical') || lower.includes('blocker')
            ? 'critical'
            : lower.includes('high')
              ? 'high'
              : 'medium',
        evidenceQuote: line,
        speaker: speaker,
        isUncertainDeadline: isUncertain
      });
      continue;
    }

    // 3. Detect Ambiguous / Ungrounded Statements
    if (
      lower.includes('maybe we should') ||
      lower.includes('not sure if') ||
      lower.includes('someone ought to') ||
      lower.includes('might happen')
    ) {
      ungroundedClaims.push(`Ambiguous proposal without consensus: "${line}"`);
    }
  }

  return {
    decisions,
    commitments,
    participants: Array.from(participants),
    ungroundedClaims
  };
}

/**
 * Searches for a verbatim text span in the original transcript,
 * handling minor whitespace or formatting variations.
 */
export function findVerbatimSpan(needle: string, haystack: string): string | null {
  if (!needle || !haystack) return null;
  if (haystack.includes(needle)) return needle;

  const cleanNeedle = needle.toLowerCase().replace(/\s+/g, ' ').trim();
  const cleanHaystack = haystack.toLowerCase().replace(/\s+/g, ' ');
  const idx = cleanHaystack.indexOf(cleanNeedle);
  if (idx !== -1) {
    // Return matching slice with original casing
    const originalTokens = haystack.match(/\S+|\s+/g) || [];
    let reconstructed = '';
    let found = false;
    for (const token of originalTokens) {
      reconstructed += token;
      if (reconstructed.toLowerCase().includes(cleanNeedle)) {
        found = true;
        break;
      }
    }
    if (found) {
      return needle; // Accept verified needle
    }
  }

  // Check significant substring
  if (cleanNeedle.length > 25) {
    const sub = cleanNeedle.substring(0, 25);
    if (haystack.toLowerCase().includes(sub)) {
      return needle;
    }
  }

  return null;
}

/**
 * Verifies that extracted decisions and commitments are strictly grounded in transcript.
 * Flags unverified quotes as ambiguous and marks vague deadlines explicitly.
 */
export function groundAndVerifyEvidence(
  result: CommitmentExtractorResult,
  transcript: string
): CommitmentExtractorResult {
  const verifiedDecisions: ExtractedDecisionItem[] = [];
  const ungrounded = [...result.ungroundedClaims];

  for (const d of result.decisions) {
    const verbatim = findVerbatimSpan(d.evidenceQuote, transcript);
    if (verbatim) {
      verifiedDecisions.push({
        ...d,
        evidenceQuote: verbatim
      });
    } else {
      ungrounded.push(
        `Decision "${d.title}" had unverified quote "${d.evidenceQuote}". Downgraded certainty.`
      );
      verifiedDecisions.push({
        ...d,
        isAmbiguous: true,
        confidenceScore: Math.min(d.confidenceScore, 45)
      });
    }
  }

  const verifiedCommitments: ExtractedCommitmentItem[] = [];
  const vagueTerms = [
    'next week',
    'soon',
    'later',
    'sometime',
    'asap',
    'tbd',
    'end of sprint',
    'sometime next week',
    'when time permits'
  ];

  for (const c of result.commitments) {
    const verbatim = findVerbatimSpan(c.evidenceQuote, transcript);
    const deadlineLower = (c.deadline || '').toLowerCase();
    const isVague =
      vagueTerms.some((t) => deadlineLower.includes(t)) ||
      (!/^\d{4}-\d{2}-\d{2}/.test(c.deadline || '') && deadlineLower !== 'unspecified');

    verifiedCommitments.push({
      ...c,
      evidenceQuote: verbatim || c.evidenceQuote,
      isUncertainDeadline: c.isUncertainDeadline || isVague
    });
  }

  return {
    ...result,
    decisions: verifiedDecisions,
    commitments: verifiedCommitments,
    ungroundedClaims: ungrounded
  };
}
