import { NextRequest, NextResponse } from 'next/server';
import { FIXTURE_ACTIVITY } from '@/features/decision-trace/data/fixtures';
import { verifyDecisionTraceAuth, isDevPreviewEnabled } from '@/lib/decision-trace-auth';
import { transformBackendActivity } from '@/features/decision-trace/api/transformers';

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
      const res = await fetch(`${backendUrl}/activity?${searchParams.toString()}`, {
        headers: authResult.headers,
        cache: 'no-store'
      });

      if (res.ok) {
        const raw = await res.json();
        const items = Array.isArray(raw) ? raw : (raw.items ?? []);
        return NextResponse.json(transformBackendActivity(items));
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
    const type = searchParams.get('type');
    const search = searchParams.get('search')?.toLowerCase();

    let items = [...FIXTURE_ACTIVITY];
    if (type && type !== 'all') {
      items = items.filter((a) => a.type === type);
    }
    if (search) {
      items = items.filter(
        (a) =>
          a.title.toLowerCase().includes(search) || a.description.toLowerCase().includes(search)
      );
    }

    const res = NextResponse.json(items);
    res.headers.set('X-DecisionTrace-Mode', 'development-preview');
    return res;
  }

  return NextResponse.json([]);
}
