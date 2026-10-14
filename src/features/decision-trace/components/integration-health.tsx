'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useAppForm } from '@/lib/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { getIntegrationHealth, getOmiConnection, connectOmi } from '../api/service';

export function IntegrationHealth() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const health = useQuery({
    queryKey: ['decision-trace', 'health'],
    queryFn: getIntegrationHealth,
    refetchInterval: 30000
  });
  const omi = useQuery({
    queryKey: ['decision-trace', 'omi', userId],
    queryFn: getOmiConnection,
    enabled: !!userId
  });
  const connect = useMutation({
    mutationFn: connectOmi,
    onSuccess: async (result) => {
      setWebhookUrl(result.webhook_url);
      setCopied(false);
      await queryClient.invalidateQueries({ queryKey: ['decision-trace', 'omi', userId] });
    }
  });
  const form = useAppForm({
    defaultValues: { external_omi_uid: '' },
    validators: { onSubmit: z.object({ external_omi_uid: z.string().max(200) }) },
    onSubmit: async ({ value }) => {
      await connect.mutateAsync(value.external_omi_uid.trim() || undefined).catch(() => undefined);
    }
  });

  return (
    <div className='grid gap-4 md:grid-cols-2'>
      <Card>
        <CardHeader>
          <CardTitle>Backend services</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {health.isPending ? (
            <p role='status'>Checking services…</p>
          ) : health.isError ? (
            <p role='alert'>Health check failed.</p>
          ) : (
            <>
              <p>Backend: {health.data.status}</p>
              {Object.entries(health.data.details?.readiness?.dependencies || {}).map(
                ([name, status]) => (
                  <p key={name} className='capitalize'>
                    {name}: {status}
                  </p>
                )
              )}
            </>
          )}
          <Button
            variant='outline'
            onClick={() => void health.refetch()}
            disabled={health.isFetching}
          >
            Refresh health
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Omi conversations</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {omi.isPending ? (
            <p role='status'>Checking connection…</p>
          ) : omi.isError ? (
            <>
              <p role='alert'>{omi.error.message}</p>
              <Button variant='outline' onClick={() => void omi.refetch()}>
                Retry
              </Button>
            </>
          ) : (
            <p>{omi.data.connected ? 'Webhook configured' : 'No webhook configured yet'}</p>
          )}
          <p className='text-sm text-muted-foreground'>
            Generate a private webhook URL, then add it to the memory-created trigger in your Omi
            app. Generating a new URL revokes the previous URL.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
            className='space-y-3'
          >
            <form.AppField
              name='external_omi_uid'
              children={(field) => <field.TextField label='Omi user ID (optional)' />}
            />
            <form.AppForm>
              <form.SubmitButton>
                {omi.data?.connected ? 'Replace webhook URL' : 'Generate webhook URL'}
              </form.SubmitButton>
            </form.AppForm>
          </form>
          {connect.isError ? (
            <p role='alert' className='text-destructive'>
              {connect.error.message}
            </p>
          ) : null}
          {webhookUrl ? (
            <div className='space-y-2'>
              <label htmlFor='omi-webhook' className='text-sm'>
                Private webhook URL (shown once)
              </label>
              <Input id='omi-webhook' type='password' readOnly value={webhookUrl} />
              <Button
                variant='outline'
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(webhookUrl);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? 'Copied' : 'Copy webhook URL'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
