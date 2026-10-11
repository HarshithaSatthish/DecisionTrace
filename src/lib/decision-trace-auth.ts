import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export interface AuthSuccess {
  authenticated: true;
  userId: string;
  orgId: string | null;
  token: string | null;
  headers: Record<string, string>;
}

export interface AuthFailure {
  authenticated: false;
  response: NextResponse;
}

export type AuthResult = AuthSuccess | AuthFailure;

/**
 * Enforces Clerk authentication on DecisionTrace route handlers.
 * Rejects missing or invalid sessions with 401 Unauthorized.
 * Provides typed headers including user and organization context for backend proxying.
 */
export async function verifyDecisionTraceAuth(): Promise<AuthResult> {
  try {
    const session = await auth();
    const { userId, orgId } = session;

    if (!userId) {
      return {
        authenticated: false,
        response: NextResponse.json(
          {
            error: 'Unauthorized: Missing or invalid authentication session.',
            code: 'UNAUTHORIZED'
          },
          { status: 401 }
        )
      };
    }

    const token = await session.getToken().catch(() => null);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
      ...(orgId ? { 'X-Org-Id': orgId } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    return {
      authenticated: true,
      userId,
      orgId: orgId ?? null,
      token,
      headers
    };
  } catch {
    return {
      authenticated: false,
      response: NextResponse.json(
        {
          error: 'Unauthorized: Authentication verification failed.',
          code: 'UNAUTHORIZED'
        },
        { status: 401 }
      )
    };
  }
}

/**
 * Checks whether development preview mode is permitted.
 * In strict production without NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW=true,
 * mock fixtures are prohibited.
 */
export function isDevPreviewEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW === 'true'
  );
}
