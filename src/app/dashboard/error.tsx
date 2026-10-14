'use client';

import { Button } from '@/components/ui/button';

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <div role='alert' className='flex flex-col items-start gap-4 p-6'>
      <h1 className='text-xl font-semibold'>Unable to load your dashboard</h1>
      <p className='text-muted-foreground'>Check your connection and try again.</p>
      <Button onClick={reset}>Retry</Button>
    </div>
  );
}
