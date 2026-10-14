import type { EvidenceReference } from '@/features/decision-trace/types';

interface BackendEvidence {
  chunk_id?: string;
  conversation_id?: string | null;
  excerpt?: string;
  source_time?: string | null;
}

/** Map backend decision evidence ({chunk_id, excerpt, ...}) to dashboard EvidenceReference. */
export function mapBackendEvidence(raw: unknown, sourceTitle: string): EvidenceReference[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e: unknown) => {
      if (e && typeof e === 'object' && 'quote' in e && 'id' in e) return e as EvidenceReference;
      const b = e as BackendEvidence;
      if (!b?.chunk_id || !b.excerpt) return null;
      return {
        id: b.chunk_id,
        sourceType: 'meeting',
        sourceTitle,
        channelOrLocation: 'Voice (Omi)',
        speakerOrAuthor: 'Omi transcript',
        timestamp: b.source_time || '',
        quote: b.excerpt,
        messageId: b.conversation_id || undefined
      } satisfies EvidenceReference;
    })
    .filter((x): x is EvidenceReference => x !== null);
}
