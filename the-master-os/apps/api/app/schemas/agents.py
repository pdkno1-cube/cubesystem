"""Pydantic v2 schemas for agent runtime endpoints.

Aligned with ARCH-MASTEROS-v1 section 3.2 (Agent Runtime).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class AgentAssignRequest(BaseModel):
    """POST /orchestrate/agent/assign"""

    agent_id: str = Field(..., description="UUID of the agent to assign")
    workspace_id: str = Field(..., description="UUID of the target workspace")
    config_override: dict[str, Any] = Field(
        default_factory=dict,
        description="Optional per-workspace configuration overrides",
    )


class AgentReleaseRequest(BaseModel):
    """POST /orchestrate/agent/release"""

    agent_id: str = Field(..., description="UUID of the agent to release")
    workspace_id: str = Field(..., description="UUID of the workspace")


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


AgentRuntimeStatus = Literal["idle", "assigned", "executing", "error", "released"]


class AgentStatusResponse(BaseModel):
    """GET /orchestrate/agent/{agent_id}/status"""

    agent_id: str
    workspace_id: str | None = None
    status: AgentRuntimeStatus
    current_task: str | None = None
    assigned_at: datetime | None = None
    last_heartbeat: datetime | None = None
    error: str | None = None
