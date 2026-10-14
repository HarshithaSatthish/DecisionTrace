import { Skeleton } from '@/components/ui/skeleton';

export default function CommitmentsLoading() {
  return (
    <div className='flex flex-1 flex-col gap-4 p-4 md:p-6'>
      <div className='space-y-1.5'>
        <Skeleton className='h-7 w-64' />
        <Skeleton className='h-3.5 w-80' />
      </div>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className='space-y-3 rounded-lg border border-border/80 p-4'>
            <Skeleton className='h-6 w-32' />
            {Array.from({ length: 4 }).map((_, card) => (
              <Skeleton key={card} className='h-28 w-full rounded-md' />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
