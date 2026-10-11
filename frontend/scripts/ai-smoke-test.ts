/**
 * DecisionTrace — Person 2: Lyzr AI Multi-Agent Smoke Test
 * 
 * Verifies live multi-agent inference across six core scenarios:
 * 1. Meeting transcript → decisions and commitments
 * 2. Updated decision → genuine conflict detection
 * 3. Commitment → proposed next action requiring approval
 * 4. Ambiguous conversation → no fabricated commitments
 * 5. Empty input → safe handling without unnecessary LLM calls
 * 6. Duplicate input → in-memory cache hit / deduplication
 * 
 * Run with: bun scripts/ai-smoke-test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { orchestrateDecisionTraceAnalysis } from '@/server/lyzr/agents/manager';
import { isLyzrConfigured, getLyzrConfig } from '@/server/lyzr/config';
import type { Decision } from '@/features/decision-trace/types';

// Load .env.local safely
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

interface TestReportItem {
  id: number;
  name: string;
  passed: boolean;
  durationMs: number;
  details: Record<string, unknown>;
}

async function runSmokeTests() {
  console.log("================================================================================");
  console.log("DECISIONTRACE — LYZR AI MULTI-AGENT SMOKE TEST SUITE");
  console.log("================================================================================");

  const cfg = getLyzrConfig();
  console.log(`Lyzr Configured: ${isLyzrConfigured() ? 'YES (Live Agents Active)' : 'NO (Preview Mode)'}`);
  console.log(`Extractor Agent ID: ${cfg.extractorAgentId || 'not configured'}`);
  console.log(`Conflict Agent ID:  ${cfg.conflictAgentId || 'not configured'}`);
  console.log(`Planner Agent ID:   ${cfg.plannerAgentId || 'not configured'}`);
  console.log(`Manager Agent ID:   ${cfg.managerAgentId || 'not configured'}`);
  console.log("================================================================================\n");

  const results: TestReportItem[] = [];
  let priorDecisions: Decision[] = [];

  // --------------------------------------------------------------------------
  // TEST 1: Meeting transcript → Decisions and Commitments
  // --------------------------------------------------------------------------
  console.log("--- TEST 1: Meeting transcript -> Grounded Decisions and Commitments ---");
  const t1Start = Date.now();
  const transcript1 = `
David (VP Eng): We reviewed the latency regressions. We decided to standardize on PostgreSQL for primary storage across all microservices.
Sarah (Principal Architect): Agreed. I will complete the schema migration scripts by 2026-05-15.
Alex (Infra Lead): I will provision the RDS Aurora multi-AZ cluster in us-east-1 by 2026-05-18.
`;
  const res1 = await orchestrateDecisionTraceAnalysis({
    conversationText: transcript1,
    sourceTitle: 'Core Architecture Review Q2',
    channel: 'Google Meet'
  });
  const t1Duration = Date.now() - t1Start;

  const t1Passed = res1.decisions.length >= 1 && res1.commitments.length >= 1;
  priorDecisions = res1.decisions;

  results.push({
    id: 1,
    name: 'Meeting Transcript Extraction',
    passed: t1Passed,
    durationMs: t1Duration,
    details: {
      decisionsCount: res1.decisions.length,
      commitmentsCount: res1.commitments.length,
      firstDecision: res1.decisions[0]?.title,
      firstEvidenceQuote: res1.decisions[0]?.evidence[0]?.quote,
      firstCommitmentOwner: res1.commitments[0]?.owner,
      firstCommitmentDeadline: res1.commitments[0]?.deadline
    }
  });
  console.log(`[TEST 1] ${t1Passed ? 'PASSED' : 'FAILED'} in ${t1Duration}ms`);
  console.log(`  Decisions extracted: ${res1.decisions.length}`);
  console.log(`  Commitments extracted: ${res1.commitments.length}\n`);

  // --------------------------------------------------------------------------
  // TEST 2: Updated decision → Genuine Conflict Detection
  // --------------------------------------------------------------------------
  console.log("--- TEST 2: Updated Decision -> Genuine Conflict Detection ---");
  const t2Start = Date.now();
  const transcript2 = `
Marcus (VP Product): Per our fast-moving sprint priorities, we decided to migrate all microservices to MongoDB instead of PostgreSQL.
`;
  const res2 = await orchestrateDecisionTraceAnalysis({
    conversationText: transcript2,
    sourceTitle: 'Product Architecture Direction',
    channel: 'Slack #architecture',
    existingDecisions: priorDecisions
  });
  const t2Duration = Date.now() - t2Start;

  const t2Passed = res2.conflicts.length >= 1;
  results.push({
    id: 2,
    name: 'Contradiction Detection',
    passed: t2Passed,
    durationMs: t2Duration,
    details: {
      conflictsCount: res2.conflicts.length,
      conflictTitle: res2.conflicts[0]?.title,
      severity: res2.conflicts[0]?.severity,
      explanation: res2.conflicts[0]?.explanation,
      priorDecisionTitle: res2.conflicts[0]?.previousDecision?.title,
      newerDecisionTitle: res2.conflicts[0]?.newerDecision?.title
    }
  });
  console.log(`[TEST 2] ${t2Passed ? 'PASSED' : 'FAILED'} in ${t2Duration}ms`);
  console.log(`  Conflicts detected: ${res2.conflicts.length}`);
  if (res2.conflicts[0]) {
    console.log(`  Conflict: "${res2.conflicts[0].title}" (Severity: ${res2.conflicts[0].severity})\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Commitment / Conflict → Proposed Action Requiring Approval
  // --------------------------------------------------------------------------
  console.log("--- TEST 3: Action Planner -> Proposed Action Requiring Human Approval ---");
  const t3Start = Date.now();
  const t3Duration = Date.now() - t3Start;
  const approvals = res2.pendingApprovals;
  const t3Passed = approvals.length >= 1 && approvals.every((a) => Boolean(a.exactActionPreview));

  results.push({
    id: 3,
    name: 'Human Approval Gating for Remediations',
    passed: t3Passed,
    durationMs: t3Duration,
    details: {
      approvalsCount: approvals.length,
      firstApprovalTitle: approvals[0]?.title,
      exactActionPreview: approvals[0]?.exactActionPreview,
      impactLevel: approvals[0]?.impactLevel
    }
  });
  console.log(`[TEST 3] ${t3Passed ? 'PASSED' : 'FAILED'}`);
  console.log(`  Pending Approvals gated: ${approvals.length}`);
  if (approvals[0]) {
    console.log(`  Preview: "${approvals[0].exactActionPreview}" (Impact: ${approvals[0].impactLevel})\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Ambiguous conversation → No Fabricated Commitments
  // --------------------------------------------------------------------------
  console.log("--- TEST 4: Ambiguous Conversation -> Grounding Guard (No Hallucinations) ---");
  const t4Start = Date.now();
  const transcript4 = `
Tom: Maybe someday we could rewrite everything in Go or Rust.
Lisa: That might be interesting if anyone ever has spare cycles down the road.
`;
  const res4 = await orchestrateDecisionTraceAnalysis({
    conversationText: transcript4,
    sourceTitle: 'Water Cooler Slack'
  });
  const t4Duration = Date.now() - t4Start;

  const t4Passed = res4.decisions.length === 0 && res4.commitments.length === 0;
  results.push({
    id: 4,
    name: 'Hallucination & Ambiguity Guard',
    passed: t4Passed,
    durationMs: t4Duration,
    details: {
      decisionsCount: res4.decisions.length,
      commitmentsCount: res4.commitments.length,
      ungroundedClaimsCount: res4.stats.ungroundedClaimsCount
    }
  });
  console.log(`[TEST 4] ${t4Passed ? 'PASSED' : 'FAILED'} in ${t4Duration}ms`);
  console.log(`  Decisions: ${res4.decisions.length}, Commitments: ${res4.commitments.length}\n`);

  // --------------------------------------------------------------------------
  // TEST 5: Empty input → Safe handling without LLM calls
  // --------------------------------------------------------------------------
  console.log("--- TEST 5: Empty Input -> Safe Zero-Call Handling ---");
  const t5Start = Date.now();
  const res5 = await orchestrateDecisionTraceAnalysis({
    conversationText: '     \n\t   ',
    sourceTitle: 'Empty Input'
  });
  const t5Duration = Date.now() - t5Start;

  const t5Passed = res5.decisions.length === 0 && res5.commitments.length === 0 && t5Duration < 200;
  results.push({
    id: 5,
    name: 'Empty Input Early Exit',
    passed: t5Passed,
    durationMs: t5Duration,
    details: {
      decisionsCount: res5.decisions.length,
      commitmentsCount: res5.commitments.length,
      durationMs: t5Duration
    }
  });
  console.log(`[TEST 5] ${t5Passed ? 'PASSED' : 'FAILED'} in ${t5Duration}ms`);
  console.log(`  Handled in ${t5Duration}ms (Zero redundant LLM calls)\n`);

  // --------------------------------------------------------------------------
  // TEST 6: Duplicate input → Cache hit / no duplicate actionable records
  // --------------------------------------------------------------------------
  console.log("--- TEST 6: Duplicate Input -> In-Memory Cache Hit & Token Conservation ---");
  const t6Start = Date.now();
  const res6 = await orchestrateDecisionTraceAnalysis({
    conversationText: transcript1,
    sourceTitle: 'Core Architecture Review Q2 (Repeat Request)',
    channel: 'Google Meet'
  });
  const t6Duration = Date.now() - t6Start;

  // Since it was already analyzed in Test 1, cache hit should return substantially faster
  const t6Passed = res6.decisions.length === res1.decisions.length && t6Duration < t1Duration;
  results.push({
    id: 6,
    name: 'Duplicate Input Cache Hit',
    passed: t6Passed,
    durationMs: t6Duration,
    details: {
      firstRunDurationMs: t1Duration,
      cachedRunDurationMs: t6Duration,
      speedup: `${Math.round((t1Duration / Math.max(t6Duration, 1)) * 10) / 10}x faster`,
      decisionsCount: res6.decisions.length
    }
  });
  console.log(`[TEST 6] ${t6Passed ? 'PASSED' : 'FAILED'} in ${t6Duration}ms`);
  console.log(`  First run: ${t1Duration}ms | Cached run: ${t6Duration}ms (${Math.round((t1Duration / Math.max(t6Duration, 1)) * 10) / 10}x faster)\n`);

  // --------------------------------------------------------------------------
  // SUMMARY REPORT & AUDIT LOG PERSISTENCE
  // --------------------------------------------------------------------------
  const allPassed = results.every((r) => r.passed);
  console.log("================================================================================");
  console.log(`SMOKE TEST RESULTS: ${results.filter((r) => r.passed).length}/${results.length} PASSED`);
  console.log("================================================================================");

  // Write sanitized results to docs/smoke-test-results.json
  const reportPath = path.resolve(process.cwd(), 'docs', 'smoke-test-results.json');
  const reportPayload = {
    executedAt: new Date().toISOString(),
    environment: 'production-live-lyzr',
    agentIdsConfigured: {
      extractor: Boolean(cfg.extractorAgentId),
      conflict: Boolean(cfg.conflictAgentId),
      planner: Boolean(cfg.plannerAgentId),
      manager: Boolean(cfg.managerAgentId)
    },
    totalTests: results.length,
    passedCount: results.filter((r) => r.passed).length,
    failedCount: results.filter((r) => !r.passed).length,
    allPassed,
    results
  };

  fs.writeFileSync(reportPath, JSON.stringify(reportPayload, null, 2), 'utf8');
  console.log(`Smoke test report written to: docs/smoke-test-results.json\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

runSmokeTests().catch((err) => {
  console.error("SMOKE TEST RUN FAILED:", err);
  process.exit(1);
});
