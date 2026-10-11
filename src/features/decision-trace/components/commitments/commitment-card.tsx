'use client';

import React from 'react';
import { KanbanItem } from '@/components/ui/kanban';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { Commitment } from '../../types';
import { PriorityBadge } from '../status-badges';

interface CommitmentCardProps extends Omit<
  React.ComponentProps<typeof KanbanItem>,
  'value' | 'onSelect'
> {
  commitment: Commitment;
  onSelect?: (commitment: Commitment) => void;
}

export function CommitmentCard({ commitment, onSelect, ...props }: CommitmentCardProps) {
  return (
    <KanbanItem
      key={commitment.id}
      value={commitment.id}
      {...props}
      render={
        <div
          role='button'
          tabIndex={0}
          aria-label={`Select commitment: ${commitment.title}`}
          onClick={() => onSelect?.(commitment)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect?.(commitment);
            }
          }}
          className='bg-card rounded-lg border border-border/70 p-3 shadow-xs hover:border-indigo-500/50 transition-all cursor-pointer group'
        />
      }
    >
      <div className='flex flex-col gap-2'>
        <div className='flex items-start justify-between gap-2'>
          <span className='line-clamp-2 text-xs font-semibold text-foreground group-hover:text-indigo-600 transition-colors'>
            {commitment.title}
          </span>
          <PriorityBadge priority={commitment.priority} />
        </div>

        {/* Originating Decision Tag */}
        <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
          <Badge
            variant='outline'
            className='h-4 px-1 text-[10px] text-indigo-700 dark:text-indigo-300 border-indigo-200'
          >
            {commitment.relatedDecisionId}
          </Badge>
          <span className='truncate'>{commitment.relatedDecisionTitle}</span>
        </div>

        {/* Blocker alert if present */}
        {commitment.status === 'blocked' && (
          <div className='flex items-center gap-1 rounded bg-rose-500/10 px-2 py-1 text-[10px] text-rose-700 dark:text-rose-300 font-medium'>
            <Icons.warning className='size-3 shrink-0' />
            <span className='truncate'>{commitment.blockerNotes || 'Blocked'}</span>
          </div>
        )}

        {/* Bottom meta row */}
        <div className='text-muted-foreground flex items-center justify-between text-xs pt-1 border-t border-border/40'>
          <div className='flex items-center gap-1.5'>
            <div className='size-4 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-semibold text-primary'>
              {commitment.ownerAvatar || commitment.owner[0]}
            </div>
            <span className='text-[11px] truncate'>{commitment.owner}</span>
          </div>

          <div className='flex items-center gap-2'>
            {commitment.evidence.length > 0 && (
              <span
                className='flex items-center gap-0.5 text-[10px] text-muted-foreground'
                title='Verified evidence quotes'
              >
                <Icons.post className='size-3 text-indigo-500' />
                {commitment.evidence.length}
              </span>
            )}
            <time className='text-[10px] tabular-nums font-medium'>{commitment.deadline}</time>
          </div>
        </div>
      </div>
    </KanbanItem>
  );
}
