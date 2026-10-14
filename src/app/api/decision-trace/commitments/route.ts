import { NextRequest, NextResponse } from 'next/server';
import { FIXTURE_COMMITMENTS } from '@/features/decision-trace/data/fixtures';
import { verifyDecisionTraceAuth, isDevPreviewEnabled } from '@/lib/decision-trace-auth';

export const dynamic = 'force-dynamic';

interface RawCommitment {
  id: string | number;
  title?: string;
  topic?: string;
  task?: string;
  current_commitment?: string;
  owner?: string;
  ownerAvatar?: string;
  due_date?: string;
  deadline?: string;
  status?: 'backlog' | 'in_progress' | 'blocked' | 'completed';
  state?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  evidence?: unknown[];
  decision_id?: string;
  readOnly?: boolean;
  overdue?: boolean;
  needsFollowUp?: boolean;
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
      let res = await fetch(`${backendUrl}/commitments?${searchParams.toString()}`, {
        headers: authResult.headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      }).catch(() => null);

      if (!res || !res.ok) {
        // Fallback to /decisions in Harshitha's architecture where decisions contain current_commitment
        res = await fetch(`${backendUrl}/decisions?${searchParams.toString()}`, {
          headers: authResult.headers,
          cache: 'no-store',
          signal: AbortSignal.timeout(10000)
        }).catch(() => null);
      }

      if (res && res.ok) {
        const raw = await res.json();
        const items: RawCommitment[] = Array.isArray(raw) ? raw : (raw.items ?? []);
        const mapped = items.map((d: RawCommitment) => {
          const topicTitle = (d.topic || 'Commitment')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c: string) => c.toUpperCase());
          return {
            id: String(d.id),
            title: d.title || topicTitle,
            task: d.task || d.current_commitment || topicTitle,
            owner: d.owner || 'Unassigned',
            ownerAvatar: d.ownerAvatar,
            deadline: d.due_date || d.deadline || 'Not specified',
            status: d.status || (d.state === 'active' ? 'in_progress' : 'completed'),
            priority: d.priority || 'high',
            relatedDecisionId: d.decision_id || String(d.id),
            relatedDecisionTitle: topicTitle,
            evidence: Array.isArray(d.evidence) ? d.evidence : [],
            progressPercentage: undefined,
            readOnly: d.readOnly ?? false,
            overdue: d.overdue ?? false,
            needsFollowUp: d.needsFollowUp ?? false
          };
        });
        return NextResponse.json(mapped);
      }
    } catch {
      // Backend probe failed
    }
  }

  if (isDevPreviewEnabled()) {
    const status = searchParams.get('status');
    const owner = searchParams.get('owner');
    const priority = searchParams.get('priority');

    let items = [...FIXTURE_COMMITMENTS];
    if (status && status !== 'all') {
      items = items.filter((c) => c.status === status);
    }
    if (owner && owner !== 'all') {
      items = items.filter((c) => c.owner === owner);
    }
    if (priority && priority !== 'all') {
      items = items.filter((c) => c.priority === priority);
    }

    const res = NextResponse.json(items);
    res.headers.set('X-DecisionTrace-Mode', 'development-preview');
    return res;
  }

  return NextResponse.json({ error: 'Backend unavailable. Please retry.' }, { status: 503 });
}
