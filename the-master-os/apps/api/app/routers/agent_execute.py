"""Agent execution router with SSE streaming."""
from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncGenerator

import sentry_sdk
import anthropic
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agent-execute"])


class ExecuteRequest(BaseModel):
    input_text: str
    workspace_id: str | None = None
    conversation_id: str | None = None
    max_tokens: int = 4096


def _get_supabase():  # noqa: ANN202
    """Create a sync Supabase client from settings."""
    from supabase import create_client  # noqa: WPS433

    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _fetch_agent_sync(agent_id: str) -> dict[str, object]:
    """Fetch agent row from Supabase synchronously."""
    sb = _get_supabase()
    result = (
        sb.table("agents")
        .select("*")
        .eq("id", agent_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    return dict(result.data)


async def _stream_anthropic(
    agent: dict[str, object],
    input_text: str,
    max_tokens: int,
) -> AsyncGenerator[str, None]:
    """Stream Anthropic API response as SSE."""
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    system_prompt = str(agent.get("system_prompt") or f"You are {agent['name']}, an AI assistant.")
    model = str(agent.get("model") or "claude-sonnet-4-6")

    try:
        with client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": input_text}],
        ) as stream:
            for text in stream.text_stream:
                data = json.dumps({"type": "text", "text": text})
                yield f"data: {data}\n\n"

            # Final usage stats
            final_msg = stream.get_final_message()
            usage = {
                "type": "done",
                "tokens_input": final_msg.usage.input_tokens,
                "tokens_output": final_msg.usage.output_tokens,
                # claude-sonnet-4-6 pricing: $3/$15 per 1M tokens
                "cost_usd": round(
                    (final_msg.usage.input_tokens * 3 + final_msg.usage.output_tokens * 15)
                    / 1_000_000,
                    6,
                ),
            }
            yield f"data: {json.dumps(usage)}\n\n"
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        logger.exception("Anthropic stream error for agent %s", agent.get("id"))
        error_data = json.dumps({"type": "error", "message": str(exc)})
        yield f"data: {error_data}\n\n"


@router.post("/{agent_id}/execute")
async def execute_agent(
    agent_id: str,
    body: ExecuteRequest,
) -> StreamingResponse:
    """Execute an agent with SSE streaming response."""
    agent = _fetch_agent_sync(agent_id)

    sb = _get_supabase()

    # Create task record
    try:
        task_result = (
            sb.table("agent_tasks")
            .insert({
                "agent_id": agent_id,
                "workspace_id": body.workspace_id,
                "conversation_id": body.conversation_id,
                "input_text": body.input_text,
                "status": "running",
            })
            .execute()
        )
        task_id: str | None = task_result.data[0]["id"] if task_result.data else None
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        logger.warning("Failed to create agent_task record: %s", exc)
        task_id = None

    start_time = time.time()

    async def event_stream() -> AsyncGenerator[str, None]:
        # Send task_id first
        if task_id:
            yield f"data: {json.dumps({'type': 'task_id', 'task_id': task_id})}\n\n"

        full_text = ""
        tokens_in = 0
        tokens_out = 0
        cost = 0.0
        had_error = False
        error_msg = ""

        async for chunk in _stream_anthropic(agent, body.input_text, body.max_tokens):
            yield chunk
            # Parse to capture stats
            if chunk.startswith("data: "):
                try:
                    payload = json.loads(chunk[6:])
                    if payload.get("type") == "text":
                        full_text += payload.get("text", "")
                    elif payload.get("type") == "done":
                        tokens_in = payload.get("tokens_input", 0)
                        tokens_out = payload.get("tokens_output", 0)
                        cost = payload.get("cost_usd", 0.0)
                    elif payload.get("type") == "error":
                        had_error = True
                        error_msg = payload.get("message", "Unknown error")
                except Exception as parse_exc:
                    sentry_sdk.capture_exception(parse_exc)

        # Update task record
        if task_id:
            try:
                duration_ms = int((time.time() - start_time) * 1000)
                (
                    sb.table("agent_tasks")
                    .update({
                        "status": "error" if had_error else "done",
                        "output_text": full_text or None,
                        "tokens_input": tokens_in,
                        "tokens_output": tokens_out,
                        "cost_usd": cost,
                        "duration_ms": duration_ms,
                        "error_message": error_msg if had_error else None,
                    })
                    .eq("id", task_id)
                    .execute()
                )
            except Exception as update_exc:
                sentry_sdk.capture_exception(update_exc)
                logger.warning("Failed to update agent_task %s: %s", task_id, update_exc)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
