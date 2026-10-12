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
        cache: 'no-store'
      }).catch(() => null);

      if (!res || !res.ok) {
        // Fallback to /decisions in Harshitha's architecture where decisions contain current_commitment
        res = await fetch(`${backendUrl}/decisions?${searchParams.toString()}`, {
          headers: authResult.headers,
          cache: 'no-store'
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
            deadline: d.due_date || d.deadline || new Date().toISOString(),
            status: d.status || (d.state === 'active' ? 'in_progress' : 'completed'),
            priority: d.priority || 'high',
            relatedDecisionId: String(d.id),
            relatedDecisionTitle: topicTitle,
            evidence: Array.isArray(d.evidence) ? d.evidence : [],
            progressPercentage: d.state === 'active' ? 50 : 100
          };
        });
        return NextResponse.json(mapped);
      }
      if (res && (res.status === 401 || res.status === 403)) {
        return NextResponse.json(
          {
            error: res.status === 401 ? 'Unauthorized upstream request' : 'Forbidden upstream request',
            code: res.status === 401 ? 'UPSTREAM_UNAUTHORIZED' : 'UPSTREAM_FORBIDDEN'
          },
          { status: res.status }
        );
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

  return NextResponse.json([]);
}
