"""Grant Factory router — 조달입찰 자동 탐색/검증/서류 준비.

Endpoints:
  GET    /orchestrate/grants/tenders       입찰 공고 목록 조회
  POST   /orchestrate/grants/crawl         수동 크롤 트리거
  GET    /orchestrate/grants/submissions   제출 이력
  PATCH  /orchestrate/grants/submissions/{id}  상태 업데이트

PRD ref: F-04a Grant Factory Pipeline
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.schemas.common import BaseResponse, PaginatedResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrate/grants", tags=["grants"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _supabase_client(settings: Settings):  # noqa: ANN202
    from supabase import create_client  # noqa: WPS433

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class TenderSubmission(BaseModel):
    """Tender submission row from DB."""

    id: str
    workspace_id: str
    pipeline_execution_id: str | None = None
    tender_id: str
    tender_title: str
    tender_url: str | None = None
    organization: str | None = None
    status: str
    bid_amount: float | None = None
    deadline: str | None = None
    documents: list[dict[str, object]] = Field(default_factory=list)
    metadata: dict[str, object] = Field(default_factory=dict)
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class CrawlRequest(BaseModel):
    """Request body for manual crawl trigger."""

    workspace_id: str
    keywords: list[str] = Field(default_factory=list, min_length=0)
    source: str = "g2b"


class CrawlResponse(BaseModel):
    """Response for crawl trigger."""

    message: str
    tenders_found: int
    tenders: list[TenderSubmission] = Field(default_factory=list)


class SubmissionPatchBody(BaseModel):
    """Patch body for submission status update."""

    status: Literal[
        "draft", "crawled", "eligible", "reviewing",
        "docs_ready", "submitted", "won", "lost",
    ] | None = None
    bid_amount: float | None = None
    documents: list[dict[str, object]] | None = None
    metadata: dict[str, object] | None = None


# ---------------------------------------------------------------------------
# GET /orchestrate/grants/tenders — 입찰 공고 목록 조회
# ---------------------------------------------------------------------------


@router.get(
    "/tenders",
    response_model=PaginatedResponse[TenderSubmission],
    summary="List tender submissions (public tenders)",
)
async def list_tenders(
    workspace_id: str = Query(..., description="Target workspace ID"),
    status_filter: str | None = Query(None, alias="status", description="Filter by status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> PaginatedResponse[TenderSubmission]:
    """Retrieve paginated tender submissions for a workspace."""
    sb = _supabase_client(settings)

    query = (
        sb.table("tender_submissions")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .range((page - 1) * limit, page * limit - 1)
    )

    if status_filter:
        query = query.eq("status", status_filter)

    result = query.execute()
    rows = result.data or []
    total = result.count or 0

    tenders = [TenderSubmission(**row) for row in rows]
    return PaginatedResponse(data=tenders, total=total, page=page, limit=limit)


# ---------------------------------------------------------------------------
# POST /orchestrate/grants/crawl — 수동 크롤 트리거
# ---------------------------------------------------------------------------


@router.post(
    "/crawl",
    response_model=BaseResponse[CrawlResponse],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger manual tender crawl (FireCrawl MCP simulation)",
)
async def trigger_crawl(
    body: CrawlRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[CrawlResponse]:
    """Simulate crawling tenders from G2B / 나라장터.

    In production, this dispatches a FireCrawl MCP call. Currently returns
    simulated results to validate the pipeline structure.
    """
    sb = _supabase_client(settings)

    logger.info(
        "Grant crawl triggered: workspace=%s keywords=%s source=%s user=%s",
        body.workspace_id,
        body.keywords,
        body.source,
        user.user_id,
    )

    # -- Simulated crawl results (FireCrawl MCP placeholder) --
    now_iso = datetime.now(tz=timezone.utc).isoformat()
    simulated_tenders = [
        {
            "workspace_id": body.workspace_id,
            "tender_id": f"G2B-2026-{idx:04d}",
            "tender_title": title,
            "tender_url": f"https://www.g2b.go.kr/pt/detail/{idx}",
            "organization": org,
            "status": "crawled",
            "bid_amount": amount,
            "deadline": deadline,
            "documents": [],
            "metadata": {"source": body.source, "keywords": body.keywords},
        }
        for idx, (title, org, amount, deadline) in enumerate(
            [
                (
                    "AI 기반 문서 자동화 시스템 구축",
                    "조달청",
                    150000000,
                    "2026-04-15T18:00:00+09:00",
                ),
                (
                    "공공데이터 분석 플랫폼 고도화",
                    "행정안전부",
                    280000000,
                    "2026-04-20T18:00:00+09:00",
                ),
                (
                    "클라우드 보안 관제 시스템 도입",
                    "과학기술정보통신부",
                    95000000,
                    "2026-03-30T18:00:00+09:00",
                ),
            ],
            start=1,
        )
    ]

    # Upsert simulated tenders into DB
    inserted: list[TenderSubmission] = []
    for tender in simulated_tenders:
        # Check if tender_id already exists for this workspace
        existing = (
            sb.table("tender_submissions")
            .select("id")
            .eq("workspace_id", body.workspace_id)
            .eq("tender_id", tender["tender_id"])
            .execute()
        )
        if existing.data and len(existing.data) > 0:
            continue

        result = (
            sb.table("tender_submissions")
            .insert(tender)
            .execute()
        )
        if result.data:
            inserted.append(TenderSubmission(**result.data[0]))

    response = CrawlResponse(
        message=f"{len(inserted)}건의 신규 공고를 수집했습니다.",
        tenders_found=len(inserted),
        tenders=inserted,
    )
    return BaseResponse(data=response)


# ---------------------------------------------------------------------------
# GET /orchestrate/grants/submissions — 제출 이력
# ---------------------------------------------------------------------------


@router.get(
    "/submissions",
    response_model=PaginatedResponse[TenderSubmission],
    summary="List submission history",
)
async def list_submissions(
    workspace_id: str = Query(..., description="Target workspace ID"),
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> PaginatedResponse[TenderSubmission]:
    """Retrieve submission history — only non-draft statuses by default."""
    sb = _supabase_client(settings)

    query = (
        sb.table("tender_submissions")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
        .order("updated_at", desc=True)
        .range((page - 1) * limit, page * limit - 1)
    )

    if status_filter:
        query = query.eq("status", status_filter)
    else:
        query = query.neq("status", "draft")

    result = query.execute()
    rows = result.data or []
    total = result.count or 0

    submissions = [TenderSubmission(**row) for row in rows]
    return PaginatedResponse(data=submissions, total=total, page=page, limit=limit)


# ---------------------------------------------------------------------------
# PATCH /orchestrate/grants/submissions/{id} — 상태 업데이트
# ---------------------------------------------------------------------------


@router.patch(
    "/submissions/{submission_id}",
    response_model=BaseResponse[TenderSubmission],
    summary="Update tender submission status",
)
async def update_submission(
    submission_id: str,
    body: SubmissionPatchBody,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[TenderSubmission]:
    """Update the status or fields of a tender submission."""
    sb = _supabase_client(settings)

    # Build update payload — only include non-None fields
    update_data: dict[str, object] = {}
    if body.status is not None:
        update_data["status"] = body.status
    if body.bid_amount is not None:
        update_data["bid_amount"] = body.bid_amount
    if body.documents is not None:
        update_data["documents"] = body.documents
    if body.metadata is not None:
        update_data["metadata"] = body.metadata

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "VALIDATION_ERROR", "message": "No fields to update"},
        )

    logger.info(
        "Submission update: id=%s fields=%s user=%s",
        submission_id,
        list(update_data.keys()),
        user.user_id,
    )

    result = (
        sb.table("tender_submissions")
        .update(update_data)
        .eq("id", submission_id)
        .execute()
    )

    if not result.data or len(result.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "NOT_FOUND",
                "message": f"Submission '{submission_id}' not found",
            },
        )

    submission = TenderSubmission(**result.data[0])
    return BaseResponse(data=submission)
