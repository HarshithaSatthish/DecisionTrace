import { NextRequest, NextResponse } from 'next/server';
import { FIXTURE_DECISIONS } from '@/features/decision-trace/data/fixtures';
import { verifyDecisionTraceAuth, isDevPreviewEnabled } from '@/lib/decision-trace-auth';

export const dynamic = 'force-dynamic';

interface RawDecision {
  id: string | number;
  title?: string;
  topic?: string;
  summary?: string;
  current_commitment?: string;
  whatWasDecided?: string;
  participants?: string[];
  owner?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  status?: 'active' | 'superseded' | 'under_review' | 'deprecated';
  state?: string;
  sourceConversation?: { id: string; title: string; channel: string; timestamp: string };
  source_event_id?: string;
  evidence?: unknown[];
  confidence?: number;
  confidenceLevel?: 'high' | 'medium' | 'low';
  relatedCommitmentIds?: string[];
  category?: string;
  impactLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export async function GET(request: NextRequest) {
  const authResult = await verifyDecisionTraceAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const { searchParams } = request.nextUrl;
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;

  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/decisions?${searchParams.toString()}`, {
        headers: authResult.headers,
        cache: 'no-store'
      });
      if (res.ok) {
        const raw = await res.json();
        const items: RawDecision[] = Array.isArray(raw) ? raw : (raw.items ?? []);
        const mapped = items.map((d: RawDecision) => {
          const topicTitle = (d.topic || 'Decision')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c: string) => c.toUpperCase());
          return {
            id: String(d.id),
            title: d.title || topicTitle,
            summary: d.summary || d.current_commitment || topicTitle,
            whatWasDecided: d.whatWasDecided || d.current_commitment || topicTitle,
            participants: Array.isArray(d.participants)
              ? d.participants
              : d.owner
                ? [d.owner]
                : ['Team'],
            createdAt: d.created_at || d.createdAt || new Date().toISOString(),
            updatedAt: d.updated_at || d.updatedAt || new Date().toISOString(),
            status: d.status || (d.state === 'active' ? 'active' : 'superseded'),
            sourceConversation: d.sourceConversation || {
              id: d.source_event_id || 'conv-omi',
              title: topicTitle,
              channel: 'Voice (Omi)',
              timestamp: d.updated_at || d.created_at || new Date().toISOString()
            },
            evidence: Array.isArray(d.evidence) ? d.evidence : [],
            confidence: d.confidence ?? 95,
            confidenceLevel: d.confidenceLevel || 'high',
            relatedCommitmentIds: d.relatedCommitmentIds || [String(d.id)],
            category: d.category || d.topic || 'Engineering',
            impactLevel: d.impactLevel || 'high'
          };
        });
        return NextResponse.json(mapped);
      }
      if (res && res.status >= 500) {
        return NextResponse.json(
          {
            error: `Upstream FastAPI backend error: HTTP ${res.status}`,
            code: 'UPSTREAM_BACKEND_ERROR'
          },
          { status: res.status }
        );
      }
    } catch (err: unknown) {
      if (!isDevPreviewEnabled()) {
        return NextResponse.json(
          {
            error: `Failed to connect to FastAPI backend: ${err instanceof Error ? err.message : 'Connection failed'}`,
            code: 'BACKEND_CONNECTION_FAILED'
          },
          { status: 503 }
        );
      }
    }
  }

  if (isDevPreviewEnabled()) {
    const search = searchParams.get('search')?.toLowerCase();
    const status = searchParams.get('status');

    let items = [...FIXTURE_DECISIONS];
    if (search) {
      items = items.filter(
        (d) =>
          d.title.toLowerCase().includes(search) ||
          d.whatWasDecided.toLowerCase().includes(search) ||
          d.summary.toLowerCase().includes(search)
      );
    }
    if (status && status !== 'all') {
      items = items.filter((d) => d.status === status);
    }

    const res = NextResponse.json(items);
    res.headers.set('X-DecisionTrace-Mode', 'development-preview');
    return res;
  }

  // Production offline: return empty list, never fake decisions
  return NextResponse.json([]);
}
