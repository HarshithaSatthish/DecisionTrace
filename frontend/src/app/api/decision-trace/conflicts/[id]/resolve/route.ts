import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';
import { POST as executeApproval } from '@/app/api/decision-trace/approvals/[id]/route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyDecisionTraceAuth();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;
  const parsed = z
    .object({
      action: z.enum(['resolve', 'escalate', 'dismiss']),
      rationale: z.string().max(4000).optional(),
      approval_id: z.uuid().optional(),
      approvalId: z.uuid().optional()
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: 'An explicit resolve, escalate, or dismiss action is required.' },
      { status: 400 }
    );
  const backend = process.env.DECISIONTRACE_BACKEND_URL;
  if (!backend)
    return NextResponse.json(
      { error: 'Backend is not configured.', code: 'BACKEND_OFFLINE' },
      { status: 503 }
    );
  try {
    const suppliedId = parsed.data.approval_id || parsed.data.approvalId;
    const result = await fetch(
      suppliedId
        ? `${backend}/approvals/${suppliedId}`
        : `${backend}/approvals?limit=100&status=pending`,
      { headers: auth.headers, cache: 'no-store', signal: AbortSignal.timeout(8000) }
    );
    if (!result.ok)
      return NextResponse.json(
        { error: 'Unable to load approval for this conflict.' },
        { status: result.status }
      );
    const data = await result.json();
    const items = suppliedId ? [data] : data.items || [];
    const approval = items.find(
      (item: { id: string; finding_id: string; status: string }) =>
        item.status === 'pending' && (item.finding_id === id || item.id === id)
    );
    if (!approval)
      return NextResponse.json(
        { error: 'No pending approval found for this conflict.', code: 'APPROVAL_NOT_FOUND' },
        { status: 404 }
      );
    const action = { resolve: 'approve', escalate: 'clarify', dismiss: 'reject' }[
      parsed.data.action
    ];
    // Reuse the one approval executor so every caller gets the same validation and safety guards.
    const response = await executeApproval(
      new NextRequest(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          rationale: parsed.data.rationale,
          execution_key: approval.execution_key
        })
      }),
      { params: Promise.resolve({ id: approval.id }) }
    );
    const payload = await response.json();
    return NextResponse.json(
      { ...payload, conflictId: id, message: payload.executionSummary || payload.error },
      { status: response.status }
    );
  } catch {
    return NextResponse.json({ error: 'Conflict review failed. Please retry.' }, { status: 502 });
  }
}
