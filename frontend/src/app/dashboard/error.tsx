'use client';

import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export default function DashboardError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const retry = () => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <div className='flex h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center' role='alert'>
      <div className='rounded-full bg-destructive/10 p-4 text-destructive'>
        <Icons.warning className='h-8 w-8' aria-hidden='true' />
      </div>
      <div className='space-y-1'>
        <h2 className='text-xl font-semibold tracking-tight'>Unable to load data</h2>
        <p className='max-w-md text-sm text-muted-foreground'>
          {error.message || 'A service error occurred while fetching live data. Please try again.'}
        </p>
      </div>
      <Button variant='outline' onClick={retry} disabled={isPending}>
        {isPending ? (
          <>
            <Icons.spinner className='mr-2 h-4 w-4 animate-spin' aria-hidden='true' />
            Retrying...
          </>
        ) : (
          'Try again'
        )}
      </Button>
    </div>
  );
}
