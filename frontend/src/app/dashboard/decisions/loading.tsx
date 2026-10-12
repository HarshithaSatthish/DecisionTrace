import { Skeleton } from '@/components/ui/skeleton';

export default function DecisionsLoading() {
  return (
    <div className='flex flex-1 flex-col gap-4 p-4 md:p-6'>
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
        <div className='space-y-1.5'>
          <Skeleton className='h-7 w-64' />
          <Skeleton className='h-3.5 w-80' />
        </div>
        <Skeleton className='h-9 w-36' />
      </div>
      <div className='flex items-center justify-between gap-4'>
        <Skeleton className='h-9 w-72' />
        <Skeleton className='h-9 w-48' />
      </div>
      <div className='rounded-lg border border-border/80 overflow-hidden'>
        <Skeleton className='h-10 w-full' />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className='flex items-center justify-between p-4 border-t border-border/40'>
            <Skeleton className='h-5 w-48' />
            <Skeleton className='h-4 w-72' />
            <Skeleton className='h-6 w-20' />
          </div>
        ))}
      </div>
    </div>
  );
}
