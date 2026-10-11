import React from 'react';
import PageContainer from '@/components/layout/page-container';
import { getApprovals } from '@/features/decision-trace/api/service';
import { ApprovalsList } from '@/features/decision-trace/components/approvals/approvals-list';
import { DevelopmentPreviewBanner } from '@/features/decision-trace/components/development-preview-banner';
import { Badge } from '@/components/ui/badge';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Approvals Guardian — DecisionTrace',
  description: 'Human-in-the-loop consensus approvals with execution impact previews'
};

export default async function ApprovalsPage() {
  const approvals = await getApprovals();

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-4'>
        <DevelopmentPreviewBanner />

        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight text-foreground'>
              Consensus & Approvals Review
            </h1>
            <p className='text-xs text-muted-foreground mt-0.5'>
              Human-in-the-loop review interface with strict execution impact previews and backend
              verification
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Badge variant='outline' className='text-xs'>
              {approvals.length} Approval Items
            </Badge>
          </div>
        </div>

        <ApprovalsList initialApprovals={approvals} />
      </div>
    </PageContainer>
  );
}
