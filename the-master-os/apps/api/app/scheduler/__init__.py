"""Vault auto-rotation scheduler — APScheduler-based background job.

Initialisation:
  Call ``init_vault_scheduler()`` during FastAPI lifespan startup to register
  the hourly vault rotation job.  The scheduler only starts when the
  ``ENABLE_SCHEDULER`` environment variable is set to ``true``.

Design:
  - Uses APScheduler's AsyncIOScheduler (shares the uvicorn event loop).
  - One job: ``vault_rotation_check`` running every 60 minutes.
  - Graceful degradation: if the scheduler fails to start, the API keeps running.
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
_ROTATION_INTERVAL_MINUTES = 60


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


async def shutdown_vault_scheduler() -> None:
    """Gracefully shutdown the vault rotation scheduler."""
    global _scheduler  # noqa: PLW0603
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        logger.info("Vault rotation scheduler stopped")
        _scheduler = None
