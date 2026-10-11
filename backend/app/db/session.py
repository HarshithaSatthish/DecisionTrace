"""Database session and connection management."""

from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlmodel import Session, SQLModel

from app.core.config import settings


def normalize_database_url(url: str) -> str:
    """Normalize PostgreSQL connection URLs for SQLAlchemy + psycopg driver."""
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://") and not url.startswith("postgresql+"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


engine_url = normalize_database_url(settings.DATABASE_URL)
engine_kwargs = {"echo": False, "pool_pre_ping": True}
if engine_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

engine = create_engine(engine_url, **engine_kwargs)


def init_db():
    """Create all tables in database if not created."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency for database session."""
    with Session(engine) as session:
        yield session


@contextmanager
def get_session_context() -> Generator[Session, None, None]:
    """Context manager for standalone jobs, worker processes, and scripts."""
    with Session(engine) as session:
        yield session
