import React from 'react';
import PageContainer from '@/components/layout/page-container';
import { getDecisions, getCommitments } from '@/features/decision-trace/api/service';
import { DecisionsTable } from '@/features/decision-trace/components/decisions/decisions-table';
import { DevelopmentPreviewBanner } from '@/features/decision-trace/components/development-preview-banner';
import { Badge } from '@/components/ui/badge';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Decisions',
  description: 'Searchable decision registry with verifiable conversation evidence and consensus verification'
};

export default async function DecisionsPage() {
  const [decisions, commitments] = await Promise.all([getDecisions(), getCommitments()]);

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-4 min-w-0 max-w-full'>
        <DevelopmentPreviewBanner />

        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight text-foreground'>
              Decisions Registry
            </h1>
            <p className='text-xs text-muted-foreground mt-0.5'>
              Autonomously extracted technical decisions with semantic consensus scores and linked
              citations
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Badge variant='outline' className='text-xs'>
              {decisions.length} Decisions Tracked
            </Badge>
          </div>
        </div>

        <DecisionsTable initialDecisions={decisions} initialCommitments={commitments} />
      </div>
    </PageContainer>
  );
}
