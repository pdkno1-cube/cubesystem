"""MCP Integration Hub router — manage provider connections and run health checks.

Endpoints:
  GET    /orchestrate/mcp/providers                List available providers + connection status
  POST   /orchestrate/mcp/connections              Create/activate a connection
  DELETE /orchestrate/mcp/connections/{id}         Soft-delete a connection
  POST   /orchestrate/mcp/test/{provider}          Run health check and update status

Design:
  - Connections link a secret_vault row (by ID) to a provider for a workspace.
  - One active connection per (workspace, provider) — upsert on conflict.
  - Health check calls MCPRegistry.health_check() and persists the result.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.schemas.common import BaseResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrate/mcp", tags=["mcp-hub"])

# ---------------------------------------------------------------------------
# Provider catalogue — static metadata for the UI
# ---------------------------------------------------------------------------

_PROVIDER_META: dict[str, dict[str, str]] = {
    "resend": {
        "label": "Resend",
        "description": "이메일 뉴스레터 & 트랜잭션 이메일 발송",
        "icon": "mail",
        "doc_url": "https://resend.com/docs",
        "required_secret": "API Key (re_...)",
    },
    "google_drive": {
        "label": "Google Drive",
        "description": "파이프라인 결과물 자동 저장 & 공유",
        "icon": "hard-drive",
        "doc_url": "https://developers.google.com/drive",
        "required_secret": "Service Account JSON",
    },
    "slack": {
        "label": "Slack",
        "description": "파이프라인 완료 & 에러 Slack 알림",
        "icon": "message-circle",
        "doc_url": "https://api.slack.com/",
        "required_secret": "Bot User OAuth Token (xoxb-...)",
    },
    "firecrawl": {
        "label": "FireCrawl",
        "description": "웹 스크래핑 & 콘텐츠 추출",
        "icon": "globe",
        "doc_url": "https://www.firecrawl.dev/",
        "required_secret": "API Key (fc-...)",
    },
    "paddleocr": {
        "label": "PaddleOCR",
        "description": "PDF/이미지 문서 텍스트 추출",
        "icon": "file-scan",
        "doc_url": "https://paddlepaddle.github.io/PaddleOCR/",
        "required_secret": "Endpoint URL (또는 로컬 실행)",
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _supabase_client(settings: Settings):  # noqa: ANN202
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _mcp_registry(settings: Settings):  # noqa: ANN202
    from supabase import create_client

    from app.mcp.registry import MCPRegistry
    from app.security.vault import SecretVault

    sb = create_client(settings.supabase_url, settings.supabase_service_role_key)
    vault = SecretVault(sb)
    return MCPRegistry(vault=vault, supabase_client=sb)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ProviderStatus(BaseModel):
    provider: str
    label: str
    description: str
    icon: str
    doc_url: str
    required_secret: str
    connection_id: str | None
    secret_ref: str | None       # vault ID (no value exposed)
    health_status: str           # healthy | degraded | down | unknown | not_connected
    last_health_check: datetime | None
    test_result: dict[str, object] | None
    is_connected: bool


class ConnectionCreate(BaseModel):
    workspace_id: str
    provider: Literal["resend", "google_drive", "slack", "firecrawl", "paddleocr"]
    secret_ref: str = Field(..., description="UUID of the secret_vault row")
    name: str = Field(..., min_length=1, max_length=100)
    endpoint_url: str = Field(default="")
    config: dict[str, object] = Field(default_factory=dict)


class ConnectionResponse(BaseModel):
    id: str
    workspace_id: str
    provider: str
    name: str
    health_status: str
    is_active: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# GET /orchestrate/mcp/providers
# ---------------------------------------------------------------------------


@router.get(
    "/providers",
    response_model=BaseResponse[list[ProviderStatus]],
    summary="List MCP providers + connection status for a workspace",
)
async def list_providers(
    workspace_id: str = Query(...),
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[list[ProviderStatus]]:
    """Return all known MCP providers with their current connection status."""
    sb = _supabase_client(settings)

    conn_result = (
        sb.table("mcp_connections")
        .select(
            "id, provider, secret_ref, health_status, last_health_check, test_result, is_active"
        )
        .eq("workspace_id", workspace_id)
        .eq("is_active", True)
        .is_("deleted_at", "null")
        .execute()
    )

    # Index by provider for O(1) lookup
    connections: dict[str, dict[str, object]] = {}
    for row in conn_result.data or []:
        connections[str(row["provider"])] = row

    statuses: list[ProviderStatus] = []
    for provider_key, meta in _PROVIDER_META.items():
        conn = connections.get(provider_key)
        statuses.append(
            ProviderStatus(
                provider=provider_key,
                label=meta["label"],
                description=meta["description"],
                icon=meta["icon"],
                doc_url=meta["doc_url"],
                required_secret=meta["required_secret"],
                connection_id=str(conn["id"]) if conn else None,
                secret_ref=str(conn["secret_ref"]) if conn and conn.get("secret_ref") else None,
                health_status=str(conn["health_status"]) if conn else "not_connected",
                last_health_check=(
                    datetime.fromisoformat(str(conn["last_health_check"]))
                    if conn and conn.get("last_health_check")
                    else None
                ),
                test_result=conn.get("test_result") if conn else None,  # type: ignore[arg-type]
                is_connected=conn is not None,
            )
        )

    return BaseResponse(data=statuses)


# ---------------------------------------------------------------------------
# POST /orchestrate/mcp/connections
# ---------------------------------------------------------------------------


@router.post(
    "/connections",
    response_model=BaseResponse[ConnectionResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create or reactivate an MCP connection",
)
async def create_connection(
    body: ConnectionCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[ConnectionResponse]:
    """Link a vault secret to an MCP provider for a workspace.

    Uses upsert on (workspace_id, provider) so re-connecting a provider
    updates the existing row rather than creating a duplicate.
    """
    sb = _supabase_client(settings)

    # Verify the secret exists in this workspace
    secret_check = (
        sb.table("secret_vault")
        .select("id")
        .eq("id", body.secret_ref)
        .eq("workspace_id", body.workspace_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if not secret_check.data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "SECRET_NOT_FOUND",
                "message": (
                    f"Secret (id={body.secret_ref}) not found in workspace "
                    f"'{body.workspace_id}'."
                ),
            },
        )

    slug = f"{body.provider}-{body.workspace_id[:8]}"
    row = {
        "workspace_id": body.workspace_id,
        "name": body.name,
        "slug": slug,
        "service_name": body.provider,
        "service_type": "external",
        "provider": body.provider,
        "endpoint_url": body.endpoint_url or "",
        "config": body.config,
        "auth_method": "api_key",
        "secret_ref": body.secret_ref,
        "status": "active",
        "health_status": "unknown",
        "is_active": True,
        "deleted_at": None,
        "created_by": user.user_id,
    }

    result = (
        sb.table("mcp_connections")
        .upsert(row, on_conflict="workspace_id,slug")
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "DB_ERROR", "message": "Failed to create connection."},
        )

    row_out = result.data[0]
    return BaseResponse(
        data=ConnectionResponse(
            id=str(row_out["id"]),
            workspace_id=str(row_out["workspace_id"]),
            provider=str(row_out["provider"]),
            name=str(row_out["name"]),
            health_status=str(row_out.get("health_status", "unknown")),
            is_active=bool(row_out.get("is_active", True)),
            created_at=datetime.fromisoformat(str(row_out["created_at"])),
        )
    )


# ---------------------------------------------------------------------------
# DELETE /orchestrate/mcp/connections/{connection_id}
# ---------------------------------------------------------------------------


@router.delete(
    "/connections/{connection_id}",
    response_model=BaseResponse[dict[str, object]],
    summary="Disconnect (soft-delete) an MCP connection",
)
async def delete_connection(
    connection_id: str,
    workspace_id: str = Query(...),
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[dict[str, object]]:
    """Soft-delete a connection. The linked vault secret is NOT deleted."""
    sb = _supabase_client(settings)
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    result = (
        sb.table("mcp_connections")
        .update({
            "is_active": False,
            "deleted_at": now_iso,
            "status": "inactive",
        })
        .eq("id", connection_id)
        .eq("workspace_id", workspace_id)
        .execute()
    )

    affected = len(result.data or [])
    return BaseResponse(data={"connection_id": connection_id, "disconnected": affected > 0})


# ---------------------------------------------------------------------------
# POST /orchestrate/mcp/test/{provider}
# ---------------------------------------------------------------------------


@router.post(
    "/test/{provider}",
    response_model=BaseResponse[dict[str, object]],
    summary="Run a health check for an MCP provider",
)
async def test_provider(
    provider: str,
    workspace_id: str = Query(...),
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[dict[str, object]]:
    """Run MCPRegistry.health_check() and persist result to mcp_connections.

    Returns:
        {'healthy': bool, 'provider': str, 'tested_at': ISO datetime}
    """
    registry = _mcp_registry(settings)
    sb = _supabase_client(settings)

    tested_at = datetime.now(tz=timezone.utc)
    healthy = False
    start_time = time.monotonic()

    try:
        healthy = await registry.health_check(provider, workspace_id)
    except Exception as exc:
        logger.warning(
            "MCP test failed: provider=%s workspace=%s error=%s", provider, workspace_id, exc
        )

    response_time_ms = round((time.monotonic() - start_time) * 1000)

    new_health = "healthy" if healthy else "down"
    test_result = {
        "healthy": healthy,
        "tested_at": tested_at.isoformat(),
        "tested_by": user.user_id,
        "response_time_ms": response_time_ms,
    }

    # Persist result to the connection row
    try:
        sb.table("mcp_connections").update({
            "health_status": new_health,
            "last_health_check": tested_at.isoformat(),
            "test_result": test_result,
        }).eq("provider", provider).eq("workspace_id", workspace_id).eq(
            "is_active", True
        ).execute()
    except Exception:
        logger.warning(
            "Failed to persist health check result for provider=%s", provider, exc_info=True
        )

    return BaseResponse(
        data={
            "healthy": healthy,
            "provider": provider,
            "health_status": new_health,
            "tested_at": tested_at.isoformat(),
            "response_time_ms": response_time_ms,
        }
    )
