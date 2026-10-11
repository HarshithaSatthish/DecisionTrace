import { NextRequest, NextResponse } from 'next/server';
import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

      const res = await fetch(`${backendUrl}/commitments/${id}`, {
        method: 'PATCH',
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
            data.detail || data.error || `FastAPI backend update failed with status ${res.status}`,
          code: 'BACKEND_UPDATE_FAILED'
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

  // Without a connected backend, mutations cannot be persisted.
  return NextResponse.json(
    {
      success: false,
      error:
        'Backend service unreachable: Commitment updates require FastAPI backend persistence at DECISIONTRACE_BACKEND_URL. Mutation aborted to prevent unpersisted state.',
      code: 'BACKEND_OFFLINE',
      commitmentId: id
    },
    { status: 503 }
  );
}
