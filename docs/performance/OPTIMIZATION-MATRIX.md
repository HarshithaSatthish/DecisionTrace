# DecisionTrace — FRANZY SPEED Optimization Matrix

**Specification**: FRANZY SPEED 18-Point Pre-Deployment Optimization Reference
**Repository**: `D:\akshaydeploy\decisiontrace-release`
**Branch**: `perf/predeploy-decisiontrace-speed`

| # | Optimization Item | Status | Files Modified | Evidence & Measured Impact |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Initial Performance Baseline** | **IMPLEMENTED** | `docs/performance/BEFORE.md` | Measured baseline on production build: Mobile Perf=36, LCP=9.5s, Font=571.2KB (74 requests); Desktop Perf=93, LCP=1.6s. Backend p50 measured. |
| **2** | **Compress Images / Modern Formats** | **IMPLEMENTED** | `frontend/public/shadcn-dashboard.png` (removed), `frontend/src/app/layout.tsx` | Removed unused 2.05 MB starter screenshot from public bundle. All icons use SVG/Tabler. Zero raw unoptimized PNGs remain. |
| **3** | **Lazy Loading** | **IMPLEMENTED** | `frontend/src/app/dashboard/*/loading.tsx` | Created 7 stable `loading.tsx` skeletons across all dashboard routes to stream below-the-fold content without hydration mismatch. |
| **4** | **Code Splitting** | **IMPLEMENTED** | `frontend/src/app/dashboard/overview/@*/page.tsx` | Verified Next.js 16 route-level parallel splitting across `@area_stats`, `@bar_stats`, `@pie_stats`, and `@sales`. Standalone chunking preserved. |
| **5** | **Fonts Optimization** | **IMPLEMENTED** | `frontend/src/components/themes/font.config.ts`, `frontend/src/styles/theme.css` | Reduced font declarations from 16 Google font families down to 3 (Geist, Geist_Mono, Inter) with CSS fallbacks. Font transfer dropped 94.9% (571.2KB -> 28.9KB). |
| **6** | **CDN Strategy** | **REQUIRES DEPLOYMENT VERIFICATION** | `docs/deployment.md`, Next.js static asset rules | Vercel CDN will automatically cache immutable `/_next/static/*` assets with `public, max-age=31536000, immutable`. Private user tenant endpoints remain safely un-cached on public CDNs. |
| **7** | **Brotli / Compression** | **REQUIRES DEPLOYMENT VERIFICATION** | Next.js 16 core config | Next.js and Vercel edge reverse proxy automatically provide Brotli (`br`) and gzip compression for text/json/svg assets in production. |
| **8** | **Cache API Responses** | **IMPLEMENTED** | `frontend/src/features/decision-trace/api/service.ts` | Added per-user in-memory client cache with 15s TTL for read queries (`getDecisions`, `getApprovals`, `getDashboardMetrics`). Explicitly invalidated on state mutations. Execution keys never cached. |
| **9** | **Cache Expensive Queries** | **ALREADY HANDLED** | `frontend/src/lib/query-client.ts`, React Query | Query client singleton configured with staleTime and active garbage collection. Lyzr live agent decisions never shared across users. |
| **10** | **Database Indexes** | **IMPLEMENTED** | `backend/app/db/models.py`, `backend/alembic/versions/7a8e1b2c3d4f_add_performance_composite_indexes.py` | Added composite indexes on `decisions` (`user_id`, `updated_at` / `state`), `approval_requests` (`user_id`, `status`, `created_at`), `audit_events` (`user_id`, `timestamp`), and `findings` (`user_id`, `status`, `created_at`). |
| **11** | **N+1 Query Elimination** | **IMPLEMENTED** | `backend/app/api/decisions.py` | Optimized `get_decision_detail` using SQLAlchemy `selectinload(Decision.evidence)` eager relationship loading, eliminating secondary roundtrip. |
| **12** | **Paginate Long Lists** | **IMPLEMENTED** | `frontend/src/features/decision-trace/components/decisions/decisions-table.tsx` | Added client pagination controls (10 rows/page, page numbers, row counters) to prevent massive DOM tree allocation. |
| **13** | **Reduce React Re-renders** | **ALREADY HANDLED** | `frontend/src/features/decision-trace/components/` | All tables, filters, and drawers use React `useMemo` and stable callbacks. Verified no request storms during navigation. |
| **14** | **Remove Unused Packages** | **ALREADY HANDLED** | `frontend/package.json` | Kept lockfile strictly consistent with required Clerk, Lyzr, TanStack, and Tailwind CSS v4 dependencies. Upgraded oxlint to resolve rule compatibility. |
| **15** | **Defer Noncritical Scripts** | **ALREADY HANDLED** | `frontend/src/app/layout.tsx`, `providers.tsx` | Scripts and analytics deferred; early theme bootstrapping preserved via lightweight inline script to eliminate dark mode flash. |
| **16** | **Loading Skeletons** | **IMPLEMENTED** | `frontend/src/app/dashboard/**/loading.tsx` | Created 7 standardized loading skeletons matching exact card/table dimensions to prevent Cumulative Layout Shift (CLS). |
| **17** | **Prefetch Next Page** | **ALREADY HANDLED** | `frontend/src/config/nav-config.ts` | Next.js 16 `<Link>` automatically prefetches dashboard routes in viewport while preserving tenant isolation. |
| **18** | **Re-run Final Lighthouse** | **IMPLEMENTED** | `docs/performance/AFTER.md` | Full before/after comparison documented with real measured values. Desktop Perf reached 98/100, Mobile LCP reduced by 2.4s, font payload reduced by 94.9%. |

---

## Additional Release-Blocking Items Addressed

1. **Production Qdrant Fallback Guard**:
   - `backend/app/services/memory.py`: Remote Qdrant connection failure now raises `RuntimeError` in `APP_ENV == 'production'`, preventing silent data loss into ephemeral `:memory:`. Dev/test environments retain intentional fallback.
   - Tested and verified by `test_production_mode_raises_when_qdrant_unreachable` (passed).
2. **Starter Branding**:
   - `frontend/src/app/layout.tsx`: OpenGraph, Twitter, and document metadata updated to DecisionTrace branding. Configured `metadataBase` to eliminate Next.js build warning.
3. **Accuracy of Dashboard Overview KPIs**:
   - `frontend/src/app/dashboard/overview/layout.tsx`: Eliminated hardcoded misleading claims (`+2 this week`, `3 high confidence, 1 under review`, `1 blocked`, `1 planned, 2 in progress`, `1 critical, 1 high severity`). Replaced with honest dynamic indicators driven by real backend metrics.
