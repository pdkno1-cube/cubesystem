"""Graph builder — converts a pipeline's ``graph_definition`` JSON into a
compiled LangGraph :class:`StateGraph`.

The builder reads nodes, edges, and entry_point from the JSON definition,
wires up type-specific handler functions (with dependencies captured via
closures), and returns a compiled graph ready for ``ainvoke()``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import partial
from typing import TYPE_CHECKING, Any

from langgraph.graph import END, StateGraph

from app.pipeline.node_handlers import NODE_TYPE_HANDLERS
from app.pipeline.state import PipelineState

if TYPE_CHECKING:
    from langgraph.graph.state import CompiledStateGraph
    from supabase._async.client import AsyncClient as SupabaseAsyncClient

    from app.billing.cost_calculator import CostCalculator
    from app.llm.client import LLMClient
    from app.mcp.registry import MCPRegistry
    from app.ws.connection_manager import ConnectionManager

logger = logging.getLogger(__name__)


@dataclass
class PipelineDependencies:
    """Container for external services injected into node handler closures."""

    llm_client: LLMClient
    mcp_registry: MCPRegistry
    cost_calculator: CostCalculator
    ws_manager: ConnectionManager | None
    supabase: SupabaseAsyncClient | None
    required_agents: list[str]
    required_mcps: list[str]


class PipelineGraphBuilder:
    """Transforms a ``graph_definition`` JSON into a compiled LangGraph.

    Usage::

        builder = PipelineGraphBuilder()
        compiled = builder.build(pipeline_row, deps)
        result = await compiled.ainvoke(initial_state)
    """

    def build(
        self,
        pipeline_row: dict[str, Any],
        deps: PipelineDependencies,
    ) -> CompiledStateGraph:
        """Parse ``graph_definition`` and return a compiled StateGraph.

        Args:
            pipeline_row: A full row from the ``pipelines`` table, containing
                at least ``graph_definition``, ``required_agents``, and
                ``required_mcps``.
            deps: External service dependencies for node handlers.

        Returns:
            A compiled LangGraph ``StateGraph`` ready for execution.

        Raises:
            ValueError: If the graph definition is malformed.
        """
        graph_def = pipeline_row.get("graph_definition")
        if not graph_def or not isinstance(graph_def, dict):
            raise ValueError(
                "Pipeline graph_definition is missing or not a JSON object"
            )

        nodes: list[dict[str, Any]] = graph_def.get("nodes", [])
        edges: list[dict[str, str]] = graph_def.get("edges", [])
        entry_point: str | None = graph_def.get("entry_point")

        if not nodes:
            raise ValueError("graph_definition contains no nodes")
        if not entry_point:
            raise ValueError("graph_definition has no entry_point")

        # Validate that entry_point exists in nodes
        node_ids = {n["id"] for n in nodes}
        if entry_point not in node_ids:
            raise ValueError(
                f"entry_point '{entry_point}' not found in node IDs: {node_ids}"
            )

        # Build node lookup
        node_map: dict[str, dict[str, Any]] = {n["id"]: n for n in nodes}

        # Create the StateGraph
        graph = StateGraph(PipelineState)

        # Add nodes with their handler closures
        for node in nodes:
            node_id = node["id"]
            node_type = node.get("type", "action")
            handler_fn = NODE_TYPE_HANDLERS.get(node_type)

            if handler_fn is None:
                logger.warning(
                    "Unknown node type '%s' for node '%s', defaulting to 'action'",
                    node_type,
                    node_id,
                )
                handler_fn = NODE_TYPE_HANDLERS["action"]

            # Create a closure that injects dependencies
            bound_handler = self._create_node_closure(
                handler_fn=handler_fn,
                node_config=node,
                node_type=node_type,
                deps=deps,
            )

            graph.add_node(node_id, bound_handler)

        # Set entry point
        graph.set_entry_point(entry_point)

        # Add edges
        # Build adjacency to detect terminal nodes
        outgoing: dict[str, list[str]] = {n["id"]: [] for n in nodes}
        for edge in edges:
            from_node = edge["from"]
            to_node = edge["to"]

            if from_node not in node_ids:
                raise ValueError(
                    f"Edge 'from' node '{from_node}' not found in nodes"
                )
            if to_node not in node_ids:
                raise ValueError(
                    f"Edge 'to' node '{to_node}' not found in nodes"
                )

            graph.add_edge(from_node, to_node)
            outgoing[from_node].append(to_node)

        # Connect terminal nodes (no outgoing edges) to END
        for node_id, targets in outgoing.items():
            if not targets:
                graph.add_edge(node_id, END)
                logger.debug(
                    "Connected terminal node '%s' to END", node_id
                )

        compiled = graph.compile()
        logger.info(
            "Pipeline graph compiled: %d nodes, %d edges, entry=%s",
            len(nodes),
            len(edges),
            entry_point,
        )

        return compiled

    def _create_node_closure(
        self,
        handler_fn: Any,
        node_config: dict[str, Any],
        node_type: str,
        deps: PipelineDependencies,
    ) -> Any:
        """Build a closure wrapping *handler_fn* with injected dependencies.

        The returned async function has the LangGraph-expected signature:
          ``async (state: PipelineState) -> PipelineState``
        """
        # Build keyword arguments specific to the node type
        kwargs: dict[str, Any] = {
            "ws_manager": deps.ws_manager,
            "supabase": deps.supabase,
        }

        if node_type == "agent_call":
            kwargs["llm_client"] = deps.llm_client
            kwargs["cost_calculator"] = deps.cost_calculator
            kwargs["required_agents"] = deps.required_agents

        elif node_type == "mcp_call":
            kwargs["mcp_registry"] = deps.mcp_registry
            kwargs["required_mcps"] = deps.required_mcps

        # Capture everything in a closure
        captured_config = dict(node_config)
        captured_kwargs = dict(kwargs)

        async def _node_handler(state: PipelineState) -> PipelineState:
            return await handler_fn(state, captured_config, **captured_kwargs)

        # Give the closure a readable name for debugging
        _node_handler.__name__ = f"handle_{node_config['id']}"
        _node_handler.__qualname__ = f"PipelineGraphBuilder._node_handler[{node_config['id']}]"

        return _node_handler
