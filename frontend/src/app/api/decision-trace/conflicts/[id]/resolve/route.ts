import { NextRequest, NextResponse } from 'next/server';
import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyDecisionTraceAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;

  if (backendUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${backendUrl}/conflicts/${id}/resolve`, {
        method: 'POST',
        headers: authResult.headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return NextResponse.json(data);
      }

      return NextResponse.json(
        {
          success: false,
          error:
            data.detail ||
            data.error ||
            `FastAPI conflict resolution failed with status ${res.status}`,
          code: 'BACKEND_RESOLVE_FAILED'
        },
        { status: res.status }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error';
      return NextResponse.json(
        {
          success: false,
          error: `Failed to connect to FastAPI backend: ${message}`,
          code: 'BACKEND_UNREACHABLE'
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    {
      success: false,
      error:
        'Backend service unreachable: Conflict resolution requires FastAPI backend persistence at DECISIONTRACE_BACKEND_URL. Mutation aborted.',
      code: 'BACKEND_OFFLINE',
      conflictId: id
    },
    { status: 503 }
  );
}
