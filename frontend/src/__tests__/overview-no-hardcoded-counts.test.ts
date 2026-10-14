import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const layout = readFileSync(join(process.cwd(), 'src/app/dashboard/overview/layout.tsx'), 'utf8');

describe('Overview summary cards', () => {
  test('do not render hardcoded decision breakdowns', () => {
    expect(layout.includes('3 high confidence')).toBe(false);
    expect(layout.includes('1 under review')).toBe(false);
  });

  test('alert badges are conditional on live counts', () => {
    expect(layout).toContain('metrics.detectedConflictsCount > 0 ?');
    expect(layout).toContain('metrics.pendingApprovalsCount > 0 ?');
    expect(layout).toContain('metrics.activeDecisionsCount > 0');
  });
});
