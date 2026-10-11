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

  // 1. If backend URL is configured, forward request to FastAPI with Clerk authentication
  if (backendUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const action = body.action || 'approve';
      let targetPath = '';
      let targetPayload: Record<string, unknown> = {};

      if (action === 'reject') {
        targetPath = `${backendUrl}/approvals/${id}/reject`;
        targetPayload = { reason: body.rationale || body.reason || 'Rejected by reviewer' };
      } else if (action === 'clarify') {
        targetPath = `${backendUrl}/approvals/${id}/clarify`;
        targetPayload = {
          clarification_request:
            body.rationale || body.clarification_request || 'Clarification requested'
        };
      } else {
        // Approve: get execution_key if not supplied
        let execKey = body.execution_key || body.executionKey;
        if (!execKey) {
          try {
            const detailRes = await fetch(`${backendUrl}/approvals/${id}`, {
              headers: authResult.headers,
              cache: 'no-store'
            });
            if (detailRes.ok) {
              const detailData = await detailRes.json();
              execKey = detailData.execution_key;
            }
          } catch {
            // Non-fatal, try without or proceed
          }
        }
        targetPath = `${backendUrl}/approvals/${id}/approve`;
        targetPayload = {
          execution_key: execKey || 'exec_key_auto',
          note: body.rationale || body.note || 'Confirmed by human reviewer'
        };
      }

      let res = await fetch(targetPath, {
        method: 'POST',
        headers: authResult.headers,
        body: JSON.stringify(targetPayload),
        signal: controller.signal
      });

      // Backward compatibility fallback to /action if /approve or /reject returns 404
      if (res.status === 404) {
        res = await fetch(`${backendUrl}/approvals/${id}/action`, {
          method: 'POST',
          headers: authResult.headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });
      }

      clearTimeout(timeoutId);

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
