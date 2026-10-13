"""Main FastAPI Application Entrypoint for DecisionTrace."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    activity,
    approvals,
    conversations,
    decisions,
    findings,
    health,
    integrations,
    omi_webhook,
)
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import init_db

setup_logging()
logger = logging.getLogger("decisiontrace")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing DecisionTrace Backend...")
    # Initialize database tables
    try:
        init_db()
        logger.info("Database initialized successfully.")
    except Exception as e:
        logger.error(f"Error during database initialization: {e}")
    yield
    logger.info("Shutting down DecisionTrace Backend...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Autonomous Decision & Commitment Guardian Backend",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Unauthenticated Health probes (accessible at /health, /ready, /api/v1/health, /api/v1/ready)
app.include_router(health.router)
app.include_router(health.router, prefix=settings.API_V1_STR)

# Versioned API Routers (Canonical /api/v1/...)
app.include_router(omi_webhook.router, prefix=settings.API_V1_STR)
app.include_router(integrations.router, prefix=settings.API_V1_STR)
app.include_router(conversations.router, prefix=settings.API_V1_STR)
app.include_router(decisions.router, prefix=settings.API_V1_STR)
app.include_router(findings.router, prefix=settings.API_V1_STR)
app.include_router(approvals.router, prefix=settings.API_V1_STR)
app.include_router(activity.router, prefix=settings.API_V1_STR)

# Root-level aliases for deployment URL flexibility
app.include_router(integrations.router)
app.include_router(conversations.router)
app.include_router(decisions.router)
app.include_router(findings.router)
app.include_router(approvals.router)
app.include_router(activity.router)


@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/health",
    }
