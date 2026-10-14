import { describe, expect, test } from 'bun:test';
import {
  extractCommitments,
  groundAndVerifyEvidence
} from '@/server/lyzr/agents/commitment-extractor';
import { deterministicDetectConflicts } from '@/server/lyzr/agents/conflict-detector';
import { deterministicPlanActions } from '@/server/lyzr/agents/action-planner';
import { orchestrateDecisionTraceAnalysis, clearAnalysisCache } from '@/server/lyzr/agents/manager';
import { LyzrClient, extractJsonFromResponse } from '@/server/lyzr/client';
import type { Decision } from '@/features/decision-trace/types';

describe('Person 2: Lyzr AI Multi-Agent System Test Suite', () => {
  // ==========================================================================
  // Scenario 1: Conversation containing a clear decision
  // ==========================================================================
  describe('Scenario 1: Clear Decision Extraction', () => {
    test('extracts grounded decision with verbatim evidence and speaker attribution', async () => {
      const transcript = `
Alice: After reviewing the latency metrics, we decided to standardize on PostgreSQL for all relational data storage.
Bob: Sounds good, agreed on that.
`;
      const result = await extractCommitments(transcript, {
        sourceTitle: 'Architecture Review',
        channel: '#architecture'
      });

      expect(result.decisions.length).toBeGreaterThanOrEqual(1);
      const dec = result.decisions[0];
      expect(dec.whatWasDecided).toContain('standardize on PostgreSQL');
      expect(dec.speaker).toBe('Alice');
      expect(dec.evidenceQuote).toContain('we decided to standardize on PostgreSQL');
      expect(dec.confidenceScore).toBeGreaterThanOrEqual(80);
      expect(result.participants).toContain('Alice');
    });
  });

  // ==========================================================================
  // Scenario 2: Conversation containing multiple commitments
  // ==========================================================================
  describe('Scenario 2: Multiple Commitments Extraction', () => {
    test('extracts multiple commitments with real owners and deadlines without inventing dates', async () => {
      const transcript = `
Carol: I will deliver the initial GraphQL schema migration by 2026-05-15.
Dave: Action item: I will configure the Redis caching layer before Friday.
`;
      const result = await extractCommitments(transcript, {
        sourceTitle: 'Sprint Planning',
        channel: '#backend-team'
      });

      expect(result.commitments.length).toBe(2);
      expect(result.commitments[0].owner).toBe('Carol');
      expect(result.commitments[0].deadline).toBe('2026-05-15');
      expect(result.commitments[0].isUncertainDeadline).toBe(false);

      expect(result.commitments[1].owner).toBe('Dave');
      expect(result.commitments[1].deadline).toBe('Friday');
      expect(result.commitments[1].isUncertainDeadline).toBe(false);
    });
  });

  // ==========================================================================
  // Scenario 3: Change to an earlier deadline
  // ==========================================================================
  describe('Scenario 3: Earlier Deadline Alteration', () => {
    test('detects changed/compressed deadline and generates proactive follow-up alerts', async () => {
      const transcript = `
Emma: Due to customer launch commitments, we decided to mandate the security audit completion by 2026-04-15.
Frank: I will deliver the SOC2 remediation by 2026-04-15.
`;
      const analysis = await orchestrateDecisionTraceAnalysis({
        conversationText: transcript,
        sourceTitle: 'Executive Sync',
        existingDecisions: [
          {
            id: 'DEC-099',
            title: 'Annual Security Review Timeline',
            summary: 'Security review scheduled for Q3',
            whatWasDecided: 'Security review was scheduled for 90 days audit completion.',
            participants: ['Security Team'],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            status: 'active',
            sourceConversation: {
              id: 'c1',
              title: 'Q1 Board Review',
              channel: '#sec',
              timestamp: '2026-01-01'
            },
            evidence: [
              {
                id: 'ev-1',
                sourceType: 'meeting',
                sourceTitle: 'Q1 Board Review',
                speakerOrAuthor: 'CISO',
                timestamp: '2026-01-01',
                quote: 'Audit scheduled for 90 days completion.'
              }
            ],
            confidence: 90,
            confidenceLevel: 'high',
            relatedCommitmentIds: [],
            category: 'Security & Compliance',
            impactLevel: 'critical'
          }
        ]
      });

      expect(analysis.decisions.length).toBe(1);
      expect(analysis.commitments.length).toBe(1);
      expect(analysis.stats.actionsPlannedCount).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Scenario 4: Contradiction between two decisions
  // ==========================================================================
  describe('Scenario 4: Contradiction Detection with Dual Evidence Quotes', () => {
    test('detects policy contradiction with quotes from both sides', async () => {
      const existingDecisions: Decision[] = [
        {
          id: 'DEC-104',
          title: 'GDPR Data Retention Policy',
          summary: 'Mandates strict 30 days log retention window.',
          whatWasDecided: 'All customer audit logs must be purged after 30 days retention window.',
          participants: ['DPO', 'Legal'],
          createdAt: '2026-02-01T00:00:00Z',
          updatedAt: '2026-02-01T00:00:00Z',
          status: 'active',
          sourceConversation: {
            id: 'c-gdpr',
            title: 'Legal Briefing',
            channel: '#legal',
            timestamp: '2026-02-01'
          },
          evidence: [
            {
              id: 'ev-gdpr',
              sourceType: 'meeting',
              sourceTitle: 'Legal Briefing',
              speakerOrAuthor: 'General Counsel',
              timestamp: '2026-02-01',
              quote:
                'Article 17 requires all customer audit logs must be purged after 30 days retention.'
            }
          ],
          confidence: 95,
          confidenceLevel: 'high',
          relatedCommitmentIds: [],
          category: 'Security & Compliance',
          impactLevel: 'critical'
        }
      ];

      const newDecisions = [
        {
          title: 'Enterprise Analytics Retention Extended',
          summary: 'New enterprise client requested longer retention',
          whatWasDecided:
            'We decided to extend audit log retention to 90 days for compliance audits.',
          participants: ['Sales Eng'],
          category: 'Security & Compliance',
          impactLevel: 'critical' as const,
          confidenceScore: 90,
          evidenceQuote:
            'We decided to extend audit log retention to 90 days for compliance audits.',
          speaker: 'Sales VP'
        }
      ];

      const conflictResult = deterministicDetectConflicts(newDecisions, existingDecisions);
      expect(conflictResult.hasConflicts).toBe(true);
      expect(conflictResult.conflicts.length).toBe(1);

      const conflict = conflictResult.conflicts[0];
      expect(conflict.isDefiniteConflict).toBe(true);
      expect(conflict.severity).toBe('critical');
      // Verbatim evidence from both sides
      expect(conflict.priorDecision.evidenceQuote).toContain('30 days retention');
      expect(conflict.newDecision.evidenceQuote).toContain('90 days');
    });
  });

  // ==========================================================================
  // Scenario 5: Conversation containing no actionable decision
  // ==========================================================================
  describe('Scenario 5: No Actionable Decision in Casual Conversation', () => {
    test('returns empty decisions/commitments without inventing fake actions', async () => {
      const transcript = `
Grace: Morning everyone! Did you watch the match yesterday?
Harry: Yes, it was fantastic!
Grace: Let us grab some coffee before the standup.
`;
      const result = await extractCommitments(transcript);
      expect(result.decisions.length).toBe(0);
      expect(result.commitments.length).toBe(0);

      const analysis = await orchestrateDecisionTraceAnalysis({
        conversationText: transcript
      });
      expect(analysis.decisions.length).toBe(0);
      expect(analysis.commitments.length).toBe(0);
      expect(analysis.conflicts.length).toBe(0);
      expect(analysis.summary).toContain('No actionable decisions or commitments were identified');
    });
  });

  // ==========================================================================
  // Scenario 6: Ambiguous statements and missing evidence
  // ==========================================================================
  describe('Scenario 6: Ambiguity Flagging & Missing Evidence Guard', () => {
    test('categorizes ungrounded suggestions as ambiguous proposals rather than decisions', async () => {
      const transcript = `
Ian: Maybe we should migrate everything to GraphQL at some point.
Julia: Not sure if the team has the bandwidth, someone ought to look at serverless later.
`;
      const result = await extractCommitments(transcript);
      expect(result.decisions.length).toBe(0);
      expect(result.ungroundedClaims.length).toBeGreaterThan(0);
      expect(result.ungroundedClaims[0]).toContain('Ambiguous proposal without consensus');
    });

    test('flags commitments with vague timeframes as isUncertainDeadline', async () => {
      const transcript = `
Kevin: I will look into the database indexing sometime next week.
`;
      const result = await extractCommitments(transcript);
      expect(result.commitments.length).toBe(1);
      expect(result.commitments[0].isUncertainDeadline).toBe(true);
    });
  });

  // ==========================================================================
  // Scenario 7: Duplicate events
  // ==========================================================================
  describe('Scenario 7: Duplicate Event Merging & Deduplication', () => {
    test('deduplicates identical decisions and commitments repeated across conversation', async () => {
      const transcript = `
Alice: We decided to standardize on PostgreSQL for all relational data storage.
Bob: Repeating for clarity: we decided to standardize on PostgreSQL for all relational data storage.
Alice: I will deliver the schema migration by 2026-05-01.
Alice: Just confirming: I will deliver the schema migration by 2026-05-01.
`;
      const analysis = await orchestrateDecisionTraceAnalysis({
        conversationText: transcript,
        sourceTitle: 'Sprint Retrospective'
      });

      // Deduplicated down to 1 Decision and 1 Commitment
      expect(analysis.decisions.length).toBe(1);
      expect(analysis.commitments.length).toBe(1);
    });
  });

  // ==========================================================================
  // Scenario 8: Malformed or unavailable agent responses
  // ==========================================================================
  describe('Scenario 8: Error Resilience & Lyzr Client Guardrails', () => {
    test('LyzrClient throws LyzrConfigurationError when API key is missing', async () => {
      const client = new LyzrClient({ apiKey: null });
      await expect(client.chat('agent-123', 'Hello')).rejects.toThrow(
        'Missing LYZR_API_KEY environment variable'
      );
    });

    test('LyzrClient throws LyzrConfigurationError when Agent ID is empty', async () => {
      const client = new LyzrClient({ apiKey: 'mock_key' });
      await expect(client.chat('', 'Hello')).rejects.toThrow('Agent ID is required');
    });

    test('extractJsonFromResponse parses standard JSON correctly', () => {
      const json = '{"decisions": [], "commitments": []}';
      const parsed = extractJsonFromResponse(json) as { decisions: unknown[] };
      expect(Array.isArray(parsed.decisions)).toBe(true);
    });

    test('extractJsonFromResponse handles markdown-fenced json blocks', () => {
      const raw = `
Here is your analysis:
\`\`\`json
{
  "decisions": [{"title": "Postgres Migration"}],
  "commitments": []
}
\`\`\`
Hope this helps!
`;
      const parsed = extractJsonFromResponse(raw) as { decisions: Array<{ title: string }> };
      expect(parsed.decisions[0].title).toBe('Postgres Migration');
    });

    test('extractJsonFromResponse throws LyzrParseError when given unparseable text', () => {
      const unparseable =
        'Sorry, as an AI I am unable to analyze this text without further context.';
      expect(() => extractJsonFromResponse(unparseable)).toThrow();
    });

    test('Action Planner marks external conflict remediation with requiresApproval: true', () => {
      const plannerResult = deterministicPlanActions(
        [],
        [],
        [
          {
            title: 'Data Retention Contradiction',
            severity: 'critical',
            explanation: '30 vs 90 days',
            confidence: 95,
            isDefiniteConflict: true,
            priorDecision: {
              id: 'DEC-101',
              title: '30 Days',
              decisionText: 'Purge after 30 days',
              source: 'Meeting',
              evidenceQuote: '30 days',
              speaker: 'Legal'
            },
            newDecision: {
              title: '90 Days',
              decisionText: 'Keep 90 days',
              source: 'Slack',
              evidenceQuote: '90 days',
              speaker: 'Sales'
            }
          }
        ]
      );

      expect(plannerResult.recommendedActions.length).toBe(1);
      const action = plannerResult.recommendedActions[0];
      expect(action.requiresApproval).toBe(true);
      expect(action.approvalPayload).toBeDefined();
      expect(action.approvalPayload?.actionType).toBe('override_conflict');
    });

    test('Strict production guard: throws LyzrConfigurationError when live Lyzr agent is unconfigured in production', async () => {
      const origEnv = process.env.NODE_ENV;
      const origPreview = process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;

      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        delete process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW;
        delete process.env.LYZR_API_KEY;
        delete process.env.LYZR_EXTRACTOR_AGENT_ID;

        await expect(
          extractCommitments('Alice: We decided to deploy to us-east-1.')
        ).rejects.toThrow('Live Lyzr Commitment Extractor agent is not configured');
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
        if (origPreview) process.env.NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW = origPreview;
      }
    });
  });

  // ==========================================================================
  // Scenario 7: Security, Multi-Tenant Isolation & Human-in-the-Loop Gating
  // ==========================================================================
  describe('Scenario 7: Security, Multi-Tenant Cache Isolation & Human Approval Gating', () => {
    test('enforces organization cache isolation: org-A cached analysis cannot leak to org-B', async () => {
      clearAnalysisCache();
      const transcript = 'Alice: We decided to migrate all workloads to us-east-1.\nBob: Agreed.';

      // Analyze for org-alpha
      const resOrgAlpha = await orchestrateDecisionTraceAnalysis(
        {
          conversationText: transcript,
          orgId: 'org_tenant_alpha',
          userId: 'user_alpha_1'
        },
        { orgId: 'org_tenant_alpha', userId: 'user_alpha_1' }
      );

      // Analyze for org-beta
      const resOrgBeta = await orchestrateDecisionTraceAnalysis(
        {
          conversationText: transcript,
          orgId: 'org_tenant_beta',
          userId: 'user_beta_1'
        },
        { orgId: 'org_tenant_beta', userId: 'user_beta_1' }
      );

      // Different org tenants must receive isolated instances, not a reused cross-tenant cache hit
      expect(resOrgAlpha !== resOrgBeta).toBe(true);
      expect(resOrgAlpha.decisions.length).toBeGreaterThanOrEqual(1);
      expect(resOrgBeta.decisions.length).toBeGreaterThanOrEqual(1);
    });

    test('enforces user cache isolation when organization is absent', async () => {
      clearAnalysisCache();
      const transcript = 'Charlie: We decided to mandate Redis for distributed caching.';

      const resUser1 = await orchestrateDecisionTraceAnalysis(
        {
          conversationText: transcript,
          userId: 'user_101'
        },
        { userId: 'user_101' }
      );

      const resUser2 = await orchestrateDecisionTraceAnalysis(
        {
          conversationText: transcript,
          userId: 'user_202'
        },
        { userId: 'user_202' }
      );

      expect(resUser1 !== resUser2).toBe(true);
    });

    test('invalidates cache when existing decisions context changes, preventing stale conflict detection', async () => {
      clearAnalysisCache();
      const transcript = 'Alice: We decided to retain user telemetry for 90 days.';

      // First run without prior decisions: no conflict detected
      const resWithoutPrior = await orchestrateDecisionTraceAnalysis(
        {
          conversationText: transcript,
          orgId: 'org_test_invalidation',
          existingDecisions: []
        },
        { orgId: 'org_test_invalidation' }
      );
      expect(resWithoutPrior.conflicts.length).toBe(0);

      // Second run with prior contradictory decision: cache key must differ and detect conflict
      const priorDecision: Decision = {
        id: 'DEC-PRIOR-01',
        title: '30-Day Retention Policy',
        summary: 'Purge data after 30 days',
        whatWasDecided: 'Telemetry data must be purged after 30 days.',
        participants: ['Compliance Team'],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        status: 'active',
        sourceConversation: {
          id: 'c1',
          title: 'Compliance Sync',
          channel: '#legal',
          timestamp: '2026-01-01'
        },
        evidence: [
          {
            id: 'ev-1',
            sourceType: 'meeting',
            sourceTitle: 'Compliance Sync',
            speakerOrAuthor: 'Legal',
            timestamp: '2026-01-01',
            quote: 'Telemetry data must be purged after 30 days.'
          }
        ],
        confidence: 95,
        confidenceLevel: 'high',
        relatedCommitmentIds: [],
        category: 'Security & Compliance',
        impactLevel: 'critical'
      };

      const resWithPrior = await orchestrateDecisionTraceAnalysis(
        {
          conversationText: transcript,
          orgId: 'org_test_invalidation',
          existingDecisions: [priorDecision]
        },
        { orgId: 'org_test_invalidation' }
      );

      // Distinct cache keys ensure new decisions detect the conflict
      expect(resWithPrior !== resWithoutPrior).toBe(true);
      expect(resWithPrior.conflicts.length).toBe(1);
      expect(resWithPrior.conflicts[0].previousDecision.id).toBe('DEC-PRIOR-01');
      const updatedPrior = {
        ...priorDecision,
        whatWasDecided: 'Retain telemetry for 90 days.',
        updatedAt: '2026-02-01T00:00:00Z'
      };
      const updatedResult = await orchestrateDecisionTraceAnalysis({
        conversationText: transcript,
        orgId: 'org_test_invalidation',
        existingDecisions: [updatedPrior]
      });
      expect(updatedResult === resWithPrior).toBe(false);
    });

    test('groundAndVerifyEvidence flags fabricated or unverified quotes as ambiguous and reduces confidence', () => {
      const transcript = 'Alice: We decided to deploy to Kubernetes.\nBob: I will configure Helm.';

      const extractorOutput = {
        decisions: [
          {
            title: 'Deploy to Kubernetes',
            summary: 'Deploy to Kubernetes',
            whatWasDecided: 'Deploy to Kubernetes',
            participants: ['Alice'],
            category: 'Architecture' as const,
            impactLevel: 'high' as const,
            confidenceScore: 90,
            evidenceQuote: 'Alice: We decided to deploy to Kubernetes.', // VERIFIED
            speaker: 'Alice',
            isAmbiguous: false
          },
          {
            title: 'Fabricated Secret Cloud Migration',
            summary: 'Secret migration invented by untrusted input',
            whatWasDecided: 'Secret migration',
            participants: ['Eve'],
            category: 'Architecture' as const,
            impactLevel: 'critical' as const,
            confidenceScore: 95,
            evidenceQuote: 'Eve: Completely hallucinated quote that never existed in transcript.', // UNVERIFIED
            speaker: 'Eve',
            isAmbiguous: false
          }
        ],
        commitments: [],
        participants: ['Alice', 'Bob'],
        ungroundedClaims: []
      };

      const verified = groundAndVerifyEvidence(extractorOutput, transcript);

      // First decision is grounded and unchanged
      expect(verified.decisions[0].isAmbiguous).toBe(false);
      expect(verified.decisions[0].confidenceScore).toBe(90);

      // Second decision failed verification: downgraded and marked ambiguous
      expect(verified.decisions[1].isAmbiguous).toBe(true);
      expect(verified.decisions[1].confidenceScore).toBeLessThanOrEqual(45);
      expect(verified.ungroundedClaims.length).toBeGreaterThanOrEqual(1);
      expect(verified.ungroundedClaims[0]).toContain('unverified quote');
    });

    test('verifies all state-changing conflict overrides generate human approval requests', async () => {
      clearAnalysisCache();
      const transcript = 'Alice: We decided to keep customer logs for 90 days.';
      const priorDecision: Decision = {
        id: 'DEC-LEG-100',
        title: '30 Days Purge Policy',
        summary: 'Purge after 30 days',
        whatWasDecided: 'Purge customer logs after 30 days.',
        participants: ['Legal'],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        status: 'active',
        sourceConversation: {
          id: 'c1',
          title: 'Legal',
          channel: '#legal',
          timestamp: '2026-01-01'
        },
        evidence: [],
        confidence: 95,
        confidenceLevel: 'high',
        relatedCommitmentIds: [],
        category: 'Security & Compliance',
        impactLevel: 'critical'
      };

      const analysis = await orchestrateDecisionTraceAnalysis(
        {
          conversationText: transcript,
          orgId: 'org_approval_test',
          existingDecisions: [priorDecision]
        },
        { orgId: 'org_approval_test' }
      );

      // Mutating actions MUST require approval and populate pendingApprovals
      expect(analysis.stats.actionsPlannedCount).toBeGreaterThanOrEqual(1);
      expect(analysis.pendingApprovals.length).toBeGreaterThanOrEqual(1);

      const approval = analysis.pendingApprovals[0];
      expect(approval.status).toBe('pending');
      expect(approval.proposedBy).toBe('Lyzr Action Planner');
      expect([
        'override_conflict',
        'supersede_decision',
        'reassign_commitment',
        'policy_exception',
        'pipeline_execution'
      ]).toContain(approval.actionType);
      expect(approval.exactActionPreview).toBeDefined();
    });
  });
});
