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

      // Conflict resolution in DecisionTrace is approval-gated.
      // 1. Locate the approval request for this conflict/finding
      let approvalId = body.approval_id || body.approvalId;
      let execKey = body.execution_key || body.executionKey;

      if (!approvalId) {
        // Query pending approvals to find matching finding_id or approval_id
        const listRes = await fetch(`${backendUrl}/approvals?limit=50`, {
          headers: authResult.headers,
          cache: 'no-store',
          signal: controller.signal
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          const items = Array.isArray(listData.items) ? listData.items : [];
          const match = items.find(
            (a: { id?: string; finding_id?: string }) =>
              String(a.id) === id || String(a.finding_id) === id
          );
          if (match) {
            approvalId = match.id;
            execKey = match.execution_key;
          }
        }
      }

      // If approval request was located, route through the approval-gated mutation endpoint
      if (approvalId) {
        const action = body.action || 'resolve';
        let targetEndpoint = '';
        let targetPayload: Record<string, unknown> = {};

        if (action === 'dismiss') {
          targetEndpoint = `${backendUrl}/approvals/${approvalId}/reject`;
          targetPayload = { reason: body.rationale || 'Dismissed by reviewer' };
        } else if (action === 'escalate') {
          targetEndpoint = `${backendUrl}/approvals/${approvalId}/clarify`;
          targetPayload = {
            clarification_request: body.rationale || 'Escalated for clarification'
          };
        } else {
          targetEndpoint = `${backendUrl}/approvals/${approvalId}/approve`;
          targetPayload = {
            execution_key: execKey || 'exec_key_auto',
            note: body.rationale || 'Resolved by human reviewer'
          };
        }

        const appRes = await fetch(targetEndpoint, {
          method: 'POST',
          headers: authResult.headers,
          body: JSON.stringify(targetPayload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const appData = await appRes.json().catch(() => ({}));
        if (appRes.ok) {
          return NextResponse.json({
            success: true,
            conflictId: id,
            approvalId,
            status: appData.status || 'resolved',
            message: appData.message || `Conflict ${id} resolved successfully through consensus approval.`,
            resultingDecision: appData.resulting_decision
          });
        }

        return NextResponse.json(
          {
            success: false,
            error: appData.detail || appData.error || `FastAPI approval failed with status ${appRes.status}`,
            code: 'APPROVAL_MUTATION_FAILED'
          },
          { status: appRes.status }
        );
      }

      clearTimeout(timeoutId);

      // If no approval request was found for this conflict
      return NextResponse.json(
        {
          success: false,
          error:
            `Conflict resolution requires an authoritative human approval request. No pending approval found for conflict ${id}.`,
          code: 'APPROVAL_NOT_FOUND',
          conflictId: id
        },
        { status: 404 }
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
        'Backend service unreachable: Conflict resolutions require FastAPI backend persistence at DECISIONTRACE_BACKEND_URL. Mutation aborted.',
      code: 'BACKEND_OFFLINE',
      conflictId: id
    },
    { status: 503 }
  );
}
