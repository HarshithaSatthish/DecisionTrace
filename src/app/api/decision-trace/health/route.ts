import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  const isDevPreviewEnabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW === 'true';

  if (!backendUrl) {
    return NextResponse.json({
      status: 'disconnected',
      connected: false,
      backendUrl: null,
      mode: isDevPreviewEnabled ? 'development-preview' : 'production-offline',
      message:
        'FastAPI backend URL (DECISIONTRACE_BACKEND_URL) is not configured. Running in disconnected mode.',
      timestamp: new Date().toISOString()
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`${backendUrl}/health`, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({
        status: 'connected',
        connected: true,
        backendUrl,
        mode: 'live',
        details: data,
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json({
      status: 'degraded',
      connected: false,
      backendUrl,
      mode: isDevPreviewEnabled ? 'development-preview' : 'production-offline',
      statusCode: res.status,
      message: `FastAPI health check responded with status ${res.status}`,
      timestamp: new Date().toISOString()
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Connection failed';
    return NextResponse.json({
      status: 'disconnected',
      connected: false,
      backendUrl,
      mode: isDevPreviewEnabled ? 'development-preview' : 'production-offline',
      message: `Failed to connect to FastAPI backend: ${errMsg}`,
      timestamp: new Date().toISOString()
    });
  }
}
