"""Celery configuration — broker, result backend, and beat schedule.

All URLs are read from environment variables with sensible defaults.
The beat schedule registers periodic tasks that Celery Beat will execute.

Environment variables:
  - ``CELERY_BROKER_URL``: Redis broker URL (required for Celery to activate)
  - ``CELERY_RESULT_BACKEND``: Redis result backend URL (defaults to broker URL)
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


class CeleryConfig:
    """Celery configuration object — passed to ``app.config_from_object()``."""

    def __init__(self) -> None:
        broker_url = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
        result_backend = os.environ.get("CELERY_RESULT_BACKEND", broker_url)

        # --- Core ---
        self.broker_url: str = broker_url
        self.result_backend: str = result_backend
        self.task_serializer: str = "json"
        self.result_serializer: str = "json"
        self.accept_content: list[str] = ["json"]
        self.timezone: str = "UTC"
        self.enable_utc: bool = True

        # --- Task behaviour ---
        self.task_track_started: bool = True
        self.task_acks_late: bool = True  # re-deliver if worker dies mid-task
        self.worker_prefetch_multiplier: int = 1  # one task at a time per worker
        self.task_soft_time_limit: int = 300  # 5 minutes soft limit
        self.task_time_limit: int = 600  # 10 minutes hard limit
        self.task_reject_on_worker_lost: bool = True

        # --- Result expiry ---
        self.result_expires: int = 3600  # 1 hour

        # --- Beat schedule ---
        self.beat_schedule: dict[str, Any] = {
            "vault-rotation-hourly": {
                "task": "app.worker.tasks.run_vault_rotation_task",
                "schedule": 3600.0,  # every 60 minutes
                "options": {"queue": "maintenance"},
            },
            "health-check-periodic": {
                "task": "app.worker.tasks.run_health_check",
                "schedule": 60.0,  # every 60 seconds
                "options": {"queue": "monitoring"},
            },
            "cleanup-old-audit-logs-daily": {
                "task": "app.worker.tasks.cleanup_old_audit_logs",
                "schedule": 86400.0,  # every 24 hours
                "options": {"queue": "maintenance"},
            },
        }

        # --- Queues ---
        self.task_default_queue: str = "default"
        self.task_routes: dict[str, dict[str, str]] = {
            "app.worker.tasks.execute_pipeline_async": {"queue": "pipelines"},
            "app.worker.tasks.send_notification": {"queue": "notifications"},
            "app.worker.tasks.run_health_check": {"queue": "monitoring"},
            "app.worker.tasks.run_vault_rotation_task": {"queue": "maintenance"},
            "app.worker.tasks.cleanup_old_audit_logs": {"queue": "maintenance"},
        }


_config: CeleryConfig | None = None


def get_celery_config() -> CeleryConfig:
    """Return a cached singleton of the Celery configuration."""
    global _config  # noqa: PLW0603
    if _config is None:
        _config = CeleryConfig()
    return _config
