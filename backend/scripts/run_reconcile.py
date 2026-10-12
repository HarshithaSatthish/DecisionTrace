"""Script to execute outbox reconciliation manually or via recurring daemon/cron."""

import argparse
import os
import sys
import time

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.workers.reconcile import reconcile_pending_jobs

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DecisionTrace Outbox Reconciler")
    parser.add_argument(
        "--loop", action="store_true", help="Run continuously in a recurring background loop"
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=60,
        help="Interval in seconds between reconciliation cycles in loop mode (default: 60s)",
    )
    args = parser.parse_args()

    if args.loop:
        print(f"Starting DecisionTrace recurring reconciler daemon (interval: {args.interval}s)...")
        while True:
            try:
                count = reconcile_pending_jobs()
                if count > 0:
                    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Reconciled {count} jobs.")
            except Exception as e:
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Reconciliation error: {e}", file=sys.stderr)
            time.sleep(args.interval)
    else:
        print("Running DecisionTrace one-shot outbox reconciliation...")
        count = reconcile_pending_jobs()
        print(f"Reconciliation complete. Re-enqueued {count} jobs.")
