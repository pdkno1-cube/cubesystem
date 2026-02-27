"""Marketing automation router — newsletter delivery & content scheduling.

Endpoints:
  POST   /orchestrate/marketing/newsletter/send         Send newsletter to subscribers
  POST   /orchestrate/marketing/newsletter/send-single  Send single transactional email
  GET    /orchestrate/marketing/subscribers              List subscribers
  POST   /orchestrate/marketing/subscribers              Add subscriber
  DELETE /orchestrate/marketing/subscribers/{email}     Unsubscribe
  POST   /orchestrate/marketing/schedules               Create content schedule
  GET    /orchestrate/marketing/schedules               List schedules
  PATCH  /orchestrate/marketing/schedules/{id}          Update schedule status
  GET    /orchestrate/marketing/analytics/overview      KPI overview (runs, credits, open rate)
  GET    /orchestrate/marketing/analytics/timeseries    Daily timeseries (30 days)
  POST   /orchestrate/marketing/webhooks/resend         Resend email webhook receiver

PRD ref: TEAM_G_DESIGN/prd/PRD-MARKETING-AUTO-v1.md
Skill ref: TEAM_F_SKILLS/registry/SKILL-NEWSLETTER-AGENT.md
"""

from __future__ import annotations

import logging
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field

from app.config import Settings, get_settings
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.schemas.common import BaseResponse, PaginatedResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrate/marketing", tags=["marketing"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _supabase_client(settings: Settings):  # noqa: ANN202
    from supabase import create_client  # noqa: WPS433

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _mcp_registry(settings: Settings):  # noqa: ANN202
    """Build a minimal MCPRegistry for direct email dispatch."""
    from supabase import create_client  # noqa: WPS433

    from app.mcp.registry import MCPRegistry
    from app.security.vault import SecretVault

    sb = create_client(settings.supabase_url, settings.supabase_service_role_key)
    vault = SecretVault(sb)
    return MCPRegistry(vault=vault, supabase_client=sb)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class SubscriberCreate(BaseModel):
    email: EmailStr
    name: str | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, object] = Field(default_factory=dict)


class SubscriberResponse(BaseModel):
    id: str
    email: str
    name: str | None
    tags: list[str]
    status: str
    subscribed_at: datetime


class NewsletterSendRequest(BaseModel):
    workspace_id: str
    subject: str = Field(..., min_length=1, max_length=200)
    html: str = Field(default="")
    text: str = Field(default="")
    tags: list[str] = Field(
        default_factory=list,
        description="Only send to subscribers with these tags. Empty = all subscribers.",
    )
    from_address: str | None = Field(
        default=None,
        description="Override sender address. Defaults to MCP connection default_from.",
    )


class NewsletterSendResponse(BaseModel):
    sent_count: int
    failed_count: int
    email_ids: list[str]
    workspace_id: str


class SingleEmailRequest(BaseModel):
    workspace_id: str
    to: str | list[str]
    subject: str = Field(..., min_length=1)
    html: str = Field(default="")
    text: str = Field(default="")
    from_address: str | None = None
    reply_to: str | None = None


class SingleEmailResponse(BaseModel):
    email_id: str
    to: list[str]
    subject: str


class ContentScheduleCreate(BaseModel):
    workspace_id: str
    pipeline_id: str | None = None
    channel: Literal["instagram", "newsletter", "twitter", "linkedin", "blog"]
    title: str = Field(..., min_length=1, max_length=200)
    content: dict[str, object] = Field(default_factory=dict)
    scheduled_at: datetime
    recurrence: Literal["none", "daily", "weekly", "monthly"] = "none"
    tags: list[str] = Field(default_factory=list)


class ContentScheduleResponse(BaseModel):
    id: str
    workspace_id: str
    pipeline_id: str | None
    channel: str
    title: str
    content: dict[str, object]
    status: str
    scheduled_at: datetime
    recurrence: str
    tags: list[str]
    created_at: datetime


class ScheduleStatusUpdate(BaseModel):
    status: Literal["pending", "running", "completed", "failed", "cancelled"]
    error_message: str | None = None


