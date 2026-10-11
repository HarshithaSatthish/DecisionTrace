"""Simulation and smoke testing script for Omi webhook delivery."""

import argparse
import sys
import uuid
from datetime import datetime, timezone

import httpx


def generate_omi_event(event_id: str | None = None, text: str = "Prototype review moved to Thursday 2 PM") -> dict:
    eid = event_id or f"omi_mem_{uuid.uuid4()}"
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "id": eid,
        "created_at": now_iso,
        "started_at": now_iso,
        "finished_at": now_iso,
        "transcript_segments": [
            {
                "text": text,
                "speaker": "SPEAKER_00",
                "is_user": True,
                "start": 0.0,
                "end": 4.5,
            }
        ],
        "structured": {
            "title": "Autonomous Decision Capture",
            "overview": "Omi memory captured via device integration",
            "category": "work",
        },
        "discarded": False,
    }


def send_webhook(target_url: str, payload: dict) -> httpx.Response:
    print(f"Sending Omi event '{payload['id']}' to: {target_url}...")
    with httpx.Client(timeout=10.0) as client:
        return client.post(target_url, json=payload)


def main():
    parser = argparse.ArgumentParser(description="Test Omi Webhook Ingestion")
    parser.add_argument("--url", required=True, help="Full webhook URL e.g. http://127.0.0.1:8000/api/v1/webhooks/omi/<TOKEN>")
    parser.add_argument("--text", default="The prototype review moved to Thursday 2 PM", help="Transcript text")
    parser.add_argument("--test-dedup", action="store_true", help="Send duplicate delivery to test idempotency")
    args = parser.parse_args()

    payload = generate_omi_event(text=args.text)

    # 1. First delivery
    resp = send_webhook(args.url, payload)
    print(f"Response Status: {resp.status_code}")
    print(f"Response Body: {resp.text}")

    if resp.status_code != 202:
        print("Delivery failed!")
        sys.exit(1)

    print("Delivery 1 successfully accepted and queued.")

    # 2. Duplicate test
    if args.test_dedup:
        print("\nSending identical delivery to test deduplication...")
        resp2 = send_webhook(args.url, payload)
        print(f"Response Status: {resp2.status_code}")
        print(f"Response Body: {resp2.text}")
        if resp2.status_code == 200 and "duplicate" in resp2.text:
            print("Deduplication successfully verified: Exactly one job queued.")
        else:
            print("Deduplication check failed.")
            sys.exit(1)


if __name__ == "__main__":
    main()
