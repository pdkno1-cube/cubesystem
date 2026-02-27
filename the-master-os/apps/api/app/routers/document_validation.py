"""Document validation router — upload, review, and manage document reviews.

Endpoints:
  GET    /orchestrate/documents/reviews          List document reviews
  POST   /orchestrate/documents/upload           Upload document + trigger validation pipeline
  GET    /orchestrate/documents/reviews/{id}     Single document detail
  PATCH  /orchestrate/documents/reviews/{id}     Update review result

Validation pipeline (triggered on upload):
  1. Format validation   — file size, extension, required fields (Python)
  2. Content validation  — LLM-based compliance check (if API key configured)
  3. Status update       — reviewing -> approved/rejected with issues array
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.schemas.common import BaseResponse, PaginatedResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrate/documents", tags=["document-validation"])

# ---------------------------------------------------------------------------
# Validation constants
# ---------------------------------------------------------------------------

_ALLOWED_EXTENSIONS = frozenset({
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".hwp", ".hwpx", ".ppt", ".pptx",
    ".jpg", ".jpeg", ".png", ".tiff",
})

_MAX_FILE_SIZE_MB = 50

# Document type → required fields for compliance
_REQUIRED_FIELDS_BY_TYPE: dict[str, list[str]] = {
    "사업자등록증": ["사업자등록번호", "상호", "대표자"],
    "business_registration": ["사업자등록번호", "상호", "대표자"],
    "이행실적증명서": ["계약명", "계약금액", "이행기간"],
    "performance_certificate": ["계약명", "계약금액", "이행기간"],
    "재무제표": ["자산총계", "부채총계", "매출액"],
    "financial_statement": ["자산총계", "부채총계", "매출액"],
    "입찰참가신청서": ["공고번호", "업체명", "입찰금액"],
    "bid_application": ["공고번호", "업체명", "입찰금액"],
}

_LLM_COMPLIANCE_SYSTEM_PROMPT = """당신은 조달 입찰 문서를 검토하는 전문 검증 에이전트입니다.
주어진 문서 정보를 분석하여 다음을 판단하세요:

1. 문서가 올바른 유형인지 (document_type과 일치하는지)
2. 필수 항목이 포함되어 있는지
3. 형식이 적절한지
4. 위조/변조 징후가 있는지

반드시 JSON 형식으로 응답하세요:
{
  "status": "approved" | "rejected",
  "issues": [
    {"code": "string", "severity": "info|warning|error|critical", "message": "string", "field": "string|null"}
  ],
  "summary": "종합 판단 요약"
}

주의: issues가 비어있으면 approved, critical/error 이슈가 있으면 rejected로 판단하세요.
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _supabase_client(settings: Settings):  # noqa: ANN202
    from supabase import create_client  # noqa: WPS433

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class IssueItem(BaseModel):
    code: str
    severity: Literal["info", "warning", "error", "critical"] = "warning"
    message: str
    field: str | None = None


class DocumentReviewResponse(BaseModel):
    id: str
    workspace_id: str
    pipeline_execution_id: str | None
    document_name: str
    document_type: str
    file_url: str | None
    status: str
    issues: list[IssueItem]
    reviewer_notes: str | None
    gdrive_file_id: str | None
    created_at: datetime
    updated_at: datetime


class DocumentUploadRequest(BaseModel):
    workspace_id: str
    document_name: str = Field(..., min_length=1, max_length=200)
    document_type: str = Field(default="general")
    file_url: str | None = None


class DocumentReviewUpdate(BaseModel):
    status: Literal["pending", "reviewing", "approved", "rejected", "archived"] | None = None
    reviewer_notes: str | None = None
    issues: list[IssueItem] | None = None
    gdrive_file_id: str | None = None
    agent_id: str | None = Field(
        default=None, description="Agent UUID — records quality_score metric on approved/rejected"
    )


