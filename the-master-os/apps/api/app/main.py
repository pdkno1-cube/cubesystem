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

from app.billing.cost_calculator import CostCalculator
from app.billing.credits import CreditService
from app.config import get_settings
from app.llm.client import LLMClient
from app.middleware.audit_logger import AuditLogMiddleware
from app.middleware.rate_limiter import limiter
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.pipeline import PipelineEngine
from app.routers import agents, auto_healing, document_validation, grant_factory, health, marketing, mcp_hub, pipelines
from app.scheduler import init_vault_scheduler, shutdown_vault_scheduler
from app.services.scheduler import ContentScheduler
from app.ws import ConnectionManager, ws_router

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

    # Initialise ContentScheduler (content publishing background job)
    scheduler: ContentScheduler | None = None
    try:
        from supabase._async.client import create_client as create_async_client_for_sched

        _sched_supabase = await create_async_client_for_sched(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
        scheduler = ContentScheduler(
            supabase=_sched_supabase,
            mcp_registry=app.state._mcp_registry,
            settings=settings,
        )
        await scheduler.start()
        app.state.scheduler = scheduler
    except Exception:
        logger.warning(
            "ContentScheduler failed to start — scheduled publishing disabled",
            exc_info=True,
        )

    # Initialise Vault rotation scheduler (ENABLE_SCHEDULER=true to activate)
    vault_scheduler = None
    try:
        from supabase._async.client import (
            create_client as create_async_client_for_vault,
        )

        _vault_supabase = await create_async_client_for_vault(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
        vault_scheduler = await init_vault_scheduler(_vault_supabase)
        app.state.vault_scheduler = vault_scheduler
    except Exception:
        logger.warning(
            "Vault rotation scheduler failed to start — auto-rotation disabled",
            exc_info=True,
        )

    # Initialise PipelineEngine with async Supabase client
    try:
        from supabase._async.client import create_client as create_async_client

        supabase_async = await create_async_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )

        credit_svc = CreditService(supabase_async)

        app.state.pipeline_engine = PipelineEngine(
            llm_client=app.state._llm_client,
            mcp_registry=app.state._mcp_registry,
            credit_service=credit_svc,
            cost_calculator=app.state._cost_calculator,
            ws_manager=app.state.ws_manager,
            supabase=supabase_async,
        )
        logger.info("PipelineEngine initialised successfully")
    except Exception:
        logger.warning(
            "PipelineEngine initialisation failed — pipeline endpoints will return 503",
            exc_info=True,
        )

    yield

    # --- Shutdown ---
    logger.info("Shutting down The Master OS API")
    if scheduler is not None:
        await scheduler.stop()
    await shutdown_vault_scheduler()


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
    app.state.ws_manager = ConnectionManager()

    # --- Pipeline Engine ---
    # Supabase async client is initialised lazily; import at runtime to
    # avoid hard dependency during testing.
    _supabase_client = None
    _mcp_registry = None
    try:
        from supabase._async.client import AsyncClient as _AsyncClient, create_client

        async def _init_supabase() -> _AsyncClient:
            return await create_client(
                settings.supabase_url,
                settings.supabase_service_role_key,
            )

        # MCPRegistry and SecretVault require sync Supabase client for now
        from supabase import create_client as create_sync_client

        _sync_supabase = create_sync_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )

        from app.mcp.registry import MCPRegistry
        from app.security.vault import SecretVault

        _vault = SecretVault(_sync_supabase)
        _mcp_registry = MCPRegistry(vault=_vault, supabase_client=_sync_supabase)
    except Exception:
        logger.warning(
            "Supabase/MCP initialisation deferred — "
            "PipelineEngine will be registered during lifespan startup",
            exc_info=True,
        )

    llm_client = LLMClient(settings)
    cost_calculator = CostCalculator()
    credit_service: CreditService | None = None

    # PipelineEngine will be fully initialised in the lifespan handler
    # once the async Supabase client is available.  We store partial
    # references here so the lifespan can complete the wiring.
    app.state._llm_client = llm_client
    app.state._cost_calculator = cost_calculator
    app.state._mcp_registry = _mcp_registry

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
    app.include_router(marketing.router)
    app.include_router(mcp_hub.router)
    app.include_router(auto_healing.router)
    app.include_router(document_validation.router)
    app.include_router(grant_factory.router)
    app.include_router(ws_router)

    return app


app = create_app()
