'use client';

import React from 'react';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KanbanColumn, KanbanColumnHandle } from '@/components/ui/kanban';
import { Commitment } from '../../types';
import { CommitmentCard } from './commitment-card';

const COLUMN_CONFIG: Record<string, { label: string; badgeColor: string; icon: React.ReactNode }> =
  {
    backlog: {
      label: 'Planned / Backlog',
      badgeColor: 'border-zinc-300 text-zinc-600',
      icon: <Icons.clock className='size-3.5 text-zinc-500' />
    },
    in_progress: {
      label: 'In Progress',
      badgeColor:
        'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
      icon: <Icons.trendingUp className='size-3.5 text-indigo-600' />
    },
    blocked: {
      label: 'Blocked / At Risk',
      badgeColor: 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
      icon: <Icons.warning className='size-3.5 text-rose-600' />
    },
    completed: {
      label: 'Completed',
      badgeColor:
        'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
      icon: <Icons.circleCheck className='size-3.5 text-emerald-600' />
    }
  };

interface CommitmentColumnProps extends Omit<
  React.ComponentProps<typeof KanbanColumn>,
  'children'
> {
  commitments: Commitment[];
  onSelectCommitment: (commitment: Commitment) => void;
}

export function CommitmentColumn({
  value,
  commitments,
  onSelectCommitment,
  ...props
}: CommitmentColumnProps) {
  const config = COLUMN_CONFIG[String(value)] ?? {
    label: String(value),
    badgeColor: '',
    icon: null
  };

  return (
    <KanbanColumn
      value={value}
      className='w-full shrink-0 md:w-[310px] bg-muted/30 border-border/80'
      {...props}
    >
      <div className='flex items-center justify-between pb-1'>
        <div className='flex items-center gap-2'>
          {config.icon}
          <span className='text-xs font-semibold text-foreground'>{config.label}</span>
          <Badge
            variant='outline'
            className={`rounded-sm text-[11px] h-5 px-1.5 font-medium ${config.badgeColor}`}
          >
            {commitments.length}
          </Badge>
        </div>
        <KanbanColumnHandle
          render={<Button variant='ghost' size='icon' className='size-6 text-muted-foreground' />}
        >
          <Icons.gripVertical className='size-3.5' />
        </KanbanColumnHandle>
      </div>
      <div className='flex flex-col gap-2.5 p-0.5 min-h-[380px]'>
        {commitments.length === 0 ? (
          <div className='flex h-24 items-center justify-center rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground'>
            No commitments
          </div>
        ) : (
          commitments.map((commitment) => (
            <CommitmentCard
              key={commitment.id}
              commitment={commitment}
              onSelect={onSelectCommitment}
              asHandle
            />
          ))
        )}
      </div>
    </KanbanColumn>
  );
}
