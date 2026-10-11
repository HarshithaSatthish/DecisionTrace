/**
 * DecisionTrace — MiniMax Patch Ingestion & Safety Validator
 *
 * Checks modified working tree files to ensure:
 * 1. Zero protected files (auth, agents, API routes, contracts, tests) are touched.
 * 2. All 49 frontend tests pass without regression.
 * 3. TypeScript strict check passes.
 * 4. Linter passes with zero errors.
 *
 * Usage:
 *   bun run scripts/verify-minimax-patch.ts
 */

import { execSync } from 'child_process';

const PROTECTED_PREFIXES = [
  'src/lib/decision-trace-auth.ts',
  'src/middleware.ts',
  'src/app/auth',
  'src/app/api',
  'src/server',
  'src/features/decision-trace/types',
  'src/features/decision-trace/api',
  'src/__tests__',
  'integration-tests'
];

console.log('='.repeat(72));
console.log(' DecisionTrace — MiniMax Frontend Patch Ingestion Validator');
console.log('='.repeat(72));

// 1. Get changed files
let changedFiles: string[] = [];
try {
  const statusOutput = execSync('git status --porcelain', { encoding: 'utf-8' });
  changedFiles = statusOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3).trim().replace(/\\/g, '/'));
} catch (err) {
  console.error('Failed to read git status:', err);
  process.exit(1);
}

if (changedFiles.length === 0) {
  console.log('ℹ️  No modified files found in working tree to audit.');
  console.log('   Apply MiniMax patch files first, then run this validator.');
} else {
  console.log(`Auditing ${changedFiles.length} modified file(s)...`);

  const boundaryViolations: string[] = [];
  for (const file of changedFiles) {
    for (const forbidden of PROTECTED_PREFIXES) {
      if (file.startsWith(forbidden)) {
        boundaryViolations.push(file);
      }
    }
  }

  if (boundaryViolations.length > 0) {
    console.error('\n❌ BOUNDARY VIOLATION DETECTED!');
    console.error('MiniMax patch modifies strictly protected core files:');
    boundaryViolations.forEach((f) => console.error(`  - ${f}`));
    console.error('\nReject these file changes before merging.');
    process.exit(1);
  }

  console.log('✅ Boundary Check: Zero protected files modified. All changes within presentation UI.');
}

console.log('\nRunning automated test and build verification...');
console.log('-'.repeat(72));

try {
  console.log('1. Running Bun test suite...');
  execSync('bun test', { stdio: 'inherit' });

  console.log('\n2. Running TypeScript strict typecheck...');
  execSync('bun run typecheck', { stdio: 'inherit' });

  console.log('\n3. Running Linter...');
  execSync('bun run lint', { stdio: 'inherit' });

  console.log('\n' + '='.repeat(72));
  console.log('✅ MINIMAX PATCH VERIFICATION: ALL CHECKS PASSED.');
  console.log('   Patch is safe to merge into feature/decisiontrace-ui.');
  console.log('='.repeat(72));
} catch {
  console.error('\n❌ VERIFICATION FAILED: Tests, typecheck, or lint reported errors.');
  process.exit(1);
}