class ChannelBreakdown(BaseModel):
    channel: str
    executions: int
    credits: float


class AnalyticsOverviewResponse(BaseModel):
    total_executions: int
    total_credits: float
    email_open_rate: float  # 0.0 ~ 1.0
    published_count: int
    channel_breakdown: list[ChannelBreakdown]


class TimeseriesPoint(BaseModel):
    date: str  # YYYY-MM-DD
    executions: int
    published: int
    email_opens: int


class AnalyticsTimeseriesResponse(BaseModel):
    points: list[TimeseriesPoint]


class WebhookEvent(BaseModel):
    type: str  # email.opened, email.clicked, etc.
    data: dict[str, object] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# POST /orchestrate/marketing/newsletter/send
# ---------------------------------------------------------------------------


@router.post(
    "/newsletter/send",
    response_model=BaseResponse[NewsletterSendResponse],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send newsletter to all (or tagged) subscribers",
)
async def send_newsletter(
    body: NewsletterSendRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[NewsletterSendResponse]:
    """Dispatch newsletter via Resend batch API.

    Fetches active subscribers from `newsletter_subscribers` table,
    applies optional tag filter, then sends via Resend `send_batch` action.
    """
    if not body.html and not body.text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "MISSING_CONTENT", "message": "Provide 'html' or 'text' (or both)."},
        )

    sb = _supabase_client(settings)

    # Fetch active subscribers
    query = (
        sb.table("newsletter_subscribers")
        .select("email, name")
        .eq("workspace_id", body.workspace_id)
        .eq("status", "active")
        .is_("deleted_at", "null")
    )
    if body.tags:
        # Filter by any matching tag using Supabase JSONB overlap operator
        query = query.contains("tags", body.tags)

    sub_result = query.execute()
    subscribers: list[dict[str, object]] = sub_result.data or []

    if not subscribers:
        logger.info(
            "No active subscribers for newsletter send: workspace=%s, tags=%s",
            body.workspace_id,
            body.tags,
        )
        return BaseResponse(
            data=NewsletterSendResponse(
                sent_count=0,
                failed_count=0,
                email_ids=[],
                workspace_id=body.workspace_id,
            )
        )

    # Build Resend batch payload (max 100 per call)
    emails_payload: list[dict[str, object]] = []
    for sub in subscribers:
        email_obj: dict[str, object] = {
            "to": str(sub["email"]),
            "subject": body.subject,
        }
        if body.from_address:
            email_obj["from"] = body.from_address
        if body.html:
            email_obj["html"] = body.html
        if body.text:
            email_obj["text"] = body.text
        emails_payload.append(email_obj)

    # Send in chunks of 100
    registry = _mcp_registry(settings)
    sent_count = 0
    failed_count = 0
    email_ids: list[str] = []

    for chunk_start in range(0, len(emails_payload), 100):
        chunk = emails_payload[chunk_start : chunk_start + 100]
        try:
            result = await registry.execute_tool(
                mcp_name="resend",
                workspace_id=body.workspace_id,
                action="send_batch",
                params={"emails": chunk},
            )
            batch_data: list[dict[str, object]] = result.get("data", [])  # type: ignore[assignment]
            for item in batch_data:
                email_id = str(item.get("id", ""))
                if email_id:
                    email_ids.append(email_id)
            sent_count += result.get("sent_count", len(chunk))  # type: ignore[operator]
        except Exception:
            logger.exception(
                "Newsletter batch send failed for chunk start=%d, workspace=%s",
                chunk_start,
                body.workspace_id,
            )
            failed_count += len(chunk)

    # Audit log
    try:
        sb.table("audit_logs").insert({
            "workspace_id": body.workspace_id,
            "user_id": user.user_id,
            "action": "marketing.newsletter.send",
            "category": "marketing",
            "resource_type": "newsletter",
            "details": {
                "subject": body.subject,
                "sent_count": sent_count,
                "failed_count": failed_count,
                "tags": body.tags,
            },
            "severity": "info",
        }).execute()
    except Exception:
        logger.warning("Failed to write newsletter send audit log", exc_info=True)

    return BaseResponse(
        data=NewsletterSendResponse(
            sent_count=sent_count,
            failed_count=failed_count,
            email_ids=email_ids,
            workspace_id=body.workspace_id,
        )
    )


