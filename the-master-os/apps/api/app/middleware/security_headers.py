"""Security headers middleware.

Security references:
  - P0-09: HSTS, X-Frame-Options, X-Content-Type-Options, CSP, etc.
  - A05: Security misconfiguration prevention
"""

from __future__ import annotations

import logging
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

# Header values aligned with TEAM_H security review section 11.2
_SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    # Modern browsers rely on CSP; legacy XSS-Protection header set to 0
    "X-XSS-Protection": "0",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "connect-src 'self' wss: https://*.supabase.co; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    ),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject security response headers into every HTTP response."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response: Response = await call_next(request)
        for header_name, header_value in _SECURITY_HEADERS.items():
            response.headers[header_name] = header_value
        return response
