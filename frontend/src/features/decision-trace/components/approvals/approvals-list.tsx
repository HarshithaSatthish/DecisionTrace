'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { applyApprovalStatus, countApprovalsByStatus, filterApprovals } from '@/lib/approval-state';
import { ApprovalRequest } from '../../types';
import { ApprovalCard } from './approval-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

interface ApprovalsListProps {
  initialApprovals: ApprovalRequest[];
}

export function ApprovalsList({ initialApprovals }: ApprovalsListProps) {
  const router = useRouter();
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(initialApprovals);
  // Re-sync when the server component re-renders with fresh backend data
  useEffect(() => setApprovals(initialApprovals), [initialApprovals]);

  const handleActionComplete = useCallback(
    (id: string, newStatus: string) => {
      setApprovals((prev) => applyApprovalStatus(prev, id, newStatus as ApprovalRequest['status']));
      router.refresh();
    },
    [router]
  );

  const counts = useMemo(() => countApprovalsByStatus(approvals), [approvals]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(
    () => filterApprovals(approvals, statusFilter, search),
    [approvals, search, statusFilter]
  );

  return (
    <div className='space-y-4'>
      {/* Filtering */}
      <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
        <div className='relative flex-1 max-w-md'>
          <Icons.search className='absolute left-3 top-2.5 size-4 text-muted-foreground' />
          <Input
            placeholder='Search approvals, proposed by, action...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='pl-9 h-9 text-xs'
          />
        </div>

        <div className='flex items-center gap-1 border border-border/80 rounded-md p-1 bg-muted/20 text-xs'>
          {['all', 'pending', 'approved', 'rejected', 'clarified'].map((st) => (
            <Button
              key={st}
              variant={statusFilter === st ? 'secondary' : 'ghost'}
              size='sm'
              onClick={() => setStatusFilter(st)}
              className='h-7 px-2.5 text-xs capitalize'
            >
              {st} ({counts[st] ?? 0})
            </Button>
          ))}
        </div>
      </div>

      {/* Approvals Cards */}
      <div className='space-y-4'>
        {filtered.length === 0 ? (
          <div className='flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-border/80 text-center p-6 bg-card'>
            <Icons.shieldCheck className='size-8 text-muted-foreground pb-1' />
            <h4 className='text-sm font-semibold text-foreground'>No Approvals Found</h4>
            <p className='text-xs text-muted-foreground'>
              {statusFilter === 'all'
                ? 'There are no approval requests matching your search.'
                : `There are no ${statusFilter} approval requests matching your search.`}
            </p>
          </div>
        ) : (
          filtered.map((approval) => (
            <ApprovalCard
              key={`${approval.id}:${approval.status}`}
              approval={approval}
              onActionComplete={handleActionComplete}
            />
          ))
        )}
      </div>
    </div>
  );
}
