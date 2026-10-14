import { Skeleton } from '@/components/ui/skeleton';

export default function OverviewLoading() {
  return (
    <div className='flex flex-1 flex-col gap-4'>
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3'>
        <div className='space-y-1.5'>
          <Skeleton className='h-7 w-72' />
          <Skeleton className='h-3.5 w-96' />
        </div>
        <Skeleton className='h-6 w-44' />
      </div>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className='h-32 rounded-lg' />
        ))}
      </div>
      <Skeleton className='h-12 w-full rounded-lg' />
      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7'>
        <Skeleton className='col-span-4 h-[340px] rounded-lg' />
        <Skeleton className='col-span-4 md:col-span-3 h-[340px] rounded-lg' />
      </div>
    </div>
  );
}
