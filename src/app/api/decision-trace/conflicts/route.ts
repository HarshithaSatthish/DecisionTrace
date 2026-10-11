import { NextResponse } from 'next/server';
import { FIXTURE_CONFLICTS } from '@/features/decision-trace/data/fixtures';
import { verifyDecisionTraceAuth, isDevPreviewEnabled } from '@/lib/decision-trace-auth';

interface RawEvidenceChunk {
  chunk_id?: string;
  excerpt?: string;
  conversation_id?: string;
  source_time?: string;
}

interface RawFinding {
  id: string | number;
  previous_value?: string | null;
  new_value?: string | null;
  classification?: string;
  topic_key?: string;
  confidence?: string;
  explanation?: string;
  status?: string;
  created_at?: string;
  evidence?: RawEvidenceChunk[];
  previousDecision?: unknown;
  newerDecision?: unknown;
}

export const dynamic = 'force-dynamic';

export async function GET() {
  const authResult = await verifyDecisionTraceAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  if (backendUrl) {
    try {
      let res = await fetch(`${backendUrl}/conflicts`, {
        headers: authResult.headers,
        cache: 'no-store'
      }).catch(() => null);

      if (!res || !res.ok) {
        // Fallback to /findings in Harshitha's backend
        res = await fetch(`${backendUrl}/findings`, {
          headers: authResult.headers,
          cache: 'no-store'
        }).catch(() => null);
      }

      if (res && res.ok) {
        const raw = await res.json();
        const items: RawFinding[] = Array.isArray(raw) ? raw : (raw.items ?? []);
        const mapped = items
          .filter(
            (f: RawFinding) =>
              f.previous_value != null ||
              f.classification === 'possible_conflict' ||
              f.classification === 'superseding_change' ||
              f.previousDecision != null
          )
          .map((f: RawFinding) => {
            if (f.previousDecision && f.newerDecision) {
              return f; // Already formatted as Conflict
            }
            const topic = (f.topic_key || 'Commitment')
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (c: string) => c.toUpperCase());
            const ev1 = f.evidence?.[0];
            const ev2 = f.evidence?.[1] || ev1;

            return {
              id: String(f.id),
              title: `Contradiction: ${topic}`,
              severity: f.confidence === 'high' ? 'high' : 'medium',
              explanation:
                f.explanation ||
                `Contradiction between historical agreement and new statement on ${topic}.`,
              status: f.status === 'pending_approval' ? 'unresolved' : 'resolved',
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
                  vectorSimilarity: 0.94
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
                  vectorSimilarity: 0.96
                }
              }
            };
          });
        return NextResponse.json(mapped);
      }
    } catch {
      // Backend probe failed
    }
  }

  if (isDevPreviewEnabled()) {
    const res = NextResponse.json(FIXTURE_CONFLICTS);
    res.headers.set('X-DecisionTrace-Mode', 'development-preview');
    return res;
  }

  return NextResponse.json([]);
}
