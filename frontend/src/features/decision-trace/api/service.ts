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
import { isDevPreviewEnabled } from '@/lib/decision-trace-preview';

export const EMPTY_METRICS: DashboardMetrics = {
  activeDecisionsCount: 0,
  openCommitmentsCount: 0,
  detectedConflictsCount: 0,
  pendingApprovalsCount: 0,
  decisionTrend: [],
  attentionItems: [],
  recentActivity: [],
  isProductionOffline: true
};


// ----------------------------------------------------------------------------
// FRANZY #8 & #9: Per-User Ephemeral In-Memory Client Cache
// 15s TTL for read-only query deduplication with automatic invalidation on mutations.
// Never persists execution keys or tokens, never shared across browser sessions.
// ----------------------------------------------------------------------------
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const _clientMemoryCache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_CACHE_TTL_MS = 15000;

export function invalidateClientCache(): void {
  _clientMemoryCache.clear();
}

function getFromClientCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  const entry = _clientMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _clientMemoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setInClientCache<T>(key: string, data: T, ttlMs = DEFAULT_CACHE_TTL_MS): void {
  if (typeof window === 'undefined') return;
  _clientMemoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// Helper to determine if we should attempt direct FastAPI backend or proxy handler
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const cacheKey = 'metrics:overview';
  const cached = getFromClientCache<DashboardMetrics>(cacheKey);
  if (cached) return cached;

  try {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/decision-trace/metrics');
      if (res.ok) {
        const data = (await res.json()) as DashboardMetrics;
        setInClientCache(cacheKey, data);
        return data;
      }
    } else {
      const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
      if (backendUrl) {
        const res = await fetch(`${backendUrl}/metrics`, { cache: 'no-store' });
        if (res.ok) {
          return (await res.json()) as DashboardMetrics;
        }
      }
    }
  } catch (error) {
    console.warn('Backend metrics fetch failed, evaluating preview mode:', error);
  }

  if (isDevPreviewEnabled()) {
    return FIXTURE_METRICS;
  }
  return EMPTY_METRICS;
}

export async function getDecisions(filters?: DecisionFilters): Promise<Decision[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters?.category && filters.category !== 'all') params.set('category', filters.category);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const cacheKey = `decisions:${qs}`;
    const cached = getFromClientCache<Decision[]>(cacheKey);
    if (cached) return cached;

    if (typeof window !== 'undefined') {
      const res = await fetch(`/api/decision-trace/decisions${qs}`);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items ?? []);
        setInClientCache(cacheKey, items);
        return items;
      }
    } else {
      const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
      if (backendUrl) {
        const res = await fetch(`${backendUrl}/decisions${qs}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          return Array.isArray(data) ? data : (data.items ?? []);
        }
      }
    }
  } catch (error) {
    console.warn('Backend decisions fetch failed, evaluating preview mode:', error);
  }

  if (isDevPreviewEnabled()) {
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

  return [];
}

export async function getDecisionById(id: string): Promise<Decision | null> {
  const decisions = await getDecisions();
  return decisions.find((d) => d.id === id) ?? null;
}

export async function getCommitments(filters?: CommitmentFilters): Promise<Commitment[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters?.owner && filters.owner !== 'all') params.set('owner', filters.owner);
    if (filters?.priority && filters.priority !== 'all') params.set('priority', filters.priority);
    const qs = params.toString() ? `?${params.toString()}` : '';

    if (typeof window !== 'undefined') {
      const res = await fetch(`/api/decision-trace/commitments${qs}`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : (data.items ?? []);
      }
    } else {
      const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
      if (backendUrl) {
        const res = await fetch(`${backendUrl}/commitments${qs}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          return Array.isArray(data) ? data : (data.items ?? []);
        }
      }
    }
  } catch (error) {
    console.warn('Backend commitments fetch failed, evaluating preview mode:', error);
  }

  if (isDevPreviewEnabled()) {
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

  return [];
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
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
    const qs = params.toString() ? `?${params.toString()}` : '';

    if (typeof window !== 'undefined') {
      const res = await fetch(`/api/decision-trace/conflicts${qs}`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : (data.items ?? []);
      }
    } else {
      const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
      if (backendUrl) {
        const res = await fetch(`${backendUrl}/conflicts${qs}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          return Array.isArray(data) ? data : (data.items ?? []);
        }
      }
    }
  } catch (error) {
    console.warn('Backend conflicts fetch failed, evaluating preview mode:', error);
  }

  if (isDevPreviewEnabled()) {
    let result = [...FIXTURE_CONFLICTS];
    if (filters?.status && filters.status !== 'all') {
      result = result.filter((c) => c.status === filters.status);
    }
    return result;
  }

  return [];
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
    // Explicit cache bust on state mutation
    invalidateClientCache();
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
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const cacheKey = `approvals:${qs}`;
    const cached = getFromClientCache<ApprovalRequest[]>(cacheKey);
    if (cached) return cached;

    if (typeof window !== 'undefined') {
      const res = await fetch(`/api/decision-trace/approvals${qs}`);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items ?? []);
        setInClientCache(cacheKey, items);
        return items;
      }
    } else {
      const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
      if (backendUrl) {
        const res = await fetch(`${backendUrl}/approvals${qs}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          return Array.isArray(data) ? data : (data.items ?? []);
        }
      }
    }
  } catch (error) {
    console.warn('Backend approvals fetch failed, evaluating preview mode:', error);
  }

  if (isDevPreviewEnabled()) {
    let result = [...FIXTURE_APPROVALS];
    if (filters?.status && filters.status !== 'all') {
      result = result.filter((a) => a.status === filters.status);
    }
    return result;
  }

  return [];
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

    // Explicit cache bust on state mutation
    invalidateClientCache();

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
    const params = new URLSearchParams();
    if (filters?.type && filters.type !== 'all') params.set('type', filters.type);
    const qs = params.toString() ? `?${params.toString()}` : '';

    if (typeof window !== 'undefined') {
      const res = await fetch(`/api/decision-trace/activity${qs}`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : (data.items ?? []);
      }
    } else {
      const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
      if (backendUrl) {
        const res = await fetch(`${backendUrl}/activity${qs}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          return Array.isArray(data) ? data : (data.items ?? []);
        }
      }
    }
  } catch (error) {
    console.warn('Backend activity fetch failed, evaluating preview mode:', error);
  }

  if (isDevPreviewEnabled()) {
    let result = [...FIXTURE_ACTIVITY];
    if (filters?.type && filters.type !== 'all') {
      result = result.filter((a) => a.type === filters.type);
    }
    return result;
  }

  return [];
}
