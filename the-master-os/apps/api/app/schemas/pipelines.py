"""Pydantic v2 schemas for pipeline orchestration endpoints.

Aligned with ARCH-MASTEROS-v1 section 3.2 (FastAPI Orchestration Engine).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class PipelineStartRequest(BaseModel):
    """POST /orchestrate/pipeline/start"""

    execution_id: str = Field(..., description="UUID of the pipeline execution record")
    pipeline_id: str = Field(..., description="UUID of the pipeline template")
    workspace_id: str = Field(..., description="UUID of the target workspace")
    input_params: dict[str, Any] = Field(
        default_factory=dict,
        description="User-provided parameters for the pipeline run",
    )
    assigned_agents: list[str] = Field(
        default_factory=list,
        description="List of agent IDs assigned to this execution",
    )


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


PipelineStatus = Literal[
    "pending", "running", "paused", "completed", "failed", "cancelled"
]


class PipelineStatusResponse(BaseModel):
    """GET /orchestrate/pipeline/{execution_id}/status"""

    execution_id: str
    pipeline_id: str
    workspace_id: str
    status: PipelineStatus
    current_step: str | None = None
    progress_pct: float = 0.0
    credits_used: float = 0.0
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None


class PipelineStepResponse(BaseModel):
    """Single step within a pipeline execution."""

    step_id: str
    step_name: str
    status: Literal["pending", "running", "completed", "failed", "skipped"]
    agent_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: float | None = None
    input_preview: str | None = None
    output_preview: str | None = None
    error: str | None = None


class PipelineStepsListResponse(BaseModel):
    """GET /orchestrate/pipeline/{execution_id}/steps"""

    execution_id: str
    steps: list[PipelineStepResponse]
