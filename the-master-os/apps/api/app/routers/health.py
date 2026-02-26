"""Health check endpoints.

ARCH-MASTEROS-v1 section 3.2 — System endpoints:
  GET /orchestrate/health
  GET /orchestrate/health/detailed
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, status
from redis.asyncio import Redis as AsyncRedis

from app.config import get_settings
from app.schemas.common import DetailedHealthResponse, HealthResponse, ServiceStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrate", tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Basic health check",
)
async def health_check() -> HealthResponse:
    """Return basic liveness probe response."""
    return HealthResponse(
        status="healthy",
        version="0.1.0",
        timestamp=datetime.now(tz=timezone.utc),
    )


@router.get(
    "/health/detailed",
    response_model=DetailedHealthResponse,
    summary="Detailed health check with dependency statuses",
)
async def detailed_health() -> DetailedHealthResponse:
    """Probe all backend dependencies and return per-service status."""
    settings = get_settings()
    services: list[ServiceStatus] = []

    overall_status = "healthy"

    # --- Supabase connectivity ---
    try:
        start = time.monotonic()
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.supabase_url}/rest/v1/", headers={
                "apikey": settings.supabase_service_role_key,
            })
        latency = round((time.monotonic() - start) * 1000, 2)
        supa_status = "healthy" if resp.status_code < 500 else "degraded"
    except Exception as exc:
        latency = None
        supa_status = "down"
        logger.error("Supabase health probe failed: %s", exc)

    if supa_status != "healthy":
        overall_status = "degraded"
    services.append(
        ServiceStatus(name="supabase", status=supa_status, latency_ms=latency)
    )

    # --- Redis connectivity ---
    try:
        start = time.monotonic()
        redis = AsyncRedis.from_url(settings.redis_url, decode_responses=True)
        pong = await redis.ping()
        latency = round((time.monotonic() - start) * 1000, 2)
        redis_status = "healthy" if pong else "degraded"
        await redis.aclose()
    except Exception as exc:
        latency = None
        redis_status = "down"
        logger.error("Redis health probe failed: %s", exc)

    if redis_status != "healthy":
        overall_status = "degraded"
    services.append(
        ServiceStatus(name="redis", status=redis_status, latency_ms=latency)
    )

    return DetailedHealthResponse(
        status=overall_status,
        version="0.1.0",
        timestamp=datetime.now(tz=timezone.utc),
        services=services,
    )
