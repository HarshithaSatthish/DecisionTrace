'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import { OmiIntegrationStatus, OmiLinkResult } from '../../types';
import { linkOmiIntegration } from '../../api/service';

interface OmiSettingsCardProps {
  initialStatus: OmiIntegrationStatus;
}

export const OMI_DELIVERY_NOTE =
  'A generated webhook only means the endpoint is configured. It does not confirm that Omi has delivered any audio. Delivery is verified only once a conversation arrives from your Omi device.';

export type OmiDeliveryState = 'not-configured' | 'configured-unverified';

/**
 * The Omi status endpoint reports whether a webhook token exists — it exposes no
 * delivery signal. So a configured webhook is never rendered as a verified
 * live Omi connection.
 */
export function resolveOmiDeliveryState(connected: boolean | undefined): OmiDeliveryState {
  return connected ? 'configured-unverified' : 'not-configured';
}

export function OmiSettingsCard({ initialStatus }: OmiSettingsCardProps) {
  const [status, setStatus] = useState<OmiIntegrationStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [latestToken, setLatestToken] = useState<OmiLinkResult | null>(null);
  const [copied, setCopied] = useState(false);

  const deliveryState = resolveOmiDeliveryState(status.connected);

  // Check if current webhook URL is redacted (e.g. after page reload)
  const isRedacted = Boolean(
    (!latestToken && status.webhookUrl && status.webhookUrl.includes('REDACTED')) ||
    (!latestToken &&
      status.connected &&
      (!status.webhookUrl || status.webhookUrl.includes('REDACTED')))
  );

  // Raw secret URL is only copyable when freshly generated in this session
  const copyableUrl = latestToken?.webhookUrl || '';

  const displayInputValue = latestToken?.webhookUrl
    ? latestToken.webhookUrl
    : isRedacted
      ? 'Secret webhook token hidden after reload. Regenerate below to get a new URL.'
      : status.webhookUrl || 'Click below to generate an authenticated webhook URL';

  const handleLinkOrRenew = async () => {
    setLoading(true);
    try {
      const result = await linkOmiIntegration();
      setLatestToken(result);
      setStatus({
        connected: true,
        installationId: result.installationId,
        webhookUrl: result.webhookUrl,
        createdAt: new Date().toISOString()
      });
      toast.success(
        status.connected
          ? 'Omi webhook token regenerated. Previous token has been revoked.'
          : 'Omi webhook token generated successfully!'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to configure Omi';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUrl = () => {
    if (!copyableUrl || isRedacted) return;
    navigator.clipboard.writeText(copyableUrl);
    setCopied(true);
    toast.success('Webhook URL copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className='space-y-6 max-w-4xl'>
      {/* Connection Status Overview */}
      <Card>
        <CardHeader className='pb-3'>
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2'>
            <div className='space-y-1'>
              <CardTitle className='text-lg font-bold flex items-center gap-2'>
                <Icons.settings className='size-5 text-primary' />
                Omi Device Connection Status
              </CardTitle>
              <CardDescription className='text-xs'>
                Direct webhook integration: Omi wearable audio capture posts events to your
                DecisionTrace webhook endpoint.
              </CardDescription>
            </div>
            <div>
              {deliveryState === 'configured-unverified' ? (
                <Badge className='border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 gap-1.5 py-1 px-2.5 text-xs'>
                  <Icons.check className='size-3.5' />
                  Webhook Configured
                </Badge>
              ) : (
                <Badge
                  variant='outline'
                  className='border-amber-500/40 bg-amber-50/50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 gap-1.5 py-1 px-2.5 text-xs'
                >
                  <Icons.warning className='size-3.5' />
                  Webhook Not Configured
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4 pt-1'>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg bg-muted/30 border border-border/40 text-xs'>
            <div>
              <span className='text-muted-foreground block text-[11px] mb-0.5'>
                Installation Reference
              </span>
              <span className='font-mono font-medium'>
                {status.installationId || (latestToken?.installationId ?? 'Not provisioned')}
              </span>
            </div>
            <div>
              <span className='text-muted-foreground block text-[11px] mb-0.5'>
                Webhook Created
              </span>
              <span className='font-medium'>
                {status.createdAt ? new Date(status.createdAt).toLocaleString() : 'Pending setup'}
              </span>
            </div>
          </div>

          <div className='flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] leading-relaxed'>
            <Icons.info className='size-3.5 shrink-0 mt-0.5 text-muted-foreground' />
            <div>
              <span className='font-semibold text-foreground'>
                {deliveryState === 'configured-unverified'
                  ? 'Webhook configured — delivery not verified. '
                  : 'No webhook configured. '}
              </span>
              <span className='text-muted-foreground'>{OMI_DELIVERY_NOTE}</span>
            </div>
          </div>

          {/* Webhook Configuration Section */}
          <div className='space-y-2.5'>
            <label
              htmlFor='omi-webhook-url-input'
              className='text-xs font-semibold text-foreground block'
            >
              Personal DecisionTrace Webhook Endpoint
            </label>
            <div className='flex items-center gap-2'>
              <Input
                readOnly
                id='omi-webhook-url-input'
                value={displayInputValue}
                placeholder='https://your-api.com/api/v1/webhooks/omi/{token}'
                className={`font-mono text-xs h-9 bg-muted/20 ${isRedacted && !latestToken ? 'text-muted-foreground italic' : ''}`}
              />
              <Button
                size='sm'
                variant='outline'
                className='h-9 text-xs gap-1.5 shrink-0'
                onClick={handleCopyUrl}
                disabled={!copyableUrl || isRedacted}
              >
                {copied ? (
                  <Icons.check className='size-3.5' />
                ) : (
                  <Icons.post className='size-3.5' />
                )}
                {copied ? 'Copied' : 'Copy URL'}
              </Button>
            </div>
            {isRedacted && (
              <p className='text-[11px] text-amber-700 dark:text-amber-300'>
                Webhook secret is protected with SHA-256 and cannot be displayed after page reload.
                Regenerate token to configure a new device (previous token will be revoked).
              </p>
            )}
            {!isRedacted && (
              <p className='text-[11px] text-muted-foreground'>
                Protected with unique 256-bit cryptographic bearer token hashed with SHA-256 in
                PostgreSQL.
              </p>
            )}
          </div>

          <div className='pt-2'>
            <Button
              size='sm'
              onClick={handleLinkOrRenew}
              disabled={loading}
              className='gap-1.5 text-xs'
            >
              {loading && <Icons.spinner className='size-3.5 animate-spin' />}
              {status.connected ? 'Regenerate Webhook Token' : 'Generate Authenticated Webhook'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step-by-Step Instructions */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base font-bold flex items-center gap-2'>
            <Icons.info className='size-4 text-primary' />
            Setup Instructions for Omi Wearable App
          </CardTitle>
          <CardDescription className='text-xs'>
            Follow these 4 steps to configure your Omi webhook integration.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3.5 text-xs'>
          <ol className='list-decimal list-inside space-y-3 text-muted-foreground'>
            <li className='leading-relaxed'>
              <strong className='text-foreground'>Open the Omi App:</strong> Launch the official Omi
              application on your iOS or Android device.
            </li>
            <li className='leading-relaxed'>
              <strong className='text-foreground'>Go to Developer Webhooks:</strong> Tap on{' '}
              <code className='rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono'>Settings</code>{' '}
              &rarr;{' '}
              <code className='rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono'>
                Integrations / Webhooks
              </code>
              .
            </li>
            <li className='leading-relaxed'>
              <strong className='text-foreground'>Paste Webhook URL:</strong> Copy the personal
              webhook URL generated above and paste it into the Webhook URL field.
            </li>
            <li className='leading-relaxed'>
              <strong className='text-foreground'>Enable Memory Events:</strong> Toggle{' '}
              <span className='text-foreground font-medium'>"Memory Created Webhook Events"</span>{' '}
              to <span className='text-emerald-600 dark:text-emerald-400 font-medium'>ON</span>.
            </li>
          </ol>

          <div className='rounded-lg border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 p-3.5 text-[11px] text-blue-900 dark:text-blue-200 mt-4'>
            <div className='flex items-center gap-1.5 font-semibold pb-1'>
              <Icons.info className='size-3.5' />
              Zero-Drift Architecture Note
            </div>
            As soon as audio transcript chunks are ingested, DecisionTrace chunks the transcript,
            embeds them via 384-dimensional FastEmbed, retrieves prior evidence from Qdrant, and
            orchestrates Lyzr Manager to flag any conflicting commitments.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
