# MiniMax Frontend QA & Visual Polish — Rules of Engagement

## 1. Overview
MiniMax is conducting independent frontend QA, responsive layout auditing, and UI accessibility reviews.
This document defines the **precise boundaries** of what MiniMax may safely touch versus what is strictly protected in the Master codebase.

---

## 2. Permitted Components (Safe for MiniMax Polish)

MiniMax MAY safely improve CSS styling, Tailwind utility classes, responsive spacing, ARIA labels, micro-animations, and visual polish in the following UI presentation components:

| Category | Permitted Files | Scope of Safe Improvements |
|---|---|---|
| **Overview Dashboard** | `src/features/decision-trace/components/overview/attention-items-banner.tsx`<br>`src/features/decision-trace/components/overview/commitment-velocity-chart.tsx`<br>`src/features/decision-trace/components/overview/decision-distribution-chart.tsx`<br>`src/features/decision-trace/components/overview/decision-trends-chart.tsx`<br>`src/features/decision-trace/components/overview/recent-guardian-activity.tsx` | Chart container sizing, responsive grids, dark/light contrast, badge margins, empty state visual hierarchy. |
| **Decisions Screen** | `src/features/decision-trace/components/decisions/decisions-table.tsx`<br>`src/features/decision-trace/components/decisions/decision-detail-drawer.tsx` | Table column widths, mobile row wrapping, drawer transition smoothness, quote callout typography, filter badge alignment. |
| **Commitments Kanban** | `src/features/decision-trace/components/commitments/commitments-board.tsx`<br>`src/features/decision-trace/components/commitments/commitment-column.tsx`<br>`src/features/decision-trace/components/commitments/commitment-card.tsx`<br>`src/features/decision-trace/components/commitments/commitment-detail-modal.tsx` | Drag handle hover states, column background tints, priority pill styling, modal responsiveness on mobile viewports. |
| **Conflicts Screen** | `src/features/decision-trace/components/conflicts/conflicts-list.tsx`<br>`src/features/decision-trace/components/conflicts/conflict-card.tsx` | Side-by-side comparison card padding, severity badge colors, evidence citation quote borders, card shadows. |
| **Approvals Screen** | `src/features/decision-trace/components/approvals/approvals-list.tsx`<br>`src/features/decision-trace/components/approvals/approval-card.tsx` | Action button spacing, impact level icon contrast, confirmation modal layout, reviewer textarea polish. |
| **Activity Feed** | `src/features/decision-trace/components/activity/activity-timeline.tsx` | Timeline connector vertical line styling, actor avatar badges, timestamp text opacity. |
| **Header Status Badge** | `src/components/layout/guardian-status-pill.tsx` | Pill pulse animation timing, tooltip trigger area, color vibrancy. |
| **Shared Badges & Cards** | `src/features/decision-trace/components/status-badges.tsx`<br>`src/features/decision-trace/components/evidence-card.tsx`<br>`src/features/decision-trace/components/development-preview-banner.tsx` | Badge border radii, typography weights, preview banner dismiss behavior. |

---

## 3. STRICTLY OFF-LIMITS (Do NOT Touch)

The following core modules are frozen and must **NEVER** be modified by MiniMax during QA polish:

1. **Authentication & Session Security**:
   - `src/lib/decision-trace-auth.ts` (Clerk session verification & header forwarding)
   - `src/middleware.ts` (Clerk route protection)
   - `src/app/auth/*` (Sign-in and sign-up flows)

2. **Server API Routes & Proxy Controls**:
   - `src/app/api/decision-trace/*` (All 8 API route handlers, size checks, timeout safeguards)

3. **Lyzr AI Agent Intelligence**:
   - `src/server/lyzr/*` (Manager agent, 3 worker agents, prompts, schemas, multi-tenant cache keys)

4. **Domain Contract & Data Layer**:
   - `src/features/decision-trace/types/index.ts` (TypeScript types for Decision, Commitment, Conflict, ApprovalRequest)
   - `src/features/decision-trace/api/service.ts` (Backend API client and mutation calls)
   - `src/features/decision-trace/api/queries.ts` (React Query key factories)

5. **Test Suites**:
   - `src/__tests__/*` (All 49 unit and regression test specifications)

---

## 4. Acceptance Criteria for MiniMax Submissions

Before any MiniMax UI changes are merged into the Master branch:
1. `bun test` must pass 49/49 tests.
2. `bun run typecheck` (`tsc --noEmit`) must report 0 errors.
3. `bun run lint` must report 0 errors.
4. `bun run build` must compile cleanly without hydration warnings or bundle bloat.
5. Functional component contracts (props, callbacks, state hooks) must remain identical.
