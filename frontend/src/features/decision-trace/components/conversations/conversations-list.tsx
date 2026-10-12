'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Icons } from '@/components/icons';
import { OmiConversation, OmiConversationDetail } from '../../types';
import { getConversationDetail, getConversations, invalidateClientCache } from '../../api/service';
import { formatSafeDate, formatSafeTime, formatSafeDateTime } from '../../lib/format-date';

interface ConversationsListProps {
  initialConversations: OmiConversation[];
}

export const DETAIL_UNAVAILABLE_MESSAGE =
  'The full transcript for this conversation could not be loaded from the server. The snippet above is a truncated preview, not the complete transcript.';

export type DetailViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; detail: OmiConversationDetail };

/**
 * Derives the transcript detail view state. If an error occurred or no detail
 * could be retrieved, an explicit error state is produced so the UI never
 * masquerades a truncated preview as the verified complete transcript.
 */
export function resolveDetailViewState(params: {
  loading: boolean;
  error: string | null;
  detail: OmiConversationDetail | null;
}): DetailViewState {
  if (params.loading) return { kind: 'loading' };
  if (params.error) return { kind: 'error', message: params.error };
  if (!params.detail) {
    return { kind: 'error', message: DETAIL_UNAVAILABLE_MESSAGE };
  }
  return { kind: 'ready', detail: params.detail };
}

/**
 * Returns the normalized transcript body. Never falls back to the truncated
 * preview to maintain audit truthfulness.
 */
export function resolveTranscriptText(detail: OmiConversationDetail): string {
  if (detail.normalizedTranscript && detail.normalizedTranscript.trim().length > 0) {
    return detail.normalizedTranscript;
  }
  return 'No transcript recorded for this conversation.';
}

