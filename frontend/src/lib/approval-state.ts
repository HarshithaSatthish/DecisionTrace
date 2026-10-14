import type { ApprovalRequest } from '@/features/decision-trace/types';

export function applyApprovalStatus(
  list: ApprovalRequest[],
  id: string,
  status: ApprovalRequest['status']
): ApprovalRequest[] {
  return list.map((a) => (a.id === id ? { ...a, status } : a));
}

export function countApprovalsByStatus(list: ApprovalRequest[]): Record<string, number> {
  const c: Record<string, number> = { all: list.length, pending: 0, approved: 0, rejected: 0 };
  for (const a of list) c[a.status] = (c[a.status] ?? 0) + 1;
  return c;
}

export function filterApprovals(
  list: ApprovalRequest[],
  status: string,
  search = ''
): ApprovalRequest[] {
  const q = search.toLowerCase();
  return list.filter(
    (a) =>
      (status === 'all' || a.status === status) &&
      (q === '' ||
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.proposedBy.toLowerCase().includes(q))
  );
}
