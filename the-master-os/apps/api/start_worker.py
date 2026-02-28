"""Start Celery worker — self-contained to avoid app/ package name conflict.

The WORKDIR is /app and the Python package is /app/app/, causing Celery CLI's
ctx.obj.app to resolve to the 'app' Python module. This script avoids the
conflict by creating the Celery instance inline and calling worker_main().
"""

from __future__ import annotations

import logging
import os
import sys

# Ensure app package is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("start_worker")

broker_url = os.environ.get("CELERY_BROKER_URL", "")
if not broker_url:
    logger.critical("CELERY_BROKER_URL is not set — cannot start Celery worker")
    sys.exit(1)

# Import Celery
from celery import Celery  # noqa: E402

# Create Celery app directly (not via celery_worker module)
worker_app = Celery("the_master_os")

# Apply configuration
from app.worker.config import get_celery_config  # noqa: E402

config = get_celery_config()
worker_app.config_from_object(config)

# Register tasks
import app.worker.tasks  # noqa: E402, F401

# Initialise Sentry if available
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
        logger.warning("sentry-sdk[celery] not installed — Sentry disabled")

logger.info("Starting Celery worker — broker=%s", broker_url)

# Start worker (bypasses celery CLI entirely)
worker_app.worker_main(
    argv=[
        "worker",
        "--loglevel=info",
        "-Q", "default,pipelines,notifications,monitoring,maintenance",
        "-B",
        "--concurrency=2",
    ]
)
