"""Celery tasks — async pipeline execution, notifications, and maintenance.

All tasks are designed with graceful degradation:
  - If Celery is not available, they can be called as regular functions.
  - Each task handles its own errors and logs appropriately.

Tasks:
  - ``execute_pipeline_async``: Run a pipeline asynchronously via Celery.
  - ``send_notification``: Send Slack/email notifications.
  - ``run_health_check``: Periodic MCP provider health checks.
  - ``run_vault_rotation_task``: Trigger vault secret rotation (Celery Beat).
  - ``cleanup_old_audit_logs``: Archive old audit log entries (daily).
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


def _get_celery_app() -> Any:
    """Lazy import to avoid circular imports at module level."""
    from app.worker import get_celery_app

    return get_celery_app()


def _get_sync_supabase() -> Any:
    """Create a sync Supabase client for task execution."""
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


# ---------------------------------------------------------------------------
# Task: execute_pipeline_async
# STUB: Celery pipeline execution requires Redis broker. Currently using
# sync PipelineEngine.run() fallback.
# ---------------------------------------------------------------------------

def execute_pipeline_async(
    pipeline_id: str,
    workspace_id: str,
    input_data: dict[str, Any],
) -> dict[str, Any]:
    """Execute a pipeline asynchronously.

    **STUB**: This task only marks the execution as "queued" — it does NOT
    run pipeline nodes.  Full execution requires a Redis broker and the
    async ``PipelineEngine``.  Without Redis, the caller should fall back
    to ``PipelineEngine.run()`` directly.

    This task is registered with Celery when available.  When Celery is not
    configured, it can be called directly as a regular function.

    Args:
        pipeline_id: UUID of the pipeline to execute.
        workspace_id: UUID of the workspace.
        input_data: Input data for the pipeline.

    Returns:
        Dict with execution result metadata.
    """
    logger.warning(
        "execute_pipeline_async: STUB — pipeline=%s queued but NOT executed. "
        "Celery pipeline execution requires a Redis broker. "
        "Use sync PipelineEngine.run() as fallback.",
        pipeline_id,
    )

    try:
        sb = _get_sync_supabase()

        # Mark pipeline execution as running (status bookkeeping only)
        sb.table("pipeline_executions").update({
            "status": "running",
            "started_at": datetime.now(tz=timezone.utc).isoformat(),
        }).eq("pipeline_id", pipeline_id).eq(
            "workspace_id", workspace_id
        ).eq("status", "pending").execute()

        # STUB: Celery pipeline execution requires Redis broker. Currently
        # using sync PipelineEngine.run() fallback. Full node execution is
        # NOT wired here — the orchestrate router invokes PipelineEngine
        # directly until Redis infrastructure is provisioned.

        return {
            "pipeline_id": pipeline_id,
            "workspace_id": workspace_id,
            "status": "queued",
            "queued_at": datetime.now(tz=timezone.utc).isoformat(),
        }

    except Exception:
        logger.exception(
            "execute_pipeline_async: failed pipeline=%s workspace=%s",
            pipeline_id,
            workspace_id,
        )
        return {
            "pipeline_id": pipeline_id,
            "workspace_id": workspace_id,
            "status": "error",
            "error": "Pipeline execution failed — see logs",
        }


# ---------------------------------------------------------------------------
# Task: send_notification
# ---------------------------------------------------------------------------

def send_notification(
    workspace_id: str,
    channel: str,
    title: str,
    body: str,
    severity: str = "info",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Send a notification via Slack or email.

    Args:
        workspace_id: UUID of the workspace.
        channel: Notification channel ('slack' or 'email').
        title: Notification title.
        body: Notification body.
        severity: Severity level ('info', 'warning', 'error', 'critical').
        metadata: Additional metadata to include.

    Returns:
        Dict with delivery result.
    """
    logger.info(
        "send_notification: workspace=%s channel=%s title=%s",
        workspace_id,
        channel,
        title,
    )

    try:
        sb = _get_sync_supabase()

        from app.mcp.registry import MCPRegistry
        from app.security.vault import SecretVault

        vault = SecretVault(sb)
        registry = MCPRegistry(vault=vault, supabase_client=sb)

        if channel == "slack":
            # Use synchronous approach — Celery tasks are sync
            import asyncio

            result = asyncio.run(
                registry.execute_tool(
                    mcp_name="slack",
                    workspace_id=workspace_id,
                    action="send_notification",
                    params={
                        "title": title,
                        "body": body,
                        "severity": severity,
                        "fields": metadata or {},
                    },
                )
            )
            return {"channel": channel, "status": "sent", "result": result}

        logger.warning(
            "send_notification: unsupported channel=%s; notification not sent",
            channel,
        )
        return {"channel": channel, "status": "unsupported"}

    except Exception:
        logger.exception(
            "send_notification: failed workspace=%s channel=%s",
            workspace_id,
            channel,
        )
        return {"channel": channel, "status": "error"}


# ---------------------------------------------------------------------------
# Task: run_health_check
# ---------------------------------------------------------------------------

