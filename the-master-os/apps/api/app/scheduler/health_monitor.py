"""Automated health monitoring — detects service failures and creates healing incidents.

Runs every 5 minutes via APScheduler.  For each monitored target:
  1. Supabase — ``/rest/v1/`` health check via HTTP GET.
  2. MCP providers — vault-configured providers via ``MCPRegistry.health_check()``.

When a failure is detected:
  - A ``healing_incidents`` row is created with status=detected.
  - An audit log entry is written (``health_monitor.incident_created``).

Design:
  - Individual target failures do NOT block other checks.
  - All errors are logged via ``logger.warning`` / ``logger.exception``
    (Sentry captures these automatically when DSN is configured).
  - Only workspaces with active MCP connections are checked (avoids phantom errors).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_SUPABASE_TIMEOUT_SECONDS = 10
_MCP_CHECK_TIMEOUT_SECONDS = 15


async def run_health_monitor(
    supabase: Any,
    supabase_url: str,
    supabase_key: str,
) -> None:
    """Main health monitor entry point — check all monitored services.

    Args:
        supabase: Async Supabase client instance.
        supabase_url: Supabase project URL (e.g. ``https://xxx.supabase.co``).
        supabase_key: Supabase service role key for HTTP health check.
    """
    now = datetime.now(tz=timezone.utc)
    logger.info("Health monitor check started at %s", now.isoformat())

    results: dict[str, bool] = {}

    # 1. Supabase health check
    supabase_healthy = await _check_supabase(supabase_url, supabase_key)
    results["supabase"] = supabase_healthy

    if not supabase_healthy:
        await _create_incident_for_all_workspaces(
            supabase=supabase,
            source_service="supabase",
            incident_type="api_failure",
            severity="critical",
            details={"check": "supabase_rest_health", "url": supabase_url},
        )

    # 2. MCP provider health checks (per workspace)
    mcp_results = await _check_mcp_providers(supabase)
    results.update(mcp_results)

    healthy_count = sum(1 for v in results.values() if v)
    total_count = len(results)
    logger.info(
        "Health monitor completed: healthy=%d/%d services=%s",
        healthy_count,
        total_count,
        {k: ("ok" if v else "FAIL") for k, v in results.items()},
    )


async def _check_supabase(supabase_url: str, supabase_key: str) -> bool:
    """Check Supabase REST API health via HTTP GET to /rest/v1/.

    Returns True if the response status is 2xx.
    """
    url = f"{supabase_url.rstrip('/')}/rest/v1/"
    try:
        async with httpx.AsyncClient(timeout=_SUPABASE_TIMEOUT_SECONDS) as client:
            resp = await client.get(
                url,
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                },
            )
            is_healthy = 200 <= resp.status_code < 300
            if not is_healthy:
                logger.warning(
                    "Supabase health check failed: status=%d url=%s",
                    resp.status_code,
                    url,
                )
            return is_healthy
    except httpx.TimeoutException:
        logger.warning("Supabase health check timed out: url=%s", url)
        return False
    except Exception:
        logger.exception("Supabase health check error: url=%s", url)
        return False


async def _check_mcp_providers(supabase: Any) -> dict[str, bool]:
    """Check MCP providers for all workspaces with active connections.

    Returns a dict like ``{"mcp:resend:ws-abc": True, "mcp:slack:ws-abc": False}``.
    """
    results: dict[str, bool] = {}

    try:
        conn_result = await (
            supabase.table("mcp_connections")
            .select("id, workspace_id, provider, health_status")
            .eq("is_active", True)
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        logger.exception("Health monitor: failed to query MCP connections")
        return results

    connections: list[dict[str, Any]] = conn_result.data or []
    if not connections:
        logger.debug("Health monitor: no active MCP connections to check")
        return results

    # Lazy import to avoid circular dependencies at module load time
    from supabase import create_client as create_sync_client

    from app.config import get_settings
    from app.mcp.registry import MCPRegistry
    from app.security.vault import SecretVault

    settings = get_settings()
    sync_sb = create_sync_client(settings.supabase_url, settings.supabase_service_role_key)
    vault = SecretVault(sync_sb)
    registry = MCPRegistry(vault=vault, supabase_client=sync_sb)

    for conn in connections:
        provider = str(conn.get("provider", ""))
        workspace_id = str(conn.get("workspace_id", ""))
        key = f"mcp:{provider}:{workspace_id[:8]}"

        try:
            healthy = await registry.health_check(provider, workspace_id)
            results[key] = healthy

            # Update connection health_status
            now_iso = datetime.now(tz=timezone.utc).isoformat()
            new_status = "healthy" if healthy else "down"
            try:
                await (
                    supabase.table("mcp_connections")
                    .update({
                        "health_status": new_status,
                        "last_health_check": now_iso,
                    })
                    .eq("id", str(conn["id"]))
                    .execute()
                )
            except Exception:
                logger.warning(
                    "Health monitor: failed to update health_status for connection=%s",
                    conn.get("id"),
                    exc_info=True,
                )

            if not healthy:
                await _create_incident(
                    supabase=supabase,
                    workspace_id=workspace_id,
                    source_service=f"mcp:{provider}",
                    incident_type="api_failure",
                    severity="high",
                    details={
                        "check": "mcp_health_check",
                        "provider": provider,
                        "connection_id": str(conn.get("id", "")),
                    },
                )
        except Exception:
            results[key] = False
            logger.exception(
                "Health monitor: MCP check failed for provider=%s workspace=%s",
                provider,
                workspace_id,
            )

    return results


async def _create_incident_for_all_workspaces(
    supabase: Any,
    *,
    source_service: str,
    incident_type: str,
    severity: str,
    details: dict[str, Any],
) -> None:
    """Create a healing incident for every workspace (used for global outages like Supabase)."""
    try:
        ws_result = await (
            supabase.table("workspaces")
            .select("id")
            .limit(100)
            .execute()
        )
    except Exception:
        logger.exception("Health monitor: failed to query workspaces for incident creation")
        return

    workspaces: list[dict[str, Any]] = ws_result.data or []
    for ws in workspaces:
        workspace_id = str(ws["id"])
        await _create_incident(
            supabase=supabase,
            workspace_id=workspace_id,
            source_service=source_service,
            incident_type=incident_type,
            severity=severity,
            details=details,
        )


async def _create_incident(
    supabase: Any,
    *,
    workspace_id: str,
    source_service: str,
    incident_type: str,
    severity: str,
    details: dict[str, Any],
) -> None:
    """Create a healing_incidents row if no active incident already exists for this service."""
    now = datetime.now(tz=timezone.utc)

    try:
        # Avoid duplicate active incidents for the same source_service + workspace
        existing = await (
            supabase.table("healing_incidents")
            .select("id")
            .eq("workspace_id", workspace_id)
            .eq("source_service", source_service)
            .in_("status", ["detected", "diagnosing", "healing"])
            .limit(1)
            .execute()
        )

        if existing.data:
            logger.debug(
                "Health monitor: active incident already exists for %s in workspace %s",
                source_service,
                workspace_id[:8],
            )
            return

        # Create new incident
        row = {
            "workspace_id": workspace_id,
            "incident_type": incident_type,
            "source_service": source_service,
            "severity": severity,
            "status": "detected",
            "resolution_details": {
                "auto_detected": True,
                "detected_by": "health_monitor",
                **details,
            },
            "detected_at": now.isoformat(),
        }

        result = await supabase.table("healing_incidents").insert(row).execute()

        if result.data:
            incident_id = str(result.data[0]["id"])
            logger.info(
                "Health monitor: incident created id=%s service=%s workspace=%s severity=%s",
                incident_id,
                source_service,
                workspace_id[:8],
                severity,
            )

            # Write audit log
            await _write_audit_log(
                supabase,
                workspace_id=workspace_id,
                action="health_monitor.incident_created",
                resource_type="healing_incident",
                resource_id=incident_id,
                details={
                    "source_service": source_service,
                    "incident_type": incident_type,
                    "severity": severity,
                    **details,
                },
            )

    except Exception:
        logger.exception(
            "Health monitor: failed to create incident for %s in workspace %s",
            source_service,
            workspace_id[:8],
        )


async def _write_audit_log(
    supabase: Any,
    *,
    workspace_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    details: dict[str, Any],
) -> None:
    """Write an audit log entry (best-effort)."""
    try:
        await (
            supabase.table("audit_logs")
            .insert({
                "workspace_id": workspace_id,
                "action": action,
                "category": "healing",
                "resource_type": resource_type,
                "resource_id": resource_id,
                "details": details,
                "severity": "warning",
            })
            .execute()
        )
    except Exception:
        logger.warning(
            "Health monitor: failed to write audit log for resource_id=%s",
            resource_id,
            exc_info=True,
        )
