import type { ActivityItem } from '@/features/decision-trace/types';

type ActivityType = ActivityItem['type'];

/**
 * Map a backend audit `action` (e.g. approval_granted, conversation_ingested)
 * to a dashboard activity type. Order matters: approval/rejection actions must
 * be matched before generic substrings like "decision" or "request".
 */
export function mapAuditActionToActivityType(action?: string, entityType?: string): ActivityType {
  const a = (action || '').toLowerCase();
  if (
    a.startsWith('approval_') ||
    a.includes('approv') ||
    a.includes('reject') ||
    a.includes('clarif')
  ) {
    if (a === 'approval_requested' || a.includes('requested')) return 'approval_requested';
    return 'approval_executed';
  }
  if (a.includes('conflict') || a.includes('finding')) return 'conflict_detected';
  if (a.includes('commitment') || a.includes('task')) return 'commitment_updated';
  if (a.includes('decision')) return 'decision_extracted';
  if (a.includes('conversation') || a.includes('ingest') || a.includes('processed'))
    return 'conversation_processed';
  if (entityType === 'approval') return 'approval_executed';
  if (entityType === 'decision') return 'decision_extracted';
  if (entityType === 'commitment') return 'commitment_updated';
  if (entityType === 'conversation') return 'conversation_processed';
  return 'conversation_processed';
}

/** Activity tab -> activity types it should include. */
export const ACTIVITY_TAB_TYPES: Record<string, ActivityType[] | null> = {
  all: null,
  decision_extracted: ['decision_extracted'],
  conflict_detected: ['conflict_detected'],
  approval_requested: ['approval_requested', 'approval_executed'],
  commitment_updated: ['commitment_updated'],
  conversation_processed: ['conversation_processed']
};

export function activityMatchesTab(type: ActivityType, tab: string): boolean {
  const types = ACTIVITY_TAB_TYPES[tab];
  return !types || types.includes(type);
}
