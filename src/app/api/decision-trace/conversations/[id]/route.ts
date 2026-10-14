import { NextRequest, NextResponse } from 'next/server';
import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyDecisionTraceAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const { id } = await params;
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;

  if (backendUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${backendUrl}/conversations/${id}`, {
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

  return NextResponse.json(
    { error: 'Backend service unreachable', code: 'BACKEND_OFFLINE' },
    { status: 503 }
  );
}
