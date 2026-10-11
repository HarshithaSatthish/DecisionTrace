import { NextRequest, NextResponse } from 'next/server';
import { FIXTURE_DECISIONS } from '@/features/decision-trace/data/fixtures';
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
      const res = await fetch(`${backendUrl}/decisions?${searchParams.toString()}`, {
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
