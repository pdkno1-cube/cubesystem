"""Background schedulers — vault rotation + health monitor.

Initialisation:
  Call ``init_vault_scheduler()`` and ``init_health_monitor()`` during
  FastAPI lifespan startup.  Both schedulers only start when the
  ``ENABLE_SCHEDULER`` environment variable is set to ``true``.

Design:
  - Uses APScheduler's AsyncIOScheduler (shares the uvicorn event loop).
  - Jobs:
    - ``vault_rotation_check`` — every 60 minutes
    - ``health_monitor_check`` — every 5 minutes
  - Graceful degradation: if a scheduler fails to start, the API keeps running.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

from apscheduler.schedulers.asyncio import AsyncIOScheduler

if TYPE_CHECKING:
    from supabase._async.client import AsyncClient as SupabaseAsyncClient

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None
_health_scheduler: AsyncIOScheduler | None = None
_ROTATION_INTERVAL_MINUTES = 60
_HEALTH_CHECK_INTERVAL_MINUTES = 5


async def init_vault_scheduler(supabase: SupabaseAsyncClient) -> AsyncIOScheduler | None:
    """Create and start the vault rotation scheduler.

    Returns the scheduler instance (for shutdown) or ``None`` when disabled.
    """
    global _scheduler  # noqa: PLW0603

    enabled = os.environ.get("ENABLE_SCHEDULER", "false").lower() == "true"
    if not enabled:
        logger.info("Vault rotation scheduler disabled (ENABLE_SCHEDULER != true)")
        return None

    from app.scheduler.vault_rotation import run_vault_rotation

    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        run_vault_rotation,
        trigger="interval",
        minutes=_ROTATION_INTERVAL_MINUTES,
        id="vault_rotation_check",
        max_instances=1,
        replace_existing=True,
        misfire_grace_time=120,
        kwargs={"supabase": supabase},
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info(
        "Vault rotation scheduler started — interval=%dm",
        _ROTATION_INTERVAL_MINUTES,
    )
    return scheduler


async def init_health_monitor(
    supabase: SupabaseAsyncClient,
    supabase_url: str,
    supabase_key: str,
) -> AsyncIOScheduler | None:
    """Create and start the health monitor scheduler.

    Checks Supabase and MCP providers every 5 minutes, creating
    healing incidents on failure detection.

    Returns the scheduler instance (for shutdown) or ``None`` when disabled.
    """
    global _health_scheduler  # noqa: PLW0603

    enabled = os.environ.get("ENABLE_SCHEDULER", "false").lower() == "true"
    if not enabled:
        logger.info("Health monitor scheduler disabled (ENABLE_SCHEDULER != true)")
        return None

    from app.scheduler.health_monitor import run_health_monitor

    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        run_health_monitor,
        trigger="interval",
        minutes=_HEALTH_CHECK_INTERVAL_MINUTES,
        id="health_monitor_check",
        max_instances=1,
        replace_existing=True,
        misfire_grace_time=60,
        kwargs={
            "supabase": supabase,
            "supabase_url": supabase_url,
            "supabase_key": supabase_key,
        },
    )
    scheduler.start()
    _health_scheduler = scheduler
    logger.info(
        "Health monitor scheduler started — interval=%dm",
        _HEALTH_CHECK_INTERVAL_MINUTES,
    )
    return scheduler


async def shutdown_vault_scheduler() -> None:
    """Gracefully shutdown the vault rotation scheduler."""
    global _scheduler  # noqa: PLW0603
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        logger.info("Vault rotation scheduler stopped")
        _scheduler = None


async def shutdown_health_monitor() -> None:
    """Gracefully shutdown the health monitor scheduler."""
    global _health_scheduler  # noqa: PLW0603
    if _health_scheduler is not None:
        _health_scheduler.shutdown(wait=False)
        logger.info("Health monitor scheduler stopped")
        _health_scheduler = None
