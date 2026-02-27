"""Auto-Healing pipeline router — incident tracking and manual healing triggers.

Endpoints:
  GET    /orchestrate/healing/incidents          List healing incidents
  POST   /orchestrate/healing/trigger            Manually trigger a healing pipeline
  GET    /orchestrate/healing/incidents/{id}     Get incident details
  PATCH  /orchestrate/healing/incidents/{id}     Resolve or update an incident
  GET    /orchestrate/healing/stats              Healing statistics (totals, auto-resolve rate, avg MTTR)

Design:
  - healing_incidents tracks every detected system failure.
  - Each incident links optionally to a pipeline_execution for traceability.
  - Stats are computed from the incidents table (no separate aggregation table).
  - On resolution, agent success_rate metrics are recorded via agent_metrics service.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.schemas.common import BaseResponse, PaginatedResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrate/healing", tags=["auto-healing"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _supabase_client(settings: Settings):  # noqa: ANN202
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class IncidentResponse(BaseModel):
    id: str
    workspace_id: str
    pipeline_execution_id: str | None
    incident_type: str
    source_service: str
    severity: str
    status: str
    resolution_action: str | None
    resolution_details: dict[str, object]
    detected_at: datetime
    resolved_at: datetime | None
    created_at: datetime


class HealingTriggerRequest(BaseModel):
    workspace_id: str
    source_service: str = Field(..., min_length=1, max_length=100)
    incident_type: Literal[
        "api_failure", "crawl_blocked", "rate_limited", "timeout", "auth_expired"
    ] = "api_failure"
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    description: str = Field(default="", max_length=500)


class HealingTriggerResponse(BaseModel):
    incident_id: str
    workspace_id: str
    source_service: str
    status: str
    triggered_at: datetime


class HealingStatsResponse(BaseModel):
    total_incidents: int
    auto_resolved: int
    auto_resolve_rate: float  # 0.0 ~ 1.0
    avg_recovery_seconds: float
    active_incidents: int
    by_severity: dict[str, int]
    by_type: dict[str, int]


class IncidentResolveRequest(BaseModel):
    """Request body for PATCH /orchestrate/healing/incidents/{id}."""

    status: Literal["resolved", "escalated"] = "resolved"
    resolution_action: str | None = Field(
        default=None, max_length=200, description="e.g. api_key_rotated, proxy_switched"
    )
    resolution_details: dict[str, object] = Field(default_factory=dict)
    agent_id: str | None = Field(
        default=None, description="Agent UUID — records success_rate metric on resolution"
    )


# ---------------------------------------------------------------------------
# GET /orchestrate/healing/incidents
# ---------------------------------------------------------------------------


@router.get(
    "/incidents",
    response_model=PaginatedResponse[IncidentResponse],
    summary="List healing incidents for a workspace",
)
async def list_incidents(
    workspace_id: str = Query(...),
    severity: str | None = Query(None),
    incident_status: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> PaginatedResponse[IncidentResponse]:
    """Return paginated list of healing incidents, with optional severity/status filters."""
    sb = _supabase_client(settings)
    offset = (page - 1) * limit

    query = (
        sb.table("healing_incidents")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
    )

    if severity:
        query = query.eq("severity", severity)
    if incident_status:
        query = query.eq("status", incident_status)

    result = (
        query.order("detected_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    items = [_row_to_incident(row) for row in (result.data or [])]
    return PaginatedResponse(data=items, total=result.count or 0, page=page, limit=limit)


# ---------------------------------------------------------------------------
# POST /orchestrate/healing/trigger
# ---------------------------------------------------------------------------


@router.post(
    "/trigger",
    response_model=BaseResponse[HealingTriggerResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Manually trigger a healing pipeline for a service",
)
async def trigger_healing(
    body: HealingTriggerRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[HealingTriggerResponse]:
    """Create a new healing incident with status=detected and optionally kick off the pipeline."""
    sb = _supabase_client(settings)

    now = datetime.now(tz=timezone.utc)

    row = {
        "workspace_id": body.workspace_id,
        "incident_type": body.incident_type,
        "source_service": body.source_service,
        "severity": body.severity,
        "status": "detected",
        "resolution_details": {"manual_trigger": True, "description": body.description, "triggered_by": user.user_id},
        "detected_at": now.isoformat(),
    }

    result = sb.table("healing_incidents").insert(row).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "DB_ERROR", "message": "Failed to create healing incident."},
        )

    created = result.data[0]

    # Audit log
    try:
        sb.table("audit_logs").insert({
            "workspace_id": body.workspace_id,
            "user_id": user.user_id,
            "action": "healing.trigger",
            "category": "healing",
            "resource_type": "healing_incident",
            "resource_id": str(created["id"]),
            "details": {
                "source_service": body.source_service,
                "incident_type": body.incident_type,
                "severity": body.severity,
            },
            "severity": "warning",
        }).execute()
    except Exception:
        logger.warning("Failed to write healing trigger audit log", exc_info=True)

    return BaseResponse(
        data=HealingTriggerResponse(
            incident_id=str(created["id"]),
            workspace_id=str(created["workspace_id"]),
            source_service=str(created["source_service"]),
            status="detected",
            triggered_at=now,
        )
    )


# ---------------------------------------------------------------------------
# GET /orchestrate/healing/incidents/{incident_id}
# ---------------------------------------------------------------------------


@router.get(
    "/incidents/{incident_id}",
    response_model=BaseResponse[IncidentResponse],
    summary="Get a single healing incident by ID",
)
async def get_incident(
    incident_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[IncidentResponse]:
    """Retrieve full details of a healing incident."""
    sb = _supabase_client(settings)

    result = (
        sb.table("healing_incidents")
        .select("*")
        .eq("id", incident_id)
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Incident '{incident_id}' not found."},
        )

    return BaseResponse(data=_row_to_incident(result.data[0]))


# ---------------------------------------------------------------------------
# PATCH /orchestrate/healing/incidents/{incident_id}
# ---------------------------------------------------------------------------


@router.patch(
    "/incidents/{incident_id}",
    response_model=BaseResponse[IncidentResponse],
    summary="Resolve or update a healing incident",
)
async def resolve_incident(
    incident_id: str,
    body: IncidentResolveRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[IncidentResponse]:
    """Update incident status to resolved/escalated and record agent metrics.

    When an incident is resolved and an ``agent_id`` is provided, a
    ``success_rate`` metric is recorded in ``agent_metrics`` for the agent.
    """
    sb = _supabase_client(settings)

    # Fetch the existing incident to get workspace_id and validate existence
    existing = (
        sb.table("healing_incidents")
        .select("*")
        .eq("id", incident_id)
        .limit(1)
        .execute()
    )

    if not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Incident '{incident_id}' not found."},
        )

    incident_row = existing.data[0]
    workspace_id = str(incident_row["workspace_id"])

    now = datetime.now(tz=timezone.utc)
    update_data: dict[str, object] = {
        "status": body.status,
    }

    if body.resolution_action is not None:
        update_data["resolution_action"] = body.resolution_action

    if body.resolution_details:
        # Merge with existing resolution_details
        existing_details: dict[str, object] = incident_row.get("resolution_details") or {}
        if isinstance(existing_details, dict):
            existing_details.update(body.resolution_details)
        else:
            existing_details = body.resolution_details
        existing_details["resolved_by"] = user.user_id
        update_data["resolution_details"] = existing_details

    if body.status == "resolved":
        update_data["resolved_at"] = now.isoformat()

    result = (
        sb.table("healing_incidents")
        .update(update_data)
        .eq("id", incident_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "DB_ERROR", "message": "Failed to update healing incident."},
        )

    updated_row = result.data[0]

    # Record agent metric on resolution
    if body.status == "resolved" and body.agent_id:
        try:
            from app.services.agent_metrics import record_agent_metric

            await record_agent_metric(
                supabase=sb,
                agent_id=body.agent_id,
                workspace_id=workspace_id,
                metric_type="success_rate",
                value=100.0,  # Successful resolution
            )
        except Exception:
            logger.warning(
                "Failed to record agent metric for incident=%s agent=%s",
                incident_id,
                body.agent_id,
                exc_info=True,
            )

    # Audit log
    try:
        sb.table("audit_logs").insert({
            "workspace_id": workspace_id,
            "user_id": user.user_id,
            "action": f"healing.{body.status}",
            "category": "healing",
            "resource_type": "healing_incident",
            "resource_id": incident_id,
            "details": {
                "status": body.status,
                "resolution_action": body.resolution_action,
                "agent_id": body.agent_id,
            },
            "severity": "info",
        }).execute()
    except Exception:
        logger.warning("Failed to write healing resolution audit log", exc_info=True)

    return BaseResponse(data=_row_to_incident(updated_row))


# ---------------------------------------------------------------------------
# GET /orchestrate/healing/stats
# ---------------------------------------------------------------------------


@router.get(
    "/stats",
    response_model=BaseResponse[HealingStatsResponse],
    summary="Healing statistics — total incidents, auto-resolve rate, avg MTTR",
)
async def get_stats(
    workspace_id: str = Query(...),
    days: int = Query(30, ge=1, le=365),
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[HealingStatsResponse]:
    """Compute aggregate healing statistics for the workspace."""
    sb = _supabase_client(settings)
    since = (datetime.now(tz=timezone.utc) - timedelta(days=days)).isoformat()

    result = (
        sb.table("healing_incidents")
        .select("id, severity, status, incident_type, detected_at, resolved_at")
        .eq("workspace_id", workspace_id)
        .gte("detected_at", since)
        .execute()
    )

    rows: list[dict[str, object]] = result.data or []
    total_incidents = len(rows)

    auto_resolved = 0
    active_incidents = 0
    total_recovery_seconds = 0.0
    resolved_count = 0
    by_severity: dict[str, int] = {}
    by_type: dict[str, int] = {}

    for row in rows:
        sev = str(row.get("severity", "medium"))
        by_severity[sev] = by_severity.get(sev, 0) + 1

        inc_type = str(row.get("incident_type", "unknown"))
        by_type[inc_type] = by_type.get(inc_type, 0) + 1

        row_status = str(row.get("status", ""))
        if row_status == "resolved":
            auto_resolved += 1
            detected_str = str(row.get("detected_at", ""))
            resolved_str = str(row.get("resolved_at", ""))
            if detected_str and resolved_str:
                try:
                    detected_dt = datetime.fromisoformat(detected_str)
                    resolved_dt = datetime.fromisoformat(resolved_str)
                    delta = (resolved_dt - detected_dt).total_seconds()
                    if delta >= 0:
                        total_recovery_seconds += delta
                        resolved_count += 1
                except (ValueError, TypeError):
                    pass
        elif row_status in ("detected", "diagnosing", "healing"):
            active_incidents += 1

    auto_resolve_rate = (auto_resolved / total_incidents) if total_incidents > 0 else 0.0
    avg_recovery_seconds = (total_recovery_seconds / resolved_count) if resolved_count > 0 else 0.0

    return BaseResponse(
        data=HealingStatsResponse(
            total_incidents=total_incidents,
            auto_resolved=auto_resolved,
            auto_resolve_rate=round(auto_resolve_rate, 4),
            avg_recovery_seconds=round(avg_recovery_seconds, 1),
            active_incidents=active_incidents,
            by_severity=by_severity,
            by_type=by_type,
        )
    )


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _row_to_incident(row: dict[str, object]) -> IncidentResponse:
    detected_at_raw = str(row.get("detected_at", ""))
    resolved_at_raw = row.get("resolved_at")
    created_at_raw = str(row.get("created_at", ""))

    return IncidentResponse(
        id=str(row["id"]),
        workspace_id=str(row["workspace_id"]),
        pipeline_execution_id=str(row["pipeline_execution_id"]) if row.get("pipeline_execution_id") else None,
        incident_type=str(row["incident_type"]),
        source_service=str(row["source_service"]),
        severity=str(row.get("severity", "medium")),
        status=str(row.get("status", "detected")),
        resolution_action=str(row["resolution_action"]) if row.get("resolution_action") else None,
        resolution_details=row.get("resolution_details") or {},  # type: ignore[arg-type]
        detected_at=datetime.fromisoformat(detected_at_raw),
        resolved_at=datetime.fromisoformat(str(resolved_at_raw)) if resolved_at_raw else None,
        created_at=datetime.fromisoformat(created_at_raw),
    )