# ---------------------------------------------------------------------------
# GET /orchestrate/documents/reviews
# ---------------------------------------------------------------------------


@router.get(
    "/reviews",
    response_model=PaginatedResponse[DocumentReviewResponse],
    summary="List document reviews",
)
async def list_reviews(
    workspace_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    review_status: str | None = Query(None, alias="status"),
    document_type: str | None = Query(None),
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> PaginatedResponse[DocumentReviewResponse]:
    """Paginated list of document reviews for a workspace."""
    sb = _supabase_client(settings)
    offset = (page - 1) * limit

    query = (
        sb.table("document_reviews")
        .select("*", count="exact")
        .eq("workspace_id", workspace_id)
    )
    if review_status:
        query = query.eq("status", review_status)
    if document_type:
        query = query.eq("document_type", document_type)

    result = (
        query.order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    items = [_row_to_review(row) for row in (result.data or [])]
    return PaginatedResponse(data=items, total=result.count or 0, page=page, limit=limit)


# ---------------------------------------------------------------------------
# POST /orchestrate/documents/upload
# ---------------------------------------------------------------------------


@router.post(
    "/upload",
    response_model=BaseResponse[DocumentReviewResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Upload document and trigger validation pipeline",
)
async def upload_document(
    body: DocumentUploadRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[DocumentReviewResponse]:
    """Create a document review record and trigger the async validation pipeline.

    Pipeline stages:
      1. Insert record with status='pending'
      2. Fire-and-forget background task:
         a) Format validation (extension, size, required fields)
         b) LLM compliance check (if anthropic/openai key configured)
         c) Update status to 'approved' or 'rejected' with issues
    """
    sb = _supabase_client(settings)

    insert_data: dict[str, object] = {
        "workspace_id": body.workspace_id,
        "document_name": body.document_name,
        "document_type": body.document_type,
        "file_url": body.file_url,
        "status": "pending",
        "issues": [],
    }

    result = sb.table("document_reviews").insert(insert_data).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "DB_ERROR", "message": "Failed to create document review."},
        )

    row = result.data[0]

    # Audit log
    try:
        sb.table("audit_logs").insert(
            {
                "workspace_id": body.workspace_id,
                "user_id": user.user_id,
                "action": "documents.upload",
                "resource_type": "document_review",
                "resource_id": str(row["id"]),
                "details": {
                    "document_name": body.document_name,
                    "document_type": body.document_type,
                },
                "severity": "info",
            }
        ).execute()
    except Exception:
        logger.warning("Failed to write document upload audit log", exc_info=True)

    # --- Fire-and-forget: async validation pipeline ---
    asyncio.create_task(
        _run_validation_pipeline(
            review_id=str(row["id"]),
            document_name=body.document_name,
            document_type=body.document_type,
            file_url=body.file_url,
            workspace_id=body.workspace_id,
            settings=settings,
        )
    )

    return BaseResponse(data=_row_to_review(row))


# ---------------------------------------------------------------------------
# GET /orchestrate/documents/reviews/{review_id}
# ---------------------------------------------------------------------------


@router.get(
    "/reviews/{review_id}",
    response_model=BaseResponse[DocumentReviewResponse],
    summary="Get single document review detail",
)
async def get_review(
    review_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[DocumentReviewResponse]:
    """Retrieve a single document review by ID."""
    sb = _supabase_client(settings)

    result = (
        sb.table("document_reviews")
        .select("*")
        .eq("id", review_id)
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Document review '{review_id}' not found."},
        )

    return BaseResponse(data=_row_to_review(result.data[0]))


# ---------------------------------------------------------------------------
# PATCH /orchestrate/documents/reviews/{review_id}
# ---------------------------------------------------------------------------


@router.patch(
    "/reviews/{review_id}",
    response_model=BaseResponse[DocumentReviewResponse],
    summary="Update document review result",
)
async def update_review(
    review_id: str,
    body: DocumentReviewUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[DocumentReviewResponse]:
    """Update the status, issues, or notes of a document review."""
    sb = _supabase_client(settings)

    update_data: dict[str, object] = {}
    if body.status is not None:
        update_data["status"] = body.status
    if body.reviewer_notes is not None:
        update_data["reviewer_notes"] = body.reviewer_notes
    if body.issues is not None:
        update_data["issues"] = [issue.model_dump() for issue in body.issues]
    if body.gdrive_file_id is not None:
        update_data["gdrive_file_id"] = body.gdrive_file_id

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "NO_UPDATE", "message": "No fields to update."},
        )

    result = (
        sb.table("document_reviews")
        .update(update_data)
        .eq("id", review_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Document review '{review_id}' not found."},
        )

    # Audit log
    try:
        sb.table("audit_logs").insert(
            {
                "workspace_id": str(result.data[0].get("workspace_id", "")),
                "user_id": user.user_id,
                "action": "documents.review.update",
                "resource_type": "document_review",
                "resource_id": review_id,
                "details": update_data,
                "severity": "info",
            }
        ).execute()
    except Exception:
        logger.warning("Failed to write document review update audit log", exc_info=True)

    # Record agent quality metric on final review status
    if body.status in ("approved", "rejected") and body.agent_id:
        try:
            from app.services.agent_metrics import record_agent_metric

            workspace_id = str(result.data[0].get("workspace_id", ""))
            # approved = 100, rejected = 0 (quality score)
            quality_value = 100.0 if body.status == "approved" else 0.0
            await record_agent_metric(
                supabase=sb,
                agent_id=body.agent_id,
                workspace_id=workspace_id,
                metric_type="quality_score",
                value=quality_value,
            )
        except Exception:
            logger.warning(
                "Failed to record agent quality metric for review=%s agent=%s",
                review_id,
                body.agent_id,
                exc_info=True,
            )

    return BaseResponse(data=_row_to_review(result.data[0]))


# ---------------------------------------------------------------------------
# Validation pipeline (background task)
# ---------------------------------------------------------------------------


async def _run_validation_pipeline(
    review_id: str,
    document_name: str,
    document_type: str,
    file_url: str | None,
    workspace_id: str,
    settings: Settings,
) -> None:
    """Execute the document validation pipeline as a background task.

    Stages:
      1. Update status to 'reviewing'
      2. Format validation (extension, size heuristic, required fields)
      3. LLM compliance check (if API key available)
      4. Update final status + issues
    """
    sb = _supabase_client(settings)

    try:
        # Stage 0: Mark as reviewing
        sb.table("document_reviews").update(
            {"status": "reviewing"}
        ).eq("id", review_id).execute()

        issues: list[dict[str, str | None]] = []

        # Stage 1: Format validation
        format_issues = _validate_format(
            document_name=document_name,
            document_type=document_type,
            file_url=file_url,
        )
        issues.extend(format_issues)

        # Stage 2: LLM compliance check (optional — graceful if no key)
        llm_available = bool(settings.anthropic_api_key or settings.openai_api_key)

        if llm_available:
            llm_result = await _run_llm_compliance_check(
                document_name=document_name,
                document_type=document_type,
                file_url=file_url,
                format_issues=format_issues,
                settings=settings,
            )
            if llm_result is not None:
                llm_status, llm_issues = llm_result
                issues.extend(llm_issues)

                # LLM determines final status if available
                has_blocking = any(
                    i.get("severity") in ("error", "critical") for i in issues
                )
                final_status = "rejected" if has_blocking else llm_status
            else:
                # LLM call failed — decide based on format issues only
                has_blocking = any(
                    i.get("severity") in ("error", "critical") for i in issues
                )
                final_status = "rejected" if has_blocking else "approved"
        else:
            # No LLM key — format-only validation
            logger.info(
                "No LLM API key configured; performing format-only validation for review=%s",
                review_id,
            )
            has_blocking = any(
                i.get("severity") in ("error", "critical") for i in issues
            )
            if has_blocking:
                final_status = "rejected"
            else:
                # Without LLM, leave as 'reviewing' for manual human review
                final_status = "reviewing"

        # Stage 3: Update DB with results
        sb.table("document_reviews").update({
            "status": final_status,
            "issues": issues,
        }).eq("id", review_id).execute()

        logger.info(
            "Validation pipeline completed: review=%s status=%s issues=%d llm=%s",
            review_id,
            final_status,
            len(issues),
            "yes" if llm_available else "no",
        )

    except Exception as exc:
        logger.error(
            "Validation pipeline failed for review=%s: %s",
            review_id,
            exc,
            exc_info=True,
        )
        # Ensure the record doesn't stay in 'pending' forever
        try:
            sb.table("document_reviews").update({
                "status": "reviewing",
                "issues": [{
                    "code": "PIPELINE_ERROR",
                    "severity": "warning",
                    "message": f"자동 검증 중 오류 발생. 수동 검토 필요: {exc}",
                    "field": None,
                }],
            }).eq("id", review_id).execute()
        except Exception:
            logger.error(
                "Failed to update review status after pipeline error: review=%s",
                review_id,
                exc_info=True,
            )


def _validate_format(
    document_name: str,
    document_type: str,
    file_url: str | None,
) -> list[dict[str, str | None]]:
    """Stage 1: Format validation — extension, size heuristic, required fields.

    Returns:
        List of issue dicts (may be empty if all checks pass).
    """
    issues: list[dict[str, str | None]] = []

    # Check file extension
    ext_match = re.search(r"\.\w+$", document_name.lower())
    if ext_match:
        extension = ext_match.group(0)
        if extension not in _ALLOWED_EXTENSIONS:
            issues.append({
                "code": "INVALID_EXTENSION",
                "severity": "error",
                "message": (
                    f"허용되지 않는 파일 확장자입니다: '{extension}'. "
                    f"허용 확장자: {', '.join(sorted(_ALLOWED_EXTENSIONS))}"
                ),
                "field": "document_name",
            })
    else:
        issues.append({
            "code": "MISSING_EXTENSION",
            "severity": "warning",
            "message": "파일명에 확장자가 없습니다. 올바른 파일인지 확인하세요.",
            "field": "document_name",
        })

    # Check file URL presence
    if not file_url:
        issues.append({
            "code": "MISSING_FILE_URL",
            "severity": "warning",
            "message": "파일 URL이 제공되지 않았습니다. 파일 업로드 후 URL을 연결해주세요.",
            "field": "file_url",
        })

    # Check document name length
    if len(document_name.strip()) < 3:
        issues.append({
            "code": "INVALID_DOCUMENT_NAME",
            "severity": "error",
            "message": "문서 이름이 너무 짧습니다 (최소 3자).",
            "field": "document_name",
        })

    # Check required fields for known document types
    required_fields = _REQUIRED_FIELDS_BY_TYPE.get(document_type)
    if required_fields:
        issues.append({
            "code": "REQUIRED_FIELDS_NOTE",
            "severity": "info",
            "message": (
                f"문서 유형 '{document_type}'의 필수 항목: "
                f"{', '.join(required_fields)}. 수동 확인 필요."
            ),
            "field": None,
        })

    return issues


async def _run_llm_compliance_check(
    document_name: str,
    document_type: str,
    file_url: str | None,
    format_issues: list[dict[str, str | None]],
    settings: Settings,
) -> tuple[str, list[dict[str, str | None]]] | None:
    """Stage 2: LLM-based compliance analysis.

    Returns:
        (status, issues_list) or None if LLM invocation fails.
    """
    import json  # noqa: WPS433

    try:
        from app.llm.client import LLMClient  # noqa: WPS433

        llm_client = LLMClient(_settings=settings)

        # Build a pseudo agent row for the LLM client
        # Prefer Anthropic if available, fallback to OpenAI
        if settings.anthropic_api_key:
            agent_row: dict[str, object] = {
                "model_provider": "anthropic",
                "model": "claude-haiku-3-20250310",
                "system_prompt": _LLM_COMPLIANCE_SYSTEM_PROMPT,
                "parameters": {"temperature": 0.2, "max_tokens": 2048},
            }
        else:
            agent_row = {
                "model_provider": "openai",
                "model": "gpt-4o-mini",
                "system_prompt": _LLM_COMPLIANCE_SYSTEM_PROMPT,
                "parameters": {"temperature": 0.2, "max_tokens": 2048},
            }

        # Compose user message with document context
        format_issues_summary = json.dumps(format_issues, ensure_ascii=False) if format_issues else "없음"
        user_message = (
            f"다음 문서를 검증해주세요:\n\n"
            f"- 문서명: {document_name}\n"
            f"- 문서 유형: {document_type}\n"
            f"- 파일 URL: {file_url or '미제공'}\n"
            f"- 형식 검증 결과: {format_issues_summary}\n\n"
            f"위 정보를 바탕으로 문서의 적합성을 판단하고, "
            f"JSON 형식으로 응답해주세요."
        )

        messages = [{"role": "user", "content": user_message}]
        response = await llm_client.invoke(agent_row, messages)

        # Parse LLM response (expected JSON)
        content = response.content.strip()
        # Strip markdown code fence if present
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)

        parsed = json.loads(content)
        llm_status = str(parsed.get("status", "reviewing"))
        raw_issues = parsed.get("issues", [])

        llm_issues: list[dict[str, str | None]] = []
        if isinstance(raw_issues, list):
            for issue in raw_issues:
                if isinstance(issue, dict):
                    llm_issues.append({
                        "code": str(issue.get("code", "LLM_ISSUE")),
                        "severity": str(issue.get("severity", "warning")),
                        "message": str(issue.get("message", "")),
                        "field": issue.get("field"),
                    })

        logger.info(
            "LLM compliance check completed: status=%s issues=%d model=%s cost=%.6f",
            llm_status,
            len(llm_issues),
            response.model,
            response.cost,
        )

        return llm_status, llm_issues

    except json.JSONDecodeError as exc:
        logger.warning(
            "LLM returned non-JSON response for compliance check: %s", exc
        )
        return None
    except Exception as exc:
        logger.warning(
            "LLM compliance check failed (non-critical): %s", exc, exc_info=True
        )
        return None


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _row_to_review(row: dict[str, object]) -> DocumentReviewResponse:
    """Convert a raw Supabase row to a DocumentReviewResponse."""
    raw_issues = row.get("issues") or []
    issues: list[IssueItem] = []
    if isinstance(raw_issues, list):
        for item in raw_issues:
            if isinstance(item, dict):
                issues.append(
                    IssueItem(
                        code=str(item.get("code", "UNKNOWN")),
                        severity=str(item.get("severity", "warning")),  # type: ignore[arg-type]
                        message=str(item.get("message", "")),
                        field=item.get("field"),  # type: ignore[arg-type]
                    )
                )

    return DocumentReviewResponse(
        id=str(row["id"]),
        workspace_id=str(row["workspace_id"]),
        pipeline_execution_id=str(row["pipeline_execution_id"]) if row.get("pipeline_execution_id") else None,
        document_name=str(row["document_name"]),
        document_type=str(row.get("document_type", "general")),
        file_url=str(row["file_url"]) if row.get("file_url") else None,
        status=str(row.get("status", "pending")),
        issues=issues,
        reviewer_notes=str(row["reviewer_notes"]) if row.get("reviewer_notes") else None,
        gdrive_file_id=str(row["gdrive_file_id"]) if row.get("gdrive_file_id") else None,
        created_at=datetime.fromisoformat(str(row["created_at"])),
        updated_at=datetime.fromisoformat(str(row["updated_at"])),
    )
