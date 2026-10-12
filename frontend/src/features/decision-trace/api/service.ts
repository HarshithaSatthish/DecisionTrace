// ============================================================================
// DecisionTrace Service — Centralized API Integration Layer
// Connects to FastAPI / Qdrant / Lyzr backend via Next.js Route Handlers & Server Fetching
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
  OmiConversation,
  OmiConversationDetail,
  OmiIntegrationStatus,
  OmiLinkResult
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
import {
  transformBackendOverview,
  transformBackendDecisions,
  transformBackendDecisionsToCommitments,
  transformBackendFindingsToConflicts,
  transformBackendApprovals,
  transformBackendActivity,
  transformBackendConversations,
  transformBackendConversationDetail
} from './transformers';

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
// Client-Side Only Ephemeral In-Memory Cache
// Strict Cache Isolation:
// - Completely disabled on server-rendered requests (typeof window === 'undefined')
// - Only caches in browser when an authenticated tenant/user identity is established
// - Automatically purged on scope switch or mutations
// ----------------------------------------------------------------------------
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const clientMemoryCache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_CACHE_TTL_MS = 15000;
let clientTestScope: string | null = null;

function isServer(): boolean {
  return typeof window === 'undefined';
}

/**
 * Sets client-side tenant/user scope (used in browser or test harnesses).
 * Has no effect on server-side requests.
 */
export function setClientCacheScope(scope: string): void {
  if (isServer()) return;
  if (clientTestScope !== scope) {
    clientMemoryCache.clear();
    clientTestScope = scope;
  }
}

export function invalidateClientCache(): void {
  clientMemoryCache.clear();
}

function getActiveTenantScope(): string | null {
  if (isServer()) {
    // Server requests NEVER share an in-memory cache
    return null;
  }
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
  return clientTestScope;
}

function getFromClientCache<T>(key: string): T | null {
  if (isServer()) return null; // NEVER cache on server to prevent cross-user leakage
  const scope = getActiveTenantScope();
  if (!scope) return null; // Do not cache without verified identity
  const scopedKey = `${scope}:${key}`;
  const entry = clientMemoryCache.get(scopedKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    clientMemoryCache.delete(scopedKey);
    return null;
  }
  return entry.data as T;
}

