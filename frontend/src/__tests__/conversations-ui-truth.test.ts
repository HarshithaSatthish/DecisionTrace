import { describe, expect, test, beforeEach, afterEach } from 'bun:test';

import {
  DETAIL_UNAVAILABLE_MESSAGE,
  resolveDetailViewState,
  resolveTranscriptText
} from '@/features/decision-trace/components/conversations/conversations-list';
import {
  OMI_DELIVERY_NOTE,
  resolveOmiDeliveryState
} from '@/features/decision-trace/components/settings/omi-settings-card';
import type { OmiConversationDetail } from '@/features/decision-trace/types';
import {
  getConversations,
  getConversationDetail,
  invalidateClientCache,
  setClientCacheScope
} from '@/features/decision-trace/api/service';

function makeDetail(overrides: Partial<OmiConversationDetail> = {}): OmiConversationDetail {
  return {
    id: 'conv-1',
    sourceEventId: 'evt-1',
    status: 'processed',
    title: 'Quarterly planning',
    transcriptPreview: 'Let us revisit the launch plan and...',
    normalizedTranscript: 'Full transcript body that is materially longer than the preview.',
    sourceTime: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    chunks: [],
    ...overrides
  } as OmiConversationDetail;
}

describe('Conversation detail truthfulness', () => {
  test('a failed detail fetch resolves to an error state, never to a ready detail', () => {
    const state = resolveDetailViewState({ loading: false, error: 'boom', detail: null });
    expect(state.kind).toBe('error');
  });

  test('detail fetch failure surfaces the documented unavailability message', () => {
    const state = resolveDetailViewState({
      loading: false,
      error: DETAIL_UNAVAILABLE_MESSAGE,
      detail: null
    });
    expect(state.kind).toBe('error');
    if (state.kind === 'error') {
      expect(state.message).toContain('could not be loaded');
      expect(state.message).toContain('not the complete transcript');
    }
  });

  test('a stale detail is not shown while a retry is in flight', () => {
    const state = resolveDetailViewState({
      loading: true,
      error: null,
      detail: makeDetail()
    });
    expect(state.kind).toBe('loading');
  });

  test('a missing detail without an explicit error still errors instead of faking content', () => {
    const state = resolveDetailViewState({ loading: false, error: null, detail: null });
    expect(state.kind).toBe('error');
  });

  test('a successfully loaded detail resolves to ready', () => {
    const state = resolveDetailViewState({
      loading: false,
      error: null,
      detail: makeDetail()
    });
    expect(state.kind).toBe('ready');
  });

  test('transcript text never falls back to the truncated preview', () => {
    const detail = makeDetail({ normalizedTranscript: '' });
    const text = resolveTranscriptText(detail);
    expect(text.includes('Let us revisit the launch plan')).toBe(false);
    expect(text).toBe('No transcript recorded for this conversation.');
  });

  test('transcript text prefers the real normalized transcript', () => {
    const detail = makeDetail();
    expect(resolveTranscriptText(detail)).toBe(detail.normalizedTranscript);
  });
});

describe('Omi webhook vs verified delivery', () => {
  test('a generated webhook reports configured-unverified, never a live connection', () => {
    expect(resolveOmiDeliveryState(true)).toBe('configured-unverified');
  });

  test('an absent webhook reports not-configured', () => {
    expect(resolveOmiDeliveryState(false)).toBe('not-configured');
  });

  test('undefined status is treated as not configured', () => {
    expect(resolveOmiDeliveryState(undefined)).toBe('not-configured');
  });

  test('the delivery note explicitly disclaims verified delivery', () => {
    expect(OMI_DELIVERY_NOTE).toContain('does not confirm');
    expect(OMI_DELIVERY_NOTE).toContain('only means the endpoint is configured');
  });
});

describe('Conversation Service Client-Side Proxy & Cache Refresh Integration', () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;

  beforeEach(() => {
    invalidateClientCache();
    // Simulate browser window
    (globalThis as unknown as { window: unknown }).window = {
      Clerk: { user: { id: 'test_user_123' }, organization: { id: 'org_abc' } }
    };
    setClientCacheScope('org_abc:test_user_123');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      (globalThis as unknown as { window: unknown }).window = originalWindow;
    }
  });

  test('client-side getConversations calls /api/decision-trace/conversations without requiring backend URL', async () => {
    let requestedUrl = '';
    globalThis.fetch = async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return new Response(
        JSON.stringify([
          {
            id: 'conv-client-1',
            source_event_id: 'evt-client-1',
            status: 'processed',
            title: 'Client Proxy Call',
            transcript_preview: 'Preview',
            created_at: '2026-01-01T00:00:00Z'
          }
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const result = await getConversations();
    expect(requestedUrl).toBe('/api/decision-trace/conversations');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('conv-client-1');
    expect(result[0].title).toBe('Client Proxy Call');
  });

  test('handleRefresh invalidates client cache and fetches latest conversations', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return new Response(
        JSON.stringify([
          {
            id: `conv-call-${callCount}`,
            source_event_id: 'evt-1',
            status: 'processed',
            title: `Title ${callCount}`
          }
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    // First call caches the result
    const first = await getConversations();
    expect(first[0].title).toBe('Title 1');
    expect(callCount).toBe(1);

    // Second call without invalidation hits client cache
    const second = await getConversations();
    expect(second[0].title).toBe('Title 1');
    expect(callCount).toBe(1);

    // After invalidateClientCache, it fetches afresh
    invalidateClientCache();
    const refreshed = await getConversations();
    expect(refreshed[0].title).toBe('Title 2');
    expect(callCount).toBe(2);
  });

  test('client-side getConversations handles fetch failure honestly', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevFlag = process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;

    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ error: 'Gateway timeout' }), { status: 504 });
    };

    try {
      await expect(getConversations()).rejects.toThrow();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
      if (prevFlag) process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW = prevFlag;
    }
  });

  test('client-side getConversationDetail calls /api/decision-trace/conversations/:id and transforms response', async () => {
    let requestedUrl = '';
    globalThis.fetch = async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return new Response(
        JSON.stringify({
          id: 'conv-detail-99',
          source_event_id: 'evt-99',
          status: 'processed',
          title: 'Detailed Transcript',
          transcript_preview: 'Preview 99',
          normalized_transcript: 'Full transcript 99',
          chunks: [{ id: 'chk-1', chunk_id: 'chk-1', excerpt: 'Text 1' }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const detail = await getConversationDetail('conv-detail-99');
    expect(requestedUrl).toBe('/api/decision-trace/conversations/conv-detail-99');
    expect(detail.id).toBe('conv-detail-99');
    expect(detail.normalizedTranscript).toBe('Full transcript 99');
    expect(detail.chunks.length).toBe(1);
  });

  test('failed getConversationDetail rejects and does not substitute preview', async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
    };

    await expect(getConversationDetail('conv-missing')).rejects.toThrow();
  });
});
