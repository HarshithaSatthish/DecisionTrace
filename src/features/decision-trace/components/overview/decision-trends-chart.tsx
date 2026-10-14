'use client';

import React from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';

const chartData = [
  { period: 'Nov 2025', decisions: 12, commitments: 9 },
  { period: 'Dec 2025', decisions: 16, commitments: 14 },
  { period: 'Jan 2026', decisions: 22, commitments: 18 },
  { period: 'Feb 2026', decisions: 28, commitments: 24 },
  { period: 'Mar 2026', decisions: 34, commitments: 30 },
  { period: 'Apr 2026', decisions: 41, commitments: 36 }
];

const chartConfig = {
  decisions: {
    label: 'Decisions Extracted',
    color: 'oklch(0.48 0.16 265)' // Restrained indigo
  },
  commitments: {
    label: 'Commitments Tracked',
    color: 'oklch(0.62 0.13 195)' // Teal accent
  }
} satisfies ChartConfig;

import { isDevPreviewEnabled } from '@/lib/decision-trace-preview';

interface DecisionTrendsChartProps {
  data?: Array<{ period: string; decisions: number; commitments: number }>;
}

export function DecisionTrendsChart({ data }: DecisionTrendsChartProps = {}) {
  const trendData = data ?? (isDevPreviewEnabled() ? chartData : []);
  const hasData = trendData.length > 0;

  return (
    <Card className='border-border/80 shadow-xs'>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='text-base font-semibold'>
              Decision Velocity & Commitment Growth
            </CardTitle>
            <CardDescription className='text-xs'>
              Autonomous extraction volume from communication channels over the past 6 months
            </CardDescription>
          </div>
          {hasData ? (
            <Badge
              variant='outline'
              className='gap-1 border-indigo-500/30 text-indigo-700 dark:text-indigo-300'
            >
              <Icons.trendingUp className='size-3' />
              +21% velocity
            </Badge>
          ) : (
            <Badge variant='outline' className='text-xs text-muted-foreground'>
              Awaiting Ingestion
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig} className='aspect-auto h-[280px] w-full'>
            <AreaChart data={trendData} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray='3 3' stroke='oklch(0.92 0.005 85)' />
              <XAxis
                dataKey='period'
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={12}
              />
              <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                dataKey='commitments'
                type='monotone'
                fill='oklch(0.62 0.13 195 / 0.15)'
                stroke='oklch(0.62 0.13 195)'
                strokeWidth={2}
              />
              <Area
                dataKey='decisions'
                type='monotone'
                fill='oklch(0.48 0.16 265 / 0.18)'
                stroke='oklch(0.48 0.16 265)'
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className='flex flex-col items-center justify-center h-[280px] w-full text-center text-muted-foreground'>
            <Icons.trendingUp className='size-8 text-muted-foreground/30 mb-2' />
            <p className='text-xs font-medium'>No velocity metrics recorded yet</p>
            <p className='text-[11px] text-muted-foreground/70 mt-0.5'>
              Extraction trends will populate as decisions and commitments are tracked.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
