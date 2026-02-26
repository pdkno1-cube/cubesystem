"""Rate limiting middleware using slowapi.

Security references:
  - API-01 / P1-04: FastAPI internal rate limiting
  - Auth brute-force protection: 10 req/min on auth routes
  - Pipeline execution protection: 5 req/min
"""

from __future__ import annotations

import logging

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

logger = logging.getLogger(__name__)


def _key_func(request: Request) -> str:
    """Extract rate-limit key from request (IP-based fallback)."""
    # Prefer authenticated user id if available
    user: object | None = getattr(request.state, "user_id", None)
    if user is not None:
        return str(user)
    return get_remote_address(request)


# Global limiter instance — attach to app.state in main.py
limiter = Limiter(key_func=_key_func, default_limits=["100/minute"])

# ---------------------------------------------------------------------------
# Pre-built rate limit strings for use as decorators on route handlers
# ---------------------------------------------------------------------------

# Default: loaded from settings at startup (100/min)
RATE_DEFAULT: str = "100/minute"

# Auth routes: strict limit to prevent brute-force (P0-10 related)
RATE_AUTH: str = "10/minute"

# Pipeline execution: heavy operation
RATE_PIPELINE_EXECUTE: str = "5/minute"
