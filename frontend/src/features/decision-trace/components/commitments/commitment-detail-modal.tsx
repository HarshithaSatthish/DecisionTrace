'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Icons } from '@/components/icons';
import { Commitment } from '../../types';
import { CommitmentStatusBadge, PriorityBadge } from '../status-badges';
import { EvidenceCard } from '../evidence-card';
import { formatSafeDate } from '../../lib/format-date';
import Link from 'next/link';

interface CommitmentDetailModalProps {
  commitment: Commitment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommitmentDetailModal({
  commitment,
  open,
  onOpenChange
}: CommitmentDetailModalProps) {
  if (!commitment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg p-6'>
        <DialogHeader className='pb-3 border-b border-border/40'>
          <div className='flex items-center gap-2 pb-1'>
            <CommitmentStatusBadge status={commitment.status} />
            {commitment.priority ? <PriorityBadge priority={commitment.priority} /> : null}
            <span className='ml-auto text-xs text-muted-foreground tabular-nums'>
              {commitment.deadline ? `Due ${formatSafeDate(commitment.deadline)}` : 'No deadline'}
            </span>
          </div>
          <DialogTitle className='text-lg font-bold text-foreground'>
            {commitment.title}
          </DialogTitle>
          <DialogDescription className='text-xs text-muted-foreground'>
            ID: {commitment.id} &bull; Owner:{' '}
            <span className='font-medium text-foreground'>{commitment.owner || 'Unassigned'}</span>
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          {commitment.readOnly ? (
            <p className='text-sm text-muted-foreground'>
              This authoritative commitment is governed by decision approvals.{' '}
              <Link href='/dashboard/approvals' className='underline'>
                Review proposed changes
              </Link>
              .
            </p>
          ) : null}
          {/* Task Description */}
          <div className='space-y-1.5'>
            <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
              Actionable Commitment Task
            </h4>
            <p className='text-xs leading-relaxed text-foreground bg-muted/20 border border-border/60 rounded-md p-3'>
              {commitment.task}
            </p>
          </div>

          {/* Blocker Notes if any */}
          {commitment.blockerNotes && (
            <div className='rounded-md border border-rose-500/30 bg-rose-500/10 p-3'>
              <div className='flex items-center gap-1.5 text-rose-800 dark:text-rose-200 text-xs font-semibold pb-1'>
                <Icons.warning className='size-3.5 text-rose-600' />
                Blocker Alert
              </div>
              <p className='text-xs text-rose-900 dark:text-rose-100'>{commitment.blockerNotes}</p>
            </div>
          )}

          {/* Related Decision Reference */}
          <div className='space-y-1.5'>
            <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
              Originating Decision
            </h4>
            <div className='flex items-center justify-between rounded-md border border-border/60 bg-card p-2.5 text-xs'>
              <div className='flex items-center gap-2'>
                <Icons.scale className='size-4 text-indigo-600 shrink-0' />
                <div>
                  <div className='font-medium text-foreground'>
                    {commitment.relatedDecisionTitle}
                  </div>
                  <div className='text-[11px] text-muted-foreground'>
                    Decision ID: {commitment.relatedDecisionId}
                  </div>
                </div>
              </div>
              <Link
                href='/dashboard/decisions'
                className='text-xs text-indigo-600 hover:underline shrink-0 font-medium'
              >
                Inspect Decision
              </Link>
            </div>
          </div>

          {/* Supporting Evidence */}
          <div className='space-y-2'>
            <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
              Supporting Evidence Citations ({commitment.evidence.length})
            </h4>
            <div className='space-y-2'>
              {commitment.evidence.map((ev) => (
                <EvidenceCard key={ev.id} evidence={ev} compact />
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
