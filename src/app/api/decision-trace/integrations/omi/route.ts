import { NextRequest, NextResponse } from 'next/server';
import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

async function proxy(request?: NextRequest): Promise<NextResponse> {
  const auth = await verifyDecisionTraceAuth();
  if (!auth.authenticated) return auth.response;
  const backend = process.env.DECISIONTRACE_BACKEND_URL;
  if (!backend) return NextResponse.json({ error: 'Backend is not configured.' }, { status: 503 });
  const payload = request
    ? z
        .object({ external_omi_uid: z.string().trim().min(1).max(200).optional() })
        .safeParse(await request.json().catch(() => null))
    : null;
  if (payload && !payload.success)
    return NextResponse.json({ error: 'Invalid Omi user ID.' }, { status: 400 });
  try {
    const response = await fetch(`${backend}/integrations/omi${request ? '' : '/status'}`, {
      method: request ? 'POST' : 'GET',
      headers: auth.headers,
      body: payload?.success ? JSON.stringify(payload.data) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch {
    return NextResponse.json(
      { error: 'Omi connection request failed. Please retry.' },
      { status: 502 }
    );
  }
}

export function GET(): Promise<NextResponse> {
  return proxy();
}
export function POST(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}
