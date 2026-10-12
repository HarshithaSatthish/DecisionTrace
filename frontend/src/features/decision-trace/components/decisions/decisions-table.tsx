'use client';

import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { Decision, Commitment } from '../../types';
import { DecisionStatusBadge } from '../status-badges';
import { DecisionDetailDrawer } from './decision-detail-drawer';

interface DecisionsTableProps {
  initialDecisions: Decision[];
  initialCommitments?: Commitment[];
}

export function DecisionsTable({ initialDecisions, initialCommitments }: DecisionsTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // FRANZY #12: Table list pagination to bound client DOM weight
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const categories = useMemo(() => {
    const set = new Set(initialDecisions.map((d) => d.category));
    return ['all', ...Array.from(set)];
  }, [initialDecisions]);

  // Reset to page 1 on filter/search change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, categoryFilter]);

  const filteredDecisions = useMemo(() => {
    return initialDecisions.filter((decision) => {
      const matchesSearch =
        search === '' ||
        decision.title.toLowerCase().includes(search.toLowerCase()) ||
        decision.whatWasDecided.toLowerCase().includes(search.toLowerCase()) ||
        decision.participants.some((p) => p.toLowerCase().includes(search.toLowerCase())) ||
        decision.category.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === 'all' || decision.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || decision.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [initialDecisions, search, statusFilter, categoryFilter]);

  const totalPages = Math.ceil(filteredDecisions.length / pageSize) || 1;
  const paginatedDecisions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDecisions.slice(start, start + pageSize);
  }, [filteredDecisions, currentPage, pageSize]);

  const handleRowClick = (decision: Decision) => {
    setSelectedDecision(decision);
    setDrawerOpen(true);
  };

  return (
    <div className='space-y-4'>
      {/* Filter and Search Bar */}
      <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
        <div className='relative flex-1 max-w-md'>
          <Icons.search className='absolute left-3 top-2.5 size-4 text-muted-foreground' />
          <Input
            placeholder='Search decisions, participants, keywords...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='pl-9 h-9 text-xs'
          />
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          {/* Status Filter */}
          <div className='flex items-center gap-1 border border-border/80 rounded-md p-1 bg-muted/20 text-xs'>
            {['all', 'active', 'under_review', 'superseded'].map((st) => (
              <Button
                key={st}
                variant={statusFilter === st ? 'secondary' : 'ghost'}
                size='sm'
                onClick={() => setStatusFilter(st)}
                className='h-7 px-2.5 text-xs capitalize'
              >
                {st.replace('_', ' ')}
              </Button>
            ))}
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className='h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Decisions Table */}
      <div className='rounded-lg border border-border/80 bg-card overflow-hidden shadow-xs'>
        <Table>
          <TableHeader className='bg-muted/30'>
            <TableRow>
              <TableHead className='w-[280px] text-xs font-semibold'>
                Decision Title & Domain
              </TableHead>
              <TableHead className='text-xs font-semibold'>What Was Decided</TableHead>
              <TableHead className='w-[140px] text-xs font-semibold'>Participants</TableHead>
              <TableHead className='w-[120px] text-xs font-semibold'>Confidence</TableHead>
              <TableHead className='w-[110px] text-xs font-semibold'>Status</TableHead>
              <TableHead className='w-[100px] text-xs font-semibold text-right'>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDecisions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className='h-32 text-center text-xs text-muted-foreground'>
                  No decisions found matching current filter criteria.
                </TableCell>
              </TableRow>
            ) : (
              paginatedDecisions.map((decision) => (
                <TableRow
                  key={decision.id}
                  onClick={() => handleRowClick(decision)}
                  className='cursor-pointer hover:bg-muted/40 transition-colors'
                >
                  <TableCell className='py-3'>
                    <div className='font-semibold text-xs text-foreground'>{decision.title}</div>
                    <div className='flex items-center gap-2 mt-1'>
                      <Badge
                        variant='outline'
                        className='text-[10px] px-1 py-0 text-muted-foreground font-normal'
                      >
                        {decision.category}
                      </Badge>
                      <span className='text-[10px] text-muted-foreground tabular-nums'>
                        {new Date(decision.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className='py-3'>
                    <p className='text-xs text-foreground/80 line-clamp-2 leading-relaxed'>
                      {decision.whatWasDecided}
                    </p>
                    <div className='mt-1 flex items-center gap-1 text-[11px] text-muted-foreground'>
                      <Icons.chat className='size-3 text-indigo-500' />
                      <span className='truncate'>{decision.sourceConversation.channel}</span>
                      <span className='text-muted-foreground/60'>&bull;</span>
                      <span>
                        {decision.evidence.length} evidence citation
                        {decision.evidence.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className='py-3'>
                    <div className='flex items-center -space-x-1.5'>
                      {decision.participants.slice(0, 3).map((person) => (
                        <div
                          key={person}
                          title={person}
                          className='size-6 rounded-full border border-background bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 flex items-center justify-center text-[10px] font-semibold'
                        >
                          {person[0]}
                        </div>
                      ))}
                      {decision.participants.length > 3 && (
                        <div className='size-6 rounded-full border border-background bg-muted flex items-center justify-center text-[10px] text-muted-foreground'>
                          +{decision.participants.length - 3}
                        </div>
                      )}
                    </div>
                    <div className='text-[10px] text-muted-foreground mt-1 truncate'>
                      {decision.participants[0]}
                      {decision.participants.length > 1 && ` +${decision.participants.length - 1}`}
                    </div>
                  </TableCell>
                  <TableCell className='py-3'>
                    <div className='flex items-center gap-1.5'>
                      <div className='w-12 bg-muted rounded-full h-1.5 overflow-hidden'>
                        <div
                          className='bg-emerald-500 h-full rounded-full'
                          style={{ width: `${decision.confidence}%` }}
                        />
                      </div>
                      <span className='text-xs font-medium tabular-nums'>
                        {decision.confidence}%
                      </span>
                    </div>
                    <span className='text-[10px] text-muted-foreground capitalize'>
                      {decision.confidenceLevel} match
                    </span>
                  </TableCell>
                  <TableCell className='py-3'>
                    <DecisionStatusBadge status={decision.status} />
                  </TableCell>
                  <TableCell className='py-3 text-right'>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(decision);
                      }}
                      className='h-7 text-xs text-indigo-600 hover:text-indigo-700'
                    >
                      View Trace
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* FRANZY #12: Pagination Bar */}
        {filteredDecisions.length > 0 && (
          <div className='flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-border/80 bg-muted/10 text-xs text-muted-foreground'>
            <div>
              Showing{' '}
              <span className='font-semibold text-foreground tabular-nums'>
                {(currentPage - 1) * pageSize + 1}
              </span>{' '}
              to{' '}
              <span className='font-semibold text-foreground tabular-nums'>
                {Math.min(currentPage * pageSize, filteredDecisions.length)}
              </span>{' '}
              of{' '}
              <span className='font-semibold text-foreground tabular-nums'>
                {filteredDecisions.length}
              </span>{' '}
              decisions
            </div>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className='h-7 px-2.5 text-xs'
              >
                Previous
              </Button>
              <span className='tabular-nums px-1'>
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className='h-7 px-2.5 text-xs'
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <DecisionDetailDrawer
        decision={selectedDecision}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        commitments={initialCommitments}
      />
    </div>
  );
}
