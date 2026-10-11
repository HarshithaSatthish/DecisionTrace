'use client';

import React from 'react';
import { Cell, Pie, PieChart } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import { isDevPreviewEnabled } from '@/lib/decision-trace-preview';

const chartData = [
  { category: 'Infrastructure', value: 38, fill: 'oklch(0.48 0.16 265)' },
  { category: 'Security & Auth', value: 27, fill: 'oklch(0.62 0.13 195)' },
  { category: 'Compliance', value: 20, fill: 'oklch(0.70 0.14 70)' },
  { category: 'API Platform', value: 15, fill: 'oklch(0.60 0.15 150)' }
];

const chartConfig = {
  value: {
    label: 'Decisions',
    color: 'oklch(0.48 0.16 265)'
  }
} satisfies ChartConfig;

interface DecisionDistributionChartProps {
  data?: Array<{ category: string; value: number; fill: string }>;
}

export function DecisionDistributionChart({ data }: DecisionDistributionChartProps = {}) {
  const displayData = data ?? (isDevPreviewEnabled() ? chartData : []);
  const hasData = displayData.some((d) => d.value > 0);

  return (
    <Card className='border-border/80 shadow-xs flex flex-col justify-between'>
      <CardHeader>
        <CardTitle className='text-base font-semibold'>Decision Categories</CardTitle>
        <CardDescription className='text-xs'>
          Domain breakdown of active and tracked decisions
        </CardDescription>
      </CardHeader>
      <CardContent className='flex-1 pb-4 flex flex-col justify-center'>
        {hasData ? (
          <>
            <ChartContainer config={chartConfig} className='mx-auto aspect-square max-h-[190px]'>
              <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={displayData}
                  dataKey='value'
                  nameKey='category'
                  innerRadius={50}
                  outerRadius={75}
                  strokeWidth={2}
                >
                  {displayData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className='grid grid-cols-2 gap-2 pt-3 text-xs'>
              {displayData.map((item) => (
                <div key={item.category} className='flex items-center gap-1.5'>
                  <span
                    className='size-2 rounded-full shrink-0'
                    style={{ backgroundColor: item.fill }}
                  />
                  <span className='text-muted-foreground truncate'>{item.category}</span>
                  <span className='font-medium ml-auto tabular-nums'>{item.value}%</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className='flex flex-col items-center justify-center min-h-[190px] text-center text-muted-foreground'>
            <Icons.scale className='size-8 text-muted-foreground/30 mb-2' />
            <p className='text-xs font-medium'>No decision categories yet</p>
            <p className='text-[11px] text-muted-foreground/70 mt-0.5'>
              Domain breakdown will populate as decisions are cataloged.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
