'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className='flex min-h-[85vh] w-full flex-col items-center justify-center px-4 py-16 text-center'>
      <div className='relative flex flex-col items-center max-w-md mx-auto space-y-4'>
        {/* DecisionTrace Shield Brand Mark */}
        <div className='flex size-16 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 shadow-sm'>
          <Icons.warning className='size-8 text-amber-500' />
        </div>

        <span className='from-foreground bg-linear-to-b to-muted-foreground/40 bg-clip-text text-7xl sm:text-8xl font-black tracking-tight text-transparent leading-none'>
          404
        </span>

        <h1 className='text-xl sm:text-2xl font-bold tracking-tight text-foreground'>
          Route Not Found
        </h1>

        <p className='text-sm text-muted-foreground leading-relaxed'>
          The requested page doesn&apos;t exist, has been archived, or requires different tenant workspace permissions.
        </p>

        <div className='pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto'>
          <Button
            onClick={() => router.back()}
            variant='outline'
            size='default'
            className='w-full sm:w-auto'
          >
            <Icons.chevronLeft className='mr-1 size-4' />
            Go Back
          </Button>
          <Button
            onClick={() => router.push('/dashboard/overview')}
            variant='default'
            size='default'
            className='w-full sm:w-auto'
          >
            <Icons.dashboard className='mr-1 size-4' />
            Return to Overview
          </Button>
        </div>
      </div>
    </div>
  );
}
