import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { NextRequest } from 'next/server';

let mockSessionUser: string | null = null;
let mockSessionOrg: string | null = null;
let mockSessionToken: string | null = null;

mock.module('@clerk/nextjs/server', () => ({
  auth: async () => {
    if (!mockSessionUser) {
      return {
        userId: null,
        orgId: null,
        getToken: async () => null
      };
    }
    return {
      userId: mockSessionUser,
      orgId: mockSessionOrg,
      getToken: async () => mockSessionToken || 'mock_jwt_token'
    };
  }
}));

import { GET as getConversationsRoute } from '@/app/api/decision-trace/conversations/route';
import { GET as getOmiStatusRoute } from '@/app/api/decision-trace/integrations/omi/status/route';
import { POST as linkOmiRoute } from '@/app/api/decision-trace/integrations/omi/route';
import { POST as resolveConflictRoute } from '@/app/api/decision-trace/conflicts/[id]/resolve/route';

describe('Core Screens & Omi Connection Verification Suite', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
    mockSessionUser = null;
    mockSessionOrg = null;
    mockSessionToken = null;
  });

  afterEach(() => {
    mockSessionUser = null;
    mockSessionOrg = null;
    mockSessionToken = null;
  });

  describe('Unauthenticated Request Protection', () => {
    test('/api/decision-trace/conversations rejects unauthenticated access with 401', async () => {
      mockSessionUser = null;
      const req = new NextRequest('http://localhost:3000/api/decision-trace/conversations');
      const res = await getConversationsRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    test('/api/decision-trace/integrations/omi/status rejects unauthenticated access with 401', async () => {
      mockSessionUser = null;
      const req = new NextRequest('http://localhost:3000/api/decision-trace/integrations/omi/status');
      const res = await getOmiStatusRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });

    test('/api/decision-trace/integrations/omi rejects unauthenticated access with 401', async () => {
      mockSessionUser = null;
      const req = new NextRequest('http://localhost:3000/api/decision-trace/integrations/omi', {
        method: 'POST',
        body: JSON.stringify({})
      });
      const res = await linkOmiRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Approval-Gated Conflict Resolution', () => {
    test('/api/decision-trace/conflicts/[id]/resolve routes through approval endpoint when backend is reachable', async () => {
      mockSessionUser = 'user_clerk_test';
      mockSessionToken = 'jwt_test_token';

      globalThis.fetch = mock((...args: unknown[]) => {
        const url = String(args[0] || '');
        const urlStr = String(url);
        if (urlStr.includes('/approvals?limit=')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                items: [
                  {
                    id: 'appr-uuid-123',
                    finding_id: 'conf-test-456',
                    status: 'pending',
                    execution_key: 'exec_key_mock_789'
                  }
                ],
                total: 1
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
        }
        if (urlStr.includes('/approvals/appr-uuid-123/approve')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'appr-uuid-123',
                status: 'approved',
                message: 'Approval executed and authoritative record updated successfully',
                resulting_decision: {
                  id: 'dec-1',
                  topic: 'architecture',
                  version: 2
                }
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      }) as unknown as typeof fetch;

      const req = new NextRequest('http://localhost:3000/api/decision-trace/conflicts/conf-test-456/resolve', {
        method: 'POST',
        body: JSON.stringify({ action: 'resolve', rationale: 'CTO confirmed resolution' })
      });

      const prevUrl = process.env.DECISIONTRACE_BACKEND_URL;
      process.env.DECISIONTRACE_BACKEND_URL = 'http://mock-fastapi.internal/api/v1';

      try {
        const res = await resolveConflictRoute(req, {
          params: Promise.resolve({ id: 'conf-test-456' })
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.approvalId).toBe('appr-uuid-123');
        expect(data.status).toBe('approved');
        expect(data.resultingDecision).toBeDefined();
      } finally {
        process.env.DECISIONTRACE_BACKEND_URL = prevUrl;
      }
    });

    test('/api/decision-trace/conflicts/[id]/resolve returns 404 when no pending approval request exists for conflict', async () => {
      mockSessionUser = 'user_clerk_test';
      mockSessionToken = 'jwt_test_token';

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ items: [], total: 0 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        )
      ) as unknown as typeof fetch;

      const req = new NextRequest('http://localhost:3000/api/decision-trace/conflicts/orphan-conf/resolve', {
        method: 'POST',
        body: JSON.stringify({ action: 'resolve' })
      });

      const prevUrl = process.env.DECISIONTRACE_BACKEND_URL;
      process.env.DECISIONTRACE_BACKEND_URL = 'http://mock-fastapi.internal/api/v1';

      try {
        const res = await resolveConflictRoute(req, {
          params: Promise.resolve({ id: 'orphan-conf' })
        });
        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.code).toBe('APPROVAL_NOT_FOUND');
      } finally {
        process.env.DECISIONTRACE_BACKEND_URL = prevUrl;
      }
    });
  });
});