function setInClientCache<T>(key: string, data: T, ttlMs = DEFAULT_CACHE_TTL_MS): void {
  if (isServer()) return; // NEVER cache on server
  const scope = getActiveTenantScope();
  if (!scope) return; // Do not cache without verified identity
  const scopedKey = `${scope}:${key}`;
  clientMemoryCache.set(scopedKey, { data, expiresAt: Date.now() + ttlMs });
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
 * Server-side request-scoped Clerk authentication headers.
 * Extracts credentials per-request without any shared mutable state.
 */
async function getServerAuthHeaders(
  overrideHeaders?: Record<string, string>
): Promise<Record<string, string> | null> {
  if (overrideHeaders) {
    return overrideHeaders;
  }
  if (typeof window !== 'undefined') {
    return null;
  }
  // Mock test authentication is STRICTLY FORBIDDEN and IMPOSSIBLE to activate in production
  if (process.env.NODE_ENV !== 'production' && process.env.TEST_AUTH_USER_ID) {
    return {
      'Content-Type': 'application/json',
      'X-User-Id': process.env.TEST_AUTH_USER_ID,
      'Authorization': `Bearer test_token_${process.env.TEST_AUTH_USER_ID}`
    };
  }
  try {
    const { auth } = await import('@clerk/nextjs/server');
    const session = await auth();
    const { userId, orgId } = session;
    if (!userId) {
      return null;
    }
    const token = await session.getToken().catch(() => null);
    return {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
      ...(orgId ? { 'X-Org-Id': orgId } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  } catch {
    return null;
  }
}

/**
 * Direct request-scoped server fetcher to FastAPI backend.
 * Never shares cache, validates auth per-request, and surfaces honest errors.
 */
async function fetchBackendOnServer<T>(
  endpointPath: string,
  transform: (data: unknown) => T,
  options?: { authHeaders?: Record<string, string>; timeoutMs?: number }
): Promise<T> {
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  if (!backendUrl) {
    throw new DecisionTraceApiError(
      'Configuration error: DECISIONTRACE_BACKEND_URL is not configured.',
      500,
      'SERVER_ERROR'
    );
  }

  const authHeaders = await getServerAuthHeaders(options?.authHeaders);
  if (!authHeaders) {
    throw createSafeApiError(401);
  }

  const timeoutMs = options?.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${backendUrl}${endpointPath}`, {
      headers: authHeaders,
      cache: 'no-store',
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

  const json = await res.json();
  return transform(json);
}

/**
 * Client-side browser fetcher to Next.js route handlers.
 */
async function fetchClientEndpoint<T>(
  clientUrl: string,
  timeoutMs = 10000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(clientUrl, {
      cache: 'no-store',
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

  return (await res.json()) as T;
}

// ----------------------------------------------------------------------------
// Dashboard Metrics & Overview
// Backend Contract: GET /overview (OverviewResponse)
// ----------------------------------------------------------------------------
export async function getDashboardMetrics(
  options?: { authHeaders?: Record<string, string> }
): Promise<DashboardMetrics> {
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  if (!backendUrl) {
    if (isDevPreviewEnabled()) return FIXTURE_METRICS;
    return EMPTY_METRICS;
  }

  if (isServer()) {
    try {
      return await fetchBackendOnServer(
        '/overview',
        (json) => transformBackendOverview(json as Record<string, unknown>),
        options
      );
    } catch (error) {
      if (isDevPreviewEnabled()) {
        console.warn('Backend overview fetch failed, serving preview metrics:', error);
        return FIXTURE_METRICS;
      }
      throw error;
    }
  }

  // Client-side execution:
  const cacheKey = 'metrics:overview';
  const cached = getFromClientCache<DashboardMetrics>(cacheKey);
  if (cached !== null) return cached;

  try {
    const raw = await fetchClientEndpoint<Record<string, unknown>>('/api/decision-trace/metrics');
    const data = transformBackendOverview(raw);
    setInClientCache(cacheKey, data);
    return data;
  } catch (error) {
    if (isDevPreviewEnabled()) {
      return FIXTURE_METRICS;
    }
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Decisions Registry
// Backend Contract: GET /decisions (DecisionListResponse)
// ----------------------------------------------------------------------------
export async function getDecisions(
  filters?: DecisionFilters,
  options?: { authHeaders?: Record<string, string> }
): Promise<Decision[]> {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters?.category && filters.category !== 'all') params.set('category', filters.category);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  if (!backendUrl) {
    if (isDevPreviewEnabled()) return filterFixtureDecisions(filters);
    return [];
  }

  if (isServer()) {
    try {
      return await fetchBackendOnServer(
        `/decisions${qs}`,
        (raw) => {
          const items = Array.isArray(raw)
            ? raw
            : ((raw as { items?: unknown[] })?.items ?? []);
          let result = transformBackendDecisions(items);
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
        },
        options
      );
    } catch (error) {
      if (isDevPreviewEnabled()) {
        console.warn('Backend decisions fetch failed, serving preview decisions:', error);
        return filterFixtureDecisions(filters);
      }
      throw error;
    }
  }

  // Client-side execution:
  const cacheKey = `decisions:${qs}`;
  const cached = getFromClientCache<Decision[]>(cacheKey);
  if (cached !== null) return cached;

  try {
    const raw = await fetchClientEndpoint<unknown>(`/api/decision-trace/decisions${qs}`);
    const items = Array.isArray(raw) ? raw : ((raw as { items?: unknown[] })?.items ?? []);
    const data = transformBackendDecisions(items);
    setInClientCache(cacheKey, data);
    return data;
  } catch (error) {
    if (isDevPreviewEnabled()) {
      return filterFixtureDecisions(filters);
    }
    throw error;
  }
}

export async function getDecisionById(
  id: string,
  options?: { authHeaders?: Record<string, string> }
): Promise<Decision | null> {
  const decisions = await getDecisions(undefined, options);
  return decisions.find((d) => d.id === id) ?? null;
}

// ----------------------------------------------------------------------------
// Commitments Guardian Board
// Implemented Contract: Derived from Decisions (Decision-derived data contract)
// Backend: GET /decisions
// ----------------------------------------------------------------------------
export async function getCommitments(
  filters?: CommitmentFilters,
  options?: { authHeaders?: Record<string, string> }
): Promise<Commitment[]> {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters?.owner && filters.owner !== 'all') params.set('owner', filters.owner);
  if (filters?.priority && filters.priority !== 'all') params.set('priority', filters.priority);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  if (!backendUrl) {
    if (isDevPreviewEnabled()) return filterFixtureCommitments(filters);
    return [];
  }

  if (isServer()) {
    try {
      // Calls /decisions under the implemented decision-derived data contract
      return await fetchBackendOnServer(
        `/decisions${qs}`,
        (raw) => {
          const items = Array.isArray(raw)
            ? raw
            : ((raw as { items?: unknown[] })?.items ?? []);
          let result = transformBackendDecisionsToCommitments(items);
          if (filters?.status && filters.status !== 'all') {
            result = result.filter((c) => c.status === filters.status);
          }
          if (filters?.owner && filters.owner !== 'all') {
            result = result.filter((c) => c.owner === filters.owner);
          }
          if (filters?.priority && filters.priority !== 'all') {
            result = result.filter((c) => c.priority === filters.priority);
          }
          return result;
        },
        options
      );
    } catch (error) {
      if (isDevPreviewEnabled()) {
        console.warn('Backend commitments fetch failed, serving preview commitments:', error);
        return filterFixtureCommitments(filters);
      }
      throw error;
    }
  }

  // Client-side execution:
  const cacheKey = `commitments:${qs}`;
  const cached = getFromClientCache<Commitment[]>(cacheKey);
  if (cached !== null) return cached;

  try {
    const raw = await fetchClientEndpoint<unknown>(`/api/decision-trace/commitments${qs}`);
    const items = Array.isArray(raw) ? raw : ((raw as { items?: unknown[] })?.items ?? []);
    const data = transformBackendDecisionsToCommitments(items);
    setInClientCache(cacheKey, data);
    return data;
  } catch (error) {
    if (isDevPreviewEnabled()) {
      return filterFixtureCommitments(filters);
    }
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Conflicts & Contradictions Guardian
// Implemented Contract: Derived from Agent Findings (Findings contract)
// Backend: GET /findings
// ----------------------------------------------------------------------------
export async function getConflicts(
  filters?: ConflictFilters,
  options?: { authHeaders?: Record<string, string> }
): Promise<Conflict[]> {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters?.severity && filters.severity !== 'all') params.set('severity', filters.severity);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  if (!backendUrl) {
    if (isDevPreviewEnabled()) return filterFixtureConflicts(filters);
    return [];
  }

  if (isServer()) {
    try {
      // Calls /findings under the implemented findings contract
      return await fetchBackendOnServer(
        `/findings${qs}`,
        (raw) => {
          const items = Array.isArray(raw)
            ? raw
            : ((raw as { items?: unknown[] })?.items ?? []);
          let result = transformBackendFindingsToConflicts(items);
          if (filters?.status && filters.status !== 'all') {
            result = result.filter((c) => c.status === filters.status);
          }
          if (filters?.severity && filters.severity !== 'all') {
            result = result.filter((c) => c.severity === filters.severity);
          }
          return result;
        },
        options
      );
    } catch (error) {
      if (error instanceof DecisionTraceApiError && error.code === 'DEV_PREVIEW') {
        return filterFixtureConflicts(filters);
      }
      if (isDevPreviewEnabled()) {
        console.warn('Backend findings/conflicts fetch failed, serving preview conflicts:', error);
        return filterFixtureConflicts(filters);
      }
      throw error;
    }
  }

  // Client-side execution:
  const cacheKey = `conflicts:${qs}`;
  const cached = getFromClientCache<Conflict[]>(cacheKey);
  if (cached !== null) return cached;

  try {
    const raw = await fetchClientEndpoint<unknown>(`/api/decision-trace/conflicts${qs}`);
    const items = Array.isArray(raw) ? raw : ((raw as { items?: unknown[] })?.items ?? []);
    const data = transformBackendFindingsToConflicts(items);
    setInClientCache(cacheKey, data);
    return data;
  } catch (error) {
    if (isDevPreviewEnabled()) {
      return filterFixtureConflicts(filters);
    }
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Approvals & Consensus Review
// Backend Contract: GET /approvals (ApprovalListResponse)
// ----------------------------------------------------------------------------
export async function getApprovals(
  filters?: ApprovalFilters,
  options?: { authHeaders?: Record<string, string> }
): Promise<ApprovalRequest[]> {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  if (!backendUrl) {
    if (isDevPreviewEnabled()) return filterFixtureApprovals(filters);
    return [];
  }

  if (isServer()) {
    try {
      return await fetchBackendOnServer(
        `/approvals${qs}`,
        (raw) => {
          const items = Array.isArray(raw)
            ? raw
            : ((raw as { items?: unknown[] })?.items ?? []);
          let result = transformBackendApprovals(items);
          if (filters?.status && filters.status !== 'all') {
            result = result.filter((a) => a.status === filters.status);
          }
          return result;
        },
        options
      );
    } catch (error) {
      if (error instanceof DecisionTraceApiError && error.code === 'DEV_PREVIEW') {
        return filterFixtureApprovals(filters);
      }
      if (isDevPreviewEnabled()) {
        console.warn('Backend approvals fetch failed, serving preview approvals:', error);
        return filterFixtureApprovals(filters);
      }
      throw error;
    }
  }

  // Client-side execution:
  const cacheKey = `approvals:${qs}`;
  const cached = getFromClientCache<ApprovalRequest[]>(cacheKey);
  if (cached !== null) return cached;

  try {
    const raw = await fetchClientEndpoint<unknown>(`/api/decision-trace/approvals${qs}`);
    const items = Array.isArray(raw) ? raw : ((raw as { items?: unknown[] })?.items ?? []);
    const data = transformBackendApprovals(items);
    setInClientCache(cacheKey, data);
    return data;
  } catch (error) {
    if (isDevPreviewEnabled()) {
      return filterFixtureApprovals(filters);
    }
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Activity Stream & Immutable Audit Log
// Backend Contract: GET /activity (ActivityResponse)
// ----------------------------------------------------------------------------
export async function getActivity(
  filters?: ActivityFilters,
  options?: { authHeaders?: Record<string, string> }
): Promise<ActivityItem[]> {
  const params = new URLSearchParams();
  if (filters?.type && filters.type !== 'all') params.set('type', filters.type);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  if (!backendUrl) {
    if (isDevPreviewEnabled()) return filterFixtureActivity(filters);
    return [];
  }

  if (isServer()) {
    try {
      return await fetchBackendOnServer(
        `/activity${qs}`,
        (raw) => {
          const items = Array.isArray(raw)
            ? raw
            : ((raw as { items?: unknown[] })?.items ?? []);
          let result = transformBackendActivity(items);
          if (filters?.type && filters.type !== 'all') {
            result = result.filter((a) => a.type === filters.type);
          }
          if (filters?.search) {
            const q = filters.search.toLowerCase();
            result = result.filter(
              (a) =>
                a.title.toLowerCase().includes(q) ||
                a.description.toLowerCase().includes(q)
            );
          }
          return result;
        },
        options
      );
    } catch (error) {
      if (error instanceof DecisionTraceApiError && error.code === 'DEV_PREVIEW') {
        return filterFixtureActivity(filters);
      }
      if (isDevPreviewEnabled()) {
        console.warn('Backend activity fetch failed, serving preview activity:', error);
        return filterFixtureActivity(filters);
      }
      throw error;
    }
  }

  // Client-side execution:
  const cacheKey = `activity:${qs}`;
  const cached = getFromClientCache<ActivityItem[]>(cacheKey);
  if (cached !== null) return cached;

  try {
    const raw = await fetchClientEndpoint<unknown>(`/api/decision-trace/activity${qs}`);
    const items = Array.isArray(raw) ? raw : ((raw as { items?: unknown[] })?.items ?? []);
    const data = transformBackendActivity(items);
    setInClientCache(cacheKey, data);
    return data;
  } catch (error) {
    if (isDevPreviewEnabled()) {
      return filterFixtureActivity(filters);
    }
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Client-Side Human Actions & Mutations
// Invalidate cache immediately to maintain fresh state across views
// ----------------------------------------------------------------------------
export async function updateCommitmentStatus(
  id: string,
  newStatus: Commitment['status']
): Promise<Commitment> {
  invalidateClientCache();
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
    throw new Error(String(err), { cause: err });
  }
}

export async function resolveConflict(
  id: string,
  payload: ConflictResolvePayload
): Promise<{ success: boolean; message: string }> {
  invalidateClientCache();
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
        body.error || body.detail || `Conflict resolution failed with HTTP ${res.status}`
      );
    }
    return {
      success: body.success ?? true,
      message: body.message ?? `Conflict ${id} resolved successfully.`
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error) throw err;
    throw new Error(String(err), { cause: err });
  }
}

export async function executeApprovalAction(
  id: string,
  payload: ApprovalActionPayload
): Promise<{ success: boolean; approvalId: string; status: string; executionSummary: string }> {
  invalidateClientCache();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`/api/decision-trace/approvals/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        body.error || body.detail || `Approval execution failed with HTTP ${res.status}`
      );
    }
    return body;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error) throw err;
    throw new Error(String(err), { cause: err });
  }
}

