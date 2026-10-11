import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import Link from 'next/link';
import { FIXTURE_METRICS } from '../../data/fixtures';

export function AttentionItemsBanner() {
  const items = FIXTURE_METRICS.attentionItems;

  return (
    <Card className='border-amber-500/30 bg-amber-500/5 shadow-xs'>
      <CardHeader className='pb-2 pt-3.5 px-4'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <div className='flex size-6 items-center justify-center rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300'>
              <Icons.warning className='size-3.5' />
            </div>
            <div>
              <CardTitle className='text-sm font-semibold text-amber-900 dark:text-amber-200'>
                Attention Required (Autonomous Alerts)
              </CardTitle>
              <CardDescription className='text-xs text-amber-700/80 dark:text-amber-300/80'>
                Conflicts and pending actions requiring human-in-the-loop consensus
              </CardDescription>
            </div>
          </div>
          <Badge
            variant='outline'
            className='border-amber-500/40 bg-white/60 text-amber-800 text-[11px]'
          >
            {items.length} High Priority
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='px-4 pb-3 pt-1'>
        <div className='grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4'>
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.actionUrl}
              aria-label={`View ${item.type}: ${item.title}`}
              className='group flex flex-col justify-between rounded-md border border-amber-500/20 bg-background/80 p-2.5 transition-all hover:border-amber-500/50 hover:shadow-xs'
            >
              <div>
                <div className='flex items-center justify-between gap-1 pb-1'>
                  <span className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
                    {item.type}
                  </span>
                  <Badge
                    variant={item.severity === 'critical' ? 'destructive' : 'outline'}
                    className='h-4 px-1 py-0 text-[10px]'
                  >
                    {item.severity}
                  </Badge>
                </div>
                <p className='text-xs font-medium leading-snug line-clamp-2 text-foreground group-hover:text-indigo-600 transition-colors'>
                  {item.title}
                </p>
              </div>
              <div className='mt-2 flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40'>
                <span>{item.time}</span>
                <span className='flex items-center gap-0.5 text-indigo-600 font-medium group-hover:underline'>
                  Resolve <Icons.chevronRight className='size-3' />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
