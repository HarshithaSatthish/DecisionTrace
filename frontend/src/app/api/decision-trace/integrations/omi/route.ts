import { NextRequest, NextResponse } from 'next/server';
import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authResult = await verifyDecisionTraceAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  const body = await request.json().catch(() => ({}));

  if (backendUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${backendUrl}/integrations/omi`, {
        method: 'POST',
        headers: authResult.headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
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

  return NextResponse.json(
    { error: 'Backend service unreachable', code: 'BACKEND_OFFLINE' },
    { status: 503 }
  );
}
