import { NextRequest, NextResponse } from 'next/server';
import { FIXTURE_COMMITMENTS } from '@/features/decision-trace/data/fixtures';
import { verifyDecisionTraceAuth, isDevPreviewEnabled } from '@/lib/decision-trace-auth';

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
      const res = await fetch(`${backendUrl}/commitments?${searchParams.toString()}`, {
        headers: authResult.headers,
        cache: 'no-store'
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
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

  return NextResponse.json([]);
}
