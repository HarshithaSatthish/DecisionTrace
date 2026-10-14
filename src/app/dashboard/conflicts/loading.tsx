import { Skeleton } from '@/components/ui/skeleton';

export default function ConflictsLoading() {
  return (
    <div className='flex flex-1 flex-col gap-4 p-4 md:p-6'>
      <div className='space-y-1.5'>
        <Skeleton className='h-7 w-64' />
        <Skeleton className='h-3.5 w-96' />
      </div>
      <div className='space-y-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className='h-36 w-full rounded-lg' />
        ))}
      </div>
    </div>
  );
}
