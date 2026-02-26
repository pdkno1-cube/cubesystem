"""Agent runtime router (skeleton).

ARCH-MASTEROS-v1 section 3.2 — Agent Runtime:
  POST   /orchestrate/agent/assign
  POST   /orchestrate/agent/release
  GET    /orchestrate/agent/{agent_id}/status
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.middleware.auth import AuthenticatedUser, get_current_user
from app.schemas.agents import (
    AgentAssignRequest,
    AgentReleaseRequest,
    AgentStatusResponse,
)
from app.schemas.common import BaseResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrate/agent", tags=["agents"])


@router.post(
    "/assign",
    response_model=BaseResponse[AgentStatusResponse],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Assign an agent to a workspace runtime",
)
async def assign_agent(
    body: AgentAssignRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> BaseResponse[AgentStatusResponse]:
    """Allocate runtime resources for an agent within a workspace.

    Skeleton -- actual Celery worker allocation will be implemented later.
    """
    logger.info(
        "Agent assign requested: agent_id=%s workspace_id=%s user=%s",
        body.agent_id,
        body.workspace_id,
        user.user_id,
    )

    # TODO: Validate agent_id exists + workspace access
    # TODO: Create/update agent_assignments in Supabase
    # TODO: Allocate Celery worker slot

    response_data = AgentStatusResponse(
        agent_id=body.agent_id,
        workspace_id=body.workspace_id,
        status="assigned",
        assigned_at=datetime.now(tz=timezone.utc),
    )

    return BaseResponse(data=response_data)


@router.post(
    "/release",
    response_model=BaseResponse[AgentStatusResponse],
    summary="Release an agent from a workspace runtime",
)
async def release_agent(
    body: AgentReleaseRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> BaseResponse[AgentStatusResponse]:
    """Free runtime resources for an agent.

    Skeleton -- actual cleanup will be implemented later.
    """
    logger.info(
        "Agent release requested: agent_id=%s workspace_id=%s user=%s",
        body.agent_id,
        body.workspace_id,
        user.user_id,
    )

    # TODO: Update agent_assignments status in Supabase
    # TODO: Release Celery worker slot

    response_data = AgentStatusResponse(
        agent_id=body.agent_id,
        workspace_id=body.workspace_id,
        status="released",
    )

    return BaseResponse(data=response_data)


@router.get(
    "/{agent_id}/status",
    response_model=BaseResponse[AgentStatusResponse],
    summary="Get agent runtime status",
)
async def get_agent_status(
    agent_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
) -> BaseResponse[AgentStatusResponse]:
    """Retrieve the current runtime status of an agent.

    Skeleton -- returns a placeholder response.
    """
    logger.info(
        "Agent status requested: agent_id=%s user=%s",
        agent_id,
        user.user_id,
    )

    # TODO: Fetch from Supabase agent_assignments + Celery worker state
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={
            "code": "NOT_IMPLEMENTED",
            "message": "Agent status retrieval is not yet implemented",
        },
    )
