// ============================================================================
// DecisionTrace Service  Centralized API Integration Layer
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
  DashboardMetrics,
  AttentionItem
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

/**
 * Structured API Error for DecisionTrace client and server requests.
 * Never leaks stack traces or internal server details.
 */
export class DecisionTraceApiError extends Error {
  public statusCode?: number;
  public code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = 'DecisionTraceApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// ----------------------------------------------------------------------------
// FRANZY #8 & #9: Multi-Tenant Ephemeral In-Memory Client Cache
// 15s TTL for read-only query deduplication with automatic invalidation on mutations.
// Keys are strictly scoped to the active tenant/organization and user.
// Never persists execution keys or tokens, never shared across browser sessions.
// ----------------------------------------------------------------------------
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const _clientMemoryCache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_CACHE_TTL_MS = 15000;

let _activeTenantScope = 'global';

/**
 * Sets the active tenant/user scope for the client-side memory cache.
 * Automatically purges cached entries if the scope changes, preventing
 * any cross-tenant or cross-user data leakage.
 */
export function setClientCacheScope(scope: string): void {
  if (_activeTenantScope !== scope) {
    _clientMemoryCache.clear();
    _activeTenantScope = scope;
  }
}

export function invalidateClientCache(): void {
  _clientMemoryCache.clear();
}

function getActiveTenantScope(): string {
  if (typeof window !== 'undefined') {
    const clerk = (
      window as unknown as {
        Clerk?: {
          user?: { id?: string };
          organization?: { id?: string };
          session?: { lastActiveOrganizationId?: string };
        };
      }
    ).Clerk;
    if (clerk?.user?.id) {
      const org = clerk.organization?.id || clerk.session?.lastActiveOrganizationId || 'personal';
      return `${org}:${clerk.user.id}`;
    }
  }
  return _activeTenantScope;
}

function getFromClientCache<T>(key: string): T | null {
  const scopedKey = `${getActiveTenantScope()}:${key}`;
  const entry = _clientMemoryCache.get(scopedKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _clientMemoryCache.delete(scopedKey);
    return null;
  }
  return entry.data as T;
}

function setInClientCache<T>(key: string, data: T, ttlMs = DEFAULT_CACHE_TTL_MS): void {
  const scopedKey = `${getActiveTenantScope()}:${key}`;
  _clientMemoryCache.set(scopedKey, { data, expiresAt: Date.now() + ttlMs });
}

/**
 * Maps HTTP status codes into sanitized, user-friendly errors.
 * Strictly prevents leaking internal server details or stack traces.
 */
function createSafeApiError(status: number, messageOrDetail?: string): DecisionTraceApiError {
  if (status === 401) {
    return new DecisionTraceApiError(
      'Authentication required. Please sign in to continue.',
      401,
      'UNAUTHORIZED'
    );
  }
  if (status === 403) {
    return new DecisionTraceApiError(
      'Access denied: You do not have permission to view this resource.',
      403,
      'FORBIDDEN'
    );
  }
  if (status === 502) {
    return new DecisionTraceApiError(
      'Upstream gateway error. Service is temporarily unreachable.',
      502,
      'BAD_GATEWAY'
    );
  }
  if (status === 503) {
    return new DecisionTraceApiError(
      'Service temporarily unavailable. Please try again shortly.',
      503,
      'SERVICE_UNAVAILABLE'
    );
  }
  if (status >= 500) {
    return new DecisionTraceApiError(
      `Internal server error (HTTP ${status}). Please try again later.`,
      status,
      'SERVER_ERROR'
    );
  }
  return new DecisionTraceApiError(
    messageOrDetail || `Request failed with HTTP ${status}.`,
    status,
    'API_ERROR'
  );
}

/**
 * Centralized fetch helper with abort controller timeout and honest error handling.
 */
async function fetchEndpoint<T>(
  clientUrl: string,
  serverUrl: string | undefined,
  cacheKey: string,
  options?: RequestInit,
  timeoutMs = 10000
): Promise<T | null> {
  const isClient = typeof window !== 'undefined';
  const cached = getFromClientCache<T>(cacheKey);
  if (cached !== null) return cached;

  const targetUrl = isClient ? clientUrl : serverUrl;
  if (!targetUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      ...options,
      signal: controller.signal
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new DecisionTraceApiError(
        'Request timed out. Please check your network connection.',
        408,
        'TIMEOUT'
      );
    }
    throw new DecisionTraceApiError(
      'Network error: Failed to connect to backend service. Please check your connection.',
      0,
      'NETWORK_ERROR'
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let detail: string | undefined;
    try {
      const errJson = await res.json();
      detail =
        typeof errJson?.error === 'string'
          ? errJson.error
          : typeof errJson?.detail === 'string'
            ? errJson.detail
            : undefined;
    } catch {
      // Non-JSON response
    }
    throw createSafeApiError(res.status, detail);
  }

  const data = (await res.json()) as T;
  setInClientCache(cacheKey, data);
  return data;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const cacheKey = 'metrics:overview';
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  const serverUrl = backendUrl ? `${backendUrl}/metrics` : undefined;

  try {
    const rawData = await fetchEndpoint<Record<string, unknown>>(
      '/api/decision-trace/metrics',
      serverUrl,
      cacheKey,
      { cache: 'no-store' }
    );

    if (rawData !== null) {
      const activeCount = (rawData.active_decisions ?? rawData.activeDecisionsCount ?? 0) as number;
      const pendingCount = (rawData.pending_approvals ?? rawData.pendingApprovalsCount ?? 0) as number;
      const findingsCount = (rawData.recent_findings ?? rawData.detectedConflictsCount ?? 0) as number;

      const attentionItems = (rawData.attentionItems ?? []) as AttentionItem[];
      const decisionTrend = (rawData.decisionTrend ?? []) as {
        period: string;
        decisions: number;
        commitments: number;
      }[];
      const recentActivity = (rawData.recentActivity ?? []) as ActivityItem[];

      return {
        activeDecisionsCount: activeCount,
        openCommitmentsCount: (rawData.openCommitmentsCount ?? activeCount) as number,
        detectedConflictsCount: findingsCount,
        pendingApprovalsCount: pendingCount,
        decisionTrend,
        attentionItems,
        recentActivity,
        isProductionOffline: false
      };
    }
  } catch (error) {
    if (isDevPreviewEnabled()) {
      console.warn('Backend metrics fetch failed, serving preview metrics:', error);
      return FIXTURE_METRICS;
    }
    throw error;
  }

  if (isDevPreviewEnabled()) {
    return FIXTURE_METRICS;
  }
  return EMPTY_METRICS;
}

export async function getDecisions(filters?: DecisionFilters): Promise<Decision[]> {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters?.category && filters.category !== 'all') params.set('category', filters.category);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const cacheKey = `decisions:${qs}`;
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  const serverUrl = backendUrl ? `${backendUrl}/decisions${qs}` : undefined;

