"""FastAPI application entry-point for The Master OS Orchestration Engine.

Security references:
  - P0-08: docs/redoc disabled in production
  - P0-07: CORS production validation
  - P0-09: Security headers middleware
  - P0-11: API_DEBUG default false
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from app.config import get_settings
from app.middleware.audit_logger import AuditLogMiddleware
from app.middleware.rate_limiter import limiter
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routers import agents, health, pipelines

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and shutdown lifecycle."""
    settings = get_settings()

    # --- Startup ---
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )
    logger.info(
        "Starting The Master OS API — env=%s, debug=%s",
        settings.api_env,
        settings.api_debug,
    )

    # P0-07: Validate CORS in production
    settings.validate_production_cors()

    # Sentry initialisation (no-op when DSN is empty)
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.sentry_environment,
            traces_sample_rate=settings.sentry_traces_sample_rate,
            integrations=[
                StarletteIntegration(transaction_style="endpoint"),
                FastApiIntegration(transaction_style="endpoint"),
            ],
            send_default_pii=False,
        )
        logger.info("Sentry initialised (env=%s)", settings.sentry_environment)

    yield

    # --- Shutdown ---
    logger.info("Shutting down The Master OS API")


def create_app() -> FastAPI:
    """Application factory."""
    settings = get_settings()

    # P0-08: Disable docs/redoc/openapi in production
    is_prod = settings.api_env == "production"

    app = FastAPI(
        title="The Master OS — Orchestration Engine",
        description="Agent orchestration & pipeline execution engine",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if is_prod else "/docs",
        redoc_url=None if is_prod else "/redoc",
        openapi_url=None if is_prod else "/openapi.json",
    )

    # --- State ---
    app.state.limiter = limiter

    # --- Middleware (executed bottom-to-top) ---

    # 1. CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.api_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "Accept"],
    )

    # 2. Security headers (P0-09)
    app.add_middleware(SecurityHeadersMiddleware)

    # 3. Audit logging for mutation requests
    app.add_middleware(AuditLogMiddleware)

    # --- Routers ---
    app.include_router(health.router)
    app.include_router(pipelines.router)
    app.include_router(agents.router)

    return app


app = create_app()
