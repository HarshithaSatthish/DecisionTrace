import { describe, expect, test } from 'bun:test';
import {
  FIXTURE_DECISIONS,
  FIXTURE_COMMITMENTS,
  FIXTURE_CONFLICTS,
  FIXTURE_APPROVALS,
  FIXTURE_ACTIVITY,
  FIXTURE_METRICS
} from '@/features/decision-trace/data/fixtures';

describe('DecisionTrace Domain Fixtures & Schema Compliance', () => {
  describe('Decisions Fixtures', () => {
    test('contains non-empty list of decisions', () => {
      expect(FIXTURE_DECISIONS.length).toBeGreaterThan(0);
    });

    test('every decision contains mandatory fields and valid confidence rating', () => {
      for (const d of FIXTURE_DECISIONS) {
        expect(d.id).toBeString();
        expect(d.title.length).toBeGreaterThan(5);
        expect(d.whatWasDecided.length).toBeGreaterThan(10);
        expect(d.confidence).toBeGreaterThanOrEqual(0);
        expect(d.confidence).toBeLessThanOrEqual(100);
        expect(['high', 'medium', 'low']).toContain(d.confidenceLevel);
        expect(['active', 'superseded', 'under_review', 'deprecated']).toContain(d.status);
        expect(Array.isArray(d.participants)).toBe(true);
        expect(d.participants.length).toBeGreaterThan(0);
        expect(Array.isArray(d.evidence)).toBe(true);
        expect(d.evidence.length).toBeGreaterThan(0);

        for (const ev of d.evidence) {
          expect(ev.id).toBeString();
          expect(['slack', 'teams', 'meeting', 'document', 'email']).toContain(ev.sourceType);
          expect(ev.quote.length).toBeGreaterThan(5);
          expect(ev.speakerOrAuthor.length).toBeGreaterThan(1);
        }
      }
    });
  });

  describe('Commitments Fixtures', () => {
    test('contains non-empty list of commitments across workflow statuses', () => {
      expect(FIXTURE_COMMITMENTS.length).toBeGreaterThan(0);
      const statuses = new Set(FIXTURE_COMMITMENTS.map((c) => c.status));
      expect(statuses.has('in_progress') || statuses.has('backlog')).toBe(true);
    });

    test('every commitment links to a decision and contains owner & priority', () => {
      for (const c of FIXTURE_COMMITMENTS) {
        expect(c.id).toBeString();
        expect(c.title.length).toBeGreaterThan(3);
        expect(c.task.length).toBeGreaterThan(5);
        expect(c.owner.length).toBeGreaterThan(1);
        expect(['backlog', 'in_progress', 'blocked', 'completed']).toContain(c.status);
        expect(['low', 'medium', 'high', 'critical']).toContain(c.priority);
        expect(c.relatedDecisionId).toBeString();
        expect(c.deadline).toBeString();
        expect(Array.isArray(c.evidence)).toBe(true);
      }
    });
  });

  describe('Conflicts Fixtures', () => {
    test('contains side-by-side comparative decisions with evidence quotes', () => {
      expect(FIXTURE_CONFLICTS.length).toBeGreaterThan(0);
      for (const conf of FIXTURE_CONFLICTS) {
        expect(conf.id).toBeString();
        expect(conf.title.length).toBeGreaterThan(5);
        expect(['low', 'medium', 'high', 'critical']).toContain(conf.severity);
        expect(['unresolved', 'resolved', 'escalated', 'dismissed']).toContain(conf.status);
        expect(conf.explanation.length).toBeGreaterThan(10);

        // Previous decision side
        expect(conf.previousDecision).toBeDefined();
        expect(conf.previousDecision.decisionText.length).toBeGreaterThan(5);
        expect(conf.previousDecision.evidence.quote.length).toBeGreaterThan(5);

        // Newer conflicting decision side
        expect(conf.newerDecision).toBeDefined();
        expect(conf.newerDecision.decisionText.length).toBeGreaterThan(5);
        expect(conf.newerDecision.evidence.quote.length).toBeGreaterThan(5);
      }
    });
  });

  describe('Approvals Fixtures', () => {
    test('contains high-impact actions with exactActionPreview and risk attribution', () => {
      expect(FIXTURE_APPROVALS.length).toBeGreaterThan(0);
      for (const app of FIXTURE_APPROVALS) {
        expect(app.id).toBeString();
        expect(app.title.length).toBeGreaterThan(5);
        expect(app.exactActionPreview.length).toBeGreaterThan(15);
        expect(app.proposedBy.length).toBeGreaterThan(1);
        expect(['pending', 'approved', 'rejected']).toContain(app.status);
        expect(['low', 'medium', 'high', 'critical']).toContain(app.impactLevel);
        expect([
          'supersede_decision',
          'reassign_commitment',
          'override_conflict',
          'policy_exception',
          'pipeline_execution'
        ]).toContain(app.actionType);
        expect(Array.isArray(app.evidence)).toBe(true);
      }
    });
  });

  describe('Activity & Overview Metrics Fixtures', () => {
    test('activity timeline entries contain attribution and timestamps', () => {
      expect(FIXTURE_ACTIVITY.length).toBeGreaterThan(0);
      for (const act of FIXTURE_ACTIVITY) {
        expect(act.id).toBeString();
        expect(act.title.length).toBeGreaterThan(3);
        expect(act.timestamp).toBeString();
        expect(act.actor).toBeDefined();
      }
    });

    test('metrics contain valid counts and attention items', () => {
      expect(FIXTURE_METRICS.activeDecisionsCount).toBeGreaterThanOrEqual(0);
      expect(FIXTURE_METRICS.openCommitmentsCount).toBeGreaterThanOrEqual(0);
      expect(FIXTURE_METRICS.detectedConflictsCount).toBeGreaterThanOrEqual(0);
      expect(FIXTURE_METRICS.pendingApprovalsCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(FIXTURE_METRICS.decisionTrend)).toBe(true);
      expect(Array.isArray(FIXTURE_METRICS.attentionItems)).toBe(true);
    });
  });
});
