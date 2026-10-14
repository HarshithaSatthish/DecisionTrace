import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardFooter
} from '@/components/ui/card';
import { Icons } from '@/components/icons';
import React from 'react';
import Link from 'next/link';
import { getDashboardMetrics } from '@/features/decision-trace/api/server';
import { AttentionItemsBanner } from '@/features/decision-trace/components/overview/attention-items-banner';
import { DevelopmentPreviewBanner } from '@/features/decision-trace/components/development-preview-banner';

export default async function OverViewLayout({
  sales,
  pie_stats,
  bar_stats,
  area_stats
}: {
  sales: React.ReactNode;
  pie_stats: React.ReactNode;
  bar_stats: React.ReactNode;
  area_stats: React.ReactNode;
}) {
  const metrics = await getDashboardMetrics();

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-4'>
        <DevelopmentPreviewBanner />

        {/* Header Header & Guardian Status */}
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight text-foreground'>
              DecisionTrace Guardian Overview
            </h1>
            <p className='text-xs text-muted-foreground mt-0.5'>
              Autonomous decision extraction, contradiction monitoring, and commitment surveillance
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Badge variant='outline' className='text-xs text-muted-foreground'>
              Qdrant + Lyzr Architecture
            </Badge>
          </div>
        </div>

        {/* 4 Core DecisionTrace Summary Cards */}
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {/* Card 1: Active Decisions */}
          <Link href='/dashboard/decisions' aria-label='View active decisions' className='group'>
            <Card className='border-border/80 shadow-xs hover:border-indigo-500/50 hover:shadow-sm transition-all'>
              <CardHeader className='pb-2'>
                <div className='flex items-center justify-between'>
                  <CardDescription className='text-xs font-medium'>
                    Active Decisions
                  </CardDescription>
                  <div className='flex size-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300'>
                    <Icons.scale className='size-4' />
                  </div>
                </div>
                <CardTitle className='text-3xl font-bold tabular-nums text-foreground'>
                  {metrics.activeDecisionsCount}
                </CardTitle>
                <CardAction>
                  <Badge
                    variant='outline'
                    className='gap-1 border-indigo-200 text-indigo-700 dark:text-indigo-300'
                  >
                    <Icons.trendingUp className='size-3' />
                    Active records
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardFooter className='pt-0 text-xs text-muted-foreground flex justify-between'>
                <span>3 high confidence, 1 under review</span>
                <span className='text-indigo-600 font-medium group-hover:underline'>
                  View &rarr;
                </span>
              </CardFooter>
            </Card>
          </Link>

          {/* Card 2: Open Commitments */}
          <Link href='/dashboard/commitments' aria-label='View open commitments' className='group'>
            <Card className='border-border/80 shadow-xs hover:border-teal-500/50 hover:shadow-sm transition-all'>
              <CardHeader className='pb-2'>
                <div className='flex items-center justify-between'>
                  <CardDescription className='text-xs font-medium'>
                    Open Commitments
                  </CardDescription>
                  <div className='flex size-7 items-center justify-center rounded-md bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-300'>
                    <Icons.kanban className='size-4' />
                  </div>
                </div>
                <CardTitle className='text-3xl font-bold tabular-nums text-foreground'>
                  {metrics.openCommitmentsCount}
                </CardTitle>
                <CardAction>
                  <Badge
                    variant='outline'
                    className='gap-1 border-teal-200 text-teal-700 dark:text-teal-300'
                  >
                    <Icons.clock className='size-3' />Track progress
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardFooter className='pt-0 text-xs text-muted-foreground flex justify-between'>
                <span>Review current commitments</span>
                <span className='text-teal-600 font-medium group-hover:underline'>
                  Board &rarr;
                </span>
              </CardFooter>
            </Card>
          </Link>

          {/* Card 3: Detected Conflicts */}
          <Link href='/dashboard/conflicts' aria-label='View detected conflicts' className='group'>
            <Card className='border-rose-500/30 bg-rose-500/[0.02] shadow-xs hover:border-rose-500/60 hover:shadow-sm transition-all'>
              <CardHeader className='pb-2'>
                <div className='flex items-center justify-between'>
                  <CardDescription className='text-xs font-medium text-rose-900 dark:text-rose-200'>
                    Detected Conflicts
                  </CardDescription>
                  <div className='flex size-7 items-center justify-center rounded-md bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'>
                    <Icons.warning className='size-4' />
                  </div>
                </div>
                <CardTitle className='text-3xl font-bold tabular-nums text-rose-950 dark:text-rose-100'>
                  {metrics.detectedConflictsCount}
                </CardTitle>
                <CardAction>
                  <Badge
                    variant='destructive'
                    className='text-[10px] uppercase font-semibold tracking-wider'
                  >
                    Contradiction Alert
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardFooter className='pt-0 text-xs text-rose-800/80 dark:text-rose-300 flex justify-between'>
                <span>Review conflict evidence</span>
                <span className='font-semibold text-rose-700 group-hover:underline'>
                  Resolve &rarr;
                </span>
              </CardFooter>
            </Card>
          </Link>

          {/* Card 4: Pending Approvals */}
          <Link href='/dashboard/approvals' aria-label='View pending approvals' className='group'>
            <Card className='border-amber-500/30 bg-amber-500/[0.02] shadow-xs hover:border-amber-500/60 hover:shadow-sm transition-all'>
              <CardHeader className='pb-2'>
                <div className='flex items-center justify-between'>
                  <CardDescription className='text-xs font-medium text-amber-900 dark:text-amber-200'>
                    Pending Approvals
                  </CardDescription>
                  <div className='flex size-7 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'>
                    <Icons.shieldCheck className='size-4' />
                  </div>
                </div>
                <CardTitle className='text-3xl font-bold tabular-nums text-amber-950 dark:text-amber-100'>
                  {metrics.pendingApprovalsCount}
                </CardTitle>
                <CardAction>
                  <Badge
                    variant='outline'
                    className='border-amber-400 bg-amber-50 text-amber-800 text-[10px]'
                  >
                    Awaiting Consensus
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardFooter className='pt-0 text-xs text-amber-800/80 dark:text-amber-300 flex justify-between'>
                <span>Backend consensus verification</span>
                <span className='font-semibold text-amber-700 group-hover:underline'>
                  Review &rarr;
                </span>
              </CardFooter>
            </Card>
          </Link>
        </div>

        {/* Attention-Required Banner */}
        <AttentionItemsBanner items={metrics.attentionItems} />

        {/* Decision Trends & Activity Stream */}
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7'>
          <div className='col-span-4'>{area_stats}</div>
          <div className='col-span-4 md:col-span-3'>{sales}</div>
          <div className='col-span-4'>{bar_stats}</div>
          <div className='col-span-4 min-h-0 md:col-span-3'>{pie_stats}</div>
        </div>
      </div>
    </PageContainer>
  );
}
