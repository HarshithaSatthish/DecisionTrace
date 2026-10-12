'use client';

import { formatSafeDate, formatSafeTime } from '../../lib/format-date';

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { ActivityItem } from '../../types';
import { EvidenceCard } from '../evidence-card';

interface ActivityTimelineProps {
  initialActivity: ActivityItem[];
}

function getEventBadge(type: string) {
  switch (type) {
    case 'conflict_detected':
      return {
        icon: <Icons.warning className='size-3.5 text-rose-600' />,
        badge: (
          <Badge variant='destructive' className='text-[10px]'>
            Conflict Detected
          </Badge>
        ),
        border: 'border-l-rose-500'
      };
    case 'approval_requested':
    case 'approval_executed':
      return {
        icon: <Icons.shieldCheck className='size-3.5 text-amber-600' />,
        badge: (
          <Badge
            variant='outline'
            className='border-amber-500 text-amber-700 bg-amber-50 text-[10px]'
          >
            Approval Event
          </Badge>
        ),
        border: 'border-l-amber-500'
      };
    case 'decision_extracted':
      return {
        icon: <Icons.scale className='size-3.5 text-indigo-600' />,
        badge: (
          <Badge
            variant='outline'
            className='border-indigo-500 text-indigo-700 bg-indigo-50 text-[10px]'
          >
            Decision Extracted
          </Badge>
        ),
        border: 'border-l-indigo-500'
      };
    case 'commitment_updated':
      return {
        icon: <Icons.circleCheck className='size-3.5 text-emerald-600' />,
        badge: (
          <Badge
            variant='outline'
            className='border-emerald-500 text-emerald-700 bg-emerald-50 text-[10px]'
          >
            Commitment Update
          </Badge>
        ),
        border: 'border-l-emerald-500'
      };
    case 'conversation_processed':
      return {
        icon: <Icons.chat className='size-3.5 text-teal-600' />,
        badge: (
          <Badge variant='outline' className='border-teal-500 text-teal-700 bg-teal-50 text-[10px]'>
            Ingestion Pipeline
          </Badge>
        ),
        border: 'border-l-teal-500'
      };
    default:
      return {
        icon: <Icons.clock className='size-3.5 text-muted-foreground' />,
        badge: (
          <Badge variant='outline' className='text-[10px]'>
            System Event
          </Badge>
        ),
        border: 'border-l-muted'
      };
  }
}

export function ActivityTimeline({ initialActivity }: ActivityTimelineProps) {
  const [activities] = useState<ActivityItem[]>(initialActivity);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = useMemo(() => {
    return activities.filter((item) => {
      const matchSearch =
        search === '' ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase()) ||
        (item.actor && item.actor.toLowerCase().includes(search.toLowerCase()));

      const matchType = typeFilter === 'all' || item.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [activities, search, typeFilter]);

  return (
    <div className='space-y-4'>
      {/* Search and Category Filters */}
      <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
        <div className='relative flex-1 max-w-md'>
          <Icons.search className='absolute left-3 top-2.5 size-4 text-muted-foreground' />
          <Input
            placeholder='Search activity timeline, events, actors...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='pl-9 h-9 text-xs'
          />
        </div>

        <div className='flex flex-wrap items-center gap-1 border border-border/80 rounded-md p-1 bg-muted/20 text-xs'>
          {[
            { label: 'All Events', value: 'all' },
            { label: 'Decisions', value: 'decision_extracted' },
            { label: 'Conflicts', value: 'conflict_detected' },
            { label: 'Approvals', value: 'approval_requested' },
            { label: 'Commitments', value: 'commitment_updated' },
            { label: 'Ingestion', value: 'conversation_processed' }
          ].map((tab) => (
            <Button
              key={tab.value}
              variant={typeFilter === tab.value ? 'secondary' : 'ghost'}
              size='sm'
              onClick={() => setTypeFilter(tab.value)}
              className='h-7 px-2.5 text-xs'
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Chronological Timeline */}
      <div className='relative pl-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border/60 space-y-4'>
        {filtered.length === 0 ? (
          <div className='flex h-32 items-center justify-center rounded-lg border border-dashed border-border/80 text-xs text-muted-foreground bg-card'>
            No activity records matching filter.
          </div>
        ) : (
          filtered.map((item) => {
            const config = getEventBadge(item.type);
            const formattedDate = formatSafeDate(item.timestamp, {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });
            const formattedTime = formatSafeTime(item.timestamp, {
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <div key={item.id} className='relative group'>
                {/* Timeline node dot */}
                <div className='absolute -left-6 top-4 flex size-5 -translate-x-1/2 items-center justify-center rounded-full border border-background bg-card shadow-xs group-hover:scale-110 transition-transform'>
                  <span className='size-2 rounded-full bg-primary' />
                </div>

                <Card
                  className={`border-border/80 shadow-xs border-l-4 ${config.border} hover:shadow-sm transition-all`}
                >
                  <CardContent className='p-4 space-y-2'>
                    {/* Header Row */}
                    <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-1.5'>
                      <div className='flex items-center gap-2'>
                        {config.icon}
                        {config.badge}
                        {item.statusBadge && (
                          <Badge
                            variant='outline'
                            className='text-[10px] font-normal text-muted-foreground'
                          >
                            {item.statusBadge}
                          </Badge>
                        )}
                      </div>
                      <time className='text-xs text-muted-foreground tabular-nums'>
                        {formattedDate} &bull; {formattedTime}
                      </time>
                    </div>

                    {/* Title & Description */}
                    <div>
                      <h4 className='text-sm font-semibold text-foreground'>{item.title}</h4>
                      <p className='text-xs text-foreground/80 leading-relaxed pt-1'>
                        {item.description}
                      </p>
                    </div>

                    {/* Actor Attribution */}
                    {item.actor && (
                      <div className='text-[11px] text-muted-foreground pt-1 flex items-center gap-1.5'>
                        <span className='font-medium text-foreground'>Originator:</span>
                        <span>{item.actor}</span>
                        {item.entityId && (
                          <>
                            <span className='text-muted-foreground/40'>&bull;</span>
                            <span className='text-muted-foreground'>Entity #{item.entityId}</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Supporting Evidence Citations if present */}
                    {item.evidence && item.evidence.length > 0 && (
                      <div className='pt-2 border-t border-border/40 space-y-2'>
                        <span className='text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1'>
                          <Icons.post className='size-3 text-indigo-500' /> Verifiable Citation
                        </span>
                        <div className='space-y-1.5'>
                          {item.evidence.map((ev) => (
                            <EvidenceCard key={ev.id} evidence={ev} compact />
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
