"""LangGraph pipeline execution state definition.

Defines the typed state dictionary that flows through all nodes in a
compiled StateGraph.  Each node receives the current state and returns
a (potentially modified) copy.
"""

from __future__ import annotations

from typing import Any, TypedDict


class PipelineState(TypedDict):
    """Immutable state schema flowing through every LangGraph node.

    Attributes:
        execution_id: UUID of the pipeline_executions row.
        pipeline_id: UUID of the pipeline template.
        workspace_id: UUID of the workspace executing the pipeline.
        user_id: UUID of the user who triggered execution.
        input_data: User-provided parameters for the pipeline run.
        current_node_id: ID of the node currently being executed.
        results: Accumulated outputs keyed by node_id.
        messages: Running conversation history for agent_call nodes.
        step_costs: Per-step cost accumulator (USD).
        error: Error message if the pipeline failed, else None.
        status: Current pipeline status
            (running | completed | failed | awaiting_approval).
    """

    execution_id: str
    pipeline_id: str
    workspace_id: str
    user_id: str
    input_data: dict[str, Any]
    current_node_id: str
    results: dict[str, Any]
    messages: list[dict[str, str]]
    step_costs: list[float]
    error: str | None
    status: str
