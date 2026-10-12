#!/usr/bin/env python3
"""
DecisionTrace — Route Categorization & Verification Inventory
Explicitly delineates:
1. Browser-tested routes
2. Build-verified routes
3. Routes requiring live authentication
4. Routes blocked by unavailable external integrations
"""

ROUTE_INVENTORY = {
    "browser_tested_routes": [
        {
            "route": "/auth/sign-in",
            "type": "public_auth",
            "tested_viewports": [320, 390, 768, 1440],
            "description": "Clerk authentication entry point with DecisionTrace Guardian branding"
        },
        {
            "route": "/auth/sign-up",
            "type": "public_auth",
            "tested_viewports": [320, 390, 768, 1440],
            "description": "User registration screen with Guardian branding and terms"
        },
        {
            "route": "/sign-in",
            "type": "public_alias",
            "tested_viewports": [320, 390, 768, 1440],
            "description": "Canonical sign-in route alias"
        },
        {
            "route": "/sign-up",
            "type": "public_alias",
            "tested_viewports": [320, 390, 768, 1440],
            "description": "Canonical sign-up route alias"
        },
        {
            "route": "/_not-found",
            "type": "public_error",
            "tested_viewports": [320, 390, 768, 1440],
            "description": "Custom branded responsive 404 page with interactive recovery"
        },
        {
            "route": "/dashboard/* (unauthenticated redirect)",
            "type": "security_test",
            "tested_viewports": [1440],
            "description": "Verified that all unauthenticated dashboard attempts redirect to /sign-in"
        }
    ],
    "routes_requiring_live_authentication": [
        {
            "route": "/dashboard/overview",
            "protection": "auth.protect()",
            "functionality": "Real-time decision velocity metrics, attention items, activity feed"
        },
        {
            "route": "/dashboard/decisions",
            "protection": "auth.protect()",
            "functionality": "Verbatim decision table, status filter tabs, search and detail view"
        },
        {
            "route": "/dashboard/commitments",
            "protection": "auth.protect()",
            "functionality": "Action commitments board, deadline tracking, assignee ownership"
        },
        {
            "route": "/dashboard/conflicts",
            "protection": "auth.protect()",
            "functionality": "Contradiction detection, side-by-side evidence quotes, resolution flow"
        },
        {
            "route": "/dashboard/approvals",
            "protection": "auth.protect()",
            "functionality": "Human approval queue, high-risk action confirmation, audit logging"
        },
        {
            "route": "/dashboard/activity",
            "protection": "auth.protect()",
            "functionality": "Chronological audit timeline of verified executive events"
        },
        {
            "route": "/dashboard/workspaces",
            "protection": "auth.protect()",
            "functionality": "Multi-tenant organization switcher and organization settings"
        },
        {
            "route": "/dashboard/notifications",
            "protection": "auth.protect()",
            "functionality": "Notification center and real-time alerts"
        },
        {
            "route": "/dashboard/billing",
            "protection": "auth.protect()",
            "functionality": "Organization subscription billing and tier management"
        },
        {
            "route": "/dashboard/profile",
            "protection": "auth.protect()",
            "functionality": "User credentials, security settings, and profile details"
        }
    ],
    "build_verified_routes": [
        "/",
        "/_not-found",
        "/auth",
        "/auth/sign-in/[[...sign-in]]",
        "/auth/sign-up/[[...sign-up]]",
        "/dashboard",
        "/dashboard/activity",
        "/dashboard/ai-chat",
        "/dashboard/approvals",
        "/dashboard/billing",
        "/dashboard/chat",
        "/dashboard/commitments",
        "/dashboard/conflicts",
        "/dashboard/decisions",
        "/dashboard/exclusive",
        "/dashboard/kanban",
        "/dashboard/notifications",
        "/dashboard/overview",
        "/dashboard/product",
        "/dashboard/product/[productId]",
        "/dashboard/profile/[[...profile]]",
        "/dashboard/users",
        "/dashboard/workspaces",
        "/dashboard/workspaces/team/[[...rest]]",
        "/sign-in/[[...sign-in]]",
        "/sign-up/[[...sign-up]]",
        "/api/decision-trace/activity",
        "/api/decision-trace/analyze",
        "/api/decision-trace/approvals",
        "/api/decision-trace/approvals/[id]",
        "/api/decision-trace/commitments",
        "/api/decision-trace/commitments/[id]",
        "/api/decision-trace/conflicts",
        "/api/decision-trace/conflicts/[id]/resolve",
        "/api/decision-trace/decisions",
        "/api/decision-trace/health",
        "/api/decision-trace/metrics",
        "/api/products",
        "/api/products/[id]",
        "/api/users",
        "/api/users/[id]"
    ],
    "routes_blocked_by_unavailable_external_integrations": [
        {
            "route": "/api/v1/omi/webhook (live physical hardware ingestion)",
            "external_blocker": "Requires Bluetooth BLE Omi hardware device paired and speaking live audio in physical proximity. Tested via HMAC-authenticated JSON payload in pytest."
        },
        {
            "route": "Lyzr Studio live streaming inference on exhausted external quotas",
            "external_blocker": "Requires active Lyzr Studio v3 subscription credits. Verified via schema adapter and mocked integration in CI."
        }
    ]
}

def print_inventory():
    print("=== DECISIONTRACE ROUTE CATEGORIZATION MATRIX ===")
    print(f"\n1. Browser-Tested Routes ({len(ROUTE_INVENTORY['browser_tested_routes'])} routes):")
    for r in ROUTE_INVENTORY['browser_tested_routes']:
        print(f"   * {r['route']} - {r['description']}")

    print(f"\n2. Routes Requiring Live Authentication ({len(ROUTE_INVENTORY['routes_requiring_live_authentication'])} routes):")
    for r in ROUTE_INVENTORY['routes_requiring_live_authentication']:
        print(f"   * {r['route']} [Protected: {r['protection']}] - {r['functionality']}")

    print(f"\n3. Build-Verified Routes ({len(ROUTE_INVENTORY['build_verified_routes'])} routes compiled by Next.js Turbopack):")
    for r in ROUTE_INVENTORY['build_verified_routes']:
        print(f"   * {r}")

    print(f"\n4. Routes Blocked by Unavailable External Integrations ({len(ROUTE_INVENTORY['routes_blocked_by_unavailable_external_integrations'])} routes):")
    for r in ROUTE_INVENTORY['routes_blocked_by_unavailable_external_integrations']:
        print(f"   * {r['route']}: {r['external_blocker']}")

if __name__ == "__main__":
    print_inventory()