export function ConversationsList({ initialConversations }: ConversationsListProps) {
  const [conversations, setConversations] = useState<OmiConversation[]>(initialConversations);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedConversation, setSelectedConversation] = useState<OmiConversation | null>(null);
  const [conversationDetail, setConversationDetail] = useState<OmiConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const fetchDetail = useCallback(async (conv: OmiConversation) => {
    setDetailLoading(true);
    setDetailError(null);
    setConversationDetail(null);
    try {
      const detail = await getConversationDetail(conv.id);
      setConversationDetail(detail);
      setDetailError(null);
    } catch {
      setConversationDetail(null);
      setDetailError(DETAIL_UNAVAILABLE_MESSAGE);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleRetryDetail = () => {
    if (selectedConversation) void fetchDetail(selectedConversation);
  };

  /** Re-reads conversations + their latest processing statuses via existing authenticated endpoints. */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setListError(null);
    try {
      invalidateClientCache();
      const latest = await getConversations();
      setConversations(latest);
      setLastRefreshedAt(new Date());
    } catch {
      setListError('Could not refresh conversations. Showing the last known data.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const detailView = resolveDetailViewState({
    loading: detailLoading,
    error: detailError,
    detail: conversationDetail
  });

  const filtered = conversations.filter((c) => {
    const matchesSearch =
      !search ||
      (c.title || '').toLowerCase().includes(search.toLowerCase()) ||
      c.transcriptPreview.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOpenDetail = async (conv: OmiConversation) => {
    setSelectedConversation(conv);
    setDialogOpen(true);
    await fetchDetail(conv);
  };

  return (
    <div className='space-y-4 max-w-7xl'>
      {/* Search and Filters */}
      <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
        <div className='relative flex-1 max-w-sm'>
          <Icons.search className='absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground' />
          <Input
            placeholder='Search conversations or transcripts...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='pl-9 h-9 text-xs'
          />
        </div>
        <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0'>
          <div className='flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0'>
            {['all', 'processed', 'processing', 'pending', 'failed'].map((st) => (
              <Button
                key={st}
                size='sm'
                variant={statusFilter === st ? 'default' : 'outline'}
                className='h-8 text-xs capitalize shrink-0'
                onClick={() => setStatusFilter(st)}
              >
                {st}
              </Button>
            ))}
          </div>
          <Button
            size='sm'
            variant='outline'
            className='h-8 text-xs gap-1.5 shrink-0'
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <Icons.spinner className={refreshing ? 'size-3.5 animate-spin' : 'size-3.5'} />
            {refreshing ? 'Refreshing' : 'Refresh Status'}
          </Button>
        </div>
      </div>

      {lastRefreshedAt && !listError && (
        <p className='text-[11px] text-muted-foreground'>
          Statuses last refreshed at{' '}
          {lastRefreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.
        </p>
      )}

      {listError && (
        <div
          role='alert'
          className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs'
        >
          <span className='text-amber-800 dark:text-amber-300'>{listError}</span>
          <Button size='sm' variant='outline' className='h-7 text-xs shrink-0' onClick={handleRefresh} disabled={refreshing}>
            Try again
          </Button>
        </div>
      )}

      {/* Conversations Grid / List */}
      {filtered.length === 0 ? (
        <Card className='border-dashed'>
          <CardContent className='flex flex-col items-center justify-center py-12 text-center'>
            <Icons.chat className='size-8 text-muted-foreground/40 mb-3' />
            <p className='text-sm font-medium'>No conversations found</p>
            <p className='text-xs text-muted-foreground mt-1 max-w-sm'>
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search terms or filters.'
                : 'No audio memories have been received from Omi wearable yet. Configure your webhook in Settings.'}
            </p>
            <Link
              href='/dashboard/settings/omi'
              className='mt-4 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground'
            >
              Configure Omi Webhook
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5'>
          {filtered.map((conv) => (
            <Card
              key={conv.id}
              className='hover:border-primary/40 transition-colors flex flex-col justify-between cursor-pointer group shadow-2xs'
              onClick={() => handleOpenDetail(conv)}
            >
              <CardHeader className='pb-2.5 space-y-1.5'>
                <div className='flex items-start justify-between gap-2'>
                  <CardTitle className='text-sm font-semibold line-clamp-1 group-hover:text-primary transition-colors'>
                    {conv.title}
                  </CardTitle>
                  <Badge
                    variant={
                      conv.status === 'processed'
                        ? 'default'
                        : conv.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                    }
                    className='text-[10px] capitalize shrink-0 font-medium'
                  >
                    {conv.status}
                  </Badge>
                </div>
                <div className='flex items-center gap-2 text-[11px] text-muted-foreground'>
                  <span>{formatSafeDate(conv.sourceTime || conv.createdAt)}</span>
                  <span>&bull;</span>
                  <span>{formatSafeTime(conv.sourceTime || conv.createdAt)}</span>
                </div>
              </CardHeader>
              <CardContent className='space-y-3 pt-0'>
                <p className='text-xs text-muted-foreground line-clamp-3 leading-relaxed bg-muted/20 p-2.5 rounded border border-border/40 font-mono text-[11px]'>
                  "{conv.transcriptPreview || 'No transcript snippet available'}"
                </p>
                <div className='flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-foreground'>
                  <span className='font-mono text-[10px] truncate max-w-[140px]'>
                    {conv.sourceEventId}
                  </span>
                  <span className='text-primary group-hover:underline flex items-center gap-1 font-medium'>
                    View Full Trace &rarr;
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Transcript Detail Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='max-w-2xl max-h-[85vh] overflow-y-auto'>
          <DialogHeader>
            <div className='flex items-center gap-2'>
              <Badge variant='outline' className='text-[10px] capitalize font-medium'>
                {selectedConversation?.status}
              </Badge>
              <span className='text-xs text-muted-foreground'>
                {formatSafeDateTime(selectedConversation?.sourceTime || selectedConversation?.createdAt)}
              </span>
            </div>
            <DialogTitle className='text-base font-bold mt-1'>
              {selectedConversation?.title}
            </DialogTitle>
            <DialogDescription className='text-xs'>
              Audio memory event ID:{' '}
              <span className='font-mono text-foreground font-semibold'>
                {selectedConversation?.sourceEventId}
              </span>
            </DialogDescription>
          </DialogHeader>

          {detailView.kind === 'loading' ? (
            <div className='flex flex-col items-center justify-center gap-2 p-8'>
              <Icons.spinner className='size-5 animate-spin text-muted-foreground' />
              <span className='text-xs text-muted-foreground'>Loading full transcript...</span>
            </div>
          ) : detailView.kind === 'error' ? (
            <div
              role='alert'
              className='flex flex-col items-center justify-center gap-3 rounded-lg border border-rose-500/40 bg-rose-50/50 dark:bg-rose-950/30 p-6 text-center'
            >
              <Icons.warning className='size-6 text-rose-600 dark:text-rose-300' />
              <div>
                <h4 className='text-sm font-semibold text-foreground'>Transcript unavailable</h4>
                <p className='text-xs text-muted-foreground mt-1 max-w-sm'>{detailView.message}</p>
              </div>
              <Button size='sm' variant='outline' className='h-8 text-xs gap-1.5' onClick={handleRetryDetail}>
                <Icons.spinner className='size-3.5' />
                Retry
              </Button>
            </div>
          ) : (
            <div className='space-y-4 pt-2 text-xs'>
              <div className='grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-md bg-muted/40 border border-border/50 text-[11px]'>
                <div>
                  <span className='text-muted-foreground block text-[11px]'>Internal ID</span>
                  <span className='font-mono font-medium truncate block'>
                    {detailView.detail.id}
                  </span>
                </div>
                <div>
                  <span className='text-muted-foreground block text-[11px]'>Processing Status</span>
                  <span className='font-semibold text-foreground capitalize'>
                    {detailView.detail.status}
                  </span>
                </div>
                <div>
                  <span className='text-muted-foreground block text-[11px]'>Vector Chunks</span>
                  <span className='font-medium'>
                    {detailView.detail.chunks?.length ?? 0} indexed
                  </span>
                </div>
              </div>

              <div>
                <h4 className='font-semibold text-foreground mb-1.5'>Full Normalized Transcript</h4>
                <div className='rounded-md border p-3.5 bg-card whitespace-pre-wrap leading-relaxed text-xs max-h-60 overflow-y-auto font-sans'>
                  {resolveTranscriptText(detailView.detail)}
                </div>
              </div>

              {detailView.detail.chunks && detailView.detail.chunks.length > 0 && (
                <div>
                  <h4 className='font-semibold text-foreground mb-1.5'>Semantic Memory Chunks</h4>
                  <div className='space-y-1.5 max-h-48 overflow-y-auto'>
                    {detailView.detail.chunks.map((chk, i) => (
                      <div
                        key={chk.id || i}
                        className='rounded border border-border/60 bg-muted/20 p-2 text-[11px]'
                      >
                        <div className='flex items-center justify-between text-muted-foreground mb-1 font-mono text-[10px]'>
                          <span>Chunk #{i + 1}</span>
                          <span className='truncate max-w-[200px]'>{chk.id}</span>
                        </div>
                        <p className='text-foreground font-mono text-[11px]'>{chk.excerpt}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
