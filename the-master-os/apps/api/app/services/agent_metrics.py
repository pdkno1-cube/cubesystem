"""Agent metrics recording service — writes real performance data to agent_metrics.

Provides a single entry point ``record_agent_metric()`` that upserts
a metric row for the current ISO-week period.  If a row already exists
for the same (agent_id, metric_type, period_start), it updates the
running average and increments ``sample_count``.

Metric types (matching the CHECK constraint on agent_metrics):
  - success_rate        0–100 percentage
  - avg_response_time   milliseconds
  - cost_efficiency     0–100 score
  - quality_score       0–100 score

Usage::

    from app.services.agent_metrics import record_agent_metric

    await record_agent_metric(
        supabase=supabase_client,
        agent_id="...",
        workspace_id="...",
        metric_type="success_rate",
        value=95.5,
    )
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Literal

if TYPE_CHECKING:
    from supabase._async.client import AsyncClient as SupabaseAsyncClient

logger = logging.getLogger(__name__)

MetricType = Literal["success_rate", "avg_response_time", "cost_efficiency", "quality_score"]


def _current_week_period() -> tuple[date, date]:
    """Return (monday, sunday) of the current ISO week in UTC."""
    today = datetime.now(tz=timezone.utc).date()
    monday = today - timedelta(days=today.weekday())  # Monday = 0
    sunday = monday + timedelta(days=6)
    return monday, sunday


async def record_agent_metric(
    supabase: SupabaseAsyncClient,
    *,
    agent_id: str,
    workspace_id: str,
    metric_type: MetricType,
    value: float,
) -> None:
    """Upsert a metric value into agent_metrics for the current week.

    If a row already exists for the same (agent_id, metric_type, period_start),
    the metric_value is updated as a running average::

        new_avg = (old_avg * old_count + value) / (old_count + 1)

    Args:
        supabase: Async or sync Supabase client.
        agent_id: UUID of the agent.
        workspace_id: UUID of the workspace.
        metric_type: One of the four allowed metric types.
        value: The observed metric value.
    """
    period_start, period_end = _current_week_period()

    try:
        # Check for existing row
        existing = (
            supabase.table("agent_metrics")
            .select("id, metric_value, sample_count")
            .eq("agent_id", agent_id)
            .eq("metric_type", metric_type)
            .eq("period_start", period_start.isoformat())
            .limit(1)
            .execute()
        )

        rows: list[dict[str, Any]] = existing.data or []

        if rows:
            # Update running average
            row = rows[0]
            old_value: float = float(row.get("metric_value", 0))
            old_count: int = int(row.get("sample_count", 0))
            new_count = old_count + 1
            new_value = (old_value * old_count + value) / new_count

            supabase.table("agent_metrics").update({
                "metric_value": round(new_value, 4),
                "sample_count": new_count,
            }).eq("id", str(row["id"])).execute()

            logger.debug(
                "agent_metrics updated: agent=%s type=%s value=%.2f->%.2f count=%d",
                agent_id,
                metric_type,
                old_value,
                new_value,
                new_count,
            )
        else:
            # Insert new row
            supabase.table("agent_metrics").insert({
                "agent_id": agent_id,
                "workspace_id": workspace_id,
                "metric_type": metric_type,
                "metric_value": round(value, 4),
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "sample_count": 1,
            }).execute()

            logger.debug(
                "agent_metrics inserted: agent=%s type=%s value=%.2f period=%s~%s",
                agent_id,
                metric_type,
                value,
                period_start,
                period_end,
            )

    except Exception:
        # Metric recording must never break the calling flow
        logger.warning(
            "Failed to record agent metric: agent=%s type=%s value=%s",
            agent_id,
            metric_type,
            value,
            exc_info=True,
        )
