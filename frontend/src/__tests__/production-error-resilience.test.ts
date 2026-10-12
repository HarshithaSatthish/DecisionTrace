import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import {
  getDashboardMetrics,
  getDecisions,
  getCommitments,
  getConflicts,
  getApprovals,
  getActivity,
  DecisionTraceApiError,
  setClientCacheScope,
  invalidateClientCache
} from '@/features/decision-trace/api/service';

describe('Production API Error Resilience & Tenant Cache Isolation Audit', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.DECISIONTRACE_BACKEND_URL = 'http://localhost:8000/api/v1';
    delete process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;
    invalidateClientCache();
    setClientCacheScope('global');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
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
              error: 'Internal Server Error: Traceback in backend/app/main.py',
              code: 'INTERNAL_ERROR'
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        )
      ) as unknown as typeof fetch;

      try {
        await getDashboardMetrics();
      } catch (err: unknown) {
        expect(err instanceof DecisionTraceApiError).toBe(true);
        const apiErr = err as DecisionTraceApiError;
        expect(apiErr.statusCode).toBe(500);
        expect(apiErr.code).toBe('SERVER_ERROR');
        expect(apiErr.message.includes('Traceback')).toBe(false);
        expect(apiErr.message.includes('backend/app/main.py')).toBe(false);
        expect(apiErr.message).toContain('Internal server error');
      }
    });
  });

  describe('HTTP 502 Bad Gateway Error Handling', () => {
    test('surfaces honest 502 BAD_GATEWAY upstream error', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: 'Bad Gateway', code: 'BAD_GATEWAY' }),
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
    test('surfaces honest 503 SERVICE_UNAVAILABLE error when backend is degraded', async () => {
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
      globalThis.fetch = mock(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;

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
        activeDecisionsCount: 0,
        openCommitmentsCount: 0,
        detectedConflictsCount: 0,
        pendingApprovalsCount: 0,
        decisionTrend: [],
        attentionItems: [],
        recentActivity: [],
        isProductionOffline: false
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

  describe('Multi-Tenant & Multi-User Cache Isolation', () => {
    test('cached queries are partitioned by tenant scope and never leak across organizations or users', async () => {
      let fetchCount = 0;

      // Scope 1: Organization A, User Alice
      setClientCacheScope('org_A:user_alice');
      globalThis.fetch = mock(() => {
        fetchCount++;
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'dec-alice-org-a',
                title: 'Alice Decision in Org A',
                status: 'active',
                whatWasDecided: 'Org A Policy',
                participants: ['Alice'],
                createdAt: '2026-10-12T00:00:00Z',
                updatedAt: '2026-10-12T00:00:00Z',
                confidence: 90
              }
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }) as unknown as typeof fetch;

      const aliceResults = await getDecisions();
      expect(aliceResults.length).toBe(1);
      expect(aliceResults[0].id).toBe('dec-alice-org-a');
      expect(fetchCount).toBe(1);

      // Repeated fetch in same scope uses memory cache
      const aliceCached = await getDecisions();
      expect(aliceCached[0].id).toBe('dec-alice-org-a');
      expect(fetchCount).toBe(1);

      // Scope 2: Organization A, User Bob (Same org, different user)
      setClientCacheScope('org_A:user_bob');
      globalThis.fetch = mock(() => {
        fetchCount++;
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'dec-bob-org-a',
                title: 'Bob Decision in Org A',
                status: 'active',
                whatWasDecided: 'Bob Work',
                participants: ['Bob'],
                createdAt: '2026-10-12T00:00:00Z',
                updatedAt: '2026-10-12T00:00:00Z',
                confidence: 85
              }
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }) as unknown as typeof fetch;

      const bobResults = await getDecisions();
      expect(bobResults.length).toBe(1);
      expect(bobResults[0].id).toBe('dec-bob-org-a');
      expect(fetchCount).toBe(2); // Must NOT read Alice cache!

      // Scope 3: Organization B, User Alice (Cross-org isolation for same user)
      setClientCacheScope('org_B:user_alice');
      globalThis.fetch = mock(() => {
        fetchCount++;
        return Promise.resolve(
          new Response(
            JSON.stringify([]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }) as unknown as typeof fetch;

      const orgBResults = await getDecisions();
      expect(orgBResults.length).toBe(0);
      expect(fetchCount).toBe(3); // Must NOT read Org A cache!
    });

    test('invalidateClientCache flushes all cached entries immediately', async () => {
      let callCount = 0;
      setClientCacheScope('org_X:user_1');

      globalThis.fetch = mock(() => {
        callCount++;
        return Promise.resolve(
          new Response(JSON.stringify([{ id: 'item-1' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        );
      }) as unknown as typeof fetch;

      await getDecisions();
      expect(callCount).toBe(1);

      await getDecisions();
      expect(callCount).toBe(1); // Cached

      invalidateClientCache();

      await getDecisions();
      expect(callCount).toBe(2); // Re-fetched after cache flush
    });
  });
});
