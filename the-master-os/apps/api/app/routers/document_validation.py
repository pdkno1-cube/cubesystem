"""Document validation router — upload, review, and manage document reviews.

Endpoints:
  GET    /orchestrate/documents/reviews          List document reviews
  POST   /orchestrate/documents/upload           Upload document + trigger validation pipeline
  GET    /orchestrate/documents/reviews/{id}     Single document detail
  PATCH  /orchestrate/documents/reviews/{id}     Update review result
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

import sentry_sdk
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.schemas.common import BaseResponse, PaginatedResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrate/documents", tags=["document-validation"])


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
    """Create a document review record and optionally trigger the validation pipeline."""
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

    return BaseResponse(data=_row_to_review(result.data[0]))


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
