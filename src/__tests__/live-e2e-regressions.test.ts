import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ApprovalRequest } from '@/features/decision-trace/types';
import { applyApprovalStatus, countApprovalsByStatus, filterApprovals } from '@/lib/approval-state';
import { mapBackendEvidence } from '@/lib/evidence-mapping';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const base = {
  title: 'Approve Update: Launch',
  description: 'x',
  actionType: 'override_conflict',
  proposedBy: 'Lyzr',
  requestedAt: '2026-10-14T00:00:00Z',
  impactLevel: 'high',
  exactActionPreview: 'p',
  targetEntityId: 't',
  targetEntityType: 'decision',
  evidence: []
} as unknown as Omit<ApprovalRequest, 'id' | 'status'>;

describe('approvals tabs after an approval', () => {
  const list = [{ ...base, id: 'a1', status: 'pending' } as ApprovalRequest];
  const after = applyApprovalStatus(list, 'a1', 'approved');
  test('item leaves Pending and appears under Approved', () => {
    expect(filterApprovals(after, 'pending').length).toBe(0);
    expect(filterApprovals(after, 'approved').length).toBe(1);
    expect(filterApprovals(after, 'rejected').length).toBe(0);
  });
  test('counts update', () => {
    const c = countApprovalsByStatus(after);
    expect(c.pending).toBe(0);
    expect(c.approved).toBe(1);
    expect(c.all).toBe(1);
  });
  test('card reports approved/rejected (not approve/reject) to the list', () => {
    const card = src('src/features/decision-trace/components/approvals/approval-card.tsx');
    expect(card).toContain("action === 'approve' ? 'approved' : 'rejected'");
    expect(card).toContain('onActionComplete?.(approval.id, newStatus)');
  });
  test('header shows pending count', () => {
    expect(src('src/app/dashboard/approvals/page.tsx')).toContain("a.status === 'pending'");
  });
});

describe('evidence mapping from backend decisions', () => {
  test('chunk excerpts become citations', () => {
    const ev = mapBackendEvidence(
      [{ chunk_id: 'chk_1', excerpt: 'We decided to launch on Friday.', conversation_id: 'c1' }],
      'Launch'
    );
    expect(ev.length).toBe(1);
    expect(ev[0].quote).toBe('We decided to launch on Friday.');
    expect(ev[0].id).toBe('chk_1');
  });
  test('garbage is dropped', () => {
    expect(mapBackendEvidence([{}, null], 'x').length).toBe(0);
    expect(mapBackendEvidence(undefined, 'x').length).toBe(0);
  });
});

describe('overview charts and guardian pill', () => {
  test('count charts use integer ticks', () => {
    for (const f of ['commitment-velocity-chart.tsx', 'decision-trends-chart.tsx']) {
      expect(src(`src/features/decision-trace/components/overview/${f}`)).toContain(
        'allowDecimals={false}'
      );
    }
  });
  test('guardian health probe is bounded by a timeout', () => {
    expect(src('src/components/layout/guardian-status-pill.tsx')).toContain('AbortSignal.timeout(');
  });
  test('pie chart uses real categories, not a fixed list', () => {
    const pie = src('src/app/dashboard/overview/@pie_stats/page.tsx');
    expect(pie).toContain('buildCategoryDistribution');
    expect(pie.includes("'Infrastructure'")).toBe(false);
  });
});
