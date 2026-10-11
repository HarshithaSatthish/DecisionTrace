# MiniMax Frontend Patch Ingestion & Verification Guide

**Purpose:** Safe ingestion procedure for incoming MiniMax frontend QA improvements and responsive polish.  
**Rule:** Only verified, non-conflicting visual improvements are accepted. Core security, Lyzr AI agents, and backend contracts are immutable.

---

## 1. Protected Files vs Permitted Whitelist

### A. Strictly Protected (IMMUTABLE)
If a MiniMax patch modifies any of the following files, **REJECT IMMEDIATELY**:

- `src/lib/decision-trace-auth.ts` (Clerk session verification & token forwarding)
- `src/middleware.ts` (Clerk route protection)
- `src/app/auth/*` (Sign-in and sign-up flows)
- `src/app/api/decision-trace/*` (API proxy routes, size limits, circuit breakers)
- `src/server/lyzr/*` (Lyzr multi-agent orchestrator, prompt boundaries, schemas, cache)
- `src/features/decision-trace/types/index.ts` (TypeScript domain contracts)
- `src/features/decision-trace/api/*` (React Query services and mutation hooks)
- `src/__tests__/*` (All 49 unit and regression tests)

### B. Permitted Presentation Files (Safe for MiniMax Polish)
- `src/features/decision-trace/components/overview/*` (Card spacing, responsive grids, chart tooltips)
- `src/features/decision-trace/components/decisions/*` (Table column widths, drawer typography)
- `src/features/decision-trace/components/commitments/*` (Kanban card styles, priority badges)
- `src/features/decision-trace/components/conflicts/*` (Side-by-side card margins, diff styling)
- `src/features/decision-trace/components/approvals/*` (Action cards, modal layout polish)
- `src/features/decision-trace/components/activity/*` (Timeline vertical connector styling)
- `src/components/layout/guardian-status-pill.tsx` (Pill animations, tooltip text)
- `src/features/decision-trace/components/status-badges.tsx` (Badge color tokens)
- `src/features/decision-trace/components/evidence-card.tsx` (Citation quote borders)

---

## 2. Ingestion Step-by-Step Procedure

When MiniMax supplies its patch or ZIP:

### Step 1: Create an Isolated Branch
```bash
git checkout -b feature/minimax-polish
```

### Step 2: Apply the Patch or Copy Files
Apply the changes strictly to the working tree.

### Step 3: Run the Automated Boundary & Quality Validator
```bash
bun run scripts/verify-minimax-patch.ts
```

This automated validator:
1. Verifies that **zero protected files** were touched.
2. Runs all 49 frontend tests (`bun test`).
3. Runs strict TypeScript check (`bun run typecheck`).
4. Runs linter (`bun run lint`).
5. Confirms production build (`bun run build`).

### Step 4: Commit and Merge to Master Feature Branch
Only if all checks pass:
```bash
git add src/
git commit -m "feat(ui): merge verified MiniMax visual and accessibility improvements"
git checkout feature/decisiontrace-ui
git merge --ff-only feature/minimax-polish
```
