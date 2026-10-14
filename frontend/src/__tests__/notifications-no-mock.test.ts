import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useNotificationStore } from '@/features/notifications/utils/store';

describe('notification bell shows only real events', () => {
  test('store starts empty (no hardcoded "3 Notifications")', () => {
    expect(useNotificationStore.getState().notifications.length).toBe(0);
    expect(useNotificationStore.getState().unreadCount()).toBe(0);
  });
  test('no template demo notifications in source', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/features/notifications/utils/store.ts'),
      'utf8'
    );
    expect(src.includes('Sarah Connor')).toBe(false);
  });
});
