/**
 * DecisionTrace — Automated Staging Backend E2E Test Suite Runner
 *
 * Runs the Replit contract scenarios against Person 1's real staging backend.
 *
 * SAFETY GUARDS:
 * 1. Defaults to SAFE READ-ONLY mode.
 * 2. Requires explicit `--allow-mutations` flag before sending state-changing requests.
 * 3. Keeps simulator and real backend results completely separate.
 * 4. Never exposes tokens or secret values in output or command lines.
 *
 * Usage:
 *   bun run scripts/test-staging-backend.ts
 *   bun run scripts/test-staging-backend.ts --url http://localhost:8000/api/v1
 *   bun run scripts/test-staging-backend.ts --url http://localhost:8000/api/v1 --allow-mutations
 *   bun run scripts/test-staging-backend.ts --simulator
 */

import { spawn } from 'child_process';
import { parseArgs } from 'util';
import path from 'path';

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    url: { type: 'string', short: 'u' },
    token: { type: 'string', short: 't' },
    'user-id': { type: 'string' },
    'org-id': { type: 'string' },
    'allow-mutations': { type: 'boolean', default: false },
    simulator: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' }
  },
  strict: false
});

if (args.help) {
  console.log(`
DecisionTrace Staging Backend E2E Runner

Options:
  --url, -u            Backend URL (defaults to DECISIONTRACE_BACKEND_URL or http://localhost:8000/api/v1)
  --token, -t          Clerk Bearer token for authentication (or set DT_API_TOKEN)
  --user-id            User ID claim (defaults to user_staging_audit)
  --org-id             Org ID claim (defaults to org_staging_audit)
  --allow-mutations    EXPLICITLY authorize state-changing mutation checks (defaults to FALSE)
  --simulator          Run against local loopback simulator instead of real backend
  --help, -h           Show this help message
`);
  process.exit(0);
}

const isSimulator = Boolean(args.simulator);
const allowMutations = Boolean(args['allow-mutations']);
const targetMode = isSimulator ? 'simulator' : 'real';

const rawUrl =
  args.url ||
  process.env.DT_BACKEND_URL ||
  process.env.DECISIONTRACE_BACKEND_URL ||
  (isSimulator ? 'http://127.0.0.1:8001' : 'http://localhost:8000/api/v1');

let targetHost = 'localhost';
try {
  const parsed = new URL(rawUrl);
  targetHost = parsed.hostname;
} catch {
  console.error(`❌ Invalid backend URL: "${rawUrl}"`);
  process.exit(1);
}

const env: Record<string, string> = {
  ...process.env as Record<string, string>,
  PYTHONUTF8: '1'
};

if (isSimulator) {
  env.DT_SIMULATOR_URL = rawUrl;
} else {
  env.DT_BACKEND_URL = rawUrl;
  env.DT_TARGET_ENV = 'safe-test';
  env.DT_SAFE_HOST = targetHost;
  env.DT_USER_ID = args['user-id'] || process.env.DT_USER_ID || 'usr_staging_operator';
  env.DT_ORG_ID = args['org-id'] || process.env.DT_ORG_ID || 'org_staging_tenant';
  
  const token = args.token || process.env.DT_API_TOKEN;
  if (token) {
    env.DT_API_TOKEN = token;
  }

  if (allowMutations) {
    env.DT_ALLOW_REAL_MUTATIONS = '1';
  } else {
    delete env.DT_ALLOW_REAL_MUTATIONS;
  }
}

console.log('='.repeat(72));
console.log(` DecisionTrace — E2E Contract Runner [TARGET: ${targetMode.toUpperCase()}]`);
console.log('='.repeat(72));
console.log(`Endpoint URL:     ${rawUrl}`);
console.log(`Target Mode:      ${targetMode}`);
console.log(`Mutations Mode:   ${allowMutations ? '⚠️  MUTATIONS AUTHORIZED' : '🛡️  SAFE READ-ONLY (Mutations Blocked)'}`);
console.log(`Timestamp:        ${new Date().toISOString()}`);
console.log('-'.repeat(72));

if (!isSimulator && !allowMutations) {
  console.log('ℹ️  Running in SAFE READ-ONLY mode.');
  console.log('   All state-changing mutations (commitments, conflict overrides, approvals) are blocked.');
  console.log('   Pass --allow-mutations to authorize real staging mutation checks.');
  console.log('-'.repeat(72));
}

const integrationDir = path.resolve(process.cwd(), 'integration-tests');

const pyRunner = spawn(
  'python',
  ['-X', 'utf8', '-m', 'decisiontrace_testing.runner', 'run', '--target', targetMode],
  {
    cwd: integrationDir,
    env,
    stdio: 'inherit'
  }
);

pyRunner.on('close', (code) => {
  console.log('-'.repeat(72));
  if (code === 0) {
    console.log(`✅ ${targetMode.toUpperCase()} CONTRACT VERIFICATION COMPLETED (Exit Code: 0)`);
  } else {
    console.log(`⚠️  ${targetMode.toUpperCase()} CONTRACT VERIFICATION RETURNED STATUS CODE: ${code}`);
  }
  console.log('='.repeat(72));
  process.exit(code ?? 1);
});
