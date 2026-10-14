import React from 'react';
import { Metadata } from 'next';
import { getOmiIntegrationStatus } from '@/features/decision-trace/api/service';
import { OmiSettingsCard } from '@/features/decision-trace/components/settings/omi-settings-card';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Omi Connection & Settings | DecisionTrace Guardian',
  description:
    'Manage Omi wearable device webhook credentials and real-time audio ingestion settings'
};

export default async function OmiSettingsPage() {
  const status = await getOmiIntegrationStatus();

  return (
    <div className='flex-1 space-y-4 p-4 md:p-8 pt-6'>
      <div className='space-y-1'>
        <h2 className='text-2xl font-bold tracking-tight text-foreground'>
          Omi Device Integration
        </h2>
        <p className='text-xs text-muted-foreground'>
          Configure wearable hardware audio ingestion and verify real-time webhook status.
        </p>
      </div>

      <OmiSettingsCard initialStatus={status} />
    </div>
  );
}
