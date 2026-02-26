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


class MessageItem(BaseModel):
    """A single message in a conversation."""

    role: Literal["user", "assistant"] = Field(..., description="Message role")
    content: str = Field(..., min_length=1, description="Message content")


class AgentInvokeRequest(BaseModel):
    """POST /orchestrate/agent/invoke"""

    agent_id: str = Field(..., description="UUID of the agent to invoke")
    messages: list[MessageItem] = Field(
        ..., min_length=1, description="Conversation messages"
    )
    workspace_id: str = Field(..., description="UUID of the workspace context")
    context: dict[str, Any] | None = Field(
        default=None,
        description="Optional additional context for the system prompt",
    )


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


AgentRuntimeStatus = Literal["idle", "assigned", "executing", "error", "released"]


class TokenUsage(BaseModel):
    """Token usage breakdown for an LLM invocation."""

    input_tokens: int = Field(..., ge=0)
    output_tokens: int = Field(..., ge=0)


class AgentInvokeResponse(BaseModel):
    """POST /orchestrate/agent/invoke — response"""

    content: str
    usage: TokenUsage
    cost: float = Field(..., ge=0.0, description="Estimated cost in USD")
    model: str
    agent_id: str


class AgentStatusResponse(BaseModel):
    """GET /orchestrate/agent/{agent_id}/status"""

    agent_id: str
    workspace_id: str | None = None
    status: AgentRuntimeStatus
    current_task: str | None = None
    assigned_at: datetime | None = None
    last_heartbeat: datetime | None = None
    error: str | None = None
    agent_name: str | None = None
    model_provider: str | None = None
    model: str | None = None
