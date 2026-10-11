"""Script to execute outbox reconciliation manually or via cron/timer."""

import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.workers.reconcile import reconcile_pending_jobs

if __name__ == "__main__":
    print("Running DecisionTrace outbox reconciliation...")
    count = reconcile_pending_jobs()
    print(f"Reconciliation complete. Re-enqueued {count} jobs.")
