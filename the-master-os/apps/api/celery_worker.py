"""Celery worker entry point — run as a separate process.

Usage:
    celery -A celery_worker.celery_app worker --loglevel=info
    celery -A celery_worker.celery_app beat --loglevel=info

Environment variables required:
    CELERY_BROKER_URL       Redis broker URL (e.g., redis://localhost:6379/0)
    SUPABASE_URL            Supabase project URL
    SUPABASE_SERVICE_ROLE_KEY  Supabase service role key
    VAULT_ENCRYPTION_KEY    AES-256 master key (64-char hex)

Optional:
    CELERY_RESULT_BACKEND   Redis result backend (defaults to broker URL)
    SENTRY_DSN              Sentry DSN for error tracking
"""

from __future__ import annotations

import logging
import os
import sys

# Ensure the app package is importable when running from the api directory
sys.path.insert(0, os.path.dirname(__file__))

logger = logging.getLogger(__name__)

# Configure logging before anything else
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)


def create_celery_worker():  # noqa: ANN201
    """Create the Celery app for the worker process.

    Returns the Celery application instance, or raises if Celery
    cannot be initialised (broker URL is required for the worker).
    """
    broker_url = os.environ.get("CELERY_BROKER_URL", "")
    if not broker_url:
        logger.critical(
            "CELERY_BROKER_URL is not set — cannot start Celery worker"
        )
        sys.exit(1)

    try:
        from celery import Celery
    except ImportError:
        logger.critical("Celery package is not installed — pip install celery[redis]")
        sys.exit(1)

    from app.worker.config import get_celery_config

    app = Celery("the_master_os")
    config = get_celery_config()
    app.config_from_object(config)

    # Import tasks to register them
    import app.worker.tasks  # noqa: F401

    # Initialise Sentry for the worker process (if DSN is set)
    sentry_dsn = os.environ.get("SENTRY_DSN", "")
    if sentry_dsn:
        try:
            import sentry_sdk
            from sentry_sdk.integrations.celery import CeleryIntegration

            sentry_sdk.init(
                dsn=sentry_dsn,
                environment=os.environ.get("API_ENV", "development"),
                integrations=[CeleryIntegration()],
                traces_sample_rate=0.1,
                send_default_pii=False,
            )
            logger.info("Sentry initialised for Celery worker")
        except ImportError:
            logger.warning("sentry-sdk not installed — Sentry disabled for worker")

    logger.info("Celery worker initialised — broker=%s", broker_url)
    return app


# Module-level celery app instance (required by `celery -A celery_worker.celery_app`)
celery_app = create_celery_worker()
