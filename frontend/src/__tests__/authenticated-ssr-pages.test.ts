/**
 * Authenticated SSR Page Rendering & Real Server Data-Fetching Audit
 *
 * Verifies that Next.js App Router server page components:
 * 1. Execute direct server-side data-fetching functions (getDecisions, getDashboardMetrics, etc.)
 * 2. Authenticate cleanly by forwarding Clerk session credentials (X-User-Id, X-Org-Id, Bearer token)
 * 3. Target actual FastAPI endpoints (/overview, /decisions, /findings, /approvals, /activity)
 * 4. Safely handle unauthenticated SSR attempts without leaking mock or cross-tenant data.
 */

import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import DecisionsPage from '@/app/dashboard/decisions/page';
import CommitmentsPage from '@/app/dashboard/commitments/page';
import ConflictsPage from '@/app/dashboard/conflicts/page';
import ApprovalsPage from '@/app/dashboard/approvals/page';
import ActivityPage from '@/app/dashboard/activity/page';
import AreaStats from '@/app/dashboard/overview/@area_stats/page';
import {
  DecisionTraceApiError,
  invalidateClientCache
} from '@/features/decision-trace/api/service';

// Mock Clerk server auth to simulate authenticated server sessions
let mockServerUser: string | null = 'user_alice';
let mockServerOrg: string | null = 'org_corp_a';
let mockServerToken: string | null = 'test_clerk_jwt_token_alice';

mock.module('@clerk/nextjs/server', () => ({
  auth: async () => {
    if (!mockServerUser) {
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
      userId: mockServerUser,
      orgId: mockServerOrg,
      getToken: async () => mockServerToken,
      protect: async () => ({ userId: mockServerUser, orgId: mockServerOrg })
    };
  }
}));

