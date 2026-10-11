import { NextRequest, NextResponse } from 'next/server';
import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await verifyDecisionTraceAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const { id } = await params;
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;

  if (!backendUrl) {
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

  // DecisionTrace Governance Policy:
  // Direct arbitrary mutation of commitment/decision states without an approved Action Payload
  // and execution key violates the Zero-Drift human-in-the-loop guarantee.
  // The FastAPI backend intentionally exposes only GET /decisions and GET /decisions/{id},
  // with mutations strictly routed through POST /api/v1/approvals/{id}/approve.
  return NextResponse.json(
    {
      success: false,
      error:
        'Direct unapproved commitment mutations are prevented by DecisionTrace governance policy. Changes must be proposed by an analysis agent and confirmed through the Approvals workflow with a valid execution key.',
      code: 'UNAPPROVED_MUTATION_PREVENTED',
      commitmentId: id,
      governanceRule: 'ZERO_AUTONOMOUS_DRIFT_HUMAN_IN_THE_LOOP'
    },
    { status: 405 }
  );
}
