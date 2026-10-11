import React from 'react';
import PageContainer from '@/components/layout/page-container';
import { getActivity } from '@/features/decision-trace/api/service';
import { ActivityTimeline } from '@/features/decision-trace/components/activity/activity-timeline';
import { DevelopmentPreviewBanner } from '@/features/decision-trace/components/development-preview-banner';
import { Badge } from '@/components/ui/badge';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Activity Guardian Stream — DecisionTrace',
  description:
    'Chronological timeline of conversations processed, decisions extracted, conflicts detected, and approvals'
};

export default async function ActivityPage() {
  const activity = await getActivity();

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-4'>
        <DevelopmentPreviewBanner />

        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight text-foreground'>
              Guardian Activity Stream
            </h1>
            <p className='text-xs text-muted-foreground mt-0.5'>
              Chronological surveillance audit log of processed conversations, extractions, conflict
              alerts, and execution outcomes
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Badge variant='outline' className='text-xs'>
              {activity.length} Audit Events Logged
            </Badge>
          </div>
        </div>

        <ActivityTimeline initialActivity={activity} />
      </div>
    </PageContainer>
  );
}
