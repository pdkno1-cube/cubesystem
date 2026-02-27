"""Pipeline execution engine — orchestrates LangGraph graph lifecycle.

The :class:`PipelineEngine` is the primary entry point for starting,
monitoring, and cancelling pipeline executions.  It coordinates:

  - Supabase persistence (pipeline_executions, pipeline_steps)
  - LangGraph graph compilation and invocation
  - Credit deduction after successful completion
  - WebSocket progress broadcasting
  - Audit log insertion
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from app.pipeline.graph_builder import PipelineDependencies, PipelineGraphBuilder
from app.pipeline.state import PipelineState

if TYPE_CHECKING:
    from supabase._async.client import AsyncClient as SupabaseAsyncClient

    from app.billing.cost_calculator import CostCalculator
    from app.billing.credits import CreditService
    from app.llm.client import LLMClient
    from app.mcp.registry import MCPRegistry
    from app.ws.connection_manager import ConnectionManager

logger = logging.getLogger(__name__)


class PipelineEngine:
    """Orchestrates full pipeline lifecycle: build, execute, persist, bill.

    Usage::

        engine = PipelineEngine(
            llm_client=llm_client,
            mcp_registry=mcp_registry,
            credit_service=credit_service,
            cost_calculator=cost_calculator,
            ws_manager=ws_manager,
            supabase=supabase,
        )

        result = await engine.execute(
            pipeline_id="...",
            workspace_id="...",
            user_id="...",
            input_data={"query": "..."},
        )
    """

    def __init__(
        self,
        llm_client: LLMClient,
        mcp_registry: MCPRegistry,
        credit_service: CreditService,
        cost_calculator: CostCalculator,
        ws_manager: ConnectionManager | None,
        supabase: SupabaseAsyncClient,
    ) -> None:
        self.llm_client = llm_client
        self.mcp_registry = mcp_registry
        self.credit_service = credit_service
        self.cost_calculator = cost_calculator
        self.ws_manager = ws_manager
        self.supabase = supabase
        self.graph_builder = PipelineGraphBuilder()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def execute(
        self,
        pipeline_id: str,
        workspace_id: str,
        user_id: str,
        input_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute a pipeline from start to finish.

        Args:
            pipeline_id: UUID of the pipeline template.
            workspace_id: UUID of the workspace.
            user_id: UUID of the triggering user.
            input_data: User-provided parameters.

        Returns:
            A dict containing ``execution_id``, ``status``, ``results``,
            and ``total_cost``.
        """
        execution_id = str(uuid.uuid4())
        start_time = time.monotonic()
        started_at = datetime.now(tz=timezone.utc)

        logger.info(
            "Pipeline execution starting: execution=%s pipeline=%s workspace=%s user=%s",
            execution_id,
            pipeline_id,
            workspace_id,
            user_id,
        )

        # 1. Fetch pipeline definition from Supabase
        pipeline_row = await self._fetch_pipeline(pipeline_id)
        if pipeline_row is None:
            return {
                "execution_id": execution_id,
                "status": "failed",
                "error": f"Pipeline '{pipeline_id}' not found or inactive",
                "total_cost": 0.0,
            }

        # 2. Insert pipeline_executions record (status=running)
        await self._insert_execution(
            execution_id=execution_id,
            pipeline_id=pipeline_id,
            workspace_id=workspace_id,
            user_id=user_id,
            input_data=input_data,
            started_at=started_at,
        )

        # 3. Build the LangGraph
        required_agents: list[str] = pipeline_row.get("required_agents", []) or []
        required_mcps: list[str] = pipeline_row.get("required_mcps", []) or []

        deps = PipelineDependencies(
            llm_client=self.llm_client,
            mcp_registry=self.mcp_registry,
            cost_calculator=self.cost_calculator,
            ws_manager=self.ws_manager,
            supabase=self.supabase,
            required_agents=required_agents,
            required_mcps=required_mcps,
        )

        try:
            compiled_graph = self.graph_builder.build(pipeline_row, deps)
        except ValueError as exc:
            logger.error(
                "Graph build failed for pipeline %s: %s",
                pipeline_id,
                exc,
                exc_info=True,
            )
            await self._update_execution_failed(execution_id, str(exc))
            return {
                "execution_id": execution_id,
                "status": "failed",
                "error": str(exc),
                "total_cost": 0.0,
            }

        # 4. Create initial state
        initial_state: PipelineState = {
            "execution_id": execution_id,
            "pipeline_id": pipeline_id,
            "workspace_id": workspace_id,
            "user_id": user_id,
            "input_data": input_data,
            "current_node_id": "",
            "results": {},
            "messages": [],
            "step_costs": [],
            "error": None,
            "status": "running",
        }

        # 5. Execute the graph
        try:
            final_state: dict[str, Any] = await compiled_graph.ainvoke(
                initial_state
            )
        except Exception as exc:
            logger.error(
                "Pipeline execution failed: execution=%s error=%s",
                execution_id,
                exc,
                exc_info=True,
            )
            await self._update_execution_failed(execution_id, str(exc))
            await self._broadcast_error(execution_id, str(exc))
            return {
                "execution_id": execution_id,
                "status": "failed",
                "error": str(exc),
                "total_cost": 0.0,
            }

        # 6. Process final state
        status = final_state.get("status", "completed")
        error = final_state.get("error")
        step_costs: list[float] = final_state.get("step_costs", [])
        total_cost = self.cost_calculator.calculate_pipeline_cost(step_costs)
        duration_ms = int((time.monotonic() - start_time) * 1000)

        if error and status != "awaiting_approval":
            status = "failed"

        # 7. Persist final results
        completed_at = datetime.now(tz=timezone.utc)
        await self._update_execution_completed(
            execution_id=execution_id,
            status=status,
            results=final_state.get("results", {}),
            total_cost=total_cost,
            duration_ms=duration_ms,
            completed_at=completed_at,
            error=error,
        )

        # 8. Insert step records
        await self._insert_step_records(
            execution_id=execution_id,
            results=final_state.get("results", {}),
            graph_def=pipeline_row.get("graph_definition", {}),
            step_costs=step_costs,
        )

        # 9. Deduct credits (only on completed pipelines)
        if status == "completed" and total_cost > 0:
            try:
                await self.credit_service.deduct(
                    workspace_id=workspace_id,
                    amount=total_cost,
                    description=f"Pipeline execution: {pipeline_row.get('name', pipeline_id)}",
                    reference_id=execution_id,
                    reference_type="pipeline_execution",
                    user_id=user_id,
                )
            except Exception as exc:
                logger.error(
                    "Credit deduction failed: execution=%s cost=%.6f error=%s",
                    execution_id,
                    total_cost,
                    exc,
                    exc_info=True,
                )
                # Do not fail the pipeline for billing errors

        # 10. Audit log
        await self._insert_audit_log(
            workspace_id=workspace_id,
            user_id=user_id,
            execution_id=execution_id,
            pipeline_id=pipeline_id,
            status=status,
            total_cost=total_cost,
            duration_ms=duration_ms,
        )

        # 11. Broadcast completion
        if self.ws_manager is not None and status == "completed":
            try:
                await self.ws_manager.send_execution_complete(
                    execution_id, status, total_cost
                )
            except Exception:
                logger.debug(
                    "WebSocket completion broadcast failed (best-effort)"
                )

        logger.info(
            "Pipeline execution finished: execution=%s status=%s cost=%.6f duration=%dms",
            execution_id,
            status,
            total_cost,
            duration_ms,
        )

        return {
            "execution_id": execution_id,
            "status": status,
            "results": final_state.get("results", {}),
            "total_cost": total_cost,
            "duration_ms": duration_ms,
            "error": error,
        }

    async def get_execution_status(self, execution_id: str) -> dict[str, Any]:
        """Retrieve current execution status from the database.

        Args:
            execution_id: UUID of the pipeline execution.

        Returns:
            Execution record dict, or error dict if not found.
        """
        result = (
            await self.supabase.table("pipeline_executions")
            .select("*")
            .eq("id", execution_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return {"error": f"Execution '{execution_id}' not found"}

        row = result.data[0]
        return {
            "execution_id": row["id"],
            "pipeline_id": row["pipeline_id"],
            "workspace_id": row["workspace_id"],
            "status": row["status"],
            "total_credits": float(row.get("total_credits", 0)),
            "started_at": row.get("started_at"),
            "completed_at": row.get("completed_at"),
            "duration_ms": row.get("duration_ms"),
            "error": row.get("error_message"),
            "result": row.get("result"),
            "output_result": row.get("output_result"),
        }

    async def cancel_execution(self, execution_id: str) -> dict[str, Any]:
        """Cancel a running or paused execution.

        Args:
            execution_id: UUID of the pipeline execution.

        Returns:
            Updated execution record dict.
        """
        # Verify execution exists and is cancellable
        result = (
            await self.supabase.table("pipeline_executions")
            .select("id, status")
            .eq("id", execution_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return {"error": f"Execution '{execution_id}' not found"}

        current_status = result.data[0]["status"]
        if current_status not in ("pending", "running", "paused"):
            return {
                "error": f"Cannot cancel execution in '{current_status}' state",
                "execution_id": execution_id,
                "status": current_status,
            }

        # Update status to cancelled
        now = datetime.now(tz=timezone.utc).isoformat()
        await (
            self.supabase.table("pipeline_executions")
            .update({
                "status": "cancelled",
                "completed_at": now,
                "error_message": "Cancelled by user",
            })
            .eq("id", execution_id)
            .execute()
        )

        # Broadcast cancellation
        if self.ws_manager is not None:
            try:
                await self.ws_manager.send_execution_error(
                    execution_id, "Pipeline cancelled by user"
                )
            except Exception:
                logger.debug("WebSocket cancellation broadcast failed (best-effort)")

        logger.info("Pipeline execution cancelled: execution=%s", execution_id)

        return {
            "execution_id": execution_id,
            "status": "cancelled",
        }

    async def get_execution_steps(
        self, execution_id: str
    ) -> list[dict[str, Any]]:
        """Retrieve all step records for an execution.

        Args:
            execution_id: UUID of the pipeline execution.

        Returns:
            List of step record dicts ordered by step_order.
        """
        result = (
            await self.supabase.table("pipeline_steps")
            .select("*")
            .eq("execution_id", execution_id)
            .order("step_order")
            .execute()
        )

        return result.data or []

    # ------------------------------------------------------------------
    # Private persistence helpers
    # ------------------------------------------------------------------

    async def _fetch_pipeline(self, pipeline_id: str) -> dict[str, Any] | None:
        """Fetch a pipeline definition from the database."""
        result = (
            await self.supabase.table("pipelines")
            .select("*")
            .eq("id", pipeline_id)
            .eq("is_active", True)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )

        if not result.data:
            logger.warning("Pipeline not found: id=%s", pipeline_id)
            return None

        return result.data[0]

    async def _insert_execution(
        self,
        execution_id: str,
        pipeline_id: str,
        workspace_id: str,
        user_id: str,
        input_data: dict[str, Any],
        started_at: datetime,
    ) -> None:
        """Insert a new pipeline_executions row with status=running."""
        try:
            await (
                self.supabase.table("pipeline_executions")
                .insert({
                    "id": execution_id,
                    "pipeline_id": pipeline_id,
                    "workspace_id": workspace_id,
                    "triggered_by": user_id,
                    "status": "running",
                    "input_params": input_data,
                    "started_at": started_at.isoformat(),
                })
                .execute()
            )
        except Exception:
            logger.error(
                "Failed to insert pipeline_executions: execution=%s",
                execution_id,
                exc_info=True,
            )
            raise

    async def _update_execution_completed(
        self,
        execution_id: str,
        status: str,
        results: dict[str, Any],
        total_cost: float,
        duration_ms: int,
        completed_at: datetime,
        error: str | None,
    ) -> None:
        """Update execution record on completion or failure."""
        update_data: dict[str, Any] = {
            "status": status,
            "result": results,
            "output_result": results,
            "total_credits": total_cost,
            "duration_ms": duration_ms,
            "completed_at": completed_at.isoformat(),
        }
        if error:
            update_data["error_message"] = error

        try:
            await (
                self.supabase.table("pipeline_executions")
                .update(update_data)
                .eq("id", execution_id)
                .execute()
            )
        except Exception:
            logger.error(
                "Failed to update pipeline_executions: execution=%s",
                execution_id,
                exc_info=True,
            )

    async def _update_execution_failed(
        self, execution_id: str, error_message: str
    ) -> None:
        """Mark an execution as failed."""
        now = datetime.now(tz=timezone.utc).isoformat()
        try:
            await (
                self.supabase.table("pipeline_executions")
                .update({
                    "status": "failed",
                    "error_message": error_message,
                    "completed_at": now,
                })
                .eq("id", execution_id)
                .execute()
            )
        except Exception:
            logger.error(
                "Failed to update execution to failed: execution=%s",
                execution_id,
                exc_info=True,
            )

    async def _insert_step_records(
        self,
        execution_id: str,
        results: dict[str, Any],
        graph_def: dict[str, Any],
        step_costs: list[float],
    ) -> None:
        """Insert pipeline_steps rows for each completed node."""
        nodes: list[dict[str, Any]] = graph_def.get("nodes", [])
        if not nodes:
            return

        rows: list[dict[str, Any]] = []
        for idx, node in enumerate(nodes):
            node_id = node["id"]
            node_result = results.get(node_id)

            step_status = "completed" if node_result is not None else "skipped"
            if isinstance(node_result, dict) and node_result.get("error"):
                step_status = "failed"

            cost = step_costs[idx] if idx < len(step_costs) else 0.0

            rows.append({
                "execution_id": execution_id,
                "step_name": node_id,
                "step_order": idx + 1,
                "status": step_status,
                "input_data": None,
                "output_data": node_result,
                "credits_used": cost,
            })

        if rows:
            try:
                await (
                    self.supabase.table("pipeline_steps")
                    .insert(rows)
                    .execute()
                )
            except Exception:
                logger.error(
                    "Failed to insert pipeline_steps: execution=%s",
                    execution_id,
                    exc_info=True,
                )

    async def _insert_audit_log(
        self,
        workspace_id: str,
        user_id: str,
        execution_id: str,
        pipeline_id: str,
        status: str,
        total_cost: float,
        duration_ms: int,
    ) -> None:
        """Insert an audit log entry for the pipeline execution."""
        try:
            await (
                self.supabase.table("audit_logs")
                .insert({
                    "workspace_id": workspace_id,
                    "user_id": user_id,
                    "action": f"pipeline.{status}",
                    "category": "pipeline",
                    "resource_type": "pipeline_execution",
                    "severity": "info" if status == "completed" else "warning",
                    "details": {
                        "execution_id": execution_id,
                        "pipeline_id": pipeline_id,
                        "status": status,
                        "total_cost": total_cost,
                        "duration_ms": duration_ms,
                    },
                })
                .execute()
            )
        except Exception:
            logger.error(
                "Failed to insert audit log: execution=%s",
                execution_id,
                exc_info=True,
            )

    async def _broadcast_error(
        self, execution_id: str, error_message: str
    ) -> None:
        """Best-effort error broadcast via WebSocket."""
        if self.ws_manager is None:
            return
        try:
            await self.ws_manager.send_execution_error(execution_id, error_message)
        except Exception:
            logger.debug("WebSocket error broadcast failed (best-effort)")