# ---------------------------------------------------------------------------
# POST /orchestrate/marketing/newsletter/send-single
# ---------------------------------------------------------------------------


@router.post(
    "/newsletter/send-single",
    response_model=BaseResponse[SingleEmailResponse],
    summary="Send a single transactional email via Resend",
)
async def send_single_email(
    body: SingleEmailRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[SingleEmailResponse]:
    """Send one transactional email (welcome, confirm, notification)."""
    if not body.html and not body.text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "MISSING_CONTENT", "message": "Provide 'html' or 'text' (or both)."},
        )

    params: dict[str, object] = {
        "to": body.to,
        "subject": body.subject,
    }
    if body.html:
        params["html"] = body.html
    if body.text:
        params["text"] = body.text
    if body.from_address:
        params["from"] = body.from_address
    if body.reply_to:
        params["reply_to"] = body.reply_to

    registry = _mcp_registry(settings)
    result = await registry.execute_tool(
        mcp_name="resend",
        workspace_id=body.workspace_id,
        action="send",
        params=params,
    )

    to_list = body.to if isinstance(body.to, list) else [body.to]
    return BaseResponse(
        data=SingleEmailResponse(
            email_id=str(result.get("email_id", "")),
            to=to_list,
            subject=body.subject,
        )
    )


# ---------------------------------------------------------------------------
# GET /orchestrate/marketing/subscribers
# ---------------------------------------------------------------------------