describe('Authenticated SSR Pages Real Server-Side Data-Fetching', () => {
  const originalFetch = globalThis.fetch;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBackendUrl = process.env.DECISIONTRACE_BACKEND_URL;

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.DECISIONTRACE_BACKEND_URL = 'http://localhost:8000/api/v1';
    delete process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;
    delete process.env.TEST_AUTH_USER_ID;
    mockServerUser = 'user_alice';
    mockServerOrg = 'org_corp_a';
    mockServerToken = 'test_clerk_jwt_token_alice';
    invalidateClientCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalNodeEnv !== undefined) {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    } else {
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    }

    if (originalBackendUrl !== undefined) {
      process.env.DECISIONTRACE_BACKEND_URL = originalBackendUrl;
    } else {
      delete process.env.DECISIONTRACE_BACKEND_URL;
    }
    mockServerUser = null;
    mockServerOrg = null;
    mockServerToken = null;
  });

  test('DecisionsPage renders genuine backend decisions forwarding Clerk auth headers', async () => {
    const capturedRequests: { url: string; headers: Record<string, string> }[] = [];

    globalThis.fetch = mock((url: unknown, init?: unknown) => {
      const headers = ((init as RequestInit | undefined)?.headers || {}) as Record<string, string>;
      capturedRequests.push({ url: String(url), headers });

      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'dec-101',
                title: 'Adopt PostgreSQL with psycopg driver',
                status: 'finalized',
                confidence: 0.95,
                extracted_at: '2026-10-12T08:00:00Z',
                rationale: 'High concurrency connection pooling',
                commitments: [
                  {
                    id: 'com-1',
                    text: 'Deploy migration scripts',
                    assignee: 'Alice',
                    status: 'pending'
                  }
                ]
              }
            ],
            total: 1,
            limit: 50,
            offset: 0
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }) as unknown as typeof fetch;

    const pageElement = await DecisionsPage();

    expect(pageElement).toBeDefined();
    expect(React.isValidElement(pageElement)).toBe(true);

    // Verify correct FastAPI endpoints were requested
    expect(capturedRequests.length).toBeGreaterThanOrEqual(1);
    expect(capturedRequests.some((r) => r.url.includes('/decisions'))).toBe(true);

    // Verify Clerk session headers were forwarded
    for (const req of capturedRequests) {
      expect(req.headers['X-User-Id']).toBe('user_alice');
      expect(req.headers['X-Org-Id']).toBe('org_corp_a');
      expect(req.headers['Authorization']).toBe('Bearer test_clerk_jwt_token_alice');
    }
  });

  test('CommitmentsPage renders owned tasks using the commitments backend contract', async () => {
    const capturedRequests: { url: string; headers: Record<string, string> }[] = [];

    globalThis.fetch = mock((url: unknown, init?: unknown) => {
      const headers = ((init as RequestInit | undefined)?.headers || {}) as Record<string, string>;
      capturedRequests.push({ url: String(url), headers });

      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'dec-202',
                title: 'Implement Qdrant 384-dim vector storage',
                status: 'active',
                confidence: 0.88,
                commitments: [
                  {
                    id: 'com-202-a',
                    text: 'Configure conversation_chunks_v1 collection',
                    assignee: 'Bob',
                    status: 'in_progress'
                  }
                ]
              }
            ],
            total: 1,
            limit: 50,
            offset: 0
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }) as unknown as typeof fetch;

    const pageElement = await CommitmentsPage();

    expect(pageElement).toBeDefined();
    expect(React.isValidElement(pageElement)).toBe(true);
    expect(capturedRequests.some((r) => r.url.includes('/commitments'))).toBe(true);
    expect(capturedRequests[0].headers['X-User-Id']).toBe('user_alice');
  });

  test('ConflictsPage renders genuine findings-derived conflicts from backend', async () => {
    const capturedRequests: { url: string; headers: Record<string, string> }[] = [];

    globalThis.fetch = mock((url: unknown, init?: unknown) => {
      const headers = ((init as RequestInit | undefined)?.headers || {}) as Record<string, string>;
      capturedRequests.push({ url: String(url), headers });

      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'find-303',
                decision_id: 'dec-101',
                classification: 'possible_conflict',
                severity: 'high',
                detail: 'Contradiction regarding database driver version',
                detected_at: '2026-10-12T09:00:00Z',
                status: 'open'
              }
            ],
            total: 1,
            limit: 50,
            offset: 0
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }) as unknown as typeof fetch;

    const pageElement = await ConflictsPage();

    expect(pageElement).toBeDefined();
    expect(React.isValidElement(pageElement)).toBe(true);
    expect(capturedRequests.some((r) => r.url.includes('/findings'))).toBe(true);
  });

  test('ApprovalsPage renders genuine pending approvals from backend', async () => {
    const capturedRequests: { url: string; headers: Record<string, string> }[] = [];

    globalThis.fetch = mock((url: unknown, init?: unknown) => {
      const headers = ((init as RequestInit | undefined)?.headers || {}) as Record<string, string>;
      capturedRequests.push({ url: String(url), headers });

      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'appr-404',
                action_type: 'override_decision',
                requester: 'user_carol',
                status: 'pending',
                created_at: '2026-10-12T10:00:00Z',
                description: 'Requesting permission to alter schema'
              }
            ],
            total: 1,
            limit: 50,
            offset: 0
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }) as unknown as typeof fetch;

    const pageElement = await ApprovalsPage();

    expect(pageElement).toBeDefined();
    expect(React.isValidElement(pageElement)).toBe(true);
    expect(capturedRequests.some((r) => r.url.includes('/approvals'))).toBe(true);
  });

  test('ActivityPage renders genuine activity items from backend', async () => {
    const capturedRequests: { url: string; headers: Record<string, string> }[] = [];

    globalThis.fetch = mock((url: unknown, init?: unknown) => {
      const headers = ((init as RequestInit | undefined)?.headers || {}) as Record<string, string>;
      capturedRequests.push({ url: String(url), headers });

      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'act-505',
                action: 'created',
                entity_type: 'decision',
                entity_id: 'dec-101',
                timestamp: '2026-10-12T10:30:00Z',
                actor: 'user_alice'
              }
            ],
            total: 1,
            limit: 50,
            offset: 0
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }) as unknown as typeof fetch;

    const pageElement = await ActivityPage();

    expect(pageElement).toBeDefined();
    expect(React.isValidElement(pageElement)).toBe(true);
    expect(capturedRequests.some((r) => r.url.includes('/activity'))).toBe(true);
  });

  test('AreaStats overview widget renders metrics from backend /overview endpoint', async () => {
    const capturedRequests: { url: string; headers: Record<string, string> }[] = [];

    globalThis.fetch = mock((url: unknown, init?: unknown) => {
      const headers = ((init as RequestInit | undefined)?.headers || {}) as Record<string, string>;
      capturedRequests.push({ url: String(url), headers });

      return Promise.resolve(
        new Response(
          JSON.stringify({
            total_conversations: 42,
            active_decisions: 15,
            pending_approvals: 3,
            recent_findings: 2,
            system_status: 'healthy'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }) as unknown as typeof fetch;

    const widgetElement = await AreaStats();

    expect(widgetElement).toBeDefined();
    expect(React.isValidElement(widgetElement)).toBe(true);
    expect(capturedRequests.some((r) => r.url.endsWith('/overview'))).toBe(true);
  });

  test('Unauthenticated SSR request fails safely without leaking fixtures or mock data', async () => {
    mockServerUser = null;
    mockServerOrg = null;
    mockServerToken = null;

    let rejectedError: DecisionTraceApiError | null = null;
    try {
      await DecisionsPage();
    } catch (err) {
      rejectedError = err as DecisionTraceApiError;
    }

    expect(rejectedError !== null).toBe(true);
    expect(rejectedError?.statusCode).toBe(401);
    expect(rejectedError?.code).toBe('UNAUTHORIZED');
  });
});
