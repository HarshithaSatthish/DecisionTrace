import { describe, expect, test, mock, beforeEach } from 'bun:test';
import {
  updateCommitmentStatus,
  resolveConflict,
  executeApprovalAction
} from '@/features/decision-trace/api/service';

describe('DecisionTrace Mutation Resilience & Backend Failure Handling', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('updateCommitmentStatus', () => {
    test('throws Error when backend responds with 503 Service Unavailable', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: 'Backend service unreachable: Commitment updates require FastAPI persistence',
              code: 'BACKEND_OFFLINE'
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          )
        )
      ) as unknown as typeof fetch;

      await expect(updateCommitmentStatus('cmt-101', 'in_progress')).rejects.toThrow(
        'Backend service unreachable'
      );
    });

    test('throws Error on network abort / timeout', async () => {
      globalThis.fetch = mock(() =>
        Promise.reject(new Error('Connection timed out after 8000ms'))
      ) as unknown as typeof fetch;

      await expect(updateCommitmentStatus('cmt-101', 'completed')).rejects.toThrow(
        'Connection timed out'
      );
    });

    test('returns persisted commitment object upon 200 OK from backend', async () => {
      const mockUpdated = {
        id: 'cmt-101',
        title: 'Complete test suite',
        status: 'completed',
        owner: 'Akshay',
        priority: 'high'
      };

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockUpdated), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        )
      ) as unknown as typeof fetch;

      const result = await updateCommitmentStatus('cmt-101', 'completed');
      expect(result.status).toBe('completed');
      expect(result.id).toBe('cmt-101');
    });
  });

  describe('resolveConflict', () => {
    test('throws descriptive error on 502 Bad Gateway / upstream error', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              detail: 'FastAPI conflict resolution service crashed or refused connection',
              code: 'BACKEND_UNREACHABLE'
            }),
            { status: 502, headers: { 'Content-Type': 'application/json' } }
          )
        )
      ) as unknown as typeof fetch;

      await expect(
        resolveConflict('conf-1', {
          action: 'resolve',
          rationale: 'Overridden by CTO'
        })
      ).rejects.toThrow('FastAPI conflict resolution service crashed');
    });

    test('returns confirmation payload only on 200 OK', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              message: 'Conflict resolved successfully'
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
      ) as unknown as typeof fetch;

      const result = await resolveConflict('conf-1', {
        action: 'resolve',
        rationale: 'Valid alignment'
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('resolved successfully');
    });
  });

  describe('executeApprovalAction', () => {
    test('halts execution and throws when backend returns 503 Pending Deployment', async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: false,
              error:
                'Backend service unreachable: Person 1 FastAPI endpoint /api/v1/approvals/appr-1/action is pending deployment. Approval actions are halted to prevent unverified mutations.',
              code: 'BACKEND_PENDING_DEPLOYMENT'
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          )
        )
      ) as unknown as typeof fetch;

      await expect(
        executeApprovalAction('appr-1', {
          action: 'approve',
          rationale: 'Approved for Q3 roadmap'
        })
      ).rejects.toThrow('Backend service unreachable: Person 1 FastAPI endpoint');
    });

    test('returns execution details when backend returns 200 OK', async () => {
      const mockResult = {
        success: true,
        approvalId: 'appr-1',
        status: 'approved',
        executionSummary: 'Decision superseded in Qdrant and relational registry'
      };

      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResult), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        )
      ) as unknown as typeof fetch;

      const result = await executeApprovalAction('appr-1', {
        action: 'approve',
        rationale: 'Validated'
      });
      expect(result.success).toBe(true);
      expect(result.status).toBe('approved');
      expect(result.executionSummary).toContain('superseded in Qdrant');
    });
  });
});
