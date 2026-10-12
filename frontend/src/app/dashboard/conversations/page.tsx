import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';
import { getConversations } from '@/features/decision-trace/api/service';
import { ConversationsList } from '@/features/decision-trace/components/conversations/conversations-list';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Conversations | DecisionTrace Guardian',
  description: 'Verified Omi meeting transcripts, chunked memory records, and real-time ingestion status'
};

export default async function ConversationsPage() {
  const conversations = await getConversations();

  return (
    <div className='flex-1 space-y-4 p-4 md:p-8 pt-6'>
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight text-foreground'>Conversations</h2>
          <p className='text-xs text-muted-foreground'>
            Ingested audio transcripts from your Omi wearable device with semantic vector chunking.
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Link href='/dashboard/settings/omi'>
            <Button size='sm' variant='outline' className='h-8 text-xs gap-1.5'>
              <Icons.settings className='size-3.5' />
              Omi Settings
            </Button>
          </Link>
        </div>
      </div>

      <ConversationsList initialConversations={conversations} />
    </div>
  );
}
