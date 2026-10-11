'use client';

import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';

interface HealthState {
  status: 'loading' | 'connected' | 'disconnected' | 'degraded';
  connected: boolean;
  message?: string;
}

export default function GuardianStatusPill() {
  const [health, setHealth] = useState<HealthState>({
    status: 'loading',
    connected: false
  });

  useEffect(() => {
    let isMounted = true;

    async function checkHealth() {
      try {
        const res = await fetch('/api/decision-trace/health');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setHealth({
              status: data.connected ? 'connected' : 'disconnected',
              connected: Boolean(data.connected),
              message: data.message
            });
          }
        } else {
          if (isMounted) {
            setHealth({
              status: 'disconnected',
              connected: false,
              message: 'Health probe returned non-200 status'
            });
          }
        }
      } catch {
        if (isMounted) {
          setHealth({
            status: 'disconnected',
            connected: false,
            message: 'Network error querying guardian health'
          });
        }
      }
    }

    void checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (health.status === 'loading') {
    return (
      <div
        className='hidden lg:flex items-center gap-1.5'
        title='Probing DecisionTrace Guardian connection...'
      >
        <Badge
          variant='outline'
          className='gap-1.5 border-border/80 bg-muted/40 text-muted-foreground py-1 px-2.5 text-[11px] font-normal'
        >
          <span className='size-1.5 rounded-full bg-muted-foreground/60 animate-pulse' />
          Guardian: Probing...
        </Badge>
      </div>
    );
  }

  if (health.connected) {
    return (
      <div
        className='hidden lg:flex items-center gap-1.5'
        title='Connected to FastAPI backend and Lyzr agent'
      >
        <Badge
          variant='outline'
          className='gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 py-1 px-2.5 text-[11px] font-medium'
        >
          <span className='size-1.5 rounded-full bg-emerald-500 animate-pulse' />
          Guardian Connected
        </Badge>
      </div>
    );
  }

  return (
    <div
      className='hidden lg:flex items-center gap-1.5'
      title={health.message || 'FastAPI backend is offline. Running in offline/preview mode.'}
    >
      <Badge
        variant='outline'
        className='gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 py-1 px-2.5 text-[11px] font-medium'
      >
        <Icons.alertCircle className='size-3 text-amber-600' />
        Guardian Disconnected
      </Badge>
    </div>
  );
}
