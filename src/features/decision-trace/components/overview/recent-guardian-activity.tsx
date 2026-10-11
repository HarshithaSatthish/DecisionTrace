import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { ActivityItem } from '../../types';
import { FIXTURE_ACTIVITY } from '../../data/fixtures';
import { isDevPreviewEnabled } from '@/lib/decision-trace-preview';
import Link from 'next/link';

function getActivityIcon(type: string) {
  switch (type) {
    case 'conflict_detected':
      return <Icons.warning className='size-3.5 text-rose-600' />;
    case 'approval_requested':
      return <Icons.shieldCheck className='size-3.5 text-amber-600' />;
    case 'decision_extracted':
      return <Icons.scale className='size-3.5 text-indigo-600' />;
    case 'commitment_updated':
      return <Icons.circleCheck className='size-3.5 text-emerald-600' />;
    case 'conversation_processed':
      return <Icons.chat className='size-3.5 text-teal-600' />;
    default:
      return <Icons.clock className='size-3.5 text-muted-foreground' />;
  }
}

interface RecentGuardianActivityProps {
  initialActivities?: ActivityItem[];
}

export function RecentGuardianActivity({ initialActivities }: RecentGuardianActivityProps = {}) {
  const activities =
    initialActivities ?? (isDevPreviewEnabled() ? FIXTURE_ACTIVITY.slice(0, 5) : []);

  return (
    <Card className='border-border/80 shadow-xs h-full flex flex-col'>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='text-base font-semibold'>Guardian Live Stream</CardTitle>
            <CardDescription className='text-xs'>
              Autonomous extractions, conflict alerts and audit events
            </CardDescription>
          </div>
          <Link
            href='/dashboard/activity'
            className='text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline'
          >
            View all
          </Link>
        </div>
      </CardHeader>
      {activities.length === 0 ? (
        <CardContent className='flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground'>
          <Icons.clock className='size-7 text-muted-foreground/40 mb-2' />
          <p className='text-xs font-medium'>No guardian activity recorded yet.</p>
          <p className='text-[11px] text-muted-foreground/70 mt-0.5'>
            Events will stream as conversations are processed.
          </p>
        </CardContent>
      ) : (
        <CardContent className='flex-1 space-y-3 pt-0'>
          {activities.slice(0, 5).map((item) => (
            <div
              key={item.id}
              className='flex items-start gap-3 rounded-lg border border-border/40 p-2.5 transition-colors hover:bg-muted/40'
            >
              <div className='mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted'>
                {getActivityIcon(item.type)}
              </div>
              <div className='min-w-0 flex-1 space-y-1'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='truncate text-xs font-medium text-foreground'>{item.title}</p>
                  <time className='shrink-0 text-[11px] text-muted-foreground tabular-nums'>
                    {new Date(item.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </time>
                </div>
                <p className='line-clamp-2 text-[11px] text-muted-foreground leading-relaxed'>
                  {item.description}
                </p>
                <div className='flex items-center gap-2 pt-0.5'>
                  <Badge variant='outline' className='h-4 px-1.5 py-0 text-[10px] font-normal'>
                    {item.statusBadge || item.type.replace('_', ' ')}
                  </Badge>
                  {item.actor && (
                    <span className='truncate text-[10px] text-muted-foreground'>
                      by {item.actor}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
