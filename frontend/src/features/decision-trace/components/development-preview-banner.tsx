'use client';

import React, { useEffect, useState } from 'react';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';

export function DevelopmentPreviewBanner() {
  const [isPreview, setIsPreview] = useState(false);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    // Check health endpoint for truthful mode
    fetch('/api/decision-trace/health')
      .then((res) => res.json())
      .then((data) => {
        if (!data.connected) {
          setConnected(false);
          setIsPreview(data.mode === 'development-preview');
        }
      })
      .catch(() => {
        setConnected(false);
      });
  }, []);

  if (connected) return null;

  if (isPreview) {
    return (
      <div className='rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs min-w-0 max-w-full'>
        <div className='flex items-start sm:items-center gap-2 min-w-0 flex-1'>
          <Icons.warning className='size-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0' />
          <div className='min-w-0 flex-1'>
            <span className='font-semibold uppercase tracking-wider text-[11px] mr-1.5'>
              Development Preview Mode:
            </span>
            <span className='text-amber-800 dark:text-amber-200 break-words'>
              Displaying local verified fixtures. Person 1 FastAPI backend
              (DECISIONTRACE_BACKEND_URL) is currently disconnected.
            </span>
          </div>
        </div>
        <Badge
          variant='outline'
          className='border-amber-400 bg-amber-50 text-amber-800 text-[10px] shrink-0 self-start sm:self-center'
        >
          Mock Fixtures Active
        </Badge>
      </div>
    );
  }

  // Production offline
  return (
    <div className='rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-900 dark:text-rose-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0 max-w-full shadow-2xs'>
      <div className='flex items-start sm:items-center gap-2 min-w-0 flex-1'>
        <Icons.alertCircle className='size-4 text-rose-600 shrink-0 mt-0.5 sm:mt-0' />
        <span className='break-words min-w-0 flex-1'>
          Backend Service Offline: Connect FastAPI backend at{' '}
          <code className='font-mono break-all'>DECISIONTRACE_BACKEND_URL</code> to ingest real decision
          records.
        </span>
      </div>
      <Badge variant='destructive' className='text-[10px] shrink-0 self-start sm:self-center'>
        Offline
      </Badge>
    </div>
  );
}
