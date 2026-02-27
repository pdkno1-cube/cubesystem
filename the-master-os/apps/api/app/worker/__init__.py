"""Celery worker initialisation — optional async task infrastructure.

The Celery app is only created when ``CELERY_BROKER_URL`` is set in the
environment.  Without it, all task invocations fall back to synchronous
in-process execution (graceful degradation).

Usage:
    from app.worker import celery_app, is_celery_available

    if is_celery_available():
        celery_app.send_task("app.worker.tasks.execute_pipeline_async", ...)
    else:
        # run synchronously
        ...
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# Sentinel — set after successful Celery initialisation
_celery_app: object | None = None


def _create_celery_app() -> object | None:
    """Create and configure the Celery application.

    Returns ``None`` if ``CELERY_BROKER_URL`` is not set or Celery
    cannot be imported.
    """
    broker_url = os.environ.get("CELERY_BROKER_URL", "")
    if not broker_url:
        logger.info(
            "Celery disabled — CELERY_BROKER_URL not set; tasks will run synchronously"
        )
        return None

    try:
        from celery import Celery

        app = Celery("the_master_os")

        # Apply configuration from the worker config module
        from app.worker.config import get_celery_config

        config = get_celery_config()
        app.config_from_object(config)

        # Auto-discover tasks in app.worker.tasks
        app.autodiscover_tasks(["app.worker"])

        logger.info("Celery app created — broker=%s", broker_url)
        return app
    except ImportError:
        logger.warning(
            "Celery package not installed — tasks will run synchronously",
            exc_info=True,
        )
        return None
    except Exception:
        logger.warning(
            "Celery initialisation failed — tasks will run synchronously",
            exc_info=True,
        )
        return None


def get_celery_app() -> object | None:
    """Return the Celery app singleton (lazy-initialised)."""
    global _celery_app  # noqa: PLW0603
    if _celery_app is None:
        _celery_app = _create_celery_app()
    return _celery_app


def is_celery_available() -> bool:
    """Check whether Celery is configured and available."""
    return get_celery_app() is not None


# Convenience alias
celery_app = get_celery_app()
