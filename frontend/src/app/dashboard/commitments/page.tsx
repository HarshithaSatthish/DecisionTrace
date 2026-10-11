import React from 'react';
import PageContainer from '@/components/layout/page-container';
import { getCommitments } from '@/features/decision-trace/api/service';
import { CommitmentsBoard } from '@/features/decision-trace/components/commitments/commitments-board';
import { DevelopmentPreviewBanner } from '@/features/decision-trace/components/development-preview-banner';
import { Badge } from '@/components/ui/badge';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Commitments Guardian — DecisionTrace',
  description:
    'Commitment tracking board derived from architectural decisions with verifiable ownership'
};

export default async function CommitmentsPage() {
  const commitments = await getCommitments();

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-4'>
        <DevelopmentPreviewBanner />

        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight text-foreground'>
              Commitments Guardian Board
            </h1>
            <p className='text-xs text-muted-foreground mt-0.5'>
              Surveillance of engineering action items and commitments extracted from decisions
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Badge variant='outline' className='text-xs'>
              {commitments.length} Active Commitments
            </Badge>
          </div>
        </div>

        <CommitmentsBoard initialCommitments={commitments} />
      </div>
    </PageContainer>
  );
}
