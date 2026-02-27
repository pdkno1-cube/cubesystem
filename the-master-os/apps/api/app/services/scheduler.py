"""Content publishing scheduler — polls content_schedules and dispatches.

Runs as an in-process background job alongside FastAPI using APScheduler's
AsyncIOScheduler (shares the uvicorn event loop; no separate process needed).

Safety:
  - Atomic claim via UPDATE WHERE status='pending' prevents double-execution
    across multiple uvicorn workers.
  - Each job run processes at most BATCH_SIZE items to bound latency.
  - All failures are soft: items move to 'failed' status and never block others.

Channel dispatch map (channel → handler):
  - newsletter → Resend send_batch (reads subscribers table)
  - instagram  → stub (future: Instagram Graph API)
  - blog       → stub (future: WordPress/Ghost API)
  - twitter    → stub (future: Twitter API v2)
  - linkedin   → stub (future: LinkedIn API)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler

if TYPE_CHECKING:
    from supabase._async.client import AsyncClient as SupabaseAsyncClient

    from app.config import Settings
    from app.mcp.registry import MCPRegistry

logger = logging.getLogger(__name__)

_BATCH_SIZE = 50  # max items processed per tick
_INTERVAL_SECONDS = 60  # poll interval


class ContentScheduler:
    """Background scheduler that executes content_schedules at their scheduled_at time.

    Usage (in FastAPI lifespan)::

        scheduler = ContentScheduler(supabase=supabase_async, mcp_registry=registry)
        await scheduler.start()
        yield
        await scheduler.stop()
    """

    def __init__(
        self,
        supabase: SupabaseAsyncClient,
        mcp_registry: MCPRegistry | None,
        settings: Settings,
    ) -> None:
        self._supabase = supabase
        self._mcp_registry = mcp_registry
        self._settings = settings
        self._scheduler = AsyncIOScheduler(timezone="UTC")

    async def start(self) -> None:
        """Start the scheduler and register the polling job."""
        self._scheduler.add_job(
            self._process_due_schedules,
            trigger="interval",
            seconds=_INTERVAL_SECONDS,
            id="content_schedule_processor",
            max_instances=1,  # never overlap within a single worker
            replace_existing=True,
            misfire_grace_time=30,  # allow up to 30s late start
        )
        self._scheduler.start()
        logger.info(
            "ContentScheduler started — polling every %ds", _INTERVAL_SECONDS
        )

    async def stop(self) -> None:
        """Gracefully shutdown the scheduler."""
        self._scheduler.shutdown(wait=False)
        logger.info("ContentScheduler stopped")

    # ------------------------------------------------------------------
    # Core dispatch loop
    # ------------------------------------------------------------------

    async def _process_due_schedules(self) -> None:
        """Fetch and execute all due pending content schedules."""
        now_iso = datetime.now(tz=timezone.utc).isoformat()

        try:
            result = (
                await self._supabase.table("content_schedules")
                .select("*")
                .eq("status", "pending")
                .lte("scheduled_at", now_iso)
                .is_("deleted_at", "null")
                .limit(_BATCH_SIZE)
                .execute()
            )
        except Exception:
            logger.exception("ContentScheduler: failed to fetch due schedules")
            return

        rows: list[dict[str, Any]] = result.data or []
        if not rows:
            return

        logger.info(
            "ContentScheduler: processing %d due schedule(s)", len(rows)
        )

        for row in rows:
            await self._execute_schedule(row)

    async def _execute_schedule(self, row: dict[str, Any]) -> None:
        """Execute a single content schedule item (atomic claim → dispatch → notify)."""
        schedule_id: str = str(row["id"])
        workspace_id: str = str(row["workspace_id"])
        channel: str = str(row.get("channel", ""))
        title: str = str(row.get("title", ""))
        content: dict[str, Any] = row.get("content") or {}

        # 1. Atomic claim — prevents another worker/tick from processing the same item
        claim_result = (
            await self._supabase.table("content_schedules")
            .update({"status": "running"})
            .eq("id", schedule_id)
            .eq("status", "pending")  # optimistic lock
            .execute()
        )
        if not claim_result.data:
            # Another worker already claimed it
            return

        logger.info(
            "ContentScheduler: executing schedule=%s channel=%s workspace=%s",
            schedule_id,
            channel,
            workspace_id,
        )

        # 2. Dispatch to channel handler
        error_message: str | None = None
        try:
            if channel == "newsletter":
                await self._dispatch_newsletter(workspace_id, content, schedule_id)
            else:
                # Stub for future channels
                logger.info(
                    "ContentScheduler: channel '%s' dispatch is not yet implemented"
                    " (schedule=%s) — marking completed as stub",
                    channel,
                    schedule_id,
                )
        except Exception as exc:
            logger.exception(
                "ContentScheduler: dispatch failed schedule=%s error=%s",
                schedule_id,
                exc,
            )
            error_message = str(exc)

        # 3. Update final status
        completed_at = datetime.now(tz=timezone.utc).isoformat()
        final_status = "failed" if error_message else "completed"
        update_data: dict[str, object] = {
            "status": final_status,
            "published_at": completed_at if not error_message else None,
        }
        if error_message:
            update_data["error_message"] = error_message[:500]

        try:
            await (
                self._supabase.table("content_schedules")
                .update(update_data)
                .eq("id", schedule_id)
                .execute()
            )
        except Exception:
            logger.exception(
                "ContentScheduler: failed to update final status for schedule=%s",
                schedule_id,
            )

        # 4. Slack notification (best-effort)
        await self._notify_slack(
            workspace_id=workspace_id,
            title=title,
            channel=channel,
            schedule_id=schedule_id,
            status=final_status,
            error=error_message,
        )

    # ------------------------------------------------------------------
    # Channel handlers
    # ------------------------------------------------------------------

    async def _dispatch_newsletter(
        self,
        workspace_id: str,
        content: dict[str, Any],
        schedule_id: str,
    ) -> None:
        """Send newsletter to active subscribers via Resend.

        Reads `content.subject`, `content.html`, `content.text` from the
        content_schedules row.
        """
        if self._mcp_registry is None:
            logger.warning(
                "ContentScheduler: MCP registry unavailable; skipping newsletter send"
            )
            return

        subject: str = str(content.get("subject", "The Master OS Newsletter"))
        html: str = str(content.get("html", ""))
        text_body: str = str(content.get("text", ""))

        if not html and not text_body:
            raise ValueError(
                f"Newsletter schedule {schedule_id} has no html or text content"
            )

        # Fetch active subscribers
        sub_result = (
            await self._supabase.table("newsletter_subscribers")
            .select("email, name")
            .eq("workspace_id", workspace_id)
            .eq("status", "active")
            .is_("deleted_at", "null")
            .execute()
        )
        subscribers: list[dict[str, Any]] = sub_result.data or []

        if not subscribers:
            logger.info(
                "ContentScheduler: no active subscribers for workspace=%s; skipping",
                workspace_id,
            )
            return

        emails_payload: list[dict[str, object]] = [
            {
                "to": str(sub["email"]),
                "subject": subject,
                **({"html": html} if html else {}),
                **({"text": text_body} if text_body else {}),
            }
            for sub in subscribers
        ]

        sent_total = 0
        for chunk_start in range(0, len(emails_payload), 100):
            chunk = emails_payload[chunk_start : chunk_start + 100]
            result = await self._mcp_registry.execute_tool(
                mcp_name="resend",
                workspace_id=workspace_id,
                action="send_batch",
                params={"emails": chunk},
            )
            sent_total += int(result.get("sent_count", len(chunk)))

        logger.info(
            "ContentScheduler: newsletter sent — workspace=%s sent=%d subscribers=%d",
            workspace_id,
            sent_total,
            len(subscribers),
        )

    # ------------------------------------------------------------------
    # Slack notification
    # ------------------------------------------------------------------

    async def _notify_slack(
        self,
        workspace_id: str,
        title: str,
        channel: str,
        schedule_id: str,
        status: str,
        error: str | None,
    ) -> None:
        """Send a Slack notification on schedule completion or failure."""
        if self._mcp_registry is None:
            return

        severity = "info" if status == "completed" else "error"
        body = (
            f"채널: `{channel}` | 스케줄 ID: `{schedule_id[:8]}...`"
            if status == "completed"
            else f"오류: {error or 'unknown'}"
        )

        try:
            await self._mcp_registry.execute_tool(
                mcp_name="slack",
                workspace_id=workspace_id,
                action="send_notification",
                params={
                    "title": f"{'✅' if status == 'completed' else '❌'} 콘텐츠 발행 {status}: {title}",
                    "body": body,
                    "severity": severity,
                    "fields": {
                        "channel": channel,
                        "workspace": workspace_id,
                        "status": status,
                    },
                },
            )
        except Exception:
            # Slack notification failures must never break the scheduler
            logger.debug(
                "ContentScheduler: Slack notification failed for schedule=%s (best-effort)",
                schedule_id,
            )
