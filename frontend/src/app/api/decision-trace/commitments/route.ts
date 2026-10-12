import { NextRequest, NextResponse } from 'next/server';
import { FIXTURE_COMMITMENTS } from '@/features/decision-trace/data/fixtures';
import { verifyDecisionTraceAuth, isDevPreviewEnabled } from '@/lib/decision-trace-auth';
import { transformBackendDecisionsToCommitments } from '@/features/decision-trace/api/transformers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await verifyDecisionTraceAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const { searchParams } = request.nextUrl;
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;

  if (backendUrl) {
    try {
      // Backend contract: commitments are derived from /decisions
      const res = await fetch(`${backendUrl}/decisions?${searchParams.toString()}`, {
        headers: authResult.headers,
        cache: 'no-store'
      });

      if (res.ok) {
        const raw = await res.json();
        const items = Array.isArray(raw) ? raw : (raw.items ?? []);
        return NextResponse.json(transformBackendDecisionsToCommitments(items));
      }
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          {
            error: res.status === 401 ? 'Unauthorized upstream request' : 'Forbidden upstream request',
            code: res.status === 401 ? 'UPSTREAM_UNAUTHORIZED' : 'UPSTREAM_FORBIDDEN'
          },
          { status: res.status }
        );
      }
      if (res.status >= 500) {
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
