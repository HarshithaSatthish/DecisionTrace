"""Pytest fixtures and configuration."""

import os
import sys
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set test environment
os.environ["APP_ENV"] = "test"
os.environ["AUTH_DEV_MODE"] = "True"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app.core.security import hash_webhook_token
from app.db.models import OmiIntegration, User, utc_now
from app.db.session import get_session
from app.main import app

# In-memory SQLite engine for tests
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@pytest.fixture(name="db_session", scope="function")
def fixture_db_session() -> Generator[Session, None, None]:
    """Provide clean database session with all tables created."""
    SQLModel.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        yield session
    SQLModel.metadata.drop_all(test_engine)


@pytest.fixture(name="client", scope="function")
def fixture_client(db_session: Session) -> Generator[TestClient, None, None]:
    """TestClient with dependency overrides for database session."""

    def override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(name="test_user")
def fixture_test_user(db_session: Session) -> User:
    """Fixture providing a test user."""
    user = User(
        clerk_id="user_test_harshitha_123",
        email="harshitha@decisiontrace.test",
        created_at=utc_now(),
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(name="test_integration")
def fixture_test_integration(db_session: Session, test_user: User) -> tuple[OmiIntegration, str]:
    """Fixture providing an active Omi integration and raw token."""
    raw_token = "omi_test_secret_token_12345"
    token_hash = hash_webhook_token(raw_token)
    integration = OmiIntegration(
        user_id=test_user.id,
        external_omi_uid="omi_dev_user_01",
        installation_id="inst_test_001",
        webhook_token_hash=token_hash,
        is_active=True,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db_session.add(integration)
    db_session.commit()
    db_session.refresh(integration)
    return integration, raw_token
