import { describe, expect, test } from 'bun:test';
import {
  transformBackendActivity,
  transformBackendDecisions,
  transformBackendDecisionsToCommitments
} from '@/features/decision-trace/api/transformers';

describe('consolidated Codex + PR #14/#15 contracts', () => {
  test('decision evidence: Codex source_evidence wins', () => {
    const [d] = transformBackendDecisions([
      {
        id: 'd1',
        topic: 'launch',
        source_evidence: [{ chunk_id: 'c1', excerpt: 'We ship Friday' }],
        evidence: [{ chunk_id: 'c2', excerpt: 'other' }]
      }
    ]);
    expect(d.evidence.map((e) => e.quote)).toEqual(['We ship Friday']);
  });
  test('decision evidence: PR #15 raw evidence list is normalised, not passed through', () => {
    const [d] = transformBackendDecisions([
      {
        id: 'd1',
        topic: 'launch',
        evidence: [{ chunk_id: 'c2', excerpt: 'Akshay sends deck Thursday' }]
      }
    ]);
    expect(d.evidence[0].id).toBe('c2');
    expect(d.evidence[0].quote).toBe('Akshay sends deck Thursday');
  });
  test('commitment evidence normalised', () => {
    const [c] = transformBackendDecisionsToCommitments([
      { id: 't1', topic: 'deck', evidence: [{ chunk_id: 'c3', excerpt: 'by Thursday' }] }
    ]);
    expect(c.evidence[0].quote).toBe('by Thursday');
  });
  test('approval audit actions land in the approvals family', () => {
    const types = transformBackendActivity([
      { id: 1, action: 'approval_requested' },
      { id: 2, action: 'approval_granted' },
      { id: 3, action: 'conversation_processed' }
    ]).map((a) => a.type);
    expect(types).toEqual(['approval_requested', 'approval_executed', 'conversation_processed']);
  });
});
