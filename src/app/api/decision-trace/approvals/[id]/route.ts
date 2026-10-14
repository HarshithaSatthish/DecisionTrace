import { NextRequest, NextResponse } from 'next/server';
import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyDecisionTraceAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const { id } = await params;
  const parsed = z.object({
    action: z.enum(['approve', 'reject', 'clarify']),
    rationale: z.string().max(4000).optional(),
    execution_key: z.string().max(256).optional(),
    executionKey: z.string().max(256).optional()
  }).safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success) {
    return NextResponse.json({ error: 'A valid approval ID and explicit approve, reject, or clarify action are required.' }, { status: 400 });
  }
  const body = parsed.data;
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;

  // 1. If backend URL is configured, forward request to FastAPI with Clerk authentication
  if (backendUrl) {
    try {
      const signal = AbortSignal.timeout(8000);

      const action = body.action;
      let targetPath = '';
      let targetPayload: Record<string, unknown> = {};

      if (action === 'reject') {
        targetPath = `${backendUrl}/approvals/${id}/reject`;
        targetPayload = { reason: body.rationale || 'Rejected by reviewer' };
      } else if (action === 'clarify') {
        targetPath = `${backendUrl}/approvals/${id}/clarify`;
        targetPayload = {
          clarification_request:
            body.rationale || 'Clarification requested'
        };
      } else {
        // Approve: get execution_key if not supplied
        let execKey = body.execution_key || body.executionKey;
        if (!execKey) {
          try {
            const detailRes = await fetch(`${backendUrl}/approvals/${id}`, {
              headers: authResult.headers,
              cache: 'no-store',
              signal
            });
            if (detailRes.ok) {
              const detailData = await detailRes.json();
              execKey = detailData.execution_key;
            }
          } catch {
            return NextResponse.json({ error: 'Unable to load approval for review. Please retry.' }, { status: 502 });
          }
        }
        if (!execKey) {
          return NextResponse.json({ error: 'Approval execution key is unavailable. Reload the request before approving.' }, { status: 409 });
        }
        targetPath = `${backendUrl}/approvals/${id}/approve`;
        targetPayload = {
          execution_key: execKey,
          note: body.rationale || 'Confirmed by human reviewer'
        };
      }

      const res = await fetch(targetPath, {
        method: 'POST',
        headers: authResult.headers,
        body: JSON.stringify(targetPayload),
        signal
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return NextResponse.json({
          success: true,
          approvalId: id,
          status: data.status || 'approved',
          executionSummary:
            data.message ||
            `Approval executed successfully with status '${data.status || 'approved'}'`,
          resultingDecision: data.resulting_decision,
          details: data
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: data.detail || data.error || `Backend approval failed with status ${res.status}`,
          code: 'BACKEND_REJECTED'
        },
        { status: res.status }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      return NextResponse.json(
        {
          success: false,
          error: `Failed to connect to FastAPI backend at ${backendUrl}: ${message}`,
          code: 'BACKEND_CONNECTION_ERROR'
        },
        { status: 502 }
      );
    }
  }

  // 2. Truthful reporting: Backend specification is defined in docs/backend-integration-contract.md,
  // but Person 1's FastAPI server is not yet deployed on DECISIONTRACE_BACKEND_URL.
  // Frontend NEVER claims success or fakes state mutation!
  return NextResponse.json(
    {
      success: false,
      error:
        'Backend service unreachable: Person 1 FastAPI endpoint /api/v1/approvals/' +
        id +
        '/action is pending deployment. Approval actions are halted to prevent unverified mutations.',
      code: 'BACKEND_PENDING_DEPLOYMENT',
      contractReference: 'docs/backend-integration-contract.md'
    },
    { status: 503 }
  );
}