@router.get(
    "/subscribers",
    response_model=PaginatedResponse[SubscriberResponse],
    summary="List newsletter subscribers",
)
async def list_subscribers(
    workspace_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    tag: str | None = Query(None),
    sub_status: str | None = Query(None, alias="status"),
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> PaginatedResponse[SubscriberResponse]:
    """Paginated list of subscribers for a workspace."""
    sb = _supabase_client(settings)
    offset = (page - 1) * limit

    query = (
        sb.table("newsletter_subscribers")
        .select("id, email, name, tags, status, subscribed_at", count="exact")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
    )
    if tag:
        query = query.contains("tags", [tag])
    if sub_status:
        query = query.eq("status", sub_status)

    result = query.order("subscribed_at", desc=True).range(offset, offset + limit - 1).execute()

    items = [
        SubscriberResponse(
            id=str(row["id"]),
            email=str(row["email"]),
            name=row.get("name"),
            tags=row.get("tags") or [],
            status=str(row.get("status", "active")),
            subscribed_at=datetime.fromisoformat(str(row["subscribed_at"])),
        )
        for row in (result.data or [])
    ]

    return PaginatedResponse(
        data=items,
        total=result.count or 0,
        page=page,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# POST /orchestrate/marketing/subscribers
# ---------------------------------------------------------------------------


@router.post(
    "/subscribers",
    response_model=BaseResponse[SubscriberResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Add a newsletter subscriber",
)
async def add_subscriber(
    workspace_id: str,
    body: SubscriberCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[SubscriberResponse]:
    """Subscribe an email address. Upserts on conflict (email + workspace)."""
    sb = _supabase_client(settings)

    # Upsert to handle re-subscribes gracefully
    result = (
        sb.table("newsletter_subscribers")
        .upsert(
            {
                "workspace_id": workspace_id,
                "email": body.email,
                "name": body.name,
                "tags": body.tags,
                "metadata": body.metadata,
                "status": "active",
                "subscribed_at": datetime.now(tz=timezone.utc).isoformat(),
                "deleted_at": None,
            },
            on_conflict="email,workspace_id",
        )
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "DB_ERROR", "message": "Failed to save subscriber."},
        )

    row = result.data[0]
    return BaseResponse(
        data=SubscriberResponse(
            id=str(row["id"]),
            email=str(row["email"]),
            name=row.get("name"),
            tags=row.get("tags") or [],
            status=str(row.get("status", "active")),
            subscribed_at=datetime.fromisoformat(str(row["subscribed_at"])),
        )
    )


# ---------------------------------------------------------------------------
# DELETE /orchestrate/marketing/subscribers/{email}
# ---------------------------------------------------------------------------


@router.delete(
    "/subscribers/{email}",
    response_model=BaseResponse[dict[str, object]],
    summary="Unsubscribe (soft-delete) a subscriber",
)
async def unsubscribe(
    email: str,
    workspace_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[dict[str, object]]:
    """Soft-delete a subscriber (sets status=unsubscribed, deleted_at=now)."""
    sb = _supabase_client(settings)

    result = (
        sb.table("newsletter_subscribers")
        .update({
            "status": "unsubscribed",
            "deleted_at": datetime.now(tz=timezone.utc).isoformat(),
        })
        .eq("email", email)
        .eq("workspace_id", workspace_id)
        .execute()
    )

    affected = len(result.data or [])
    return BaseResponse(data={"email": email, "unsubscribed": affected > 0})


# ---------------------------------------------------------------------------
# POST /orchestrate/marketing/schedules
# ---------------------------------------------------------------------------


@router.post(
    "/schedules",
    response_model=BaseResponse[ContentScheduleResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a content schedule",
)
async def create_schedule(
    body: ContentScheduleCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[ContentScheduleResponse]:
    """Schedule content for future publishing on a given channel."""
    sb = _supabase_client(settings)

    result = (
        sb.table("content_schedules")
        .insert({
            "workspace_id": body.workspace_id,
            "pipeline_id": body.pipeline_id,
            "channel": body.channel,
            "title": body.title,
            "content": body.content,
            "status": "pending",
            "scheduled_at": body.scheduled_at.isoformat(),
            "recurrence": body.recurrence,
            "tags": body.tags,
            "created_by": user.user_id,
        })
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "DB_ERROR", "message": "Failed to create schedule."},
        )

    row = result.data[0]
    return BaseResponse(data=_row_to_schedule(row))


# ---------------------------------------------------------------------------
# GET /orchestrate/marketing/schedules
# ---------------------------------------------------------------------------


@router.get(
    "/schedules",
    response_model=PaginatedResponse[ContentScheduleResponse],
    summary="List content schedules",
)
async def list_schedules(
    workspace_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    channel: str | None = Query(None),
    sched_status: str | None = Query(None, alias="status"),
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> PaginatedResponse[ContentScheduleResponse]:
    """Paginated list of content schedules."""
    sb = _supabase_client(settings)
    offset = (page - 1) * limit

    query = (
        sb.table("content_schedules")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
    )
    if channel:
        query = query.eq("channel", channel)
    if sched_status:
        query = query.eq("status", sched_status)

    result = (
        query.order("scheduled_at", desc=False)
        .range(offset, offset + limit - 1)
        .execute()
    )

    items = [_row_to_schedule(row) for row in (result.data or [])]
    return PaginatedResponse(data=items, total=result.count or 0, page=page, limit=limit)


# ---------------------------------------------------------------------------
# PATCH /orchestrate/marketing/schedules/{schedule_id}
# ---------------------------------------------------------------------------


@router.patch(
    "/schedules/{schedule_id}",
    response_model=BaseResponse[ContentScheduleResponse],
    summary="Update content schedule status",
)
async def update_schedule_status(
    schedule_id: str,
    body: ScheduleStatusUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[ContentScheduleResponse]:
    """Update the status of a content schedule (e.g., mark as completed)."""
    sb = _supabase_client(settings)

    update_data: dict[str, object] = {"status": body.status}
    if body.error_message:
        update_data["error_message"] = body.error_message
    if body.status == "completed":
        update_data["published_at"] = datetime.now(tz=timezone.utc).isoformat()

    result = (
        sb.table("content_schedules")
        .update(update_data)
        .eq("id", schedule_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Schedule '{schedule_id}' not found."},
        )

    return BaseResponse(data=_row_to_schedule(result.data[0]))


# ---------------------------------------------------------------------------
# GET /orchestrate/marketing/analytics/overview
# ---------------------------------------------------------------------------


@router.get(
    "/analytics/overview",
    response_model=BaseResponse[AnalyticsOverviewResponse],
    summary="KPI overview — executions, credits, open rate, channel breakdown",
)
async def analytics_overview(
    workspace_id: str,
    days: int = Query(30, ge=1, le=365),
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[AnalyticsOverviewResponse]:
    """Aggregate marketing KPIs from content_schedules, pipeline_executions, and content_metrics."""
    sb = _supabase_client(settings)
    since = (datetime.now(tz=timezone.utc) - timedelta(days=days)).isoformat()

    # 1) Content schedules for channel breakdown + published count
    sched_result = (
        sb.table("content_schedules")
        .select("channel, status, created_at")
        .eq("workspace_id", workspace_id)
        .gte("created_at", since)
        .is_("deleted_at", "null")
        .execute()
    )
    schedules: list[dict[str, object]] = sched_result.data or []

    channel_counter: Counter[str] = Counter()
    published_count = 0
    for row in schedules:
        ch = str(row.get("channel", "unknown"))
        channel_counter[ch] += 1
        if row.get("status") == "completed":
            published_count += 1

    # 2) Pipeline executions for total runs + credit sum
    exec_result = (
        sb.table("pipeline_executions")
        .select("id, credits_used, created_at")
        .eq("workspace_id", workspace_id)
        .gte("created_at", since)
        .execute()
    )
    executions: list[dict[str, object]] = exec_result.data or []
    total_executions = len(executions)
    total_credits = sum(float(row.get("credits_used", 0) or 0) for row in executions)

    # 3) Email metrics for open rate (from aggregated opens column in content_metrics)
    metrics_result = (
        sb.table("content_metrics")
        .select("opens, impressions, channel")
        .eq("workspace_id", workspace_id)
        .eq("channel", "newsletter")
        .gte("created_at", since)
        .execute()
    )
    metrics: list[dict[str, object]] = metrics_result.data or []
    total_impressions = sum(int(m.get("impressions", 0) or 0) for m in metrics)
    total_opens = sum(int(m.get("opens", 0) or 0) for m in metrics)
    email_open_rate = (total_opens / total_impressions) if total_impressions > 0 else 0.0

    # Build channel breakdown with estimated credits per channel
    channel_breakdown = [
        ChannelBreakdown(
            channel=ch,
            executions=count,
            credits=round(total_credits * (count / len(schedules)), 2) if schedules else 0,
        )
        for ch, count in channel_counter.most_common()
    ]

    return BaseResponse(
        data=AnalyticsOverviewResponse(
            total_executions=total_executions,
            total_credits=round(total_credits, 2),
            email_open_rate=round(email_open_rate, 4),
            published_count=published_count,
            channel_breakdown=channel_breakdown,
        )
    )


# ---------------------------------------------------------------------------
# GET /orchestrate/marketing/analytics/timeseries
# ---------------------------------------------------------------------------


@router.get(
    "/analytics/timeseries",
    response_model=BaseResponse[AnalyticsTimeseriesResponse],
    summary="Daily timeseries — executions, published, email opens",
)
async def analytics_timeseries(
    workspace_id: str,
    days: int = Query(30, ge=1, le=365),
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[AnalyticsTimeseriesResponse]:
    """Return daily aggregated timeseries for the last N days."""
    sb = _supabase_client(settings)
    now = datetime.now(tz=timezone.utc)
    since = (now - timedelta(days=days)).isoformat()

    # Fetch all three data sources in sequence (PostgREST doesn't support GROUP BY)
    exec_result = (
        sb.table("pipeline_executions")
        .select("created_at")
        .eq("workspace_id", workspace_id)
        .gte("created_at", since)
        .execute()
    )
    sched_result = (
        sb.table("content_schedules")
        .select("published_at")
        .eq("workspace_id", workspace_id)
        .eq("status", "completed")
        .gte("created_at", since)
        .is_("deleted_at", "null")
        .execute()
    )
    metrics_result = (
        sb.table("content_metrics")
        .select("created_at, opens")
        .eq("workspace_id", workspace_id)
        .eq("channel", "newsletter")
        .gte("created_at", since)
        .execute()
    )

    # Build day buckets
    exec_by_day: defaultdict[str, int] = defaultdict(int)
    for row in exec_result.data or []:
        day = str(row.get("created_at", ""))[:10]
        if day:
            exec_by_day[day] += 1

    pub_by_day: defaultdict[str, int] = defaultdict(int)
    for row in sched_result.data or []:
        day = str(row.get("published_at", ""))[:10]
        if day:
            pub_by_day[day] += 1

    opens_by_day: defaultdict[str, int] = defaultdict(int)
    for row in metrics_result.data or []:
        day = str(row.get("created_at", ""))[:10]
        if day:
            opens_by_day[day] += int(row.get("opens", 0) or 0)

    # Fill all days in range
    points: list[TimeseriesPoint] = []
    for i in range(days):
        d = (now - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
        points.append(
            TimeseriesPoint(
                date=d,
                executions=exec_by_day.get(d, 0),
                published=pub_by_day.get(d, 0),
                email_opens=opens_by_day.get(d, 0),
            )
        )

    return BaseResponse(data=AnalyticsTimeseriesResponse(points=points))


# ---------------------------------------------------------------------------
# POST /orchestrate/marketing/webhooks/resend
# ---------------------------------------------------------------------------


@router.post(
    "/webhooks/resend",
    response_model=BaseResponse[dict[str, str]],
    summary="Resend email webhook receiver (opens, clicks)",
)
async def resend_webhook(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> BaseResponse[dict[str, str]]:
    """Receive Resend webhook events (email.opened, email.clicked, etc.)
    and record metrics in content_metrics. No auth required (external webhook).

    Maps event types to columns: email.opened → opens, email.clicked → clicks.
    """
    body = await request.json()
    event_type: str = body.get("type", "unknown")
    event_data: dict[str, object] = body.get("data", {})

    # Map Resend event types to content_metrics columns
    column_map: dict[str, str] = {
        "email.opened": "opens",
        "email.clicked": "clicks",
    }
    metric_column = column_map.get(event_type)

    if metric_column:
        sb = _supabase_client(settings)
        # Store as raw_data and increment the relevant counter.
        # Without a schedule_id, we create a generic newsletter row per day.
        today = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
        try:
            # Upsert: if a row already exists for today + newsletter channel, increment
            existing = (
                sb.table("content_metrics")
                .select("id, opens, clicks")
                .eq("channel", "newsletter")
                .eq("metric_date", today)
                .limit(1)
                .execute()
            )
            if existing.data:
                row = existing.data[0]
                current_val = int(row.get(metric_column, 0) or 0)
                sb.table("content_metrics").update({
                    metric_column: current_val + 1,
                    "raw_data": event_data,
                }).eq("id", str(row["id"])).execute()
            else:
                # Need a workspace_id — extract from tags or use a default approach
                insert_data: dict[str, object] = {
                    "channel": "newsletter",
                    "metric_date": today,
                    metric_column: 1,
                    "raw_data": event_data,
                }
                sb.table("content_metrics").insert(insert_data).execute()
        except Exception:
            logger.exception("Failed to store Resend webhook event: type=%s", event_type)

    return BaseResponse(data={"status": "received", "type": event_type})


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _row_to_schedule(row: dict[str, object]) -> ContentScheduleResponse:
    scheduled_at_raw = row.get("scheduled_at", "")
    created_at_raw = row.get("created_at", "")
    return ContentScheduleResponse(
        id=str(row["id"]),
        workspace_id=str(row["workspace_id"]),
        pipeline_id=str(row["pipeline_id"]) if row.get("pipeline_id") else None,
        channel=str(row["channel"]),
        title=str(row["title"]),
        content=row.get("content") or {},  # type: ignore[arg-type]
        status=str(row.get("status", "pending")),
        scheduled_at=datetime.fromisoformat(str(scheduled_at_raw)),
        recurrence=str(row.get("recurrence", "none")),
        tags=row.get("tags") or [],  # type: ignore[arg-type]
        created_at=datetime.fromisoformat(str(created_at_raw)),
    )