// ----------------------------------------------------------------------------
// In-Memory Dev-Preview Filter Utilities
// ----------------------------------------------------------------------------
function filterFixtureDecisions(filters?: DecisionFilters): Decision[] {
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

function filterFixtureCommitments(filters?: CommitmentFilters): Commitment[] {
  let result = [...FIXTURE_COMMITMENTS];
  if (filters?.status && filters.status !== 'all') {
    result = result.filter((c) => c.status === filters.status);
  }
  if (filters?.owner && filters.owner !== 'all') {
    result = result.filter((c) => c.owner === filters.owner);
  }
  if (filters?.priority && filters.priority !== 'all') {
    result = result.filter((c) => c.priority === filters.priority);
  }
  return result;
}

function filterFixtureConflicts(filters?: ConflictFilters): Conflict[] {
  let result = [...FIXTURE_CONFLICTS];
  if (filters?.status && filters.status !== 'all') {
    result = result.filter((c) => c.status === filters.status);
  }
  if (filters?.severity && filters.severity !== 'all') {
    result = result.filter((c) => c.severity === filters.severity);
  }
  return result;
}

function filterFixtureApprovals(filters?: ApprovalFilters): ApprovalRequest[] {
  let result = [...FIXTURE_APPROVALS];
  if (filters?.status && filters.status !== 'all') {
    result = result.filter((a) => a.status === filters.status);
  }
  return result;
}

function filterFixtureActivity(filters?: ActivityFilters): ActivityItem[] {
  let result = [...FIXTURE_ACTIVITY];
  if (filters?.type && filters.type !== 'all') {
    result = result.filter((a) => a.type === filters.type);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
    );
  }
  return result;
}


