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

    const baseUrl = backendUrl.replace(/\/api(\/v1)?\/?$/, '');
    // Try root /health first (Harshitha's FastAPI mounts /health at root)
    let res = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
      cache: 'no-store'
    }).catch(() => null);

    // Fallback to ${backendUrl}/health if root failed
    if (!res || !res.ok) {
      res = await fetch(`${backendUrl}/health`, {
        signal: controller.signal,
        cache: 'no-store'
      }).catch(() => null);
    }

    clearTimeout(timeoutId);

    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      // Check readiness probe if available
      let readyData = null;
      try {
        const readyRes = await fetch(`${baseUrl}/ready`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
        readyData = await readyRes.json().catch(() => null);
      } catch {
        // Non-fatal
      }

      const isHealthy =
        (data.status === 'healthy' || data.status === 'ok' || data.status === 'ready') && readyData?.status === 'ready';
      return NextResponse.json({
        status: isHealthy ? 'connected' : 'degraded',
        connected: isHealthy,
        backendUrl,
        mode: 'live',
        details: {
          ...data,
          readiness: readyData
        },
        timestamp: new Date().toISOString()
      });
    }

    const statusCode = res ? res.status : 503;
    return NextResponse.json({
      status: 'degraded',
      connected: false,
      backendUrl,
      mode: isDevPreviewEnabled ? 'development-preview' : 'production-offline',
      statusCode,
      message: `FastAPI health check responded with status ${statusCode}`,
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
