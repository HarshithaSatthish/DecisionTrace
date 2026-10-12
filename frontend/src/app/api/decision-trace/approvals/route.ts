import { NextResponse } from 'next/server';
import { FIXTURE_APPROVALS } from '@/features/decision-trace/data/fixtures';
import { verifyDecisionTraceAuth, isDevPreviewEnabled } from '@/lib/decision-trace-auth';

interface RawApprovalPayload {
  kind?: string;
  topic?: string;
  new_value?: string;
  owner?: string;
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
        cache: 'no-store'
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
                : 'override_conflict',
            proposedBy: `Lyzr Autonomous Guardian (${r.requester || 'Agent'})`,
            requestedAt: r.created_at || new Date().toISOString(),
            status:
              r.status === 'pending'
                ? 'pending'
                : r.status === 'approved'
                  ? 'approved'
                  : 'rejected',
            impactLevel: 'high',
            exactActionPreview: `Execute atomic mutation on decision '${r.action_payload?.topic}' -> '${r.action_payload?.new_value}' (Key: ${r.execution_key})`,
            targetEntityId: String(r.finding_id || r.id),
            targetEntityType: 'decision',
            evidence: r.evidence || []
          };
        });
        return NextResponse.json(mapped);
      }
      if (res && (res.status === 401 || res.status === 403)) {
        return NextResponse.json(
          {
            error: res.status === 401 ? 'Unauthorized upstream request' : 'Forbidden upstream request',
            code: res.status === 401 ? 'UPSTREAM_UNAUTHORIZED' : 'UPSTREAM_FORBIDDEN'
          },
          { status: res.status }
        );
      }
      if (res && res.status >= 500) {
        return NextResponse.json(
          {
            error: `Upstream FastAPI backend error: HTTP ${res.status}`,
            code: 'UPSTREAM_BACKEND_ERROR'
          },
          { status: res.status }
        );
      }
    } catch (err: unknown) {
      if (!isDevPreviewEnabled()) {
        return NextResponse.json(
          {
            error: `Failed to connect to FastAPI backend: ${err instanceof Error ? err.message : 'Connection failed'}`,
            code: 'BACKEND_CONNECTION_FAILED'
          },
          { status: 503 }
        );
      }
    }
  }

  if (isDevPreviewEnabled()) {
    const res = NextResponse.json(FIXTURE_APPROVALS);
    res.headers.set('X-DecisionTrace-Mode', 'development-preview');
    return res;
  }

  return NextResponse.json([]);
}
