"""Tests for user repository idempotent creation and concurrent race recovery."""

import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, create_engine, select

from app.db.models import User
from app.db.repository import get_or_create_user


def test_get_or_create_user_idempotent(db_session: Session):
    """Verify that get_or_create_user is strictly idempotent within and across calls."""
    clerk_id = f"user_idempotent_{uuid.uuid4().hex[:8]}"
    email = "test_idempotent@decisiontrace.test"

    # First call: creates user
    user1 = get_or_create_user(db_session, clerk_id=clerk_id, email=email)
    assert user1 is not None
    assert user1.clerk_id == clerk_id
    assert user1.email == email
    first_id = user1.id

    # Second call on same session: retrieves existing user without creating a duplicate
    user2 = get_or_create_user(db_session, clerk_id=clerk_id, email=email)
    assert user2.id == first_id
    assert user2.clerk_id == clerk_id

    # Verify database has exactly 1 row
    users = db_session.exec(select(User).where(User.clerk_id == clerk_id)).all()
    assert len(users) == 1
    assert users[0].id == first_id


def test_get_or_create_user_unrelated_integrity_error_raised(db_session: Session, monkeypatch):
    """Verify that unrelated database errors (where the user does not exist) are never swallowed."""
    clerk_id = f"user_unrelated_error_{uuid.uuid4().hex[:8]}"

    # Simulate an IntegrityError occurring during flush where user is not found in database
    def mock_flush_fail():
        raise IntegrityError("simulated non-clerk-conflict failure", orig=Exception("foreign key or check constraint failure"), params={})

    # When flush fails and the user doesn't exist, get_or_create_user must re-raise
    with pytest.raises(IntegrityError):
        # We invoke get_or_create_user in a context where flush raises IntegrityError
        class FailingSession:
            def __init__(self, real_session):
                self._real = real_session

            def exec(self, statement):
                return self._real.exec(statement)

            def begin_nested(self):
                class MockSavepoint:
                    def __enter__(self_inner):
                        return self_inner
                    def __exit__(self_inner, exc_type, exc_val, exc_tb):
                        # Simulates savepoint rollback
                        return False
                return MockSavepoint()

            def add(self, entity):
                pass

            def flush(self):
                raise IntegrityError("simulated failure", orig=Exception("check constraint"), params={})

        failing_session = FailingSession(db_session)
        get_or_create_user(failing_session, clerk_id=clerk_id, email="fail@test.local")


def test_six_concurrent_first_login_requests_with_real_postgresql():
    """Verify atomic recovery when six concurrent first-login requests create the same Clerk user.

    Simulates multiple simultaneous initial dashboard requests hitting the backend
    at the exact same microsecond using independent PostgreSQL sessions.
    PostgreSQL UniqueViolation on ix_users_clerk_id is caught, recovered via SAVEPOINT,
    and all six callers receive the single canonical User record.
    """
    pg_url = os.getenv("POSTGRES_TEST_URL")
    if not pg_url:
        pytest.skip("Set POSTGRES_TEST_URL to an isolated PostgreSQL test database.")
    try:
        pg_engine = create_engine(pg_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
        with pg_engine.connect():
            pass
    except Exception as e:
        pytest.skip(
            f"Live PostgreSQL database not reachable ({e}). "
            "Ensure PostgreSQL is running on port 5432 or set POSTGRES_TEST_URL."
        )

    # Ensure PostgreSQL schema is up to date
    SQLModel.metadata.create_all(pg_engine)

    target_clerk_id = f"user_race_6x_{uuid.uuid4().hex[:10]}"
    target_email = f"{target_clerk_id}@decisiontrace.test"

    # Confirm user does not exist initially in PostgreSQL
    with Session(pg_engine) as check_session:
        existing = check_session.exec(select(User).where(User.clerk_id == target_clerk_id)).first()
        assert existing is None, "Test precondition failed: user already exists"

    concurrency = 6
    start_barrier = threading.Barrier(concurrency)
    results: list[dict] = []
    errors: list[Exception] = []

    def _first_login_worker(worker_idx: int):
        # Each worker represents an independent dashboard request with its own PostgreSQL session
        try:
            with Session(pg_engine) as thread_session:
                # Synchronize all 6 threads so they attempt creation simultaneously
                start_barrier.wait(timeout=10)
                user = get_or_create_user(thread_session, clerk_id=target_clerk_id, email=target_email)
                results.append({
                    "worker": worker_idx,
                    "user_id": str(user.id),
                    "clerk_id": user.clerk_id,
                    "email": user.email,
                })
        except Exception as exc:
            errors.append(exc)

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(_first_login_worker, i) for i in range(concurrency)]
        for f in futures:
            f.result()

    # All six concurrent requests must succeed without any exceptions or UniqueViolation errors
    assert len(errors) == 0, f"Concurrent workers encountered errors: {errors}"
    assert len(results) == concurrency, f"Expected {concurrency} successful results, got {len(results)}"

    # All six requests must resolve to the EXACT SAME user record ID
    canonical_user_id = results[0]["user_id"]
    for r in results:
        assert r["user_id"] == canonical_user_id, f"Worker {r['worker']} got divergent user_id {r['user_id']} vs {canonical_user_id}"
        assert r["clerk_id"] == target_clerk_id

    # Verify the authoritative PostgreSQL state: exactly ONE user record exists
    with Session(pg_engine) as verify_session:
        all_users = verify_session.exec(select(User).where(User.clerk_id == target_clerk_id)).all()
        assert len(all_users) == 1, f"Expected exactly 1 user in PostgreSQL, found {len(all_users)}"
        assert str(all_users[0].id) == canonical_user_id
        assert all_users[0].clerk_id == target_clerk_id

    # Subsequent request on a new session also returns the canonical user
    with Session(pg_engine) as subsequent_session:
        subsequent_user = get_or_create_user(subsequent_session, clerk_id=target_clerk_id)
        assert str(subsequent_user.id) == canonical_user_id
