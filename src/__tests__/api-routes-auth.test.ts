import { describe, expect, test, mock } from 'bun:test';
import { NextRequest } from 'next/server';
mock.module('server-only', () => ({}));

// We mock @clerk/nextjs/server before importing the route handlers/auth helpers
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
      getToken: async () => mockSessionToken
    };
  }
}));

import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';
import { PATCH as updateCommitmentRoute } from '@/app/api/decision-trace/commitments/[id]/route';
import { POST as resolveConflictRoute } from '@/app/api/decision-trace/conflicts/[id]/resolve/route';
import { POST as executeApprovalRoute } from '@/app/api/decision-trace/approvals/[id]/route';
import { POST as analyzeRoute } from '@/app/api/decision-trace/analyze/route';
const { getDecisions: getServerDecisions, getDashboardMetrics: getServerMetrics } = await import('@/features/decision-trace/api/server');

describe('Server-Side Clerk Authentication Enforcement on API Routes', () => {
  test('verifyDecisionTraceAuth returns 401 when session has no userId', async () => {
    mockSessionUser = null;
    mockSessionOrg = null;
    mockSessionToken = null;

    const authResult = await verifyDecisionTraceAuth();
    expect(authResult.authenticated).toBe(false);
    if (!authResult.authenticated) {
      expect(authResult.response.status).toBe(401);
      const data = await authResult.response.json();
      expect(data.code).toBe('UNAUTHORIZED');
      expect(data.error).toContain('Unauthorized: Missing or invalid authentication session.');
    }
  });

  test('verifyDecisionTraceAuth returns authenticated context and headers when session is valid', async () => {
    mockSessionUser = 'usr_guardian_test';
    mockSessionOrg = 'org_enterprise_demo';
    mockSessionToken = 'jwt_valid_bearer_token';

    const authResult = await verifyDecisionTraceAuth();
    expect(authResult.authenticated).toBe(true);
    if (authResult.authenticated) {
      expect(authResult.userId).toBe('usr_guardian_test');
      expect(authResult.orgId).toBe('org_enterprise_demo');
      expect(authResult.headers['X-User-Id']).toBe('usr_guardian_test');
      expect(authResult.headers['X-Org-Id']).toBe('org_enterprise_demo');
      expect(authResult.headers['Authorization']).toBe('Bearer jwt_valid_bearer_token');
    }
  });

  test('PATCH /api/decision-trace/commitments/[id] returns 401 when unauthenticated', async () => {
    mockSessionUser = null;
    const req = new NextRequest('http://localhost:3000/api/decision-trace/commitments/cmt-101', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' })
    });
    const res = await updateCommitmentRoute(req, {
      params: Promise.resolve({ id: 'cmt-101' })
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/decision-trace/conflicts/[id]/resolve returns 401 when unauthenticated', async () => {
    mockSessionUser = null;
    const req = new NextRequest(
      'http://localhost:3000/api/decision-trace/conflicts/conf-1/resolve',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'resolve', rationale: 'Test rationale' })
      }
    );
    const res = await resolveConflictRoute(req, {
      params: Promise.resolve({ id: 'conf-1' })
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/decision-trace/approvals/[id] returns 401 when unauthenticated', async () => {
    mockSessionUser = null;
    const req = new NextRequest('http://localhost:3000/api/decision-trace/approvals/appr-1', {
      method: 'POST',
      body: JSON.stringify({ action: 'approve', rationale: 'Test rationale' })
    });
    const res = await executeApprovalRoute(req, {
      params: Promise.resolve({ id: 'appr-1' })
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('Authenticated route returns 503 when backend URL is missing (no fake state persistence)', async () => {
    mockSessionUser = 'usr_authorized';
    const originalUrl = process.env.DECISIONTRACE_BACKEND_URL;
    delete process.env.DECISIONTRACE_BACKEND_URL;

    const req = new NextRequest('http://localhost:3000/api/decision-trace/commitments/cmt-101', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' })
    });
    const res = await updateCommitmentRoute(req, {
      params: Promise.resolve({ id: 'cmt-101' })
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('BACKEND_OFFLINE');

    if (originalUrl) {
      process.env.DECISIONTRACE_BACKEND_URL = originalUrl;
    }
  });

  test('POST /api/decision-trace/analyze returns 401 when unauthenticated', async () => {
    mockSessionUser = null;
    const req = new NextRequest('http://localhost:3000/api/decision-trace/analyze', {
      method: 'POST',
      body: JSON.stringify({ conversationText: 'Alice: We decided to deploy.' })
    });
    const res = await analyzeRoute(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/decision-trace/analyze returns 400 when conversationText is missing', async () => {
    mockSessionUser = 'usr_authorized';
    const req = new NextRequest('http://localhost:3000/api/decision-trace/analyze', {
      method: 'POST',
      body: JSON.stringify({})
    });
    const res = await analyzeRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_INPUT');
  });

  test('POST /api/decision-trace/analyze executes agent analysis when authenticated', async () => {
    mockSessionUser = 'usr_authorized';
    const req = new NextRequest('http://localhost:3000/api/decision-trace/analyze', {
      method: 'POST',
      body: JSON.stringify({
        conversationText:
          'Alice: We decided to use PostgreSQL for relational storage.\nBob: I will migrate the schemas by Friday.'
      })
    });
    const res = await analyzeRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.decisions.length).toBe(1);
    expect(data.commitments.length).toBe(1);
    const engineHeader = res.headers.get('X-DecisionTrace-Lyzr-Engine');
    expect(['live-lyzr-studio', 'deterministic-grounded-preview']).toContain(engineHeader || '');
  });

  test('configured credentials do not label a failed provider fallback as live inference', async () => {
    mockSessionUser = 'usr_authorized';
    const origKey = process.env.LYZR_API_KEY;
    const origMgr = process.env.LYZR_MANAGER_AGENT_ID;
    const originalFetch = globalThis.fetch;

    try {
      process.env.LYZR_API_KEY = 'mock_lyzr_key';
      process.env.LYZR_MANAGER_AGENT_ID = 'mock_agent_id';
      globalThis.fetch = (async () => new Response(JSON.stringify({ detail: 'Invalid API Key' }), { status: 403 })) as typeof fetch;

      const req = new NextRequest('http://localhost:3000/api/decision-trace/analyze', {
        method: 'POST',
        body: JSON.stringify({
          conversationText: 'Alice: We decided to test live header.'
        })
      });
      const res = await analyzeRoute(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('X-DecisionTrace-Lyzr-Engine')).toBe('deterministic-grounded-preview');
    } finally {
      globalThis.fetch = originalFetch;
      if (origKey) process.env.LYZR_API_KEY = origKey;
      else delete process.env.LYZR_API_KEY;
      if (origMgr) process.env.LYZR_MANAGER_AGENT_ID = origMgr;
      else delete process.env.LYZR_MANAGER_AGENT_ID;
    }
  });

  test('POST /api/decision-trace/analyze rejects payloads exceeding 50,000 characters with 413 Payload Too Large', async () => {
    mockSessionUser = 'usr_authorized';
    const oversizedText = 'A'.repeat(50_001);
    const req = new NextRequest('http://localhost:3000/api/decision-trace/analyze', {
      method: 'POST',
      body: JSON.stringify({
        conversationText: oversizedText
      })
    });
    const res = await analyzeRoute(req);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(body.receivedLength).toBe(50_001);
  });

  test('server-rendered decisions forward Clerk auth and reuse the backend mapping', async () => {
    mockSessionUser = 'usr_authorized';
    mockSessionToken = 'jwt_ssr_test';
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.DECISIONTRACE_BACKEND_URL;
    process.env.DECISIONTRACE_BACKEND_URL = 'https://backend.test/api/v1';
    try {
      globalThis.fetch = (async (_url, init) => {
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt_ssr_test');
        return Response.json({ items: [{ id: 'decision-1', topic: 'storage', current_commitment: 'Use PostgreSQL', state: 'active' }] });
      }) as typeof fetch;
      const result = await getServerDecisions();
      expect(result[0].whatWasDecided).toBe('Use PostgreSQL');
      expect(result[0].title).toBe('Storage');
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl) process.env.DECISIONTRACE_BACKEND_URL = originalUrl;
      else delete process.env.DECISIONTRACE_BACKEND_URL;
    }
  });

  test('overview mapping does not invent historical trends or mislabel all findings as conflicts', async () => {
    mockSessionUser = 'usr_authorized';
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.DECISIONTRACE_BACKEND_URL;
    process.env.DECISIONTRACE_BACKEND_URL = 'https://backend.test/api/v1';
    try {
      globalThis.fetch = (async () => Response.json({ active_decisions: 4, pending_approvals: 2, recent_findings: 9 })) as typeof fetch;
      const result = await getServerMetrics();
      expect(result.decisionTrend).toEqual([]);
      expect(result.detectedConflictsCount).toBe(0);
      expect(result.attentionItems[0].actionUrl).toBe('/dashboard/approvals');
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl) process.env.DECISIONTRACE_BACKEND_URL = originalUrl;
      else delete process.env.DECISIONTRACE_BACKEND_URL;
    }
  });
});
