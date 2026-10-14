import { NextRequest, NextResponse } from 'next/server';
import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';
import { z } from 'zod';

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

  const payload = z
    .object({ status: z.enum(['backlog', 'in_progress', 'blocked', 'completed']) })
    .safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !payload.success)
    return NextResponse.json({ error: 'Invalid task ID or status.' }, { status: 400 });
  try {
    // This explicit human action changes task progress. Authoritative decision changes remain approval-gated.
    const result = await fetch(`${backendUrl}/commitments/${id}`, {
      method: 'PATCH',
      headers: authResult.headers,
      body: JSON.stringify(payload.data),
      signal: AbortSignal.timeout(8000)
    });
    const data = await result.json();
    if (!result.ok) return NextResponse.json(data, { status: result.status });
    return NextResponse.json({
      id: data.id,
      title: data.title,
      task: data.task,
      owner: data.owner || 'Unassigned',
      deadline: data.due_date || 'Not specified',
      status: data.status,
      priority: 'medium',
      relatedDecisionId: data.decision_id || '',
      relatedDecisionTitle: data.title,
      evidence: [],
      overdue: data.overdue,
      readOnly: false
    });
  } catch {
    return NextResponse.json(
      { error: 'Task status could not be saved. Please retry.' },
      { status: 502 }
    );
  }
}
