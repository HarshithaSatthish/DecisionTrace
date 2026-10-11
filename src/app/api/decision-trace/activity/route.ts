import { NextRequest, NextResponse } from 'next/server';
import { FIXTURE_ACTIVITY } from '@/features/decision-trace/data/fixtures';
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
      const res = await fetch(`${backendUrl}/activity?${searchParams.toString()}`, {
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
