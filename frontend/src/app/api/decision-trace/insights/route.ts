import { NextResponse } from 'next/server';
import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const auth = await verifyDecisionTraceAuth();
  if (!auth.authenticated) return auth.response;
  const backend = process.env.DECISIONTRACE_BACKEND_URL;
  if (!backend) return NextResponse.json({ error: 'Backend is not configured.' }, { status: 503 });
  try {
    const result = await fetch(`${backend}/findings?limit=100`, {
      headers: auth.headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    return NextResponse.json(await result.json(), { status: result.status });
  } catch {
    return NextResponse.json(
      { error: 'Unable to load AI insights. Please retry.' },
      { status: 502 }
    );
  }
}
