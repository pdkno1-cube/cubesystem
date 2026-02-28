"""Start Celery worker programmatically — avoids CLI `-A` module name conflicts.

The `/app/app/` Python package conflicts with Celery's internal `ctx.obj.app`
attribute when using the CLI `celery -A` flag. This script starts the worker
directly via the Celery API.
"""

from __future__ import annotations

import sys
import os

# Ensure app package is importable
sys.path.insert(0, os.path.dirname(__file__))

from celery_worker import celery_app  # noqa: E402

if __name__ == "__main__":
    celery_app.worker_main(
        argv=[
            "worker",
            "--loglevel=info",
            "-Q", "default,pipelines,notifications,monitoring,maintenance",
            "-B",
            "--concurrency=2",
        ]
    )
