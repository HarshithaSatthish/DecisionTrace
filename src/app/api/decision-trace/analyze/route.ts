import { NextRequest, NextResponse } from 'next/server';
import { verifyDecisionTraceAuth } from '@/lib/decision-trace-auth';
import {
  orchestrateDecisionTraceAnalysis,
  isLyzrConfigured,
  isLyzrPreviewAllowed
} from '@/server/lyzr';
import type { Decision } from '@/features/decision-trace/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 1. Clerk Authentication Verification
  const authResult = await verifyDecisionTraceAuth();
  if (!authResult.authenticated) {
    return authResult.response;
  }

  // 2. Parse and Validate Request Payload
  const body = await request.json().catch(() => null);
  if (!body || typeof body.conversationText !== 'string' || !body.conversationText.trim()) {
    return NextResponse.json(
      {
        error: 'Bad Request: "conversationText" string field is required for agent analysis.',
        code: 'INVALID_INPUT'
      },
      { status: 400 }
    );
  }

  // 2b. Request Size Control (Max 50,000 characters to prevent resource exhaustion / DoS)
  const MAX_CONVERSATION_LENGTH = 50_000;
  if (body.conversationText.length > MAX_CONVERSATION_LENGTH) {
    return NextResponse.json(
      {
        error: `Payload Too Large: "conversationText" exceeds maximum length of ${MAX_CONVERSATION_LENGTH} characters.`,
        code: 'PAYLOAD_TOO_LARGE',
        maxAllowed: MAX_CONVERSATION_LENGTH,
        receivedLength: body.conversationText.length
      },
      { status: 413 }
    );
  }

  const { conversationText, sourceTitle, channel, timestamp, existingDecisions } = body as {
    conversationText: string;
    sourceTitle?: string;
    channel?: string;
    timestamp?: string;
    existingDecisions?: Decision[];
  };

  // 3. Truthful Configuration Guard:
  // If Lyzr is not configured (missing LYZR_API_KEY) and we are in strict production without demo preview,
  // do not pretend live Lyzr inference succeeded.
  if (!isLyzrConfigured() && !isLyzrPreviewAllowed()) {
    return NextResponse.json(
      {
        error:
          'Lyzr Agent Service Unavailable: LYZR_API_KEY or Agent IDs are not configured on the server. Live agent inference is halted in strict production.',
        code: 'LYZR_NOT_CONFIGURED',
        setupDocumentation: 'docs/lyzr-studio-agent-specs.md'
      },
      { status: 503 }
    );
  }

  // 4. Execute Multi-Agent Analysis Pipeline with Tenant & User Scoping
  try {
    const analysis = await orchestrateDecisionTraceAnalysis(
      {
        conversationText,
        sourceTitle: sourceTitle || 'Operator Ingestion',
        channel: channel || '#decisions-channel',
        timestamp: timestamp || new Date().toISOString(),
        existingDecisions: existingDecisions || [],
        userId: authResult.userId,
        orgId: authResult.orgId ?? undefined
      },
      {
        userId: authResult.userId,
        orgId: authResult.orgId ?? undefined
      }
    );

    const response = NextResponse.json(analysis);
    if (analysis.provenance.mode !== 'live-lyzr-agent') {
      response.headers.set('X-DecisionTrace-Lyzr-Engine', 'deterministic-grounded-preview');
    } else {
      response.headers.set('X-DecisionTrace-Lyzr-Engine', 'live-lyzr-studio');
    }
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Agent orchestration failed';
    return NextResponse.json(
      {
        error: `Lyzr Agent Orchestration Failed: ${message}`,
        code: 'AGENT_ORCHESTRATION_ERROR'
      },
      { status: 500 }
    );
  }
}
