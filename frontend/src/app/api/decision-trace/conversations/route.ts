import { NextRequest, NextResponse } from 'next/server';
import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await verifyDecisionTraceAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  const searchParams = request.nextUrl.searchParams;

  if (backendUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
      const res = await fetch(`${backendUrl}/conversations${qs}`, {
        headers: authResult.headers,
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }

      const errBody = await res.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: errBody.detail || errBody.error || `FastAPI responded with ${res.status}`,
          code: 'BACKEND_ERROR'
        },
        { status: res.status }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      return NextResponse.json(
        { error: `Failed to connect to FastAPI backend: ${message}`, code: 'BACKEND_UNREACHABLE' },
        { status: 502 }
      );
    }
  }

  // Preview / Offline Fallback
  return NextResponse.json({
    items: [],
    total: 0,
    limit: 20,
    offset: 0
  });
}
