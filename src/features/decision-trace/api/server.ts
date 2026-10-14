import 'server-only';

import { NextRequest, type NextResponse } from 'next/server';
import { GET as decisions } from '@/app/api/decision-trace/decisions/route';
import { GET as commitments } from '@/app/api/decision-trace/commitments/route';
import { GET as conflicts } from '@/app/api/decision-trace/conflicts/route';
import { GET as approvals } from '@/app/api/decision-trace/approvals/route';
import { GET as activity } from '@/app/api/decision-trace/activity/route';
import { GET as metrics } from '@/app/api/decision-trace/metrics/route';
import type { Decision, Commitment, Conflict, ApprovalRequest, ActivityItem, DashboardMetrics } from '../types';

// Reuse authenticated API mappings during SSR without an HTTP round trip.
async function read<T>(response: Promise<NextResponse>): Promise<T> {
  const result = await response;
  if (!result.ok) throw new Error(`DecisionTrace request failed (${result.status}). Please retry.`);
  return result.json() as Promise<T>;
}

export function getDecisions(): Promise<Decision[]> {
  return read(decisions(new NextRequest('http://localhost/api/decision-trace/decisions')));
}

export function getCommitments(): Promise<Commitment[]> {
  return read(commitments(new NextRequest('http://localhost/api/decision-trace/commitments')));
}

export function getConflicts(): Promise<Conflict[]> {
  return read(conflicts());
}

export function getApprovals(): Promise<ApprovalRequest[]> {
  return read(approvals());
}

export function getActivity(): Promise<ActivityItem[]> {
  return read(activity(new NextRequest('http://localhost/api/decision-trace/activity')));
}

export function getDashboardMetrics(): Promise<DashboardMetrics> {
  return read(metrics());
}
