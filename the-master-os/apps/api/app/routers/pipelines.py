"""Pipeline orchestration router.

ARCH-MASTEROS-v1 section 3.2 -- Pipeline Orchestration:
  POST /orchestrate/pipeline/start
  GET  /orchestrate/pipeline/{execution_id}/status
  POST /orchestrate/pipeline/{execution_id}/cancel
  GET  /orchestrate/pipeline/{execution_id}/steps
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.middleware.auth import AuthenticatedUser, get_current_user
from app.middleware.rate_limiter import RATE_PIPELINE_EXECUTE, limiter
from app.schemas.common import BaseResponse
from app.schemas.pipelines import (
    PipelineStartRequest,
    PipelineStatusResponse,
    PipelineStepResponse,
    PipelineStepsListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrate/pipeline", tags=["pipelines"])


def _get_pipeline_engine(request: Request):  # noqa: ANN202
    """Retrieve the PipelineEngine from app.state."""
    engine = getattr(request.app.state, "pipeline_engine", None)
    if engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "ENGINE_UNAVAILABLE",
                "message": "Pipeline engine is not initialised",
            },
        )
    return engine


@router.post(
    "/start",
    response_model=BaseResponse[PipelineStatusResponse],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start a pipeline execution",
)
async def start_pipeline(
    body: PipelineStartRequest,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
) -> BaseResponse[PipelineStatusResponse]:
    """Dispatch a new pipeline execution to the LangGraph engine.

    The execution runs as a background task so this endpoint returns
    immediately with status ``running``.
    """
    engine = _get_pipeline_engine(request)

    logger.info(
        "Pipeline start requested: pipeline_id=%s workspace_id=%s user=%s",
        body.pipeline_id,
        body.workspace_id,
        user.user_id,
    )

    # Fire-and-forget background execution
    task = asyncio.create_task(
        engine.execute(
            pipeline_id=body.pipeline_id,
            workspace_id=body.workspace_id,
            user_id=user.user_id,
            input_data=body.input_params,
        )
    )

    # Use body.execution_id if provided, otherwise let the engine generate one
    execution_id = body.execution_id

    response_data = PipelineStatusResponse(
        execution_id=execution_id,
        pipeline_id=body.pipeline_id,
        workspace_id=body.workspace_id,
        status="running",
        current_step=None,
        progress_pct=0.0,
        credits_used=0.0,
        started_at=datetime.now(tz=timezone.utc),
    )

    return BaseResponse(data=response_data)


@router.get(
    "/{execution_id}/status",
    response_model=BaseResponse[PipelineStatusResponse],
    summary="Get pipeline execution status",
)
async def get_pipeline_status(
    execution_id: str,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
) -> BaseResponse[PipelineStatusResponse]:
    """Retrieve the current status of a pipeline execution."""
    engine = _get_pipeline_engine(request)

    logger.info(
        "Pipeline status requested: execution_id=%s user=%s",
        execution_id,
        user.user_id,
    )

    result = await engine.get_execution_status(execution_id)

    if "error" in result and "execution_id" not in result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "NOT_FOUND",
                "message": result["error"],
            },
        )

    response_data = PipelineStatusResponse(
        execution_id=result.get("execution_id", execution_id),
        pipeline_id=result.get("pipeline_id", ""),
        workspace_id=result.get("workspace_id", ""),
        status=result.get("status", "pending"),
        current_step=None,
        progress_pct=100.0 if result.get("status") == "completed" else 0.0,
        credits_used=result.get("total_credits", 0.0),
        started_at=result.get("started_at"),
        completed_at=result.get("completed_at"),
        error=result.get("error"),
    )

    return BaseResponse(data=response_data)


@router.post(
    "/{execution_id}/cancel",
    response_model=BaseResponse[PipelineStatusResponse],
    summary="Cancel a running pipeline execution",
)
async def cancel_pipeline(
    execution_id: str,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
) -> BaseResponse[PipelineStatusResponse]:
    """Request cancellation of a running pipeline."""
    engine = _get_pipeline_engine(request)

    logger.info(
        "Pipeline cancel requested: execution_id=%s user=%s",
        execution_id,
        user.user_id,
    )

    result = await engine.cancel_execution(execution_id)

    if "error" in result and result.get("status") is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "NOT_FOUND",
                "message": result["error"],
            },
        )

    if "error" in result:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "INVALID_STATE",
                "message": result["error"],
            },
        )

    response_data = PipelineStatusResponse(
        execution_id=execution_id,
        pipeline_id="",
        workspace_id="",
        status="cancelled",
    )

    return BaseResponse(data=response_data)


@router.get(
    "/{execution_id}/steps",
    response_model=BaseResponse[PipelineStepsListResponse],
    summary="Get detailed step-by-step execution data",
)
async def get_pipeline_steps(
    execution_id: str,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
) -> BaseResponse[PipelineStepsListResponse]:
    """Retrieve all steps for a given pipeline execution."""
    engine = _get_pipeline_engine(request)

    logger.info(
        "Pipeline steps requested: execution_id=%s user=%s",
        execution_id,
        user.user_id,
    )

    steps = await engine.get_execution_steps(execution_id)

    step_responses = [
        PipelineStepResponse(
            step_id=str(step.get("id", "")),
            step_name=step.get("step_name", ""),
            status=step.get("status", "pending"),
            agent_id=step.get("agent_id"),
            started_at=step.get("started_at"),
            completed_at=step.get("completed_at"),
            duration_ms=step.get("duration_ms"),
            input_preview=_preview(step.get("input_data")),
            output_preview=_preview(step.get("output_data")),
            error=step.get("error_message"),
        )
        for step in steps
    ]

    response_data = PipelineStepsListResponse(
        execution_id=execution_id,
        steps=step_responses,
    )

    return BaseResponse(data=response_data)


def _preview(data: object, max_len: int = 200) -> str | None:
    """Return a truncated string preview of a JSON-like object."""
    if data is None:
        return None
    text = str(data)
    if len(text) > max_len:
        return text[:max_len] + "..."
    return text
