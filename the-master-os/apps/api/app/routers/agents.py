"""Agent runtime router — assign, release, invoke, and status.

ARCH-MASTEROS-v1 section 3.2 — Agent Runtime:
  POST   /orchestrate/agent/assign
  POST   /orchestrate/agent/release
  POST   /orchestrate/agent/invoke
  GET    /orchestrate/agent/{agent_id}/status
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import Settings, get_settings
from app.llm import LLMClient
from app.llm.prompt_builder import build_messages
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.schemas.agents import (
    AgentAssignRequest,
    AgentInvokeRequest,
    AgentInvokeResponse,
    AgentReleaseRequest,
    AgentStatusResponse,
    TokenUsage,
)
from app.schemas.common import BaseResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrate/agent", tags=["agents"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _supabase_client(settings: Settings):  # noqa: ANN202
    """Create a Supabase client from settings.

    Uses supabase-py (already in dependencies).
    """
    from supabase import create_client  # noqa: WPS433 -- lazy import

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


async def _fetch_agent(agent_id: str, settings: Settings) -> dict[str, object]:
    """Fetch an agent record from Supabase by ID.

    Raises HTTPException 404 if not found.
    """
    client = _supabase_client(settings)
    response = (
        client.table("agents")
        .select("*")
        .eq("id", agent_id)
        .eq("is_active", True)
        .single()
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "AGENT_NOT_FOUND",
                "message": f"Agent '{agent_id}' not found or is inactive",
            },
        )

    return dict(response.data)


# ---------------------------------------------------------------------------
# POST /orchestrate/agent/assign
# ---------------------------------------------------------------------------


@router.post(
    "/assign",
    response_model=BaseResponse[AgentStatusResponse],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Assign an agent to a workspace runtime",
)
async def assign_agent(
    body: AgentAssignRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[AgentStatusResponse]:
    """Allocate runtime resources for an agent within a workspace.

    1. Validate that the agent exists and is active.
    2. Upsert an ``agent_assignments`` row (idle, assigned_at=now).
    3. Return the assignment record wrapped in ``BaseResponse``.
    """
    logger.info(
        "Agent assign requested: agent_id=%s workspace_id=%s user=%s",
        body.agent_id,
        body.workspace_id,
        user.user_id,
    )

    # 1. Validate agent exists and is active
    agent_row = await _fetch_agent(body.agent_id, settings)

    # 2. Upsert agent_assignments (unique on agent_id+workspace_id where released_at IS NULL)
    sb = _supabase_client(settings)
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    try:
        # Check for an existing active assignment (released_at IS NULL)
        existing_resp = (
            sb.table("agent_assignments")
            .select("id")
            .eq("agent_id", body.agent_id)
            .eq("workspace_id", body.workspace_id)
            .is_("released_at", "null")
            .limit(1)
            .execute()
        )

        if existing_resp.data:
            # Update the existing active assignment
            existing_id: str = str(existing_resp.data[0]["id"])
            upsert_resp = (
                sb.table("agent_assignments")
                .update({
                    "status": "idle",
                    "is_active": True,
                    "config_override": body.config_override,
                    "assigned_at": now_iso,
                    "released_at": None,
                })
                .eq("id", existing_id)
                .execute()
            )
        else:
            # Insert a new assignment
            upsert_resp = (
                sb.table("agent_assignments")
                .insert({
                    "agent_id": body.agent_id,
                    "workspace_id": body.workspace_id,
                    "assigned_by": user.user_id,
                    "config_override": body.config_override,
                    "status": "idle",
                    "is_active": True,
                    "assigned_at": now_iso,
                })
                .execute()
            )
    except Exception as exc:
        logger.exception(
            "Failed to upsert agent_assignment: agent_id=%s workspace_id=%s",
            body.agent_id,
            body.workspace_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "ASSIGNMENT_FAILED",
                "message": f"Failed to assign agent: {exc}",
            },
        ) from exc

    # 3. Build response
    response_data = AgentStatusResponse(
        agent_id=body.agent_id,
        workspace_id=body.workspace_id,
        status="assigned",
        assigned_at=datetime.fromisoformat(now_iso),
        agent_name=str(agent_row.get("name", "")),
        model_provider=str(agent_row.get("model_provider", "")),
        model=str(agent_row.get("model", "")),
    )

    return BaseResponse(data=response_data)


# ---------------------------------------------------------------------------
# POST /orchestrate/agent/release
# ---------------------------------------------------------------------------


@router.post(
    "/release",
    response_model=BaseResponse[AgentStatusResponse],
    summary="Release an agent from a workspace runtime",
)
async def release_agent(
    body: AgentReleaseRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[AgentStatusResponse]:
    """Free runtime resources for an agent.

    1. Find the active assignment (released_at IS NULL).
    2. Set status='idle', released_at=now, is_active=false.
    3. Return the updated status wrapped in ``BaseResponse``.
    """
    logger.info(
        "Agent release requested: agent_id=%s workspace_id=%s user=%s",
        body.agent_id,
        body.workspace_id,
        user.user_id,
    )

    sb = _supabase_client(settings)
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    try:
        # Find active assignment for this agent + workspace
        existing_resp = (
            sb.table("agent_assignments")
            .select("id")
            .eq("agent_id", body.agent_id)
            .eq("workspace_id", body.workspace_id)
            .is_("released_at", "null")
            .limit(1)
            .execute()
        )

        if not existing_resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": "ASSIGNMENT_NOT_FOUND",
                    "message": (
                        f"No active assignment found for agent '{body.agent_id}' "
                        f"in workspace '{body.workspace_id}'"
                    ),
                },
            )

        assignment_id: str = str(existing_resp.data[0]["id"])

        # Release the assignment
        sb.table("agent_assignments").update({
            "status": "idle",
            "is_active": False,
            "released_at": now_iso,
        }).eq("id", assignment_id).execute()

    except HTTPException:
        raise  # Re-raise 404 as-is
    except Exception as exc:
        logger.exception(
            "Failed to release agent_assignment: agent_id=%s workspace_id=%s",
            body.agent_id,
            body.workspace_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "RELEASE_FAILED",
                "message": f"Failed to release agent: {exc}",
            },
        ) from exc

    response_data = AgentStatusResponse(
        agent_id=body.agent_id,
        workspace_id=body.workspace_id,
        status="released",
    )

    return BaseResponse(data=response_data)


# ---------------------------------------------------------------------------
# POST /orchestrate/agent/invoke
# ---------------------------------------------------------------------------


@router.post(
    "/invoke",
    response_model=BaseResponse[AgentInvokeResponse],
    summary="Invoke an agent with messages",
)
async def invoke_agent(
    body: AgentInvokeRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[AgentInvokeResponse]:
    """Invoke an LLM-powered agent.

    1. Fetch the agent configuration from Supabase.
    2. Build the message list (system prompt + context + user messages).
    3. Call the appropriate LLM provider via ``LLMClient``.
    4. Return the response with content, token usage, and cost.
    """
    logger.info(
        "Agent invoke requested: agent_id=%s workspace_id=%s user=%s",
        body.agent_id,
        body.workspace_id,
        user.user_id,
    )

    # 1. Fetch agent from Supabase
    agent_row = await _fetch_agent(body.agent_id, settings)

    # 2. Build messages
    system_prompt = str(agent_row.get("system_prompt", ""))

    # Extract the last user message as the primary input
    user_messages_raw = [
        {"role": m.role, "content": m.content} for m in body.messages
    ]

    # If context is provided, enrich the system prompt via prompt_builder
    agent_row_for_invoke = dict(agent_row)
    if body.context:
        enriched = build_messages(
            system_prompt=system_prompt,
            user_input=user_messages_raw[-1]["content"],
            context=body.context,
        )
        # Extract system content from built messages
        system_content = ""
        conversation_messages: list[dict[str, str]] = []
        for msg in enriched:
            if msg["role"] == "system":
                system_content = msg["content"]
            else:
                conversation_messages.append(msg)
        # Prepend earlier messages (excluding last user msg which is in enriched)
        if len(user_messages_raw) > 1:
            conversation_messages = user_messages_raw[:-1] + conversation_messages
        agent_row_for_invoke["system_prompt"] = system_content
        messages_for_llm = conversation_messages
    else:
        messages_for_llm = user_messages_raw

    # 3. Invoke LLM
    llm_client = LLMClient(_settings=settings)
    llm_response = await llm_client.invoke(agent_row_for_invoke, messages_for_llm)

    # 4. Log the invocation (best-effort audit)
    try:
        sb = _supabase_client(settings)
        sb.table("audit_logs").insert({
            "workspace_id": body.workspace_id,
            "user_id": user.user_id,
            "action": "agent.invoke",
            "category": "agent",
            "resource_type": "agent",
            "resource_id": body.agent_id,
            "details": {
                "model": llm_response.model,
                "input_tokens": llm_response.input_tokens,
                "output_tokens": llm_response.output_tokens,
                "cost": llm_response.cost,
            },
            "severity": "info",
        }).execute()
    except Exception:
        logger.warning(
            "Failed to write audit log for agent invoke: agent_id=%s",
            body.agent_id,
            exc_info=True,
        )

    response_data = AgentInvokeResponse(
        content=llm_response.content,
        usage=TokenUsage(
            input_tokens=llm_response.input_tokens,
            output_tokens=llm_response.output_tokens,
        ),
        cost=llm_response.cost,
        model=llm_response.model,
        agent_id=body.agent_id,
    )

    return BaseResponse(data=response_data)


# ---------------------------------------------------------------------------
# GET /orchestrate/agent/{agent_id}/status
# ---------------------------------------------------------------------------


@router.get(
    "/{agent_id}/status",
    response_model=BaseResponse[AgentStatusResponse],
    summary="Get agent runtime status",
)
async def get_agent_status(
    agent_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> BaseResponse[AgentStatusResponse]:
    """Retrieve the current runtime status of an agent.

    Fetches agent info and its latest assignment from Supabase.
    """
    logger.info(
        "Agent status requested: agent_id=%s user=%s",
        agent_id,
        user.user_id,
    )

    # 1. Fetch agent record
    agent_row = await _fetch_agent(agent_id, settings)

    # 2. Fetch latest assignment for this agent
    sb = _supabase_client(settings)
    assignment_response = (
        sb.table("agent_assignments")
        .select("*")
        .eq("agent_id", agent_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    assignment = assignment_response.data[0] if assignment_response.data else None

    # 3. Build response
    agent_status: str = str(agent_row.get("status", "idle"))
    workspace_id: str | None = None
    assigned_at: datetime | None = None
    current_task: str | None = None

    if assignment:
        workspace_id = str(assignment.get("workspace_id", ""))
        assignment_status = str(assignment.get("status", "idle"))
        # Map assignment status to runtime status
        status_map: dict[str, str] = {
            "idle": "idle",
            "assigned": "assigned",
            "executing": "executing",
            "error": "error",
            "released": "released",
        }
        agent_status = status_map.get(assignment_status, "idle")
        raw_assigned_at = assignment.get("created_at")
        if raw_assigned_at and isinstance(raw_assigned_at, str):
            try:
                assigned_at = datetime.fromisoformat(raw_assigned_at)
            except ValueError:
                assigned_at = None

    response_data = AgentStatusResponse(
        agent_id=agent_id,
        workspace_id=workspace_id,
        status=agent_status,  # type: ignore[arg-type]
        current_task=current_task,
        assigned_at=assigned_at,
        agent_name=str(agent_row.get("name", "")),
        model_provider=str(agent_row.get("model_provider", "")),
        model=str(agent_row.get("model", "")),
    )

    return BaseResponse(data=response_data)
