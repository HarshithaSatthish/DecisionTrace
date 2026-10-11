// ============================================================================
// DecisionTrace Service — Centralized API Integration Layer
// Connects to FastAPI / Qdrant / Lyzr backend via Next.js Route Handlers
// ============================================================================

import {
  Decision,
  DecisionFilters,
  Commitment,
  CommitmentFilters,
  Conflict,
  ConflictFilters,
  ApprovalRequest,
  ApprovalFilters,
  ApprovalActionPayload,
  ConflictResolvePayload,
  ActivityItem,
  ActivityFilters,
  DashboardMetrics
} from '../types';
import {
  FIXTURE_DECISIONS,
  FIXTURE_COMMITMENTS,
  FIXTURE_CONFLICTS,
  FIXTURE_APPROVALS,
  FIXTURE_ACTIVITY,
  FIXTURE_METRICS
} from '../data/fixtures';

// Helper to determine if we should attempt direct FastAPI backend or proxy handler
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  try {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/decision-trace/metrics');
      if (res.ok) {
        return (await res.json()) as DashboardMetrics;
      }
    }
  } catch (error) {
    console.warn('Backend metrics fetch failed, using fallback preview:', error);
  }
  return FIXTURE_METRICS;
}

export async function getDecisions(filters?: DecisionFilters): Promise<Decision[]> {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams();
      if (filters?.search) params.set('search', filters.search);
      if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
      if (filters?.category && filters.category !== 'all') params.set('category', filters.category);

      const res = await fetch(`/api/decision-trace/decisions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : (data.items ?? FIXTURE_DECISIONS);
      }
    }
  } catch (error) {
    console.warn('Backend decisions fetch failed, using fallback preview:', error);
  }

  // Filter local preview items
  let result = [...FIXTURE_DECISIONS];
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.whatWasDecided.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q)
    );
  }
  if (filters?.status && filters.status !== 'all') {
    result = result.filter((d) => d.status === filters.status);
  }
  return result;
}

export async function getDecisionById(id: string): Promise<Decision | null> {
  const decisions = await getDecisions();
  return decisions.find((d) => d.id === id) ?? null;
}

export async function getCommitments(filters?: CommitmentFilters): Promise<Commitment[]> {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams();
      if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
      if (filters?.owner && filters.owner !== 'all') params.set('owner', filters.owner);
      if (filters?.priority && filters.priority !== 'all') params.set('priority', filters.priority);

      const res = await fetch(`/api/decision-trace/commitments?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : (data.items ?? FIXTURE_COMMITMENTS);
      }
    }
  } catch (error) {
    console.warn('Backend commitments fetch failed, using fallback preview:', error);
  }

  let result = [...FIXTURE_COMMITMENTS];
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (c) => c.title.toLowerCase().includes(q) || c.task.toLowerCase().includes(q)
    );
  }
  if (filters?.status && filters.status !== 'all') {
    result = result.filter((c) => c.status === filters.status);
  }
  if (filters?.priority && filters.priority !== 'all') {
    result = result.filter((c) => c.priority === filters.priority);
  }
  return result;
}

export async function updateCommitmentStatus(
  id: string,
  newStatus: Commitment['status']
): Promise<Commitment> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`/api/decision-trace/commitments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        body.error || body.detail || `Commitment persistence failed with HTTP ${res.status}`
      );
    }
    return body as Commitment;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error) throw err;
    throw new Error('Network error: failed to persist commitment status to backend.', {
      cause: err
    });
  }
}

export async function getConflicts(filters?: ConflictFilters): Promise<Conflict[]> {
  try {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/decision-trace/conflicts');
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : (data.items ?? FIXTURE_CONFLICTS);
      }
    }
  } catch (error) {
    console.warn('Backend conflicts fetch failed, using fallback preview:', error);
  }

  let result = [...FIXTURE_CONFLICTS];
  if (filters?.status && filters.status !== 'all') {
    result = result.filter((c) => c.status === filters.status);
  }
  return result;
}

export async function resolveConflict(
  id: string,
  payload: ConflictResolvePayload
): Promise<{ success: boolean; message: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`/api/decision-trace/conflicts/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        body.detail || body.error || `Conflict resolution failed with HTTP ${res.status}`
      );
    }
    return body;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error) throw err;
    throw new Error('Network error: failed to resolve conflict on backend.', {
      cause: err
    });
  }
}

export async function getApprovals(filters?: ApprovalFilters): Promise<ApprovalRequest[]> {
  try {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/decision-trace/approvals');
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : (data.items ?? FIXTURE_APPROVALS);
      }
    }
  } catch (error) {
    console.warn('Backend approvals fetch failed, using fallback preview:', error);
  }

  let result = [...FIXTURE_APPROVALS];
  if (filters?.status && filters.status !== 'all') {
    result = result.filter((a) => a.status === filters.status);
  }
  return result;
}

/**
 * Execute an approval action.
 * CRITICAL RULE: All approvals must eventually call authenticated backend endpoints.
 * Never execute actions directly in frontend state or assume approval succeeded without a backend response.
 */
export async function executeApprovalAction(
  id: string,
  payload: ApprovalActionPayload
): Promise<{ success: boolean; approvalId: string; status: string; executionSummary: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`/api/decision-trace/approvals/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const responseData = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMessage =
        responseData.detail ||
        responseData.error ||
        `Backend approval endpoint failed: HTTP ${res.status} ${res.statusText}. Action aborted.`;
      throw new Error(errorMessage);
    }

    return responseData;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error) throw err;
    throw new Error('Network error: failed to execute approval on backend.', {
      cause: err
    });
  }
}

export async function getActivity(filters?: ActivityFilters): Promise<ActivityItem[]> {
  try {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/decision-trace/activity');
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : (data.items ?? FIXTURE_ACTIVITY);
      }
    }
  } catch (error) {
    console.warn('Backend activity fetch failed, using fallback preview:', error);
  }

  let result = [...FIXTURE_ACTIVITY];
  if (filters?.type && filters.type !== 'all') {
    result = result.filter((a) => a.type === filters.type);
  }
  return result;
}
