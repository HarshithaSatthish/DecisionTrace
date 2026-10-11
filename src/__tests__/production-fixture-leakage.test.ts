import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { isDevPreviewEnabled } from '@/lib/decision-trace-preview';
import {
  getDashboardMetrics,
  getDecisions,
  getCommitments,
  getConflicts,
  getApprovals,
  getActivity,
  EMPTY_METRICS
} from '@/features/decision-trace/api/service';
import {
  FIXTURE_DECISIONS,
  FIXTURE_COMMITMENTS,
  FIXTURE_CONFLICTS,
  FIXTURE_APPROVALS,
  FIXTURE_ACTIVITY,
  FIXTURE_METRICS
} from '@/features/decision-trace/data/fixtures';

describe('Production Fixture Leakage Prevention Audit', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Strict Production Environment (NODE_ENV=production, Preview Flag unset)', () => {
    beforeEach(() => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;
      delete process.env.DECISIONTRACE_BACKEND_URL;
    });

    test('isDevPreviewEnabled returns false in strict production', () => {
      expect(isDevPreviewEnabled()).toBe(false);
    });

    test('getDashboardMetrics returns honest EMPTY_METRICS with zero counts, never fixture data', async () => {
      const metrics = await getDashboardMetrics();
      expect(metrics.activeDecisionsCount).toBe(0);
      expect(metrics.openCommitmentsCount).toBe(0);
      expect(metrics.detectedConflictsCount).toBe(0);
      expect(metrics.pendingApprovalsCount).toBe(0);
      expect(metrics.attentionItems).toEqual([]);
      expect(metrics.recentActivity).toEqual([]);
      expect(metrics.decisionTrend).toEqual([]);
      expect(metrics.isProductionOffline).toBe(true);
      expect(metrics.activeDecisionsCount === FIXTURE_METRICS.activeDecisionsCount).toBe(false);
    });

    test('getDecisions returns honest empty array, never fixture decisions', async () => {
      const decisions = await getDecisions();
      expect(decisions).toEqual([]);
      expect(decisions.length).toBe(0);
      expect(decisions.length === FIXTURE_DECISIONS.length).toBe(false);
    });

    test('getCommitments returns honest empty array, never fixture commitments', async () => {
      const commitments = await getCommitments();
      expect(commitments).toEqual([]);
      expect(commitments.length).toBe(0);
      expect(commitments.length === FIXTURE_COMMITMENTS.length).toBe(false);
    });

    test('getConflicts returns honest empty array, never fixture conflicts', async () => {
      const conflicts = await getConflicts();
      expect(conflicts).toEqual([]);
      expect(conflicts.length).toBe(0);
      expect(conflicts.length === FIXTURE_CONFLICTS.length).toBe(false);
    });

    test('getApprovals returns honest empty array, never fixture approvals', async () => {
      const approvals = await getApprovals();
      expect(approvals).toEqual([]);
      expect(approvals.length).toBe(0);
      expect(approvals.length === FIXTURE_APPROVALS.length).toBe(false);
    });

    test('getActivity returns honest empty array, never fixture activity events', async () => {
      const activity = await getActivity();
      expect(activity).toEqual([]);
      expect(activity.length).toBe(0);
      expect(activity.length === FIXTURE_ACTIVITY.length).toBe(false);
    });
  });

  describe('Explicit Development Preview Mode (NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW=true)', () => {
    beforeEach(() => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW = 'true';
      delete process.env.DECISIONTRACE_BACKEND_URL;
    });

    test('isDevPreviewEnabled returns true when explicitly authorized', () => {
      expect(isDevPreviewEnabled()).toBe(true);
    });

    test('getDashboardMetrics safely serves fixture metrics in preview mode', async () => {
      const metrics = await getDashboardMetrics();
      expect(metrics.activeDecisionsCount).toBe(FIXTURE_METRICS.activeDecisionsCount);
      expect(metrics.attentionItems.length).toBe(FIXTURE_METRICS.attentionItems.length);
    });

    test('getDecisions serves fixture decisions in preview mode', async () => {
      const decisions = await getDecisions();
      expect(decisions.length).toBe(FIXTURE_DECISIONS.length);
      expect(decisions[0].id).toBe(FIXTURE_DECISIONS[0].id);
    });

    test('getCommitments serves fixture commitments in preview mode', async () => {
      const commitments = await getCommitments();
      expect(commitments.length).toBe(FIXTURE_COMMITMENTS.length);
      expect(commitments[0].id).toBe(FIXTURE_COMMITMENTS[0].id);
    });

    test('getConflicts serves fixture conflicts in preview mode', async () => {
      const conflicts = await getConflicts();
      expect(conflicts.length).toBe(FIXTURE_CONFLICTS.length);
    });

    test('getApprovals serves fixture approvals in preview mode', async () => {
      const approvals = await getApprovals();
      expect(approvals.length).toBe(FIXTURE_APPROVALS.length);
    });

    test('getActivity serves fixture activity in preview mode', async () => {
      const activity = await getActivity();
      expect(activity.length).toBe(FIXTURE_ACTIVITY.length);
    });
  });

  describe('EMPTY_METRICS Schema Validation', () => {
    test('EMPTY_METRICS conforms to DashboardMetrics contract', () => {
      expect(EMPTY_METRICS.activeDecisionsCount).toBe(0);
      expect(EMPTY_METRICS.openCommitmentsCount).toBe(0);
      expect(EMPTY_METRICS.detectedConflictsCount).toBe(0);
      expect(EMPTY_METRICS.pendingApprovalsCount).toBe(0);
      expect(Array.isArray(EMPTY_METRICS.decisionTrend)).toBe(true);
      expect(Array.isArray(EMPTY_METRICS.attentionItems)).toBe(true);
      expect(Array.isArray(EMPTY_METRICS.recentActivity)).toBe(true);
      expect(EMPTY_METRICS.isProductionOffline).toBe(true);
    });
  });
});
