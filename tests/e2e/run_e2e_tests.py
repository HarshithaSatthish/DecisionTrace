#!/usr/bin/env python3
"""
DecisionTrace — Automated E2E Browser Test Suite
Tests public routes, responsive viewports, and verifies server-side authentication redirects.
"""
import sys
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:3000"

PUBLIC_ROUTES = [
    {"path": "/auth/sign-in", "name": "Auth Sign In"},
    {"path": "/auth/sign-up", "name": "Auth Sign Up"},
    {"path": "/sign-in", "name": "Root Sign In"},
    {"path": "/sign-up", "name": "Root Sign Up"},
    {"path": "/non-existent-page-404", "name": "Custom 404"}
]

PROTECTED_DASHBOARD_ROUTES = [
    "/dashboard/overview",
    "/dashboard/decisions",
    "/dashboard/commitments",
    "/dashboard/conflicts",
    "/dashboard/approvals",
    "/dashboard/activity"
]

VIEWPORTS = [
    {"name": "mobile_320", "width": 320, "height": 640},
    {"name": "mobile_390", "width": 390, "height": 844},
    {"name": "tablet_768", "width": 768, "height": 1024},
    {"name": "desktop_1440", "width": 1440, "height": 900}
]

def check_server():
    try:
        urlopen(f"{BASE_URL}/api/decision-trace/health", timeout=3)
        return True
    except Exception:
        try:
            urlopen(f"{BASE_URL}/", timeout=3)
            return True
        except Exception:
            return False

def run_tests():
    print("=== DECISIONTRACE AUTOMATED E2E BROWSER TEST SUITE ===")
    if not check_server():
        print(f"ERROR: Local server is not reachable at {BASE_URL}.")
        print("Please ensure 'bun run start' or 'bun run dev' is running before executing browser tests.")
        sys.exit(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        
        # Test 1: Public route rendering & overflow tests
        print("\n[Phase 1] Testing public routes across 4 viewports for horizontal overflow...")
        for route in PUBLIC_ROUTES:
            for vp in VIEWPORTS:
                page = browser.new_page(viewport={"width": vp["width"], "height": vp["height"]})
                url = f"{BASE_URL}{route['path']}"
                res = page.goto(url, wait_until="domcontentloaded")
                page.wait_for_timeout(300)

                scroll_w = page.evaluate("document.documentElement.scrollWidth")
                inner_w = page.evaluate("window.innerWidth")
                has_overflow = scroll_w > inner_w
                status = "PASS" if not has_overflow else "FAIL (Overflow)"
                print(f"  [{status}] {route['name']} @ {vp['name']} ({vp['width']}px): scrollWidth={scroll_w}, innerWidth={inner_w}")
                assert not has_overflow, f"Horizontal overflow detected on {route['path']} at {vp['width']}px"
                page.close()

        # Test 2: Unauthenticated protection enforcement on /dashboard routes
        print("\n[Phase 2] Verifying unauthenticated /dashboard access is rejected/redirected...")
        for prot_path in PROTECTED_DASHBOARD_ROUTES:
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            url = f"{BASE_URL}{prot_path}"
            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_timeout(600)

            final_url = page.url
            # Must redirect away from /dashboard to sign-in or Clerk authentication URL
            is_protected = ("/sign-in" in final_url) or ("/auth/sign-in" in final_url) or ("clerk" in final_url)
            print(f"  Access {prot_path} => Final URL: {final_url}")
            print(f"  [PASS] Unauthenticated access blocked: {is_protected}")
            assert is_protected, f"Security Breach: Unauthenticated user accessed {prot_path} without redirection!"
            page.close()

        # Test 3: Interactive 404 recovery
        print("\n[Phase 3] Testing 404 recovery buttons...")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(f"{BASE_URL}/unknown-audit-test-route")
        page.wait_for_timeout(400)
        return_btn = page.get_by_role("button", name="Return to Overview")
        if return_btn.count() > 0:
            return_btn.click()
            page.wait_for_timeout(600)
            print(f"  404 'Return to Overview' clicked => Current URL: {page.url}")
            # Without session, should navigate toward overview or be redirected to sign-in
            assert ("/dashboard/overview" in page.url or "sign-in" in page.url), "404 button navigation failed"
        page.close()

        # Test 4: Brand logo navigation on Auth view
        print("\n[Phase 4] Verifying brand logo navigation on sign-in screen...")
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(f"{BASE_URL}/auth/sign-in")
        page.wait_for_timeout(400)
        logo_link = page.locator("a[href='/dashboard/overview']").first
        assert logo_link.count() > 0, "Brand logo link to /dashboard/overview not found on sign-in view"
        print("  [PASS] Brand logo links to /dashboard/overview")
        page.close()

        browser.close()

    print("\n=== ALL E2E BROWSER TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    run_tests()
