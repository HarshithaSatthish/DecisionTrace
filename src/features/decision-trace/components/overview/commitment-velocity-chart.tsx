'use client';

import React from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';

const chartData = [
  { status: 'Planned', count: 6, fill: 'oklch(0.55 0.05 250)' },
  { status: 'In Progress', count: 8, fill: 'oklch(0.48 0.16 265)' },
  { status: 'Blocked', count: 2, fill: 'oklch(0.58 0.20 28)' },
  { status: 'Completed', count: 12, fill: 'oklch(0.58 0.15 155)' }
];

const chartConfig = {
  count: {
    label: 'Commitments',
    color: 'oklch(0.48 0.16 265)'
  }
} satisfies ChartConfig;

export function CommitmentVelocityChart() {
  return (
    <Card className='border-border/80 shadow-xs'>
      <CardHeader>
        <CardTitle className='text-base font-semibold'>Commitment Fulfillment Status</CardTitle>
        <CardDescription className='text-xs'>
          Current distribution of commitments derived from architectural decisions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className='aspect-auto h-[240px] w-full'>
          <BarChart data={chartData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray='3 3' stroke='oklch(0.92 0.005 85)' />
            <XAxis dataKey='status' tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey='count' radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
