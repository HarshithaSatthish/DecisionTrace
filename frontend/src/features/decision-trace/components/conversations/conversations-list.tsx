'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Icons } from '@/components/icons';
import { OmiConversation, OmiConversationDetail } from '../../types';
import { getConversationDetail } from '../../api/service';

function getStatusBadge(status: OmiConversation['status']) {
  switch (status) {
    case 'processed':
      return (
        <Badge className='border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'>
          <Icons.check className='mr-1 size-3' />
          Processed
        </Badge>
      );
    case 'processing':
      return (
        <Badge className='border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'>
          <Icons.spinner className='mr-1 size-3 animate-spin' />
          Processing
        </Badge>
      );
    case 'failed':
      return (
        <Badge className='border-rose-500/30 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'>
          <Icons.close className='mr-1 size-3' />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge className='border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'>
          <Icons.clock className='mr-1 size-3' />
          Pending
        </Badge>
      );
  }
}

interface ConversationsListProps {
  initialConversations: OmiConversation[];
}

export function ConversationsList({ initialConversations }: ConversationsListProps) {
  const [conversations] = useState<OmiConversation[]>(initialConversations);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedConversation, setSelectedConversation] = useState<OmiConversation | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [conversationDetail, setConversationDetail] = useState<OmiConversationDetail | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = conversations.filter((c) => {
    const matchesSearch =
      !search ||
      c.transcriptPreview.toLowerCase().includes(search.toLowerCase()) ||
      (c.sourceEventId && c.sourceEventId.toLowerCase().includes(search.toLowerCase())) ||
      (c.title && c.title.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOpenDetail = async (conv: OmiConversation) => {
    setSelectedConversation(conv);
    setDialogOpen(true);
    setDetailLoading(true);
    setConversationDetail(null);
    try {
      const detail = await getConversationDetail(conv.id);
      setConversationDetail(detail);
    } catch {
      // Fallback to conversation summary if detail fetch is not yet available
      setConversationDetail({
        ...conv,
        normalizedTranscript: conv.transcriptPreview,
        chunks: []
      });
    } finally {
      setDetailLoading(false);
    }
  };



  return (
    <div className='space-y-4'>
      {/* Search and Filters */}
      <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
        <div className='relative flex-1 max-w-md'>
          <Icons.search className='absolute left-3 top-2.5 size-4 text-muted-foreground' />
          <Input
            placeholder='Search conversations, transcripts, events...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='pl-9 h-9 text-xs'
          />
        </div>
        <div className='flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0'>
          {['all', 'processed', 'processing', 'pending', 'failed'].map((st) => (
            <Button
              key={st}
              size='sm'
              variant={statusFilter === st ? 'default' : 'outline'}
              className='h-8 text-xs capitalize'
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </Button>
          ))}
        </div>
      </div>

      {/* Conversations Grid / List */}
      {filtered.length === 0 ? (
        <Card className='border-dashed'>
          <CardContent className='flex flex-col items-center justify-center p-12 text-center'>
            <div className='rounded-full bg-muted p-4 mb-3'>
              <Icons.chat className='size-6 text-muted-foreground' />
            </div>
            <h3 className='text-base font-semibold text-foreground mb-1'>No conversations found</h3>
            <p className='text-xs text-muted-foreground max-w-sm mb-4'>
              {search || statusFilter !== 'all'
                ? 'No conversations match your filter criteria.'
                : 'No genuine Omi conversations recorded yet. Connect your Omi wearable device to start capturing and verifying decisions.'}
            </p>
            <Link href='/dashboard/settings/omi'>
              <Button size='sm' className='gap-1.5 text-xs'>
                <Icons.settings className='size-3.5' />
                Configure Omi Connection
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className='grid grid-cols-1 gap-3.5'>
          {filtered.map((conv) => (
            <Card
              key={conv.id}
              className='overflow-hidden transition-all hover:border-primary/40 hover:shadow-xs'
            >
              <CardHeader className='p-4 pb-2 bg-muted/20 border-b border-border/40'>
                <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2'>
                  <div className='flex items-center gap-2'>
                    {getStatusBadge(conv.status)}
                    <Badge variant='outline' className='text-xs font-mono font-normal'>
                      {conv.sourceEventId || `conv-${conv.id.slice(0, 8)}`}
                    </Badge>
                  </div>
                  <time className='text-xs text-muted-foreground tabular-nums'>
                    Recorded on {new Date(conv.sourceTime).toLocaleDateString()} at{' '}
                    {new Date(conv.sourceTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </time>
                </div>
                {conv.title && (
                  <CardTitle className='text-sm font-semibold pt-1'>{conv.title}</CardTitle>
                )}
              </CardHeader>
              <CardContent className='p-4 pt-3 space-y-3'>
                <p className='text-xs text-muted-foreground line-clamp-2 leading-relaxed'>
                  "{conv.transcriptPreview}"
                </p>
                <div className='flex items-center justify-between pt-1'>
                  <span className='text-[11px] text-muted-foreground/80'>
                    Received: {new Date(conv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <Button
                    size='sm'
                    variant='outline'
                    className='h-7 text-xs gap-1'
                    onClick={() => handleOpenDetail(conv)}
                  >
                    View Transcript
                    <Icons.arrowRight className='size-3' />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Transcript Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='max-w-2xl max-h-[85vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle className='text-base font-semibold flex items-center gap-2'>
              <Icons.chat className='size-4 text-primary' />
              Conversation Transcript Detail
            </DialogTitle>
            <DialogDescription className='text-xs'>
              {selectedConversation?.sourceEventId || selectedConversation?.id}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className='flex items-center justify-center p-8'>
              <Icons.spinner className='size-5 animate-spin text-muted-foreground' />
            </div>
          ) : (
            <div className='space-y-4 pt-2 text-xs'>
              <div className='grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg bg-muted/40'>
                <div>
                  <span className='text-muted-foreground block text-[11px]'>Status</span>
                  <span className='font-medium capitalize'>{selectedConversation?.status}</span>
                </div>
                <div>
                  <span className='text-muted-foreground block text-[11px]'>Source Timestamp</span>
                  <span className='font-medium'>
                    {selectedConversation?.sourceTime
                      ? new Date(selectedConversation.sourceTime).toLocaleString()
                      : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className='text-muted-foreground block text-[11px]'>Vector Chunks</span>
                  <span className='font-medium'>
                    {conversationDetail?.chunks?.length ?? 0} indexed
                  </span>
                </div>
              </div>

              <div>
                <h4 className='font-semibold text-foreground mb-1.5'>Full Normalized Transcript</h4>
                <div className='rounded-md border p-3.5 bg-card whitespace-pre-wrap leading-relaxed text-xs max-h-60 overflow-y-auto font-sans'>
                  {conversationDetail?.normalizedTranscript ||
                    selectedConversation?.transcriptPreview ||
                    'No transcript recorded.'}
                </div>
              </div>

              {conversationDetail?.chunks && conversationDetail.chunks.length > 0 && (
                <div>
                  <h4 className='font-semibold text-foreground mb-1.5'>Semantic Memory Chunks</h4>
                  <div className='space-y-1.5 max-h-48 overflow-y-auto'>
                    {conversationDetail.chunks.map((chk, i) => (
                      <div
                        key={chk.id || i}
                        className='rounded border border-border/60 bg-muted/20 p-2 text-[11px]'
                      >
                        <span className='font-mono text-muted-foreground mr-1.5'>[Chunk #{i + 1}]</span>
                        {chk.excerpt}
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