// ============================================================================
// Omi Conversations & Integration Services
// ============================================================================
export async function getConversations(
  filters?: { limit?: number; offset?: number },
  options?: { authHeaders?: Record<string, string> }
): Promise<OmiConversation[]> {
  const qs = filters?.limit ? `?limit=${filters.limit}&offset=${filters.offset || 0}` : '';
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;

  if (!backendUrl) {
    return [];
  }

  if (isServer()) {
    try {
      return await fetchBackendOnServer(
        `/conversations${qs}`,
        (raw) => {
          const items = Array.isArray(raw)
            ? raw
            : ((raw as { items?: unknown[] })?.items ?? []);
          return transformBackendConversations(items);
        },
        options
      );
    } catch (error) {
      if (isDevPreviewEnabled()) return [];
      throw error;
    }
  }

  // Client-side fetch
  const cacheKey = `conversations:${qs}`;
  const cached = getFromClientCache<OmiConversation[]>(cacheKey);
  if (cached !== null) return cached;

  try {
    const raw = await fetchClientEndpoint<unknown>(`/api/decision-trace/conversations${qs}`);
    const items = Array.isArray(raw) ? raw : ((raw as { items?: unknown[] })?.items ?? []);
    const data = transformBackendConversations(items);
    setInClientCache(cacheKey, data);
    return data;
  } catch (error) {
    if (isDevPreviewEnabled()) return [];
    throw error;
  }
}

