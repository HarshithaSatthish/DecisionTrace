"""Resolve relative deadline phrases against the conversation date (no LLM needed)."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone

_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def resolve_due_date(value: object, anchor: date) -> str | None:
    """Return an ISO-8601 datetime string (UTC, end of day) or None.

    Accepts ISO dates/datetimes, or phrases such as "Friday", "by Thursday",
    "next Monday", "today", "tomorrow", "end of week". A bare weekday means the
    next occurrence strictly after the conversation date unless it is the same
    day *and* said as "today". Unparseable values return None (never "today").
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, 23, 59, tzinfo=timezone.utc).isoformat()
    text = str(value).strip().lower()
    if not text:
        return None
    try:
        dt = datetime.fromisoformat(text.replace("z", "+00:00"))
        return dt.isoformat()
    except ValueError:
        pass

    def eod(d: date) -> str:
        return datetime(d.year, d.month, d.day, 23, 59, tzinfo=timezone.utc).isoformat()

    if re.search(r"\btoday\b|\btonight\b|end of (the )?day", text):
        return eod(anchor)
    if re.search(r"\btomorrow\b", text):
        return eod(anchor + timedelta(days=1))
    if re.search(r"end of (the )?week", text):
        return eod(anchor + timedelta(days=(4 - anchor.weekday()) % 7))
    for i, name in enumerate(_WEEKDAYS):
        if re.search(rf"\b{name}\b", text):
            delta = (i - anchor.weekday()) % 7
            if delta == 0:
                delta = 7
            if re.search(r"\bnext\b", text) and delta < 7:
                delta += 7 if anchor.weekday() >= i else 0
            return eod(anchor + timedelta(days=delta))
    return None
