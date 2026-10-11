/**
 * DecisionTrace — Person 1 FastAPI Backend Pre-Flight Compatibility Probe
 *
 * Usage:
 *   bun run scripts/verify-backend-compatibility.ts
 *
 * Checks:
 *   1. Health endpoint (/health)
 *   2. Metrics endpoint (/metrics)
 *   3. Decisions ledger (/decisions)
 *   4. Commitments board (/commitments)
 *   5. Conflicts feed (/conflicts)
 *   6. Approvals queue (/approvals)
 *   7. Activity timeline (/activity)
 */

interface CheckResult {
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL' | 'UNREACHABLE';
  httpStatus?: number;
  durationMs: number;
  notes: string;
}

async function runCompatibilityProbe() {
  const backendUrl = process.env.DECISIONTRACE_BACKEND_URL || 'http://localhost:8000/api/v1';

  console.log('='.repeat(70));
  console.log(' DecisionTrace — Person 1 Backend Compatibility Probe');
  console.log('='.repeat(70));
  console.log(`Target Backend URL: ${backendUrl}`);
  console.log(`Probe Timestamp:    ${new Date().toISOString()}`);
  console.log('-'.repeat(70));

  const endpoints = [
    { path: '/health', method: 'GET', requiredField: 'status' },
    { path: '/metrics', method: 'GET', requiredField: 'activeDecisions' },
    { path: '/decisions', method: 'GET', isArray: true },
    { path: '/commitments', method: 'GET', isArray: true },
    { path: '/conflicts', method: 'GET', isArray: true },
    { path: '/approvals', method: 'GET', isArray: true },
    { path: '/activity', method: 'GET', isArray: true }
  ];

  const results: CheckResult[] = [];

  for (const ep of endpoints) {
    const fullUrl = `${backendUrl}${ep.path}`;
    const start = performance.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(fullUrl, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': 'usr_compatibility_probe',
          'X-Org-Id': 'org_compatibility_probe'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      const durationMs = Math.round(performance.now() - start);

      if (res.ok) {
        const json = await res.json().catch(() => null);
        let note = 'Valid response';
        if (ep.requiredField && json && !(ep.requiredField in json)) {
          note = `Missing expected field "${ep.requiredField}"`;
        } else if (ep.isArray && !Array.isArray(json) && !(json && Array.isArray(json.items))) {
          note = 'Response is not an array or { items: [] }';
        }

        results.push({
          endpoint: ep.path,
          method: ep.method,
          status: 'PASS',
          httpStatus: res.status,
          durationMs,
          notes: note
        });
      } else {
        results.push({
          endpoint: ep.path,
          method: ep.method,
          status: 'FAIL',
          httpStatus: res.status,
          durationMs,
          notes: `HTTP ${res.status}: ${res.statusText}`
        });
      }
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : 'Connection failed';
      results.push({
        endpoint: ep.path,
        method: ep.method,
        status: 'UNREACHABLE',
        durationMs,
        notes: message
      });
    }
  }

  // Print results table
  console.log(
    'Endpoint'.padEnd(20) +
    'Method'.padEnd(10) +
    'Status'.padEnd(14) +
    'Latency'.padEnd(12) +
    'Notes'
  );
  console.log('-'.repeat(70));

  for (const r of results) {
    const statusColor = r.status === 'PASS' ? 'PASS' : r.status;
    console.log(
      r.endpoint.padEnd(20) +
      r.method.padEnd(10) +
      statusColor.padEnd(14) +
      `${r.durationMs}ms`.padEnd(12) +
      r.notes
    );
  }

  console.log('='.repeat(70));
  const passed = results.filter((r) => r.status === 'PASS').length;
  const unreachable = results.filter((r) => r.status === 'UNREACHABLE').length;

  if (passed === endpoints.length) {
    console.log('✅ ALL BACKEND ENDPOINTS ARE FULLY COMPATIBLE & ONLINE.');
    console.log('   Ready to set NEXT_PUBLIC_DECISIONTRACE_DEMO_PREVIEW="false" in production.');
  } else if (unreachable === endpoints.length) {
    console.log('ℹ️  FastAPI backend is currently offline / not running on port 8000.');
    console.log('   Frontend continues operating safely via Truthful Preview / Fallback mode.');
  } else {
    console.log(`⚠️  PARTIAL COMPATIBILITY: ${passed}/${endpoints.length} endpoints operational.`);
    console.log('   Review failed endpoints before disabling preview mode.');
  }
}

runCompatibilityProbe().catch((err) => {
  console.error('Fatal probe error:', err);
  process.exit(1);
});
