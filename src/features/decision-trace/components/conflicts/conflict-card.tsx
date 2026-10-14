'use client';

import { formatSafeDate, formatSafeTime } from '../../lib/format-date';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { Conflict } from '../../types';
import { ConflictSeverityBadge } from '../status-badges';
import { resolveConflict } from '../../api/service';
import { toast } from 'sonner';

interface ConflictCardProps {
  conflict: Conflict;
  onResolved?: (id: string, newStatus: string) => void;
}

export function ConflictCard({ conflict, onResolved }: ConflictCardProps) {
  const [loading, setLoading] = useState(false);
  const [resolvedStatus, setResolvedStatus] = useState(conflict.status);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleResolveAction = async (action: 'resolve' | 'escalate' | 'dismiss') => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await resolveConflict(conflict.id, {
        action,
        rationale: `Manual resolution initiated by reviewer (${action})`
      });
      setResolvedStatus(
        action === 'resolve' ? 'resolved' : action === 'dismiss' ? 'dismissed' : 'escalated'
      );
      toast.success(`Conflict marked as ${action}`);
      onResolved?.(conflict.id, action);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Resolution action failed';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className='border-rose-500/30 bg-card shadow-xs overflow-hidden'>
      {/* Top Header */}
      <CardHeader className='pb-3 bg-rose-500/[0.03] border-b border-border/40'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <ConflictSeverityBadge severity={conflict.severity} />
            <Badge variant='outline' className='text-xs font-normal'>
              ID: {conflict.id}
            </Badge>
            <Badge
              variant='outline'
              className={`text-xs font-normal capitalize ${
                resolvedStatus === 'resolved'
                  ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
                  : 'border-zinc-300 text-muted-foreground'
              }`}
            >
              Status: {resolvedStatus}
            </Badge>
          </div>
          <time className='text-xs text-muted-foreground tabular-nums'>
            Detected on {formatSafeDate(conflict.detectedAt)} at{' '}
            {new Date(conflict.detectedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </time>
        </div>
        <CardTitle className='text-lg font-bold text-foreground pt-1.5'>{conflict.title}</CardTitle>
      </CardHeader>

      <CardContent className='p-5 space-y-5'>
        {/* Explanation of Contradiction */}
        <div className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5 text-xs'>
          <div className='flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200 pb-1'>
            <Icons.alertCircle className='size-3.5 text-amber-600' />
            Contradiction Analysis
          </div>
          <p className='leading-relaxed text-foreground/90'>{conflict.explanation}</p>
        </div>

        {/* Side-by-Side Comparison Container */}
        <div>
          <h4 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground pb-2 flex items-center gap-1.5'>
            <Icons.adjustments className='size-3.5 text-indigo-600' />
            Side-by-Side Decision Contradiction Comparison
          </h4>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {/* Previous Decision */}
            <div className='rounded-lg border border-border/70 bg-muted/20 p-4 space-y-3'>
              <div className='flex items-center justify-between border-b border-border/40 pb-2'>
                <Badge variant='outline' className='text-[11px] font-medium text-muted-foreground'>
                  Earlier Decision #{conflict.previousDecision.id}
                </Badge>
                <time className='text-[11px] text-muted-foreground tabular-nums'>
                  {formatSafeDate(conflict.previousDecision.timestamp)}
                </time>
              </div>

              <div>
                <h5 className='text-xs font-semibold text-foreground'>
                  {conflict.previousDecision.title}
                </h5>
                <div className='mt-1 rounded bg-background/80 border border-border/50 p-2.5 text-xs text-foreground'>
                  <span className='font-medium text-muted-foreground text-[10px] uppercase block pb-0.5'>
                    Enacted Rule:
                  </span>
                  {conflict.previousDecision.decisionText}
                </div>
              </div>

              {/* Supporting Evidence */}
              <div className='space-y-1 pt-1'>
                <span className='text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1'>
                  <Icons.post className='size-3 text-indigo-500' /> Verifiable Source Evidence
                </span>
                <div className='rounded border border-indigo-500/20 bg-indigo-500/[0.03] p-2.5 text-xs'>
                  <div className='text-[11px] font-medium text-foreground pb-1 flex justify-between'>
                    <span>By: {conflict.previousDecision.evidence.speakerOrAuthor}</span>
                    <span className='text-muted-foreground text-[10px]'>
                      {conflict.previousDecision.source}
                    </span>
                  </div>
                  <blockquote className='italic text-foreground/80 border-l-2 border-indigo-400 pl-2 leading-relaxed'>
                    &ldquo;{conflict.previousDecision.evidence.quote}&rdquo;
                  </blockquote>
                </div>
              </div>
            </div>

            {/* Newer Decision */}
            <div className='rounded-lg border border-rose-500/30 bg-rose-500/[0.02] p-4 space-y-3'>
              <div className='flex items-center justify-between border-b border-border/40 pb-2'>
                <Badge variant='destructive' className='text-[11px] font-medium'>
                  Newer Contradictory Decision #{conflict.newerDecision.id}
                </Badge>
                <time className='text-[11px] text-muted-foreground tabular-nums'>
                  {formatSafeDate(conflict.newerDecision.timestamp)}
                </time>
              </div>

              <div>
                <h5 className='text-xs font-semibold text-foreground'>
                  {conflict.newerDecision.title}
                </h5>
                <div className='mt-1 rounded bg-background/80 border border-rose-500/30 p-2.5 text-xs text-foreground'>
                  <span className='font-medium text-muted-foreground text-[10px] uppercase block pb-0.5'>
                    Contradicting Rule:
                  </span>
                  {conflict.newerDecision.decisionText}
                </div>
              </div>

              {/* Supporting Evidence */}
              <div className='space-y-1 pt-1'>
                <span className='text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1'>
                  <Icons.post className='size-3 text-rose-500' /> Verifiable Source Evidence
                </span>
                <div className='rounded border border-rose-500/30 bg-rose-500/[0.03] p-2.5 text-xs'>
                  <div className='text-[11px] font-medium text-foreground pb-1 flex justify-between'>
                    <span>By: {conflict.newerDecision.evidence.speakerOrAuthor}</span>
                    <span className='text-muted-foreground text-[10px]'>
                      {conflict.newerDecision.source}
                    </span>
                  </div>
                  <blockquote className='italic text-foreground/80 border-l-2 border-rose-400 pl-2 leading-relaxed'>
                    &ldquo;{conflict.newerDecision.evidence.quote}&rdquo;
                  </blockquote>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error alert if resolution fails */}
        {errorMessage && (
          <div className='rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-900 dark:text-rose-100 flex items-center gap-2'>
            <Icons.warning className='size-4 text-rose-600 shrink-0' />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Bottom Resolution Controls */}
        <div className='flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40'>
          <div className='text-xs text-muted-foreground'>
            Evidence-backed conflict &bull; Resolution logs will append to audit stream
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={loading || resolvedStatus !== 'unresolved'}
              onClick={() => handleResolveAction('dismiss')}
              className='text-xs h-8'
            >
              Dismiss (False Positive)
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={loading || resolvedStatus !== 'unresolved'}
              onClick={() => handleResolveAction('escalate')}
              className='text-xs h-8 text-amber-700 hover:text-amber-800'
            >
              Escalate to Architecture Board
            </Button>
            <Button
              variant='default'
              size='sm'
              disabled={loading || resolvedStatus !== 'unresolved'}
              onClick={() => handleResolveAction('resolve')}
              className='text-xs h-8 bg-indigo-600 hover:bg-indigo-700'
            >
              Resolve & Mark Superseded
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
