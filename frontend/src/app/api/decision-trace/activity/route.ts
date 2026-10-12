import { NextRequest, NextResponse } from 'next/server';
import { FIXTURE_ACTIVITY } from '@/features/decision-trace/data/fixtures';
import { verifyDecisionTraceAuth, isDevPreviewEnabled } from '@/lib/decision-trace-auth';

interface RawAuditEvent {
  id: string | number;
  action?: string;
  actor_type?: string;
  actor_id?: string;
  actor?: string;
  entity_type?: 'decision' | 'commitment' | 'conflict' | 'approval' | 'conversation';
  entity_id?: string;
  timestamp?: string;
  title?: string;
  description?: string;
  type?: unknown;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await verifyDecisionTraceAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const { searchParams } = request.nextUrl;
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;

  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/activity?${searchParams.toString()}`, {
        headers: authResult.headers,
        cache: 'no-store'
      });
      if (res.ok) {
        const raw = await res.json();
        const items: RawAuditEvent[] = Array.isArray(raw) ? raw : (raw.items ?? []);
        const mapped = items.map((a: RawAuditEvent) => {
          if (a.title && a.description && a.type) {
            return a; // Already ActivityItem format
          }
          let actType = 'conversation_processed';
          if (a.action?.includes('decision')) actType = 'decision_extracted';
          else if (a.action?.includes('conflict') || a.action?.includes('finding'))
            actType = 'conflict_detected';
          else if (a.action?.includes('approve') || a.action?.includes('executed'))
            actType = 'approval_executed';
          else if (a.action?.includes('request')) actType = 'approval_requested';
          else if (a.action?.includes('update')) actType = 'commitment_updated';

          const actionLabel = (a.action || 'event').replace(/_/g, ' ');
          return {
            id: String(a.id),
            type: actType,
            title:
              a.title || `Audit: ${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)}`,
            description:
              a.description ||
              `${a.actor_type || 'User'} recorded ${actionLabel} on ${a.entity_type || 'system'}`,
            timestamp: a.timestamp || new Date().toISOString(),
            actor: a.actor_id || a.actor || 'System',
            entityId: a.entity_id,
            entityType: a.entity_type,
            statusBadge: a.action
          };
        });
        return NextResponse.json(mapped);
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
    const type = searchParams.get('type');
    const search = searchParams.get('search')?.toLowerCase();

    let items = [...FIXTURE_ACTIVITY];
    if (type && type !== 'all') {
      items = items.filter((a) => a.type === type);
    }
    if (search) {
      items = items.filter(
        (a) =>
          a.title.toLowerCase().includes(search) || a.description.toLowerCase().includes(search)
      );
    }

    const res = NextResponse.json(items);
    res.headers.set('X-DecisionTrace-Mode', 'development-preview');
    return res;
  }

  return NextResponse.json([]);
}
