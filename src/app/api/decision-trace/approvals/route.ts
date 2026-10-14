import { NextResponse } from 'next/server';
import { FIXTURE_APPROVALS } from '@/features/decision-trace/data/fixtures';
import { verifyDecisionTraceAuth, isDevPreviewEnabled } from '@/lib/decision-trace-auth';

interface RawApprovalPayload {
  kind?: string;
  topic?: string;
  new_value?: string;
  owner?: string;
  due_date?: string;
  target_decision_id?: string;
}

interface RawApproval {
  id: string | number;
  finding_id?: string | number;
  status?: string;
  action_payload?: RawApprovalPayload;
  requester?: string;
  execution_key?: string;
  created_at?: string;
  exactActionPreview?: string;
  title?: string;
  description?: string;
  actionType?: unknown;
  proposedBy?: string;
  requestedAt?: string;
  impactLevel?: unknown;
  targetEntityId?: string;
  targetEntityType?: unknown;
  evidence?: unknown[];
}

export const dynamic = 'force-dynamic';

export async function GET() {
  const authResult = await verifyDecisionTraceAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/approvals`, {
        headers: authResult.headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const raw = await res.json();
        const items: RawApproval[] = Array.isArray(raw) ? raw : (raw.items ?? []);
        const mapped = items.map((r: RawApproval) => {
          if (r.exactActionPreview && r.title) {
            return r; // Already in frontend format
          }
          const topic = (r.action_payload?.topic || 'Decision')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (c: string) => c.toUpperCase());
          return {
            id: String(r.id),
            title: `Approve Update: ${topic}`,
            description: `Agent proposes updating ${topic} to "${r.action_payload?.new_value || ''}".`,
            actionType:
              r.action_payload?.kind === 'request_decision_update'
                ? 'supersede_decision'
                : r.action_payload?.kind === 'create_decision'
                  ? 'create_decision'
                  : r.action_payload?.kind === 'create_task'
                    ? 'create_task'
                    : 'request_clarification',
            proposedBy: `Lyzr Autonomous Guardian (${r.requester || 'Agent'})`,
            requestedAt: r.created_at || new Date().toISOString(),
            status:
              r.status === 'pending'
                ? 'pending'
                : r.status === 'approved'
                  ? 'approved'
                  : r.status === 'clarified'
                    ? 'clarified'
                    : 'rejected',
            impactLevel: 'high',
            exactActionPreview: `${(r.action_payload?.kind || 'request clarification').replaceAll('_', ' ')}: '${r.action_payload?.topic || topic}' -> '${r.action_payload?.new_value || ''}'. Owner: ${r.action_payload?.owner || 'not specified'}. Due: ${r.action_payload?.due_date || 'not specified'}.`,
            targetEntityId: String(r.finding_id || r.id),
            targetEntityType: 'decision',
            evidence: r.evidence || []
          };
        });
        return NextResponse.json(mapped);
      }
    } catch {
      // Backend probe failed
    }
  }

  if (isDevPreviewEnabled()) {
    const res = NextResponse.json(FIXTURE_APPROVALS);
    res.headers.set('X-DecisionTrace-Mode', 'development-preview');
    return res;
  }

  return NextResponse.json({ error: 'Backend unavailable. Please retry.' }, { status: 503 });
}