def run_health_check() -> dict[str, Any]:
    """Run periodic health checks on all active MCP provider connections.

    Iterates over all active ``mcp_connections`` and updates their
    ``health_status`` and ``last_health_check`` fields.

    Returns:
        Dict with summary counts.
    """
    logger.debug("run_health_check: starting periodic health check")

    try:
        sb = _get_sync_supabase()

        # Fetch all active connections
        result = (
            sb.table("mcp_connections")
            .select("id, workspace_id, provider")
            .eq("is_active", True)
            .is_("deleted_at", "null")
            .execute()
        )

        connections: list[dict[str, Any]] = result.data or []
        if not connections:
            logger.debug("run_health_check: no active connections found")
            return {"checked": 0, "healthy": 0, "down": 0}

        from app.mcp.registry import MCPRegistry
        from app.security.vault import SecretVault

        vault = SecretVault(sb)
        registry = MCPRegistry(vault=vault, supabase_client=sb)

        healthy_count = 0
        down_count = 0

        import asyncio

        for conn in connections:
            conn_id: str = str(conn["id"])
            workspace_id: str = str(conn["workspace_id"])
            provider: str = str(conn["provider"])

            try:
                is_healthy: bool = asyncio.run(
                    registry.health_check(provider, workspace_id)
                )
                health_status = "healthy" if is_healthy else "down"
            except Exception:
                logger.warning(
                    "run_health_check: check failed provider=%s workspace=%s",
                    provider,
                    workspace_id,
                    exc_info=True,
                )
                health_status = "down"

            if health_status == "healthy":
                healthy_count += 1
            else:
                down_count += 1

            # Update connection health status
            try:
                now_iso = datetime.now(tz=timezone.utc).isoformat()
                sb.table("mcp_connections").update({
                    "health_status": health_status,
                    "last_health_check": now_iso,
                }).eq("id", conn_id).execute()
            except Exception:
                logger.warning(
                    "run_health_check: failed to update health for connection=%s",
                    conn_id,
                    exc_info=True,
                )

        logger.info(
            "run_health_check: completed — checked=%d healthy=%d down=%d",
            len(connections),
            healthy_count,
            down_count,
        )

        return {
            "checked": len(connections),
            "healthy": healthy_count,
            "down": down_count,
        }

    except Exception:
        logger.exception("run_health_check: periodic health check failed")
        return {"checked": 0, "healthy": 0, "down": 0, "error": True}


# ---------------------------------------------------------------------------
# Task: run_vault_rotation_task (Celery Beat bridge)
# ---------------------------------------------------------------------------

def run_vault_rotation_task() -> dict[str, Any]:
    """Bridge task for vault rotation via Celery Beat.

    Creates an async Supabase client and delegates to the scheduler module.
    """
    logger.info("run_vault_rotation_task: starting vault rotation via Celery Beat")

    try:
        import asyncio

        from supabase._async.client import create_client as create_async_client

        async def _run() -> None:
            url = os.environ.get("SUPABASE_URL", "")
            key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
            supabase_async = await create_async_client(url, key)

            from app.scheduler.vault_rotation import run_vault_rotation

            await run_vault_rotation(supabase=supabase_async)

        asyncio.run(_run())

        return {"status": "completed"}

    except Exception:
        logger.exception("run_vault_rotation_task: vault rotation failed")
        return {"status": "error"}


# ---------------------------------------------------------------------------
# Task: cleanup_old_audit_logs (daily)
# ---------------------------------------------------------------------------

def cleanup_old_audit_logs() -> dict[str, Any]:
    """Archive audit logs older than 90 days using the DB function.

    Calls the ``run_audit_archive()`` PostgreSQL function created in
    migration ``20260227000014_vault_rotation_audit_archive.sql``.
    """
    logger.info("cleanup_old_audit_logs: starting audit log archive")

    try:
        sb = _get_sync_supabase()

        # Call the archive function via RPC
        result = sb.rpc("run_audit_archive", {}).execute()
        archived_count = result.data if result.data else 0

        logger.info(
            "cleanup_old_audit_logs: archived %s old audit log entries",
            archived_count,
        )
        return {"status": "completed", "archived_count": archived_count}

    except Exception:
        logger.exception("cleanup_old_audit_logs: audit log archive failed")
        return {"status": "error"}


# ---------------------------------------------------------------------------
# Register tasks with Celery (if available)
# ---------------------------------------------------------------------------

def _register_celery_tasks() -> None:
    """Register all task functions with the Celery app."""
    app = _get_celery_app()
    if app is None:
        return

    try:
        app.task(name="app.worker.tasks.execute_pipeline_async", bind=False)(
            execute_pipeline_async
        )
        app.task(name="app.worker.tasks.send_notification", bind=False)(
            send_notification
        )
        app.task(name="app.worker.tasks.run_health_check", bind=False)(
            run_health_check
        )
        app.task(name="app.worker.tasks.run_vault_rotation_task", bind=False)(
            run_vault_rotation_task
        )
        app.task(name="app.worker.tasks.cleanup_old_audit_logs", bind=False)(
            cleanup_old_audit_logs
        )
        logger.info("Celery tasks registered successfully")
    except Exception:
        logger.warning("Failed to register Celery tasks", exc_info=True)


# Auto-register on import (safe no-op if Celery is unavailable)
_register_celery_tasks()
