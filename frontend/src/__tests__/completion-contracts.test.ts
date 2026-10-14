import { describe, expect, test } from 'bun:test';
import {
  transformBackendOverview,
  transformBackendDecisions,
  transformBackendDecisionsToCommitments,
  transformBackendFindingsToConflicts,
  transformBackendApprovals
} from '@/features/decision-trace/api/transformers';

describe('Completion contracts', () => {
  test('overview counts actual conflicts and supplied task metrics without invented trends', () => {
    const result = transformBackendOverview({
      active_decisions: 2,
      recent_findings: 8,
      detected_conflicts: 1,
      open_commitments: 3,
      overdue_commitments: 2
    });
    expect(result.detectedConflictsCount).toBe(1);
    expect(result.openCommitmentsCount).toBe(3);
    expect(result.overdueCommitmentsCount).toBe(2);
    expect(result.decisionTrend).toEqual([]);
  });
  test('decisions surface the stored source excerpt without inventing confidence', () => {
    const result = transformBackendDecisions([
      {
        id: 'decision',
        current_commitment: 'Use PostgreSQL',
        source_evidence: [{ chunk_id: 'chunk', excerpt: 'We decided to use PostgreSQL.' }]
      }
    ]);
    expect(result[0].evidence[0].quote).toBe('We decided to use PostgreSQL.');
    expect(result[0].confidence).toBe(undefined);
  });
  test('tasks retain overdue and follow-up flags and their actual decision link', () => {
    const result = transformBackendDecisionsToCommitments([
      {
        id: 'task',
        task: 'Migration',
        decision_id: 'decision',
        status: 'in_progress',
        overdue: true,
        needsFollowUp: true
      }
    ]);
    expect(result[0].relatedDecisionId).toBe('decision');
    expect(result[0].overdue).toBe(true);
    expect(result[0].needsFollowUp).toBe(true);
  });
  test('conflict quotes are assigned to the correct conversation', () => {
    const result = transformBackendFindingsToConflicts([
      {
        id: 'finding',
        conversation_id: 'new',
        classification: 'possible_conflict',
        evidence: [
          { chunk_id: 'new-chunk', conversation_id: 'new', excerpt: 'New statement' },
          { chunk_id: 'prior-chunk', conversation_id: 'prior', excerpt: 'Prior statement' }
        ]
      }
    ]);
    expect(result[0].previousDecision.evidence.quote).toBe('Prior statement');
    expect(result[0].newerDecision.evidence.quote).toBe('New statement');
  });
  test('approval previews describe the action and omit the execution credential', () => {
    const result = transformBackendApprovals([
      {
        id: 'approval',
        execution_key: 'private-key',
        status: 'clarified',
        action_payload: { kind: 'create_task', new_value: 'Migration', owner: 'Alice' }
      }
    ]);
    expect(result[0].exactActionPreview.includes('private-key')).toBe(false);
    expect(result[0].exactActionPreview).toContain('Alice');
    expect(result[0].status).toBe('clarified');
  });
});
