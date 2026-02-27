"""Grant Factory router — 조달입찰 자동 탐색/검증/서류 준비.

Endpoints:
  GET    /orchestrate/grants/tenders       입찰 공고 목록 조회
  POST   /orchestrate/grants/crawl         수동 크롤 트리거 (FireCrawl MCP 연동)
  GET    /orchestrate/grants/submissions   제출 이력
  PATCH  /orchestrate/grants/submissions/{id}  상태 업데이트

PRD ref: F-04a Grant Factory Pipeline
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.mcp.base import MCPConnectionError, MCPExecutionError
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.schemas.common import BaseResponse, PaginatedResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrate/grants", tags=["grants"])

# ---------------------------------------------------------------------------
# Source URLs for tender crawling
# ---------------------------------------------------------------------------
_SOURCE_URLS: dict[str, str] = {
    "g2b": "https://www.g2b.go.kr",
    "나라장터": "https://www.g2b.go.kr",
    "koneps": "https://www.g2b.go.kr",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _supabase_client(settings: Settings):  # noqa: ANN202
    from supabase import create_client  # noqa: WPS433

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


async def _try_get_firecrawl_registry(
    settings: Settings,
    workspace_id: str,
) -> tuple[bool, object | None]:
    """Attempt to create an MCPRegistry and get a FireCrawl client.

    Returns:
        (is_available, registry_or_none) — True + MCPRegistry if FireCrawl
        MCP connection is configured; False + None otherwise.
    """
    try:
        from app.mcp.registry import MCPRegistry  # noqa: WPS433
        from app.security.vault import SecretVault  # noqa: WPS433

        sb = _supabase_client(settings)
        vault = SecretVault(sb)
        registry = MCPRegistry(vault=vault, supabase_client=sb)

        # Probe for an active firecrawl connection — this will raise if not configured
        await registry.get_client("firecrawl", workspace_id)
        return True, registry
    except (MCPExecutionError, MCPConnectionError) as exc:
        logger.info(
            "FireCrawl MCP not available for workspace=%s: %s", workspace_id, exc
        )
        return False, None
    except Exception as exc:
        logger.warning(
            "Unexpected error probing FireCrawl MCP: %s", exc, exc_info=True
        )
        return False, None


def _parse_crawl_results(
    raw_results: dict[str, object],
    workspace_id: str,
    source: str,
    keywords: list[str],
) -> list[dict[str, object]]:
    """Parse FireCrawl search/crawl response into tender submission rows.

    FireCrawl search returns: {"data": [{"url": str, "markdown": str, "title": str}, ...]}
    We extract tender-like entries from the returned pages.
    """
    data_list = raw_results.get("data", [])
    if not isinstance(data_list, list):
        return []

    tenders: list[dict[str, object]] = []
    for idx, item in enumerate(data_list):
        if not isinstance(item, dict):
            continue

        page_url = str(item.get("url", ""))
        page_title = str(item.get("title", ""))
        markdown_content = str(item.get("markdown", ""))

        # Skip pages without meaningful content
        if not page_title and not markdown_content:
            continue

        # Generate a deterministic tender_id from the URL
        url_hash = hashlib.sha256(page_url.encode()).hexdigest()[:8]
        tender_id = f"LIVE-{source.upper()}-{url_hash}"

        # Try to extract organization and deadline from content
        organization = _extract_organization(markdown_content)
        deadline_str = _extract_deadline(markdown_content)
        bid_amount = _extract_bid_amount(markdown_content)

        tenders.append({
            "workspace_id": workspace_id,
            "tender_id": tender_id,
            "tender_title": page_title[:200] if page_title else f"공고 #{idx + 1}",
            "tender_url": page_url,
            "organization": organization,
            "status": "crawled",
            "bid_amount": bid_amount,
            "deadline": deadline_str,
            "documents": [],
            "metadata": {
                "source": source,
                "keywords": keywords,
                "crawl_method": "firecrawl_live",
                "raw_content_length": len(markdown_content),
            },
        })

    return tenders


def _extract_organization(content: str) -> str | None:
    """Extract organization name from crawled content using common patterns."""
    patterns = [
        r"발주기관[:\s]*([^\n,]+)",
        r"수요기관[:\s]*([^\n,]+)",
        r"공고기관[:\s]*([^\n,]+)",
        r"기관명[:\s]*([^\n,]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, content)
        if match:
            return match.group(1).strip()[:100]
    return None


def _extract_deadline(content: str) -> str | None:
    """Extract deadline from crawled content."""
    patterns = [
        r"마감[일\s]*[:\s]*([\d]{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT\d:+]*)",
        r"입찰마감[:\s]*([\d]{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT\d:+]*)",
        r"제출기한[:\s]*([\d]{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT\d:+]*)",
    ]
    for pattern in patterns:
        match = re.search(pattern, content)
        if match:
            return match.group(1).strip()
    return None


def _extract_bid_amount(content: str) -> float | None:
    """Extract bid amount (추정가격/배정예산) from crawled content."""
    patterns = [
        r"추정가격[:\s]*([\d,]+)\s*원",
        r"배정예산[:\s]*([\d,]+)\s*원",
        r"사업금액[:\s]*([\d,]+)\s*원",
    ]
    for pattern in patterns:
        match = re.search(pattern, content)
        if match:
            amount_str = match.group(1).replace(",", "")
            try:
                return float(amount_str)
            except ValueError:
                continue
    return None


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
    source: Literal["live", "simulated"] = "simulated"


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
    summary="Trigger manual tender crawl (FireCrawl MCP with fallback simulation)",
)
async def trigger_crawl(
    body: CrawlRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[CrawlResponse]:
    """Crawl tenders from G2B / 나라장터.

    Strategy (graceful degradation):
      1. Check if FireCrawl MCP is configured (vault에서 API 키 조회)
      2. If yes → execute live search via FireCrawl, parse results
      3. If no  → fall back to simulated mock data
      4. Upsert results into tender_submissions (deduplicate by tender_id)
      5. Response includes ``source: 'live' | 'simulated'`` for transparency
    """
    sb = _supabase_client(settings)

    logger.info(
        "Grant crawl triggered: workspace=%s keywords=%s source=%s user=%s",
        body.workspace_id,
        body.keywords,
        body.source,
        user.user_id,
    )

    # --- Attempt live FireCrawl MCP crawl ---
    crawl_source: Literal["live", "simulated"] = "simulated"
    tender_rows: list[dict[str, object]] = []

    firecrawl_available, registry = await _try_get_firecrawl_registry(
        settings, body.workspace_id
    )

    if firecrawl_available and registry is not None:
        try:
            # Build search query from keywords + source
            keyword_query = " ".join(body.keywords) if body.keywords else "조달 입찰 공고"
            source_url = _SOURCE_URLS.get(body.source, "")
            search_query = f"{keyword_query} site:{source_url}" if source_url else keyword_query

            logger.info(
                "Executing FireCrawl live search: query=%s workspace=%s",
                search_query,
                body.workspace_id,
            )

            raw_results = await registry.execute_tool(  # type: ignore[union-attr]
                mcp_name="firecrawl",
                workspace_id=body.workspace_id,
                action="search",
                params={"query": search_query, "limit": 10},
            )

            tender_rows = _parse_crawl_results(
                raw_results=raw_results,
                workspace_id=body.workspace_id,
                source=body.source,
                keywords=body.keywords,
            )
            crawl_source = "live"

            logger.info(
                "FireCrawl live search returned %d tender candidates",
                len(tender_rows),
            )

        except (MCPExecutionError, MCPConnectionError) as exc:
            logger.warning(
                "FireCrawl MCP execution failed, falling back to simulation: %s", exc
            )
            # Fall through to simulated data below

    # --- Fallback: simulated tender data ---
    if not tender_rows:
        crawl_source = "simulated"
        tender_rows = [
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
                "metadata": {
                    "source": body.source,
                    "keywords": body.keywords,
                    "crawl_method": "simulated",
                },
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

    # --- Upsert tenders into DB (deduplicate by tender_id per workspace) ---
    inserted: list[TenderSubmission] = []
    for tender in tender_rows:
        existing = (
            sb.table("tender_submissions")
            .select("id")
            .eq("workspace_id", body.workspace_id)
            .eq("tender_id", str(tender["tender_id"]))
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

    source_label = "실시간 크롤링" if crawl_source == "live" else "시뮬레이션"
    response = CrawlResponse(
        message=f"[{source_label}] {len(inserted)}건의 신규 공고를 수집했습니다.",
        tenders_found=len(inserted),
        tenders=inserted,
        source=crawl_source,
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
