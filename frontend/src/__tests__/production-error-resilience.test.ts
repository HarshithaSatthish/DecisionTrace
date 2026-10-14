import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import {
  getDashboardMetrics,
  getDecisions,
  getCommitments,
  getConflicts,
  getApprovals,
  getActivity,
  DecisionTraceApiError,
  invalidateClientCache
} from '@/features/decision-trace/api/service';

let mockSessionUser: string | null = 'test_user_resilience';
let mockSessionOrg: string | null = 'test_org_resilience';
let mockSessionToken: string | null = 'test_clerk_jwt_token';

mock.module('@clerk/nextjs/server', () => ({
  auth: async () => {
    if (!mockSessionUser) {
      return {
        userId: null,
        orgId: null,
        getToken: async () => null,
        protect: async () => {
          throw new Error('REDIRECT_TO_SIGN_IN');
        }
      };
    }
    return {
      userId: mockSessionUser,
      orgId: mockSessionOrg,
      getToken: async () => mockSessionToken,
      protect: async () => ({ userId: mockSessionUser, orgId: mockSessionOrg })
    };
  }
}));

describe('Production API Error Resilience & Tenant Cache Isolation Audit', () => {
  const originalFetch = globalThis.fetch;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBackendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  const originalPreview = process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;
  const originalTestUser = process.env.TEST_AUTH_USER_ID;

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.DECISIONTRACE_BACKEND_URL = 'http://localhost:8000/api/v1';
    mockSessionUser = 'test_user_resilience';
    mockSessionOrg = 'test_org_resilience';
    mockSessionToken = 'test_clerk_jwt_token';
    delete process.env.TEST_AUTH_USER_ID;
    delete process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;
    invalidateClientCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalNodeEnv !== undefined)
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    else delete (process.env as Record<string, string | undefined>).NODE_ENV;

    if (originalBackendUrl !== undefined)
      process.env.DECISIONTRACE_BACKEND_URL = originalBackendUrl;
    else delete process.env.DECISIONTRACE_BACKEND_URL;

    if (originalPreview !== undefined)
      process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW = originalPreview;
    else delete process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;

    if (originalTestUser !== undefined) process.env.TEST_AUTH_USER_ID = originalTestUser;
    else delete process.env.TEST_AUTH_USER_ID;
    mockSessionUser = null;
    mockSessionOrg = null;
    mockSessionToken = null;

    invalidateClientCache();
  });

  describe('HTTP 401 Unauthorized Error Handling', () => {
    test('surfaces honest 401 UNAUTHORIZED error across all endpoints without leaking demo fixtures', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: 'Valid authentication token required', code: 'UNAUTHORIZED' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          )
        )
      ) as unknown as typeof fetch;

      // Dashboard Metrics
      await expect(getDashboardMetrics()).rejects.toThrow('Authentication required');
      try {
        await getDashboardMetrics();
      } catch (err: unknown) {
        expect(err instanceof DecisionTraceApiError).toBe(true);
        const apiErr = err as DecisionTraceApiError;
        expect(apiErr.statusCode).toBe(401);
        expect(apiErr.code).toBe('UNAUTHORIZED');
        expect(apiErr.message).toContain('Authentication required');
      }

      // Decisions
      await expect(getDecisions()).rejects.toThrow('Authentication required');

      // Commitments
      await expect(getCommitments()).rejects.toThrow('Authentication required');

      // Conflicts
      await expect(getConflicts()).rejects.toThrow('Authentication required');

      // Approvals
      await expect(getApprovals()).rejects.toThrow('Authentication required');

      // Activity
      await expect(getActivity()).rejects.toThrow('Authentication required');
    });

    test('rejects unauthenticated request on server when no session headers are available', async () => {
      mockSessionUser = null;
      await expect(getDashboardMetrics()).rejects.toThrow('Authentication required');
      await expect(getDecisions()).rejects.toThrow('Authentication required');
    });

    test('setting TEST_AUTH_USER_ID is strictly ignored and impossible to activate in production', async () => {
      mockSessionUser = null;
      process.env.TEST_AUTH_USER_ID = 'malicious_mock_user';
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      await expect(getDecisions()).rejects.toThrow('Authentication required');
      await expect(getDashboardMetrics()).rejects.toThrow('Authentication required');
    });
  });

  describe('HTTP 403 Forbidden Error Handling', () => {
    test('surfaces honest 403 FORBIDDEN error across query services', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: 'Insufficient organization privileges', code: 'FORBIDDEN' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          )
        )
      ) as unknown as typeof fetch;

      try {
        await getDecisions();
      } catch (err: unknown) {
        expect(err instanceof DecisionTraceApiError).toBe(true);
        const apiErr = err as DecisionTraceApiError;
        expect(apiErr.statusCode).toBe(403);
        expect(apiErr.code).toBe('FORBIDDEN');
        expect(apiErr.message).toContain('Access denied');
      }
    });
  });

  describe('HTTP 500 Server Error Handling (Stack Trace Leakage Prevention)', () => {
    test('sanitizes 500 error and never exposes internal server stack traces to callers', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: 'Internal Server Error',
              detail:
                'Traceback (most recent call last):\n  File "app/api/decisions.py", line 42, in list_decisions\n    raise OperationalError("FATAL: connection to server lost")',
              code: 'INTERNAL_ERROR'
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        )
      ) as unknown as typeof fetch;

      try {
        await getDecisions();
      } catch (err: unknown) {
        expect(err instanceof DecisionTraceApiError).toBe(true);
        const apiErr = err as DecisionTraceApiError;
        expect(apiErr.statusCode).toBe(500);
        expect(apiErr.code).toBe('SERVER_ERROR');
        // Critical: Stack trace & internal file paths must NEVER leak
        expect(apiErr.message.includes('Traceback')).toBe(false);
        expect(apiErr.message.includes('app/api/decisions.py')).toBe(false);
        expect(apiErr.message.includes('OperationalError')).toBe(false);
        expect(apiErr.message).toBe('Internal server error (HTTP 500). Please try again later.');
      }
    });
  });

  describe('HTTP 502 Bad Gateway Error Handling', () => {
    test('surfaces honest 502 BAD_GATEWAY when upstream service is unreachable', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: 'Bad Gateway: FastAPI upstream crashed', code: 'BAD_GATEWAY' }),
            { status: 502, headers: { 'Content-Type': 'application/json' } }
          )
        )
      ) as unknown as typeof fetch;

      try {
        await getDecisions();
      } catch (err: unknown) {
        expect(err instanceof DecisionTraceApiError).toBe(true);
        const apiErr = err as DecisionTraceApiError;
        expect(apiErr.statusCode).toBe(502);
        expect(apiErr.code).toBe('BAD_GATEWAY');
        expect(apiErr.message).toContain('Upstream gateway error');
      }
    });
  });

  describe('HTTP 503 Service Unavailable Error Handling', () => {
    test('surfaces honest 503 SERVICE_UNAVAILABLE during dependency outages', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: 'Service Unavailable', code: 'SERVICE_UNAVAILABLE' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          )
        )
      ) as unknown as typeof fetch;

      try {
        await getCommitments();
      } catch (err: unknown) {
        expect(err instanceof DecisionTraceApiError).toBe(true);
        const apiErr = err as DecisionTraceApiError;
        expect(apiErr.statusCode).toBe(503);
        expect(apiErr.code).toBe('SERVICE_UNAVAILABLE');
        expect(apiErr.message).toContain('Service temporarily unavailable');
      }
    });
  });

  describe('Network Timeout & Network Failure Resilience', () => {
    test('handles AbortError timeout by surfacing honest TIMEOUT error', async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      globalThis.fetch = mock(() => Promise.reject(abortErr)) as unknown as typeof fetch;

      try {
        await getConflicts();
      } catch (err: unknown) {
        expect(err instanceof DecisionTraceApiError).toBe(true);
        const apiErr = err as DecisionTraceApiError;
        expect(apiErr.statusCode).toBe(408);
        expect(apiErr.code).toBe('TIMEOUT');
        expect(apiErr.message).toContain('Request timed out');
      }
    });

    test('handles network failure (connection refused / offline) by surfacing NETWORK_ERROR', async () => {
      globalThis.fetch = mock(() =>
        Promise.reject(new TypeError('Failed to fetch'))
      ) as unknown as typeof fetch;

      try {
        await getActivity();
      } catch (err: unknown) {
        expect(err instanceof DecisionTraceApiError).toBe(true);
        const apiErr = err as DecisionTraceApiError;
        expect(apiErr.statusCode).toBe(0);
        expect(apiErr.code).toBe('NETWORK_ERROR');
        expect(apiErr.message).toContain('Network error');
      }
    });
  });

  describe('Genuine Empty Responses Integrity', () => {
    test('distinguishes honest empty array from failure, returning [] without error', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        )
      ) as unknown as typeof fetch;

      const decisions = await getDecisions();
      expect(Array.isArray(decisions)).toBe(true);
      expect(decisions.length).toBe(0);

      const commitments = await getCommitments();
      expect(Array.isArray(commitments)).toBe(true);
      expect(commitments.length).toBe(0);

      const conflicts = await getConflicts();
      expect(Array.isArray(conflicts)).toBe(true);
      expect(conflicts.length).toBe(0);

      const approvals = await getApprovals();
      expect(Array.isArray(approvals)).toBe(true);
      expect(approvals.length).toBe(0);

      const activity = await getActivity();
      expect(Array.isArray(activity)).toBe(true);
      expect(activity.length).toBe(0);
    });

    test('distinguishes honest empty metrics with zero counts from failure', async () => {
      const genuineZeroMetrics = {
        total_conversations: 0,
        active_decisions: 0,
        pending_approvals: 0,
        recent_findings: 0,
        system_status: 'healthy'
      };

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(genuineZeroMetrics), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        )
      ) as unknown as typeof fetch;

      const metrics = await getDashboardMetrics();
      expect(metrics.activeDecisionsCount).toBe(0);
      expect(metrics.openCommitmentsCount).toBe(0);
      expect(metrics.detectedConflictsCount).toBe(0);
      expect(metrics.pendingApprovalsCount).toBe(0);
      expect(metrics.isProductionOffline).toBe(false);
    });
  });

  describe('Concurrent Two-User SSR Cache-Isolation & Zero Server-Cache Bleeding', () => {
    test('two concurrent server-rendered requests for different users fetch independently with zero cache leakage', async () => {
      const fetchCalls: { url: string; headers: Record<string, string> }[] = [];

      globalThis.fetch = mock((url: unknown, init?: unknown) => {
        const headers = ((init as RequestInit | undefined)?.headers || {}) as Record<
          string,
          string
        >;
        fetchCalls.push({ url: String(url), headers });

        const userId = headers['X-User-Id'];
        if (userId === 'user_alice') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                items: [
                  {
                    id: 'dec-alice',
                    topic: 'Database Architecture',
                    current_commitment: 'Use PostgreSQL',
                    owner: 'Alice',
                    state: 'active',
                    version: 1,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  }
                ],
                total: 1,
                limit: 50,
                offset: 0
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
        } else if (userId === 'user_bob') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                items: [
                  {
                    id: 'dec-bob',
                    topic: 'Messaging Queue',
                    current_commitment: 'Use Redis',
                    owner: 'Bob',
                    state: 'active',
                    version: 1,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  }
                ],
                total: 1,
                limit: 50,
                offset: 0
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })
        );
      }) as unknown as typeof fetch;

      // Concurrently execute requests for Alice and Bob
      const [aliceDecisions, bobDecisions] = await Promise.all([
        getDecisions(undefined, {
          authHeaders: { 'X-User-Id': 'user_alice', Authorization: 'Bearer token_alice' }
        }),
        getDecisions(undefined, {
          authHeaders: { 'X-User-Id': 'user_bob', Authorization: 'Bearer token_bob' }
        })
      ]);

      // Alice receives Alice data
      expect(aliceDecisions.length).toBe(1);
      expect(aliceDecisions[0].id).toBe('dec-alice');
      expect(aliceDecisions[0].whatWasDecided).toBe('Use PostgreSQL');

      // Bob receives Bob data
      expect(bobDecisions.length).toBe(1);
      expect(bobDecisions[0].id).toBe('dec-bob');
      expect(bobDecisions[0].whatWasDecided).toBe('Use Redis');

      // Crucial: Bob never saw Alice data and Alice never saw Bob data
      expect(bobDecisions.some((d) => d.id === 'dec-alice')).toBe(false);
      expect(aliceDecisions.some((d) => d.id === 'dec-bob')).toBe(false);

      // Both made direct independent backend calls (2 calls)
      expect(fetchCalls.length).toBe(2);

      // Subsequent call for Alice is NOT cached on server (3rd fetch call)
      await getDecisions(undefined, {
        authHeaders: { 'X-User-Id': 'user_alice', Authorization: 'Bearer token_alice' }
      });
      expect(fetchCalls.length).toBe(3);
    });

    test('real backend endpoint contracts are targeted during server fetching', async () => {
      const requestedUrls: string[] = [];
      globalThis.fetch = mock((url: unknown) => {
        requestedUrls.push(String(url));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [],
              total: 0,
              active_decisions: 0,
              pending_approvals: 0,
              recent_findings: 0
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          )
        );
      }) as unknown as typeof fetch;

      await getDashboardMetrics();
      expect(requestedUrls.some((u) => u.endsWith('/overview'))).toBe(true);

      await getDecisions();
      expect(requestedUrls.some((u) => u.includes('/decisions'))).toBe(true);

      await getCommitments();
      expect(requestedUrls.some((u) => u.includes('/commitments'))).toBe(true);

      await getConflicts();
      // Conflicts derived from /findings contract
      expect(requestedUrls.some((u) => u.includes('/findings'))).toBe(true);

      await getApprovals();
      expect(requestedUrls.some((u) => u.includes('/approvals'))).toBe(true);

      await getActivity();
      expect(requestedUrls.some((u) => u.includes('/activity'))).toBe(true);
    });
  });
});
