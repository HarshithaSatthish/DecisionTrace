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
      const res = await fetch(`${backendUrl}/metrics`, {
        headers: authResult.headers,
        cache: 'no-store'
      });
      if (res.ok) {
        return NextResponse.json(await res.json());
      }
    } catch {
      // Backend probe failed
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
