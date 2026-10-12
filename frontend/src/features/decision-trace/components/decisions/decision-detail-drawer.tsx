'use client';

import { formatSafeDateTime } from '../../lib/format-date';

import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { Decision, Commitment } from '../../types';
import { DecisionStatusBadge } from '../status-badges';
import { EvidenceCard } from '../evidence-card';
import { FIXTURE_COMMITMENTS } from '../../data/fixtures';
import { isDevPreviewEnabled } from '@/lib/decision-trace-preview';
import Link from 'next/link';

interface DecisionDetailDrawerProps {
  decision: Decision | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commitments?: Commitment[];
}

export function DecisionDetailDrawer({
  decision,
  open,
  onOpenChange,
  commitments
}: DecisionDetailDrawerProps) {
  if (!decision) return null;

  const pool = commitments ?? (isDevPreviewEnabled() ? FIXTURE_COMMITMENTS : []);
  const relatedCommitments = pool.filter(
    (c) => decision.relatedCommitmentIds?.includes(c.id) || c.relatedDecisionId === decision.id
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='w-full sm:max-w-xl overflow-y-auto p-6'>
        <SheetHeader className='pb-4 border-b border-border/40'>
          <div className='flex items-center gap-2 pb-1'>
            <Badge variant='outline' className='text-xs font-normal text-muted-foreground'>
              {decision.category}
            </Badge>
            <DecisionStatusBadge status={decision.status} />
            {decision.confidence != null ? (
              <Badge variant='secondary' className='text-xs font-normal ml-auto'>
                Confidence: {decision.confidence}% ({decision.confidenceLevel || 'scored'})
              </Badge>
            ) : (
              <Badge variant='outline' className='text-xs font-normal ml-auto text-muted-foreground'>
                Confidence: Unscored
              </Badge>
            )}
          </div>
          <SheetTitle className='text-xl font-bold leading-snug text-foreground'>
            {decision.title}
          </SheetTitle>
          <SheetDescription className='text-xs text-muted-foreground'>
            ID: {decision.id} &bull; Recorded on{' '}
            {new Date(decision.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })}
          </SheetDescription>
        </SheetHeader>

        <div className='py-5 space-y-6'>
          {/* What Was Decided - Callout */}
          <div className='rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4'>
            <div className='flex items-center gap-2 pb-2 text-indigo-950 dark:text-indigo-200 font-semibold text-xs uppercase tracking-wider'>
              <Icons.circleCheck className='size-4 text-indigo-600' />
              What Was Decided
            </div>
            <p className='text-sm leading-relaxed text-foreground font-medium'>
              {decision.whatWasDecided}
            </p>
          </div>

          {/* Source Conversation Context */}
          <div className='space-y-2'>
            <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
              Source Conversation
            </h4>
            <div className='rounded-md border border-border/60 bg-muted/20 p-3 flex items-center justify-between text-xs'>
              <div className='flex items-center gap-2'>
                <Icons.chat className='size-4 text-indigo-600' />
                <div>
                  <div className='font-medium text-foreground'>
                    {decision.sourceConversation.title}
                  </div>
                  <div className='text-muted-foreground text-[11px]'>
                    Channel: {decision.sourceConversation.channel} &bull;{' '}
                    {formatSafeDateTime(decision.sourceConversation.timestamp)}
                  </div>
                </div>
              </div>
              {decision.sourceConversation.url && (
                <Badge variant='outline' className='gap-1 text-[11px] cursor-pointer'>
                  <Icons.externalLink className='size-3' />
                  Source Link
                </Badge>
              )}
            </div>
          </div>

          {/* Participants */}
          <div className='space-y-2'>
            <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
              Participants & Decision Makers
            </h4>
            <div className='flex flex-wrap gap-1.5'>
              {decision.participants.map((person) => (
                <div
                  key={person}
                  className='flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-xs'
                >
                  <div className='size-4 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-semibold text-primary'>
                    {person[0]}
                  </div>
                  <span>{person}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Verifiable Supporting Evidence */}
          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                Supporting Evidence Citations ({decision.evidence.length})
              </h4>
              <span className='text-[11px] text-muted-foreground'>
                Semantic Qdrant Verification
              </span>
            </div>
            <div className='space-y-2.5'>
              {decision.evidence.map((ev) => (
                <EvidenceCard key={ev.id} evidence={ev} />
              ))}
            </div>
          </div>

          {/* Related Commitments */}
          <div className='space-y-2 pt-2 border-t border-border/40'>
            <div className='flex items-center justify-between'>
              <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                Linked Commitments ({relatedCommitments.length})
              </h4>
              <Link
                href='/dashboard/commitments'
                className='text-xs text-indigo-600 hover:underline font-medium'
              >
                Open Kanban &rarr;
              </Link>
            </div>
            {relatedCommitments.length === 0 ? (
              <p className='text-xs text-muted-foreground italic'>No active commitments linked.</p>
            ) : (
              <div className='space-y-2'>
                {relatedCommitments.map((com) => (
                  <div
                    key={com.id}
                    className='rounded-md border border-border/60 bg-card p-2.5 flex items-center justify-between text-xs'
                  >
                    <div>
                      <div className='font-medium text-foreground'>{com.title}</div>
                      <div className='text-muted-foreground text-[11px]'>
                        Owner: {com.owner} &bull; Due: {com.deadline}
                      </div>
                    </div>
                    <Badge variant='outline' className='text-[10px] capitalize'>
                      {com.status.replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
