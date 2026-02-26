"""JWT authentication middleware and dependency.

Security references:
  - AUTH-01: JWT verification with Supabase JWT secret
  - ARCH 3.2: Bearer JWT + internal API key dual auth
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=True)


class AuthenticatedUser:
    """Represents a verified user extracted from JWT claims."""

    __slots__ = ("user_id", "email", "role", "workspace_ids", "raw_claims")

    def __init__(
        self,
        user_id: str,
        email: str,
        role: str,
        workspace_ids: list[str],
        raw_claims: dict[str, Any],
    ) -> None:
        self.user_id = user_id
        self.email = email
        self.role = role
        self.workspace_ids = workspace_ids
        self.raw_claims = raw_claims


def _decode_jwt(token: str, settings: Settings) -> dict[str, Any]:
    """Decode and verify a Supabase-issued JWT.

    Raises HTTPException(401) on any failure.
    """
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require_exp": True, "require_sub": True},
        )
    except JWTError as exc:
        logger.warning("JWT verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "JWT verification failed"},
        ) from exc

    # Check expiry explicitly (belt-and-suspenders)
    exp = payload.get("exp")
    if exp is not None and datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(
        tz=timezone.utc
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_EXPIRED", "message": "Access token has expired"},
        )

    return payload


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser:
    """FastAPI dependency that extracts and verifies the current user from JWT.

    Usage:
        @router.get("/protected")
        async def protected_route(user: AuthenticatedUser = Depends(get_current_user)):
            ...
    """
    payload = _decode_jwt(credentials.credentials, settings)

    user = AuthenticatedUser(
        user_id=payload.get("sub", ""),
        email=payload.get("email", ""),
        role=payload.get("role", "viewer"),
        workspace_ids=payload.get("workspace_ids", []),
        raw_claims=payload,
    )

    # Inject into request.state for downstream middleware (e.g., audit logger)
    request.state.user_id = user.user_id
    request.state.user_email = user.email

    return user


def require_role(*allowed_roles: str):  # noqa: ANN201
    """Dependency factory that enforces RBAC role checks.

    Usage:
        @router.post("/admin-only", dependencies=[Depends(require_role("owner", "admin"))])
    """

    async def _check(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if user.role not in allowed_roles:
            logger.warning(
                "Access denied: user=%s role=%s required=%s",
                user.user_id,
                user.role,
                allowed_roles,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "INSUFFICIENT_PERMISSIONS",
                    "message": f"Required role: {', '.join(allowed_roles)}",
                },
            )
        return user

    return _check
