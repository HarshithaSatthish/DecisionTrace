import { describe, expect, test } from 'bun:test';
import { mapAuditActionToActivityType, activityMatchesTab } from '@/lib/activity-mapping';
import { buildCategoryDistribution } from '@/lib/decision-categories';

describe('audit action -> activity type', () => {
  test('approval outcomes are approval events, not ingestion', () => {
    expect(mapAuditActionToActivityType('approval_granted')).toBe('approval_executed');
    expect(mapAuditActionToActivityType('approval_rejected')).toBe('approval_executed');
    expect(mapAuditActionToActivityType('approval_clarification_requested')).toBe(
      'approval_requested'
    );
    expect(mapAuditActionToActivityType('approval_requested')).toBe('approval_requested');
  });
  test('pipeline events map to ingestion', () => {
    expect(mapAuditActionToActivityType('conversation_ingested')).toBe('conversation_processed');
    expect(mapAuditActionToActivityType('conversation_processed')).toBe('conversation_processed');
  });
  test('Approvals tab includes requested and executed', () => {
    expect(activityMatchesTab('approval_executed', 'approval_requested')).toBe(true);
    expect(activityMatchesTab('approval_requested', 'approval_requested')).toBe(true);
    expect(activityMatchesTab('conversation_processed', 'approval_requested')).toBe(false);
    expect(activityMatchesTab('decision_extracted', 'all')).toBe(true);
  });
});

describe('decision category distribution', () => {
  test('uses real categories so a single decision is visible', () => {
    const d = buildCategoryDistribution([{ category: 'Product' }]);
    expect(d.length).toBe(1);
    expect(d[0].category).toBe('Product');
    expect(d[0].value).toBe(100);
  });
  test('empty input yields empty data', () => {
    expect(buildCategoryDistribution([])).toEqual([]);
  });
  test('missing category is Uncategorized', () => {
    expect(buildCategoryDistribution([{ category: '' }])[0].category).toBe('Uncategorized');
  });
});
