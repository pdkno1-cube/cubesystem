"""Node-type handlers for the LangGraph pipeline engine.

Each handler corresponds to one of the seven node types defined in
``graph_definition.nodes[].type``:

  - ``validation``  — input data validation
  - ``agent_call``  — LLM agent invocation
  - ``mcp_call``    — external MCP tool execution
  - ``human_gate``  — human approval checkpoint
  - ``trigger``     — event trigger entry point
  - ``action``      — generic action execution
  - ``output``      — final result collection

Every handler follows the LangGraph contract:
  ``async (state: PipelineState) -> PipelineState``

External dependencies (LLM client, MCP registry, etc.) are injected via
closures in :mod:`graph_builder`.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import TYPE_CHECKING, Any

from app.billing.cost_calculator import TokenUsage
from app.llm.prompt_builder import build_messages
from app.pipeline.state import PipelineState

if TYPE_CHECKING:
    from supabase._async.client import AsyncClient as SupabaseAsyncClient

    from app.billing.cost_calculator import CostCalculator
    from app.llm.client import LLMClient
    from app.mcp.registry import MCPRegistry
    from app.ws.connection_manager import ConnectionManager

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_AGENT_SLUG_PATTERN = re.compile(r"\(([^)]+)\)")
_MCP_NAME_PATTERN = re.compile(r"\((\w+)\)")


def _extract_agent_slugs(label: str) -> list[str]:
    """Extract agent slugs from a node label.

    Examples:
        "적합성 분석 (OptimistAgent + CriticAgent)" -> ["optimist-agent", "critic-agent"]
        "데이터 구조화 (OCRAgent)" -> ["ocr-agent"]
    """
    match = _AGENT_SLUG_PATTERN.search(label)
    if not match:
        return []

    raw = match.group(1)
    # Split by '+', ',' or '&' separators
    parts = re.split(r"[+,&]", raw)
    slugs: list[str] = []
    for part in parts:
        name = part.strip()
        # Convert PascalCase agent name to slug: "OptimistAgent" -> "optimist-agent"
        slug = re.sub(r"(?<=[a-z])(?=[A-Z])", "-", name).lower()
        if slug:
            slugs.append(slug)
    return slugs


def _extract_mcp_name(label: str) -> str | None:
    """Extract MCP provider name from a node label.

    Examples:
        "공고 수집 (FireCrawl)" -> "firecrawl"
        "OCR 텍스트 추출 (PaddleOCR)" -> "paddleocr"
    """
    match = _MCP_NAME_PATTERN.search(label)
    if not match:
        return None
    return match.group(1).lower()


def _copy_state(state: PipelineState, **overrides: object) -> PipelineState:
    """Return a shallow copy of *state* with the given overrides applied."""
    new: dict[str, object] = dict(state)
    new.update(overrides)
    return PipelineState(**new)  # type: ignore[typeddict-item]


async def _broadcast_safe(
    ws_manager: ConnectionManager | None,
    execution_id: str,
    node_id: str,
    label: str,
    event: str,
    *,
    duration_ms: int = 0,
    result_preview: str = "",
) -> None:
    """Best-effort WebSocket broadcast — never raises."""
    if ws_manager is None:
        return
    try:
        if event == "start":
            await ws_manager.send_step_start(execution_id, node_id, label)
        elif event == "complete":
            await ws_manager.send_step_complete(
                execution_id, node_id, duration_ms, result_preview
            )
    except Exception:
        logger.debug(
            "WebSocket broadcast failed (best-effort): execution=%s node=%s",
            execution_id,
            node_id,
        )


# ---------------------------------------------------------------------------
# Node handlers
# ---------------------------------------------------------------------------


async def handle_validation(
    state: PipelineState,
    node_config: dict[str, Any],
    *,
    ws_manager: ConnectionManager | None = None,
    supabase: SupabaseAsyncClient | None = None,
) -> PipelineState:
    """Validate that ``input_data`` is present and non-empty.

    For the ``verify_recovery`` node (auto-healing), this validates that
    recovery results exist in previous step outputs.
    """
    node_id = node_config["id"]
    label = node_config.get("label", node_id)
    start = time.monotonic()

    await _broadcast_safe(ws_manager, state["execution_id"], node_id, label, "start")

    input_data = state.get("input_data", {})

    # For verify_recovery nodes, check that recovery results exist
    if node_id == "verify_recovery":
        recovery_result = state["results"].get("execute_recovery")
        if not recovery_result:
            return _copy_state(
                state,
                current_node_id=node_id,
                error="Recovery verification failed: no recovery results found",
                status="failed",
                results={
                    **state["results"],
                    node_id: {"valid": False, "error": "No recovery results"},
                },
            )
        validation_result: dict[str, Any] = {
            "valid": True,
            "verified": True,
            "recovery_output": recovery_result,
        }
    elif not input_data:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        await _broadcast_safe(
            ws_manager,
            state["execution_id"],
            node_id,
            label,
            "complete",
            duration_ms=elapsed_ms,
            result_preview="Validation failed: empty input",
        )
        return _copy_state(
            state,
            current_node_id=node_id,
            error="Validation failed: input_data is empty",
            status="failed",
            results={**state["results"], node_id: {"valid": False}},
        )
    else:
        validation_result = {"valid": True, "fields": list(input_data.keys())}

    elapsed_ms = int((time.monotonic() - start) * 1000)
    await _broadcast_safe(
        ws_manager,
        state["execution_id"],
        node_id,
        label,
        "complete",
        duration_ms=elapsed_ms,
        result_preview="Validation passed",
    )

    return _copy_state(
        state,
        current_node_id=node_id,
        results={**state["results"], node_id: validation_result},
    )


async def handle_agent_call(
    state: PipelineState,
    node_config: dict[str, Any],
    *,
    llm_client: LLMClient,
    cost_calculator: CostCalculator,
    ws_manager: ConnectionManager | None = None,
    supabase: SupabaseAsyncClient | None = None,
    required_agents: list[str] | None = None,
) -> PipelineState:
    """Invoke one or more LLM agents defined in the node label.

    Steps:
      1. Extract agent slugs from the node label (or fall back to
         ``required_agents`` from the pipeline definition).
      2. Look up agent configuration from Supabase ``agents`` table.
      3. Build messages with context from previous node results.
      4. Call ``LLMClient.invoke()`` for each agent.
      5. Accumulate costs and store results.
    """
    node_id = node_config["id"]
    label = node_config.get("label", node_id)
    start = time.monotonic()

    await _broadcast_safe(ws_manager, state["execution_id"], node_id, label, "start")

    # 1. Determine which agents to call
    slugs = _extract_agent_slugs(label)
    if not slugs and required_agents:
        slugs = required_agents

    if not slugs:
        logger.warning("No agent slugs found for node %s (label=%s)", node_id, label)
        return _copy_state(
            state,
            current_node_id=node_id,
            error=f"No agents resolved for node '{node_id}'",
            status="failed",
            results={**state["results"], node_id: {"error": "No agents found"}},
        )

    agent_results: dict[str, Any] = {}
    total_node_cost = 0.0
    accumulated_messages = list(state["messages"])

    for slug in slugs:
        # 2. Fetch agent row from Supabase
        if supabase is None:
            logger.error("Supabase client is not available for agent lookup")
            return _copy_state(
                state,
                current_node_id=node_id,
                error="Database client unavailable",
                status="failed",
            )

        agent_result = (
            await supabase.table("agents")
            .select("*")
            .eq("slug", slug)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )

        if not agent_result.data:
            logger.warning("Agent not found: slug=%s", slug)
            agent_results[slug] = {"error": f"Agent '{slug}' not found"}
            continue

        agent_row: dict[str, Any] = agent_result.data[0]

        # 3. Build context from previous results
        context: dict[str, Any] = {
            "pipeline_input": state["input_data"],
            "previous_results": state["results"],
            "node_id": node_id,
        }

        user_input = json.dumps(
            state["input_data"], ensure_ascii=False, indent=2
        )
        if state["results"]:
            user_input += "\n\n--- Previous Step Results ---\n"
            user_input += json.dumps(
                state["results"], ensure_ascii=False, indent=2, default=str
            )

        messages = build_messages(
            system_prompt=str(agent_row.get("system_prompt", "")),
            user_input=user_input,
            context=context,
        )

        # 4. Invoke LLM
        try:
            llm_response = await llm_client.invoke(agent_row, messages)
        except Exception as exc:
            logger.error(
                "LLM invocation failed for agent %s: %s", slug, exc, exc_info=True
            )
            agent_results[slug] = {"error": str(exc)}
            continue

        # 5. Calculate cost
        agent_cost_per_run = float(agent_row.get("cost_per_run", 0.0))
        llm_cost = cost_calculator.calculate_llm_cost(
            llm_response.model,
            TokenUsage(
                input_tokens=llm_response.input_tokens,
                output_tokens=llm_response.output_tokens,
            ),
        )
        step_cost = cost_calculator.calculate_total_cost(agent_cost_per_run, llm_cost)
        total_node_cost += step_cost

        agent_results[slug] = {
            "content": llm_response.content,
            "model": llm_response.model,
            "input_tokens": llm_response.input_tokens,
            "output_tokens": llm_response.output_tokens,
            "cost": step_cost,
        }

        # Add to conversation history
        accumulated_messages.append({
            "role": "assistant",
            "content": f"[{slug}] {llm_response.content[:500]}",
        })

    elapsed_ms = int((time.monotonic() - start) * 1000)
    preview = ", ".join(
        f"{s}: {r.get('content', r.get('error', ''))[:80]}"
        for s, r in agent_results.items()
    )
    await _broadcast_safe(
        ws_manager,
        state["execution_id"],
        node_id,
        label,
        "complete",
        duration_ms=elapsed_ms,
        result_preview=preview[:200],
    )

    new_step_costs = [*state["step_costs"], total_node_cost]

    return _copy_state(
        state,
        current_node_id=node_id,
        results={**state["results"], node_id: agent_results},
        messages=accumulated_messages,
        step_costs=new_step_costs,
    )


async def handle_mcp_call(
    state: PipelineState,
    node_config: dict[str, Any],
    *,
    mcp_registry: MCPRegistry,
    ws_manager: ConnectionManager | None = None,
    supabase: SupabaseAsyncClient | None = None,
    required_mcps: list[str] | None = None,
) -> PipelineState:
    """Execute an MCP external tool call.

    The MCP provider name is extracted from the node label parenthetical
    (e.g., ``"(FireCrawl)"`` -> ``"firecrawl"``).  Falls back to the first
    entry in ``required_mcps`` from the pipeline definition.
    """
    node_id = node_config["id"]
    label = node_config.get("label", node_id)
    start = time.monotonic()

    await _broadcast_safe(ws_manager, state["execution_id"], node_id, label, "start")

    # Resolve MCP provider name
    mcp_name = _extract_mcp_name(label)
    if not mcp_name and required_mcps:
        mcp_name = required_mcps[0]

    if not mcp_name:
        return _copy_state(
            state,
            current_node_id=node_id,
            error=f"No MCP provider resolved for node '{node_id}'",
            status="failed",
            results={**state["results"], node_id: {"error": "No MCP provider"}},
        )

    # Build action parameters from input_data + previous results
    params: dict[str, object] = {
        "input": state["input_data"],
        "previous_results": state["results"],
    }

    try:
        mcp_result = await mcp_registry.execute_tool(
            mcp_name=mcp_name,
            workspace_id=state["workspace_id"],
            action="execute",
            params=params,
        )
    except Exception as exc:
        logger.error(
            "MCP execution failed: provider=%s node=%s error=%s",
            mcp_name,
            node_id,
            exc,
            exc_info=True,
        )
        return _copy_state(
            state,
            current_node_id=node_id,
            error=f"MCP '{mcp_name}' execution failed: {exc}",
            status="failed",
            results={**state["results"], node_id: {"error": str(exc)}},
        )

    elapsed_ms = int((time.monotonic() - start) * 1000)
    await _broadcast_safe(
        ws_manager,
        state["execution_id"],
        node_id,
        label,
        "complete",
        duration_ms=elapsed_ms,
        result_preview=str(mcp_result)[:200],
    )

    return _copy_state(
        state,
        current_node_id=node_id,
        results={**state["results"], node_id: mcp_result},
    )


async def handle_newsletter_send(
    state: PipelineState,
    node_config: dict[str, Any],
    *,
    mcp_registry: MCPRegistry,
    ws_manager: ConnectionManager | None = None,
    supabase: SupabaseAsyncClient | None = None,
) -> PipelineState:
    """Send the newsletter generated by NewsletterAgent via Resend.

    Reads newsletter content from the ``generate_newsletter`` step result,
    fetches active subscribers from ``newsletter_subscribers``, then calls
    Resend ``send_batch`` through the MCP registry.

    Partial failures are tolerated: the node succeeds as long as at least
    one email is dispatched.
    """
    node_id = node_config["id"]
    label = node_config.get("label", node_id)
    start = time.monotonic()

    await _broadcast_safe(ws_manager, state["execution_id"], node_id, label, "start")

    workspace_id = state["workspace_id"]

    # 1. Extract newsletter data from previous agent result
    newsletter_result = state["results"].get("generate_newsletter", {})
    # NewsletterAgent may be keyed by its slug
    if isinstance(newsletter_result, dict):
        agent_data = newsletter_result.get("newsletter-writer", newsletter_result)
    else:
        agent_data = {}

    # Try to parse JSON content from the LLM response
    raw_content = ""
    if isinstance(agent_data, dict):
        raw_content = str(agent_data.get("content", ""))

    subject = state["input_data"].get("subject", "")
    html_body = ""
    text_body = ""

    # Parse JSON from LLM content if possible
    try:
        json_match = re.search(r"\{.*\}", raw_content, re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group())
            subject = str(parsed.get("subject", subject))
            html_body = str(parsed.get("html", ""))
            text_body = str(parsed.get("text", ""))
    except (json.JSONDecodeError, AttributeError):
        logger.warning(
            "Could not parse JSON from NewsletterAgent output for node %s", node_id
        )
        # Fall back to using the raw content as text
        text_body = raw_content[:10000]

    if not subject:
        subject = str(state["input_data"].get("topic", "The Master OS Newsletter"))

    if not html_body and not text_body:
        logger.warning("No newsletter content found; skipping send for node %s", node_id)
        elapsed_ms = int((time.monotonic() - start) * 1000)
        await _broadcast_safe(
            ws_manager, state["execution_id"], node_id, label, "complete",
            duration_ms=elapsed_ms, result_preview="Skipped: no newsletter content",
        )
        return _copy_state(
            state,
            current_node_id=node_id,
            results={**state["results"], node_id: {"skipped": True, "reason": "no_content"}},
        )

    # 2. Fetch active subscribers
    if supabase is None:
        logger.error("Supabase unavailable for newsletter_send node %s", node_id)
        return _copy_state(
            state,
            current_node_id=node_id,
            error="Database client unavailable",
            status="failed",
        )

    sub_result = (
        await supabase.table("newsletter_subscribers")
        .select("email, name")
        .eq("workspace_id", workspace_id)
        .eq("status", "active")
        .is_("deleted_at", "null")
        .execute()
    )
    subscribers: list[dict[str, Any]] = sub_result.data or []

    if not subscribers:
        logger.info("No active subscribers; skipping newsletter send for node %s", node_id)
        elapsed_ms = int((time.monotonic() - start) * 1000)
        await _broadcast_safe(
            ws_manager, state["execution_id"], node_id, label, "complete",
            duration_ms=elapsed_ms, result_preview="No subscribers to send to",
        )
        return _copy_state(
            state,
            current_node_id=node_id,
            results={**state["results"], node_id: {"skipped": True, "reason": "no_subscribers"}},
        )

    # 3. Build batch payload and send in chunks of 100
    sent_count = 0
    failed_count = 0
    email_ids: list[str] = []

    emails_payload: list[dict[str, object]] = [
        {
            "to": str(sub["email"]),
            "subject": subject,
            **({"html": html_body} if html_body else {}),
            **({"text": text_body} if text_body else {}),
        }
        for sub in subscribers
    ]

    for chunk_start in range(0, len(emails_payload), 100):
        chunk = emails_payload[chunk_start : chunk_start + 100]
        try:
            result = await mcp_registry.execute_tool(
                mcp_name="resend",
                workspace_id=workspace_id,
                action="send_batch",
                params={"emails": chunk},
            )
            batch_data: list[dict[str, Any]] = result.get("data", [])  # type: ignore[assignment]
            email_ids.extend(str(item.get("id", "")) for item in batch_data if item.get("id"))
            sent_count += int(result.get("sent_count", len(chunk)))
        except Exception as exc:
            logger.error(
                "Newsletter batch send failed: chunk_start=%d, workspace=%s, error=%s",
                chunk_start, workspace_id, exc, exc_info=True,
            )
            failed_count += len(chunk)

    elapsed_ms = int((time.monotonic() - start) * 1000)
    preview = f"Sent: {sent_count}, Failed: {failed_count}, Subject: {subject[:60]}"
    await _broadcast_safe(
        ws_manager, state["execution_id"], node_id, label, "complete",
        duration_ms=elapsed_ms, result_preview=preview,
    )

    return _copy_state(
        state,
        current_node_id=node_id,
        results={
            **state["results"],
            node_id: {
                "sent_count": sent_count,
                "failed_count": failed_count,
                "email_ids": email_ids,
                "subject": subject,
                "subscriber_count": len(subscribers),
            },
        },
    )


async def handle_human_gate(
    state: PipelineState,
    node_config: dict[str, Any],
    *,
    ws_manager: ConnectionManager | None = None,
    supabase: SupabaseAsyncClient | None = None,
) -> PipelineState:
    """Set execution status to ``awaiting_approval``.

    The actual approval/rejection is handled by a separate API endpoint.
    This handler only transitions the state and broadcasts the approval
    request via WebSocket.
    """
    node_id = node_config["id"]
    label = node_config.get("label", node_id)

    await _broadcast_safe(ws_manager, state["execution_id"], node_id, label, "start")

    # Broadcast approval request
    if ws_manager is not None:
        try:
            await ws_manager.broadcast(state["execution_id"], {
                "type": "approval_required",
                "node_id": node_id,
                "label": label,
                "previous_results": {
                    k: str(v)[:200] for k, v in state["results"].items()
                },
            })
        except Exception:
            logger.debug(
                "WebSocket broadcast for approval request failed (best-effort)"
            )

    # Update execution status in DB
    if supabase is not None:
        try:
            await (
                supabase.table("pipeline_executions")
                .update({"status": "paused"})
                .eq("id", state["execution_id"])
                .execute()
            )
        except Exception:
            logger.error(
                "Failed to update execution status to paused: execution=%s",
                state["execution_id"],
                exc_info=True,
            )

    return _copy_state(
        state,
        current_node_id=node_id,
        status="awaiting_approval",
        results={
            **state["results"],
            node_id: {
                "status": "awaiting_approval",
                "label": label,
            },
        },
    )


async def handle_trigger(
    state: PipelineState,
    node_config: dict[str, Any],
    *,
    ws_manager: ConnectionManager | None = None,
    supabase: SupabaseAsyncClient | None = None,
) -> PipelineState:
    """Process a trigger entry point (e.g., ``detect_issue`` in Auto-Healing).

    Extracts trigger-specific data from ``input_data`` and passes it
    downstream through the results dict.
    """
    node_id = node_config["id"]
    label = node_config.get("label", node_id)
    start = time.monotonic()

    await _broadcast_safe(ws_manager, state["execution_id"], node_id, label, "start")

    trigger_data: dict[str, Any] = {
        "triggered": True,
        "trigger_input": state["input_data"],
        "label": label,
    }

    elapsed_ms = int((time.monotonic() - start) * 1000)
    await _broadcast_safe(
        ws_manager,
        state["execution_id"],
        node_id,
        label,
        "complete",
        duration_ms=elapsed_ms,
        result_preview="Trigger activated",
    )

    return _copy_state(
        state,
        current_node_id=node_id,
        results={**state["results"], node_id: trigger_data},
    )


async def handle_action(
    state: PipelineState,
    node_config: dict[str, Any],
    *,
    ws_manager: ConnectionManager | None = None,
    supabase: SupabaseAsyncClient | None = None,
) -> PipelineState:
    """Execute a generic action node (e.g., recovery execution).

    In a real deployment this would dispatch to a task queue or invoke
    an infrastructure API.  For now it records the action in results
    with the accumulated context from prior steps.
    """
    node_id = node_config["id"]
    label = node_config.get("label", node_id)
    start = time.monotonic()

    await _broadcast_safe(ws_manager, state["execution_id"], node_id, label, "start")

    action_result: dict[str, Any] = {
        "executed": True,
        "label": label,
        "context": {
            k: str(v)[:500] for k, v in state["results"].items()
        },
    }

    elapsed_ms = int((time.monotonic() - start) * 1000)
    await _broadcast_safe(
        ws_manager,
        state["execution_id"],
        node_id,
        label,
        "complete",
        duration_ms=elapsed_ms,
        result_preview=f"Action executed: {label}",
    )

    return _copy_state(
        state,
        current_node_id=node_id,
        results={**state["results"], node_id: action_result},
    )


async def handle_output(
    state: PipelineState,
    node_config: dict[str, Any],
    *,
    ws_manager: ConnectionManager | None = None,
    supabase: SupabaseAsyncClient | None = None,
) -> PipelineState:
    """Collect and finalise all results into a completed pipeline output.

    Aggregates results from all prior nodes, marks the pipeline as
    ``completed``, and broadcasts the completion event.
    """
    node_id = node_config["id"]
    label = node_config.get("label", node_id)
    start = time.monotonic()

    await _broadcast_safe(ws_manager, state["execution_id"], node_id, label, "start")

    # Aggregate final output
    final_output: dict[str, Any] = {
        "pipeline_id": state["pipeline_id"],
        "execution_id": state["execution_id"],
        "node_results": state["results"],
        "total_steps": len(state["results"]),
        "label": label,
    }

    elapsed_ms = int((time.monotonic() - start) * 1000)
    await _broadcast_safe(
        ws_manager,
        state["execution_id"],
        node_id,
        label,
        "complete",
        duration_ms=elapsed_ms,
        result_preview="Pipeline completed",
    )

    return _copy_state(
        state,
        current_node_id=node_id,
        status="completed",
        results={**state["results"], node_id: final_output},
    )


# ---------------------------------------------------------------------------
# Handler dispatch map
# ---------------------------------------------------------------------------

NODE_TYPE_HANDLERS = {
    "validation": handle_validation,
    "agent_call": handle_agent_call,
    "mcp_call": handle_mcp_call,
    "newsletter_send": handle_newsletter_send,
    "human_gate": handle_human_gate,
    "trigger": handle_trigger,
    "action": handle_action,
    "output": handle_output,
}
