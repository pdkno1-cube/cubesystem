"""Audit log middleware — records all mutation requests.

Security references:
  - ARCH 5.x: Full audit logging for all state-changing operations
  - DATA-02: Filter sensitive data from audit details
  - AUDIT-01: INSERT-only enforcement (DB-side trigger)
"""

from __future__ import annotations

import logging
import time
from typing import Any
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

# HTTP methods that represent state mutations
_MUTATION_METHODS: frozenset[str] = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Fields that must never appear in audit log details
_SENSITIVE_KEYS: frozenset[str] = frozenset({
    "password",
    "secret",
    "token",
    "api_key",
    "encrypted_value",
    "vault_encryption_key",
    "authorization",
    "cookie",
})


def _sanitise_headers(headers: dict[str, str]) -> dict[str, str]:
    """Remove sensitive headers before logging."""
    return {
        k: v
        for k, v in headers.items()
        if k.lower() not in _SENSITIVE_KEYS
    }


class AuditLogMiddleware(BaseHTTPMiddleware):
    """Automatically log all mutation (POST/PUT/PATCH/DELETE) requests.

    Audit records are written via structured logging.  In a full deployment
    these logs are persisted to the Supabase ``audit_logs`` table by the
    application-level audit service (not yet implemented at skeleton stage).
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if request.method not in _MUTATION_METHODS:
            return await call_next(request)

        request_id = str(uuid4())
        start_time = time.monotonic()

        # Attempt to capture caller identity (set by auth middleware)
        user_id: str = getattr(request.state, "user_id", "anonymous")

        response: Response = await call_next(request)

        duration_ms = round((time.monotonic() - start_time) * 1000, 2)

        audit_entry: dict[str, Any] = {
            "request_id": request_id,
            "action": f"{request.method} {request.url.path}",
            "resource": request.url.path,
            "user_id": user_id,
            "ip": request.client.host if request.client else "unknown",
            "user_agent": request.headers.get("user-agent", ""),
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        }

        logger.info("AUDIT | %s", audit_entry)

        return response
