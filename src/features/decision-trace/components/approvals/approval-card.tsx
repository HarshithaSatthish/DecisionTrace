'use client';

import { formatSafeDate } from '../../lib/format-date';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { ApprovalRequest } from '../../types';
import { ApprovalStatusBadge, ImpactBadge } from '../status-badges';
import { EvidenceCard } from '../evidence-card';
import { executeApprovalAction } from '../../api/service';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface ApprovalCardProps {
  approval: ApprovalRequest;
  onActionComplete?: (id: string, newStatus: string) => void;
}

export function ApprovalCard({ approval, onActionComplete }: ApprovalCardProps) {
  const router = useRouter();
  const [showEvidence, setShowEvidence] = useState(false);
  const [rationale, setRationale] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState(approval.status);

  const handleAction = async (action: 'approve' | 'reject' | 'clarify') => {
    setLoading(true);
    setErrorMessage(null);

    try {
      // Calls authenticated backend endpoint
      const result = await executeApprovalAction(approval.id, {
        action,
        rationale: rationale.trim() || `Reviewer action: ${action}`
      });

      // Only update if backend confirmed success
      if (result.success) {
        setCurrentStatus(
          action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'clarified'
        );
        router.refresh();
        toast.success(`Approval confirmed by backend consensus engine`);
        onActionComplete?.(approval.id, action);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Backend consensus engine unreachable. Approval halted.';

      setErrorMessage(message);
      toast.error('Action failed: Backend endpoint verification error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className='border-border/80 bg-card shadow-xs overflow-hidden'>
      <CardHeader className='pb-3 border-b border-border/40 bg-muted/10'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <ApprovalStatusBadge status={currentStatus} />
            <ImpactBadge impact={approval.impactLevel} />
            <Badge variant='outline' className='text-xs font-normal text-muted-foreground'>
              Target: {approval.targetEntityType} #{approval.targetEntityId}
            </Badge>
          </div>
          <time className='text-xs text-muted-foreground tabular-nums'>
            Requested on {formatSafeDate(approval.requestedAt)}
          </time>
        </div>
        <CardTitle className='text-base font-bold text-foreground pt-1'>{approval.title}</CardTitle>
        <CardDescription className='text-xs text-muted-foreground'>
          Proposed by: <span className='font-medium text-foreground'>{approval.proposedBy}</span>
        </CardDescription>
      </CardHeader>

      <CardContent className='p-5 space-y-4'>
        {/* Description */}
        <p className='text-xs text-foreground/90 leading-relaxed'>{approval.description}</p>

        {/* Exact Action Preview - Critical Requirement */}
        <div className='rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-2'>
          <div className='flex items-center gap-2 text-indigo-950 dark:text-indigo-200 font-semibold text-xs uppercase tracking-wider'>
            <Icons.shieldCheck className='size-4 text-indigo-600' />
            Execution Impact Preview (What this action will do)
          </div>
          <p className='text-xs leading-relaxed text-foreground font-medium'>
            {approval.exactActionPreview}
          </p>
          <div className='flex items-center gap-2 pt-1 text-[11px] text-muted-foreground'>
            <Icons.info className='size-3 text-indigo-500' />
            <span>
              Target Resource: {approval.targetEntityType} ({approval.targetEntityId})
            </span>
          </div>
        </div>

        {/* Evidence Toggle & Display */}
        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setShowEvidence(!showEvidence)}
              className='h-7 text-xs text-indigo-600 hover:text-indigo-700 p-0 font-medium'
            >
              <Icons.post className='size-3.5 mr-1 text-indigo-500' />
              {showEvidence
                ? 'Hide Supporting Evidence'
                : `View Supporting Evidence (${approval.evidence.length})`}
            </Button>
          </div>

          {showEvidence && (
            <div className='space-y-2 pt-1'>
              {approval.evidence.map((ev) => (
                <EvidenceCard key={ev.id} evidence={ev} compact />
              ))}
            </div>
          )}
        </div>

        {/* Truthful Error Box if Backend rejects or is pending */}
        {errorMessage && (
          <div className='rounded-lg border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-900 dark:text-rose-100 space-y-1.5 animate-in fade-in'>
            <div className='flex items-center gap-1.5 font-semibold text-rose-700 dark:text-rose-300'>
              <Icons.warning className='size-4 text-rose-600 shrink-0' />
              Backend Consensus Verification Failed
            </div>
            <p className='text-[11px] leading-relaxed'>{errorMessage}</p>
            <p className='text-[10px] text-muted-foreground pt-1'>
              * Frontend state remains unaltered because live consensus from Person 1&apos;s FastAPI
              backend is required.
            </p>
          </div>
        )}

        {/* Action Controls & Rationale Input */}
        {currentStatus === 'pending' && (
          <div className='pt-2 border-t border-border/40 space-y-3'>
            <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2'>
              <Input
                aria-label='Audit note or clarification request'
                placeholder='Optional audit note / sign-off rationale...'
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                disabled={loading}
                className='h-8 text-xs flex-1'
              />
              <div className='flex items-center gap-2 shrink-0'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={loading}
                  onClick={() => handleAction('clarify')}
                >
                  Clarify
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={loading}
                  onClick={() => handleAction('reject')}
                  className='h-8 text-xs text-rose-700 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950'
                >
                  {loading ? <Icons.spinner className='size-3 animate-spin mr-1' /> : null}
                  Reject
                </Button>
                <Button
                  variant='default'
                  size='sm'
                  disabled={loading || approval.actionType === 'request_clarification'}
                  onClick={() => handleAction('approve')}
                  className='h-8 text-xs bg-indigo-600 hover:bg-indigo-700'
                >
                  {loading ? <Icons.spinner className='size-3 animate-spin mr-1' /> : null}
                  Approve & Execute Action
                </Button>
              </div>
            </div>
            <p className='text-[10px] text-muted-foreground'>
              Requires authenticated backend consensus endpoint call (/api/decision-trace/approvals/
              {approval.id}).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
