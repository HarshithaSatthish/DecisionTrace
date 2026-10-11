# Lovable Marketing Website Integration & Linking Guide

## 1. Architectural Relationship

- **Lovable Presentation Website**: Standalone marketing, product showcase, and conversion landing page.
- **DecisionTrace Master App (This Repository)**: Authenticated Next.js 16.4.0 SaaS dashboard, Lyzr AI Multi-Agent engine, and operator workflow portal.

```
┌─────────────────────────────────┐       User Click (CTA)       ┌─────────────────────────────────┐
│     Lovable Marketing Site      │  ────────────────────────►   │    DecisionTrace Master App     │
│    (e.g., decisiontrace.ai)     │                              │   (e.g., app.decisiontrace.ai)  │
└─────────────────────────────────┘                              └─────────────────────────────────┘
         │                                                                       │
         ├─ Feature Explanations                                                 ├─ Clerk Authentication
         ├─ Interactive Demo Previews                                            ├─ 6 Operational Screens
         └─ Pricing & Value Props                                                └─ Live Lyzr Agent Engine
```

---

## 2. Standard Deep-Linking Endpoints

Lovable buttons and CTAs must link to the following standardized routes on the deployed dashboard:

| Lovable CTA Button | Target Route | Behavior |
|---|---|---|
| **"Get Started" / "Start Free"** | `/auth/sign-up` | Enters Clerk onboarding flow; redirects to `/dashboard/overview` upon completion. |
| **"Sign In" / "Operator Login"** | `/auth/sign-in` | Directs existing users to authenticate; redirects to `/dashboard/overview`. |
| **"Explore Live Demo"** | `/dashboard/overview?demo=true` | Takes prospect directly to the overview screen (if public demo mode is enabled). |
| **"View Decision Trace"** | `/dashboard/decisions` | Direct link to the decisions ledger. |
| **"Conflict Detector"** | `/dashboard/conflicts` | Direct link to contradiction detection views. |
| **"Approvals Workflow"** | `/dashboard/approvals` | Direct link to human consensus queue. |

---

## 3. Domain & Hosting Topology

When deploying to production, follow this recommended domain topology:

1. **Subdomain Architecture**:
   - Marketing Site: `https://decisiontrace.ai` (or `https://www.decisiontrace.ai`)
   - Master Dashboard: `https://app.decisiontrace.ai`

2. **Clerk Authentication Domain Sharing**:
   - If user accounts are created or previewed on the marketing site, configure Clerk's **Satellite Domains** or shared root cookie (`.decisiontrace.ai`).
   - This enables seamless single sign-on (SSO) between marketing pages and the dashboard.

3. **UTM Attribution & Tracking**:
   - Lovable outbound links should append campaign tags to preserve conversion funnel metrics:
     ```
     https://app.decisiontrace.ai/auth/sign-up?utm_source=lovable&utm_medium=landing_page&utm_campaign=hackathon_launch
     ```

---

## 4. Visual & Brand Consistency Checklist

To maintain a cohesive product identity between the Lovable site and the Dashboard:
- **Brand Colors**: DecisionTrace Primary Blue (`oklch(0.55 0.22 260)`), Slate Dark background accents, and emerald/amber/rose status badges.
- **Typography**: Clean modern sans-serif (`Inter` or `Google Sans`).
- **Terminology**: Always use canonical terms:
  - *"Autonomous Decision & Commitment Guardian"*
  - *"Verbatim Evidence Quotations"*
  - *"Human-in-the-Loop Consensus Gating"*
  - *"Conflict Detector & Contradiction Resolution"*
