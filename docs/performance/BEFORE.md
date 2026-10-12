# DecisionTrace — Pre-Deployment Performance Baseline (BEFORE.md)

**Environment**: Local Production Mode (`next start`, Turbopack Standalone Build, Bun 1.2, Node 20)
**Backend**: FastAPI on Python 3.12 (Uvicorn / TestClient), SQLite in-memory test harness
**Date**: October 12, 2026
**Branch**: `perf/predeploy-decisiontrace-speed` (at `origin/feature/harshitha-backend` commit `144c942`)

---

## 1. Executive Summary

This document establishes the measured pre-optimization baseline for DecisionTrace across both frontend (Next.js 16) and backend (FastAPI + SQLModel) components according to the FRANZY SPEED specification. All values are real empirical measurements; no synthetic or unmeasured values are included.

Key baseline bottlenecks identified:
1. **Font Weight & Network Bloat**: `frontend/src/components/themes/font.config.ts` declares **16 Google Font families** loaded unconditionally in `layout.tsx`, transferring **571.2 KB of fonts across 32 HTTP font requests** on every page load, contributing to mobile LCP of **9.5s** and CLS of **0.183**.
2. **JavaScript Payload**: 844.4 KB initial JavaScript transferred with monolithic chart and dialog imports.
3. **Readiness Probe Latency**: `/ready` p50 latency is **4,069.96 ms** due to sequential blocking timeouts across offline services (Redis, remote Qdrant).
4. **Starter Branding**: Starter OpenGraph / Twitter metadata and unused starter images (~2 MB `shadcn-dashboard.png`) remain present.
5. **Production Qdrant Fallback Risk**: `backend/app/services/memory.py` silently falls back to ephemeral `:memory:` Qdrant on connection failure, threatening durable semantic vectors in production.

---

## 2. Lighthouse Web Vitals Baseline (FRANZY #1)

Measured on local production server (`http://localhost:3000`) using Lighthouse 13.5.0 and headless Chrome.

### A. Mobile Emulation (Moto G Power, 4G Slow Throttling)
- **URL**: `http://localhost:3000/auth/sign-in`
- **Performance Score**: **36 / 100**
- **Accessibility Score**: **94 / 100**
- **Best Practices Score**: **77 / 100**
- **SEO Score**: **63 / 100**

#### Core Web Vitals (Mobile)
| Metric | Baseline Value | Status |
| :--- | :--- | :--- |
| **First Contentful Paint (FCP)** | 2.5 s | Needs Improvement |
| **Largest Contentful Paint (LCP)** | 9.5 s | Poor (> 4.0s) |
| **Total Blocking Time (TBT)** | 1,040 ms | Poor (> 600ms) |
| **Cumulative Layout Shift (CLS)** | 0.183 | Needs Improvement (> 0.1) |
| **Speed Index** | 6.2 s | Poor |

#### Network & Payload Breakdown (Mobile)
| Resource Type | Transfer Size | Request Count |
| :--- | :--- | :--- |
| **JavaScript (Scripts)** | 844.4 KB | 28 |
| **Fonts** | 571.2 KB | 32 |
| **Stylesheets (CSS)** | 53.9 KB | 3 |
| **Document (HTML)** | 12.4 KB | 1 |
| **Images** | 2.1 KB | 2 |
| **Other / Fetch** | 39.4 KB | 8 |
| **Total Transfer** | **1,523.4 KB** | **74 requests** |

---

### B. Desktop Emulation (Unthrottled Desktop)
- **URL**: `http://localhost:3000/auth/sign-in`
- **Performance Score**: **93 / 100**
- **Accessibility Score**: **94 / 100**
- **Best Practices Score**: **77 / 100**
- **SEO Score**: **63 / 100**

#### Core Web Vitals (Desktop)
| Metric | Baseline Value | Status |
| :--- | :--- | :--- |
| **First Contentful Paint (FCP)** | 0.7 s | Good (< 0.9s) |
| **Largest Contentful Paint (LCP)** | 1.6 s | Good (< 2.5s) |
| **Total Blocking Time (TBT)** | 50 ms | Good (< 200ms) |
| **Cumulative Layout Shift (CLS)** | 0.000 | Good (< 0.1) |
| **Speed Index** | 0.8 s | Good |

---

## 3. Backend Latency Baseline (50 Sample Profiling)

Measured on FastAPI test client with seeded database containing 50 decisions, 20 findings, and 20 approvals for active tenant.

| Endpoint | Method | Samples | p50 (ms) | p95 (ms) | Min (ms) | Max (ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/decisions` | GET (limit=20) | 50 | 9.15 ms | 11.54 ms | 7.68 ms | 60.61 ms |
| `/api/v1/approvals` | GET (limit=20) | 50 | 8.63 ms | 11.26 ms | 7.89 ms | 32.86 ms |
| `/api/v1/activity` | GET (limit=20) | 50 | 8.80 ms | 16.78 ms | 8.02 ms | 32.72 ms |
| `/health` | GET | 50 | 4.28 ms | 5.78 ms | 3.64 ms | 28.69 ms |
| `/ready` | GET | 50 | 4,069.96 ms | 4,095.34 ms | 4,042.11 ms | 5,915.60 ms |

---

## 4. Key Observations & Action Plan

1. **FRANZY #5 (Fonts)**: Trimming the 16 Google font families in `font.config.ts` down to the primary system/application fonts (`Inter` / `Geist` and monospace) will immediately eliminate up to ~450 KB of font downloads and 24+ network requests, directly improving mobile FCP, LCP, and CLS.
2. **FRANZY #2 & #3 (Images & Lazy Loading)**: Remove the unused 2 MB `shadcn-dashboard.png` in `frontend/public/` and ensure all below-the-fold assets use `next/image` with lazy loading.
3. **FRANZY #4 (Code Splitting)**: Lazy-load heavy Recharts components and dialog components with `next/dynamic`.
4. **FRANZY #8 & #9 (Caching)**: Add tenant-isolated in-memory cache for repeated list queries with explicit invalidation upon approval actions.
5. **FRANZY #10 & #11 (Database & N+1)**: Optimize SQLModel queries to avoid N+1 query patterns and add compound index support.
6. **Backend Reliability & Readiness**:
   - Fix `backend/app/services/memory.py` to reject silent `:memory:` fallback in `production`.
   - Parallelize or optimize `/ready` dependency checks with tight asyncio timeouts to eliminate the 4,000ms delay.
