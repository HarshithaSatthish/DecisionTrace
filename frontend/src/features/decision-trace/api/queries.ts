import { queryOptions } from '@tanstack/react-query';
import {
  getDashboardMetrics,
  getDecisions,
  getDecisionById,
  getCommitments,
  getConflicts,
  getApprovals,
  getActivity
} from './service';
import type {
  DecisionFilters,
  CommitmentFilters,
  ConflictFilters,
  ApprovalFilters,
  ActivityFilters
} from '../types';

export const decisionTraceKeys = {
  all: ['decision-trace'] as const,
  metrics: () => [...decisionTraceKeys.all, 'metrics'] as const,
  decisions: (filters?: DecisionFilters) =>
    [...decisionTraceKeys.all, 'decisions', filters ?? {}] as const,
  decisionDetail: (id: string) => [...decisionTraceKeys.all, 'decision', id] as const,
  commitments: (filters?: CommitmentFilters) =>
    [...decisionTraceKeys.all, 'commitments', filters ?? {}] as const,
  conflicts: (filters?: ConflictFilters) =>
    [...decisionTraceKeys.all, 'conflicts', filters ?? {}] as const,
  approvals: (filters?: ApprovalFilters) =>
    [...decisionTraceKeys.all, 'approvals', filters ?? {}] as const,
  activity: (filters?: ActivityFilters) =>
    [...decisionTraceKeys.all, 'activity', filters ?? {}] as const
};

export function metricsQueryOptions() {
  return queryOptions({
    queryKey: decisionTraceKeys.metrics(),
    queryFn: () => getDashboardMetrics(),
    staleTime: 1000 * 30
  });
}

export function decisionsQueryOptions(filters?: DecisionFilters) {
  return queryOptions({
    queryKey: decisionTraceKeys.decisions(filters),
    queryFn: () => getDecisions(filters),
    staleTime: 1000 * 30
  });
}

export function decisionDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: decisionTraceKeys.decisionDetail(id),
    queryFn: () => getDecisionById(id),
    staleTime: 1000 * 60
  });
}

export function commitmentsQueryOptions(filters?: CommitmentFilters) {
  return queryOptions({
    queryKey: decisionTraceKeys.commitments(filters),
    queryFn: () => getCommitments(filters),
    staleTime: 1000 * 30
  });
}

export function conflictsQueryOptions(filters?: ConflictFilters) {
  return queryOptions({
    queryKey: decisionTraceKeys.conflicts(filters),
    queryFn: () => getConflicts(filters),
    staleTime: 1000 * 30
  });
}

export function approvalsQueryOptions(filters?: ApprovalFilters) {
  return queryOptions({
    queryKey: decisionTraceKeys.approvals(filters),
    queryFn: () => getApprovals(filters),
    staleTime: 1000 * 30
  });
}

export function activityQueryOptions(filters?: ActivityFilters) {
  return queryOptions({
    queryKey: decisionTraceKeys.activity(filters),
    queryFn: () => getActivity(filters),
    staleTime: 1000 * 30
  });
}
