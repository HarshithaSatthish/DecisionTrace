import { describe, expect, test, mock, afterEach } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NextRequest } from 'next/server';

// 1. Verify dashboard/layout.tsx source code has ZERO environment-variable bypasses
describe('Dashboard Layout Security Guardrail Source Audit', () => {
  test('dashboard/layout.tsx strictly enforces auth.protect() without environment bypasses', () => {
    const layoutPath = resolve(process.cwd(), 'src/app/dashboard/layout.tsx');
    const layoutContent = readFileSync(layoutPath, 'utf-8');

    // Must call auth.protect()
    expect(layoutContent.includes('await auth.protect()')).toBe(true);

    // Must NOT contain any conditional bypass based on E2E_TESTING or other flags
    expect(layoutContent.includes('E2E_TESTING')).toBe(false);
    expect(/if\s*\(.*process\.env\..*\)\s*\{\s*await auth\.protect/.test(layoutContent)).toBe(
      false
    );
  });
});

// 2. Mock Clerk auth for independent API & helper security testing
let mockSessionUser: string | null = null;
let mockSessionOrg: string | null = null;
let mockSessionToken: string | null = null;

afterEach(() => {
  mockSessionUser = null;
  mockSessionOrg = null;
  mockSessionToken = null;
});

mock.module('@clerk/nextjs/server', () => ({
  auth: async () => {
    if (!mockSessionUser) {
      return {
        userId: null,
        orgId: null,
        getToken: async () => null,
        protect: async () => {
          throw new Error('REDIRECT_TO_SIGN_IN: User is unauthenticated');
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

import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';
import { GET as getDecisionsRoute } from '@/app/api/decision-trace/decisions/route';
import { GET as getCommitmentsRoute } from '@/app/api/decision-trace/commitments/route';
import { GET as getConflictsRoute } from '@/app/api/decision-trace/conflicts/route';
import { GET as getApprovalsRoute } from '@/app/api/decision-trace/approvals/route';
import { GET as getActivityRoute } from '@/app/api/decision-trace/activity/route';

describe('Server-Side Authentication & Tenant Isolation Enforcement', () => {
  test('Unauthenticated request to verifyDecisionTraceAuth() returns 401 with UNAUTHORIZED code', async () => {
    mockSessionUser = null;
    mockSessionOrg = null;
    mockSessionToken = null;

    const authResult = await verifyDecisionTraceAuth();
    expect(authResult.authenticated).toBe(false);
    if (!authResult.authenticated) {
      expect(authResult.response.status).toBe(401);
      const json = await authResult.response.json();
      expect(json.code).toBe('UNAUTHORIZED');
    }
  });

  test('All primary DecisionTrace API endpoints independently reject unauthenticated access with 401', async () => {
    mockSessionUser = null;

    const endpoints = [
      {
        name: 'decisions',
        fn: getDecisionsRoute,
        url: 'http://localhost:3000/api/decision-trace/decisions'
      },
      {
        name: 'commitments',
        fn: getCommitmentsRoute,
        url: 'http://localhost:3000/api/decision-trace/commitments'
      },
      {
        name: 'conflicts',
        fn: getConflictsRoute,
        url: 'http://localhost:3000/api/decision-trace/conflicts'
      },
      {
        name: 'approvals',
        fn: getApprovalsRoute,
        url: 'http://localhost:3000/api/decision-trace/approvals'
      },
      {
        name: 'activity',
        fn: getActivityRoute,
        url: 'http://localhost:3000/api/decision-trace/activity'
      }
    ];

    for (const ep of endpoints) {
      const req = new NextRequest(ep.url, { method: 'GET' });
      const res = await ep.fn(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
    }
  });

  test('Authenticated user receives their own user and organization context in forwarding headers', async () => {
    mockSessionUser = 'usr_alice_executive';
    mockSessionOrg = 'org_acme_corp';
    mockSessionToken = 'jwt_token_alice_signed';

    const authResult = await verifyDecisionTraceAuth();
    expect(authResult.authenticated).toBe(true);
    if (authResult.authenticated) {
      expect(authResult.userId).toBe('usr_alice_executive');
      expect(authResult.orgId).toBe('org_acme_corp');
      expect(authResult.headers['X-User-Id']).toBe('usr_alice_executive');
      expect(authResult.headers['X-Org-Id']).toBe('org_acme_corp');
      expect(authResult.headers['Authorization']).toBe('Bearer jwt_token_alice_signed');
    }
  });

  test('Multi-tenant isolation: Tenant A headers cannot access or bleed into Tenant B session', async () => {
    // Tenant A
    mockSessionUser = 'usr_tenant_a_admin';
    mockSessionOrg = 'org_tenant_a';
    mockSessionToken = 'jwt_tenant_a';
    const authA = await verifyDecisionTraceAuth();

    // Tenant B
    mockSessionUser = 'usr_tenant_b_admin';
    mockSessionOrg = 'org_tenant_b';
    mockSessionToken = 'jwt_tenant_b';
    const authB = await verifyDecisionTraceAuth();

    expect(authA.authenticated).toBe(true);
    expect(authB.authenticated).toBe(true);
    if (authA.authenticated && authB.authenticated) {
      expect(authA.orgId === authB.orgId).toBe(false);
      expect(authA.headers['X-Org-Id']).toBe('org_tenant_a');
      expect(authB.headers['X-Org-Id']).toBe('org_tenant_b');
      expect(authA.headers['Authorization'] === authB.headers['Authorization']).toBe(false);
    }
  });

  test('Setting environment variables cannot bypass API authorization check', async () => {
    mockSessionUser = null; // Unauthenticated

    const prevDev = process.env.NODE_ENV;

    // Attempt to fake environment flags
    (process.env as Record<string, string | undefined>).E2E_TESTING = 'true';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';

    const authResult = await verifyDecisionTraceAuth();
    expect(authResult.authenticated).toBe(false);
    if (!authResult.authenticated) {
      expect(authResult.response.status).toBe(401);
    }

    // Clean up
    delete (process.env as Record<string, string | undefined>).E2E_TESTING;
    (process.env as Record<string, string | undefined>).NODE_ENV = prevDev;
  });
});
