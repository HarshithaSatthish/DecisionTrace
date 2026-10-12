import React from 'react';
import PageContainer from '@/components/layout/page-container';
import { getConflicts } from '@/features/decision-trace/api/service';
import { ConflictsList } from '@/features/decision-trace/components/conflicts/conflicts-list';
import { DevelopmentPreviewBanner } from '@/features/decision-trace/components/development-preview-banner';
import { Badge } from '@/components/ui/badge';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Conflicts',
  description: 'Evidence-backed contradiction detector comparing historical and recent decisions'
};

export default async function ConflictsPage() {
  const conflicts = await getConflicts();

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-4 min-w-0 max-w-full'>
        <DevelopmentPreviewBanner />

        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight text-foreground'>
              Decision Contradictions & Conflict Guardian
            </h1>
            <p className='text-xs text-muted-foreground mt-0.5'>
              Automated detection of policy divergence and contradictory rules with verifiable
              citations
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Badge variant='destructive' className='text-xs gap-1'>
              <span className='size-1.5 rounded-full bg-white animate-pulse' />
              {conflicts.length} Active Contradictions
            </Badge>
          </div>
        </div>

        <ConflictsList initialConflicts={conflicts} />
      </div>
    </PageContainer>
  );
}
