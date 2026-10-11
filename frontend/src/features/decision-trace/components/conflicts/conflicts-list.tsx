'use client';

import React, { useState, useMemo } from 'react';
import { Conflict } from '../../types';
import { ConflictCard } from './conflict-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

interface ConflictsListProps {
  initialConflicts: Conflict[];
}

export function ConflictsList({ initialConflicts }: ConflictsListProps) {
  const [conflicts] = useState<Conflict[]>(initialConflicts);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');

  const filtered = useMemo(() => {
    return conflicts.filter((c) => {
      const matchSearch =
        search === '' ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.explanation.toLowerCase().includes(search.toLowerCase());

      const matchSeverity = severityFilter === 'all' || c.severity === severityFilter;

      return matchSearch && matchSeverity;
    });
  }, [conflicts, search, severityFilter]);

  return (
    <div className='space-y-4'>
      {/* Search and Filters */}
      <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
        <div className='relative flex-1 max-w-md'>
          <Icons.search className='absolute left-3 top-2.5 size-4 text-muted-foreground' />
          <Input
            placeholder='Search conflict titles, reasoning, evidence...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='pl-9 h-9 text-xs'
          />
        </div>

        <div className='flex items-center gap-1 border border-border/80 rounded-md p-1 bg-muted/20 text-xs'>
          {['all', 'critical', 'high', 'medium'].map((sev) => (
            <Button
              key={sev}
              variant={severityFilter === sev ? 'secondary' : 'ghost'}
              size='sm'
              onClick={() => setSeverityFilter(sev)}
              className='h-7 px-2.5 text-xs capitalize'
            >
              {sev}
            </Button>
          ))}
        </div>
      </div>

      {/* List of Conflict Cards */}
      <div className='space-y-4'>
        {filtered.length === 0 ? (
          <div className='flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-border/80 text-center p-6 bg-card'>
            <Icons.check className='size-8 text-emerald-600 pb-1' />
            <h4 className='text-sm font-semibold text-foreground'>No Contradictions Detected</h4>
            <p className='text-xs text-muted-foreground'>
              All active decisions maintain consistency across communication channels.
            </p>
          </div>
        ) : (
          filtered.map((conflict) => <ConflictCard key={conflict.id} conflict={conflict} />)
        )}
      </div>
    </div>
  );
}
