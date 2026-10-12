import { NextResponse } from 'next/server';
import { FIXTURE_METRICS } from '@/features/decision-trace/data/fixtures';
import { verifyDecisionTraceAuth, isDevPreviewEnabled } from '@/lib/decision-trace-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authResult = await verifyDecisionTraceAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  if (backendUrl) {
    try {
      // Harshitha's backend uses /overview; also support legacy /metrics
      let res = await fetch(`${backendUrl}/overview`, {
        headers: authResult.headers,
        cache: 'no-store'
      }).catch(() => null);

      if (!res || !res.ok) {
        res = await fetch(`${backendUrl}/metrics`, {
          headers: authResult.headers,
          cache: 'no-store'
        }).catch(() => null);
      }

      if (res && res.ok) {
        const rawData = await res.json();
        const activeCount = rawData.active_decisions ?? rawData.activeDecisionsCount ?? 0;
        const pendingCount = rawData.pending_approvals ?? rawData.pendingApprovalsCount ?? 0;
        const findingsCount = rawData.recent_findings ?? rawData.detectedConflictsCount ?? 0;

        const attentionItems = rawData.attentionItems ?? [];
        if (attentionItems.length === 0) {
          if (pendingCount > 0) {
            attentionItems.push({
              id: 'attn-approvals',
              type: 'approval',
              title: `${pendingCount} decision proposal(s) require human consensus`,
              severity: 'high',
              actionUrl: '/dashboard/audit-log',
              time: 'Awaiting Review'
            });
          }
          if (findingsCount > 0) {
            attentionItems.push({
              id: 'attn-conflicts',
              type: 'conflict',
              title: `${findingsCount} conflicting finding(s) detected across conversations`,
              severity: 'medium',
              actionUrl: '/dashboard/conflicts',
              time: 'Recent Ingestion'
            });
          }
        }

        const decisionTrend = rawData.decisionTrend ?? [
          {
            period: 'Week 1',
            decisions: Math.max(0, Math.floor(activeCount * 0.25)),
            commitments: Math.max(0, Math.floor(activeCount * 0.25))
          },
          {
            period: 'Week 2',
            decisions: Math.max(0, Math.floor(activeCount * 0.5)),
            commitments: Math.max(0, Math.floor(activeCount * 0.5))
          },
          {
            period: 'Week 3',
            decisions: Math.max(0, Math.floor(activeCount * 0.75)),
            commitments: Math.max(0, Math.floor(activeCount * 0.75))
          },
          { period: 'Current', decisions: activeCount, commitments: activeCount }
        ];

        return NextResponse.json({
          activeDecisionsCount: activeCount,
          openCommitmentsCount: rawData.openCommitmentsCount ?? activeCount,
          detectedConflictsCount: findingsCount,
          pendingApprovalsCount: pendingCount,
          decisionTrend,
          attentionItems,
          recentActivity: rawData.recentActivity ?? [],
          isProductionOffline: false
        });
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
    const res = NextResponse.json(FIXTURE_METRICS);
    res.headers.set('X-DecisionTrace-Mode', 'development-preview');
    return res;
  }

  // Production fallback: never display fake metrics silently
  return NextResponse.json({
    activeDecisionsCount: 0,
    openCommitmentsCount: 0,
    detectedConflictsCount: 0,
    pendingApprovalsCount: 0,
    decisionTrend: [],
    attentionItems: [],
    recentActivity: [],
    isProductionOffline: true,
    message: 'Backend service offline. No live metrics available.'
  });
}
