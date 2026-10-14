'use client';

import React, { useState, useMemo } from 'react';
import { Kanban, KanbanBoard } from '@/components/ui/kanban';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { Commitment } from '../../types';
import { CommitmentColumn } from './commitment-column';
import { CommitmentDetailModal } from './commitment-detail-modal';
import { updateCommitmentStatus } from '../../api/service';
import { toast } from 'sonner';

interface CommitmentsBoardProps {
  initialCommitments: Commitment[];
}

export function CommitmentsBoard({ initialCommitments }: CommitmentsBoardProps) {
  const [commitments, setCommitments] = useState<Commitment[]>(initialCommitments);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedCommitment, setSelectedCommitment] = useState<Commitment | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const owners = useMemo(() => {
    const set = new Set(initialCommitments.map((c) => c.owner));
    return ['all', ...Array.from(set)];
  }, [initialCommitments]);

  const filtered = useMemo(() => {
    return commitments.filter((c) => {
      const matchSearch =
        search === '' ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.task.toLowerCase().includes(search.toLowerCase()) ||
        c.relatedDecisionTitle.toLowerCase().includes(search.toLowerCase());

      const matchOwner = ownerFilter === 'all' || c.owner === ownerFilter;
      const matchPriority = priorityFilter === 'all' || c.priority === priorityFilter;

      return matchSearch && matchOwner && matchPriority;
    });
  }, [commitments, search, ownerFilter, priorityFilter]);

  const columns = useMemo(() => {
    return {
      backlog: filtered.filter((c) => c.status === 'backlog'),
      in_progress: filtered.filter((c) => c.status === 'in_progress'),
      blocked: filtered.filter((c) => c.status === 'blocked'),
      completed: filtered.filter((c) => c.status === 'completed')
    };
  }, [filtered]);

  const handleValueChange = async (newColumns: Record<string, Commitment[]>) => {
    // Detect which item changed column
    for (const [colKey, items] of Object.entries(newColumns)) {
      const typedStatus = colKey as Commitment['status'];
      for (const item of items) {
        const prev = commitments.find((c) => c.id === item.id);
        if (prev && prev.status !== typedStatus) {
          // Direct commitment changes cannot bypass approval.
          // Display only confirmed backend mutation results.
          try {
            const confirmedResult = await updateCommitmentStatus(item.id, typedStatus);
            setCommitments((prevList) =>
              prevList.map((c) =>
                c.id === item.id ? { ...c, status: confirmedResult.status || typedStatus } : c
              )
            );
            toast.success(
              `Commitment status updated to ${(confirmedResult.status || typedStatus).replace('_', ' ')}`
            );
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Update failed';
            toast.error(message);
          }
          return;
        }
      }
    }
  };

  const handleSelectCommitment = (commitment: Commitment) => {
    setSelectedCommitment(commitment);
    setModalOpen(true);
  };

  return (
    <div className='space-y-4'>
      {/* Filtering Bar */}
      <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
        <div className='relative flex-1 max-w-md'>
          <Icons.search className='absolute left-3 top-2.5 size-4 text-muted-foreground' />
          <Input
            placeholder='Filter commitments, tasks, decisions...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='pl-9 h-9 text-xs'
          />
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          {/* Owner Filter */}
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className='h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          >
            {owners.map((owner) => (
              <option key={owner} value={owner}>
                {owner === 'all' ? 'All Owners' : owner}
              </option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className='h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          >
            <option value='all'>All Priorities</option>
            <option value='critical'>Critical</option>
            <option value='high'>High</option>
            <option value='medium'>Medium</option>
            <option value='low'>Low</option>
          </select>
        </div>
      </div>

      {/* Kanban Board Container */}
      <div className='w-full min-w-0 max-w-full overflow-x-auto pb-4'>
        <Kanban
          value={columns}
          onValueChange={(val) => handleValueChange(val as Record<string, Commitment[]>)}
          getItemValue={(item) => item.id}
        >
          <KanbanBoard className='min-w-[1000px]'>
            {Object.entries(columns).map(([columnId, columnTasks]) => (
              <CommitmentColumn
                key={columnId}
                value={columnId}
                commitments={columnTasks}
                onSelectCommitment={handleSelectCommitment}
              />
            ))}
          </KanbanBoard>
        </Kanban>
      </div>

      {/* Detail Modal */}
      <CommitmentDetailModal
        commitment={selectedCommitment}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