  try {
    const raw = await fetchEndpoint<unknown>(
      `/api/decision-trace/decisions${qs}`,
      serverUrl,
      cacheKey,
      { cache: 'no-store' }
    );

    if (raw !== null) {
      const items = Array.isArray(raw)
        ? (raw as Decision[])
        : ((raw as { items?: Decision[] }).items ?? []);
      return items;
    }
  } catch (error) {
    if (isDevPreviewEnabled()) {
      console.warn('Backend decisions fetch failed, serving preview decisions:', error);
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
    throw error;
  }

  if (isDevPreviewEnabled()) {
    return FIXTURE_DECISIONS;
  }
  return [];
}

export async function getDecisionById(id: string): Promise<Decision | null> {
  const decisions = await getDecisions();
  return decisions.find((d) => d.id === id) ?? null;
}

export async function getCommitments(filters?: CommitmentFilters): Promise<Commitment[]> {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters?.owner && filters.owner !== 'all') params.set('owner', filters.owner);
  if (filters?.priority && filters.priority !== 'all') params.set('priority', filters.priority);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const cacheKey = `commitments:${qs}`;
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  const serverUrl = backendUrl ? `${backendUrl}/commitments${qs}` : undefined;

  try {
    const raw = await fetchEndpoint<unknown>(
      `/api/decision-trace/commitments${qs}`,
      serverUrl,
      cacheKey,
      { cache: 'no-store' }
    );

    if (raw !== null) {
      const items = Array.isArray(raw)
        ? (raw as Commitment[])
        : ((raw as { items?: Commitment[] }).items ?? []);
      return items;
    }
  } catch (error) {
    if (isDevPreviewEnabled()) {
      console.warn('Backend commitments fetch failed, serving preview commitments:', error);
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
    throw error;
  }

  if (isDevPreviewEnabled()) {
    return FIXTURE_COMMITMENTS;
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
    // Bust client cache on state mutation
    invalidateClientCache();
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
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const cacheKey = `conflicts:${qs}`;
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  const serverUrl = backendUrl ? `${backendUrl}/conflicts${qs}` : undefined;

  try {
    const raw = await fetchEndpoint<unknown>(
      `/api/decision-trace/conflicts${qs}`,
      serverUrl,
      cacheKey,
      { cache: 'no-store' }
    );

    if (raw !== null) {
      const items = Array.isArray(raw)
        ? (raw as Conflict[])
        : ((raw as { items?: Conflict[] }).items ?? []);
      return items;
    }
  } catch (error) {
    if (isDevPreviewEnabled()) {
      console.warn('Backend conflicts fetch failed, serving preview conflicts:', error);
      let result = [...FIXTURE_CONFLICTS];
      if (filters?.status && filters.status !== 'all') {
        result = result.filter((c) => c.status === filters.status);
      }
      return result;
    }
    throw error;
  }

  if (isDevPreviewEnabled()) {
    return FIXTURE_CONFLICTS;
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
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const cacheKey = `approvals:${qs}`;
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  const serverUrl = backendUrl ? `${backendUrl}/approvals${qs}` : undefined;

  try {
    const raw = await fetchEndpoint<unknown>(
      `/api/decision-trace/approvals${qs}`,
      serverUrl,
      cacheKey,
      { cache: 'no-store' }
    );

    if (raw !== null) {
      const items = Array.isArray(raw)
        ? (raw as ApprovalRequest[])
        : ((raw as { items?: ApprovalRequest[] }).items ?? []);
      return items;
    }
  } catch (error) {
    if (isDevPreviewEnabled()) {
      console.warn('Backend approvals fetch failed, serving preview approvals:', error);
      let result = [...FIXTURE_APPROVALS];
      if (filters?.status && filters.status !== 'all') {
        result = result.filter((a) => a.status === filters.status);
      }
      return result;
    }
    throw error;
  }

  if (isDevPreviewEnabled()) {
    return FIXTURE_APPROVALS;
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
  const params = new URLSearchParams();
  if (filters?.type && filters.type !== 'all') params.set('type', filters.type);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const cacheKey = `activity:${qs}`;
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  const serverUrl = backendUrl ? `${backendUrl}/activity${qs}` : undefined;

  try {
    const raw = await fetchEndpoint<unknown>(
      `/api/decision-trace/activity${qs}`,
      serverUrl,
      cacheKey,
      { cache: 'no-store' }
    );

    if (raw !== null) {
      const items = Array.isArray(raw)
        ? (raw as ActivityItem[])
        : ((raw as { items?: ActivityItem[] }).items ?? []);
      return items;
    }
  } catch (error) {
    if (isDevPreviewEnabled()) {
      console.warn('Backend activity fetch failed, serving preview activity:', error);
      let result = [...FIXTURE_ACTIVITY];
      if (filters?.type && filters.type !== 'all') {
        result = result.filter((a) => a.type === filters.type);
      }
      return result;
    }
    throw error;
  }

  if (isDevPreviewEnabled()) {
    return FIXTURE_ACTIVITY;
  }
  return [];
}