export async function getConversationDetail(
  id: string,
  options?: { authHeaders?: Record<string, string> }
): Promise<OmiConversationDetail> {
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  if (!backendUrl) {
    throw new Error('Backend URL is not configured');
  }

  if (isServer()) {
    return await fetchBackendOnServer(
      `/conversations/${id}`,
      (raw) => transformBackendConversationDetail(raw),
      options
    );
  }

  const raw = await fetchClientEndpoint<unknown>(`/api/decision-trace/conversations/${id}`);
  return transformBackendConversationDetail(raw);
}

export async function getOmiIntegrationStatus(options?: {
  authHeaders?: Record<string, string>;
}): Promise<OmiIntegrationStatus> {
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL;
  if (!backendUrl) {
    return { connected: false };
  }

  if (isServer()) {
    try {
      return await fetchBackendOnServer(
        `/integrations/omi/status`,
        (raw) => {
          const r = (raw || {}) as Record<string, unknown>;
          return {
            connected: Boolean(r.connected),
            installationId: r.installation_id ? String(r.installation_id) : undefined,
            externalOmiUid: r.external_omi_uid ? String(r.external_omi_uid) : undefined,
            createdAt: r.created_at ? String(r.created_at) : undefined,
            webhookUrl: r.webhook_url ? String(r.webhook_url) : undefined
          };
        },
        options
      );
    } catch (error) {
      if (isDevPreviewEnabled()) return { connected: false };
      throw error;
    }
  }

  const raw = await fetchClientEndpoint<unknown>(`/api/decision-trace/integrations/omi/status`);
  const r = (raw || {}) as Record<string, unknown>;
  return {
    connected: Boolean(r.connected),
    installationId: r.installation_id ? String(r.installation_id) : undefined,
    externalOmiUid: r.external_omi_uid ? String(r.external_omi_uid) : undefined,
    createdAt: r.created_at ? String(r.created_at) : undefined,
    webhookUrl: r.webhook_url ? String(r.webhook_url) : undefined
  };
}

export async function linkOmiIntegration(externalOmiUid?: string): Promise<OmiLinkResult> {
  invalidateClientCache();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`/api/decision-trace/integrations/omi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ external_omi_uid: externalOmiUid }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        body.error || body.detail || `Failed to link Omi integration with status ${res.status}`
      );
    }
    return {
      installationId: body.installation_id,
      webhookToken: body.webhook_token,
      webhookUrl: body.webhook_url,
      message: body.message || 'Omi integration configured successfully'
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error) throw err;
    throw new Error(String(err), { cause: err });
  }
}
