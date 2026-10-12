import { formatSafeDateTime } from '../lib/format-date';
import React from 'react';
import { EvidenceReference } from '../types';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface EvidenceCardProps {
  evidence: EvidenceReference;
  className?: string;
  compact?: boolean;
}

export function EvidenceCard({ evidence, className, compact = false }: EvidenceCardProps) {
  const getSourceIcon = () => {
    switch (evidence.sourceType) {
      case 'slack':
      case 'teams':
        return <Icons.chat className='size-3.5 text-indigo-600' />;
      case 'meeting':
        return <Icons.video className='size-3.5 text-teal-600' />;
      case 'document':
        return <Icons.page className='size-3.5 text-amber-600' />;
      case 'email':
        return <Icons.notification className='size-3.5 text-blue-600' />;
      default:
        return <Icons.page className='size-3.5 text-muted-foreground' />;
    }
  };

  const formattedDate = formatSafeDateTime(evidence.timestamp, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  if (compact) {
    return (
      <div
        className={cn(
          'bg-muted/40 border-border/80 rounded-md border p-2.5 text-xs transition-colors',
          className
        )}
      >
        <div className='flex items-center justify-between gap-2 pb-1.5'>
          <div className='flex items-center gap-1.5 font-medium'>
            {getSourceIcon()}
            <span className='truncate'>{evidence.sourceTitle}</span>
          </div>
          <span className='text-muted-foreground shrink-0 text-[11px]'>{formattedDate}</span>
        </div>
        <blockquote className='text-foreground/90 border-primary/40 border-l-2 pl-2 italic leading-relaxed'>
          &ldquo;{evidence.quote}&rdquo;
        </blockquote>
        <div className='text-muted-foreground mt-1.5 flex items-center justify-between text-[11px]'>
          <span>By: {evidence.speakerOrAuthor}</span>
          {evidence.vectorSimilarity && (
            <Badge variant='outline' className='h-4 px-1 py-0 text-[10px]'>
              Match: {(evidence.vectorSimilarity * 100).toFixed(0)}%
            </Badge>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-card border-border/80 relative rounded-lg border p-3.5 shadow-xs transition-all',
        className
      )}
    >
      <div className='flex items-center justify-between gap-2 pb-2'>
        <div className='flex items-center gap-2'>
          <div className='bg-primary/10 flex size-6 items-center justify-center rounded-md'>
            {getSourceIcon()}
          </div>
          <div>
            <div className='text-xs font-semibold tracking-tight'>{evidence.sourceTitle}</div>
            <div className='text-muted-foreground text-[11px]'>
              Speaker:{' '}
              <span className='text-foreground font-medium'>{evidence.speakerOrAuthor}</span>
            </div>
          </div>
        </div>
        <div className='flex items-center gap-1.5'>
          {evidence.vectorSimilarity && (
            <Badge variant='secondary' className='h-5 text-[11px] font-normal'>
              Qdrant {(evidence.vectorSimilarity * 100).toFixed(0)}%
            </Badge>
          )}
          <time className='text-muted-foreground text-xs tabular-nums'>{formattedDate}</time>
        </div>
      </div>

      <div className='bg-muted/20 border-border/60 my-1 rounded border-l-2 border-l-indigo-500 py-1.5 pr-2 pl-3'>
        <p className='text-foreground/90 text-xs leading-relaxed italic'>
          &ldquo;{evidence.quote}&rdquo;
        </p>
      </div>

      {evidence.channelOrLocation && (
        <div className='text-muted-foreground mt-2 flex items-center gap-1 text-[11px]'>
          <Icons.info className='size-3' />
          <span>Location: {evidence.channelOrLocation}</span>
        </div>
      )}
    </div>
  );
}
