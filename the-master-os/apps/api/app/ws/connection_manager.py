"""WebSocket connection manager for pipeline execution streaming.

Manages per-execution WebSocket connections and provides typed broadcast
methods following the WS message protocol.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections grouped by execution_id.

    Each execution can have multiple concurrent viewers (e.g., team members
    watching the same pipeline run). Messages are broadcast to all connections
    subscribed to a given execution_id.
    """

    def __init__(self) -> None:
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, execution_id: str, websocket: WebSocket) -> None:
        """Accept and register a WebSocket connection for an execution."""
        await websocket.accept()
        if execution_id not in self.active:
            self.active[execution_id] = []
        self.active[execution_id].append(websocket)
        logger.info(
            "WebSocket connected: execution_id=%s, total_connections=%d",
            execution_id,
            len(self.active[execution_id]),
        )

    def disconnect(self, execution_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection from an execution group."""
        if execution_id in self.active:
            try:
                self.active[execution_id].remove(websocket)
            except ValueError:
                logger.warning(
                    "WebSocket not found in active connections: execution_id=%s",
                    execution_id,
                )
                return
            if not self.active[execution_id]:
                del self.active[execution_id]
            logger.info(
                "WebSocket disconnected: execution_id=%s, remaining=%d",
                execution_id,
                len(self.active.get(execution_id, [])),
            )

    def get_connection_count(self, execution_id: str) -> int:
        """Return the number of active connections for an execution."""
        return len(self.active.get(execution_id, []))

    async def broadcast(self, execution_id: str, message: dict[str, object]) -> None:
        """Send a message to all connections subscribed to an execution.

        Silently skips connections that have been closed or errored.
        Disconnected sockets are cleaned up after broadcast.
        """
        connections = self.active.get(execution_id, [])
        if not connections:
            return

        stale: list[WebSocket] = []
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception:
                logger.debug(
                    "Failed to send to WebSocket, marking as stale: execution_id=%s",
                    execution_id,
                )
                stale.append(ws)

        # Clean up stale connections
        for ws in stale:
            self.disconnect(execution_id, ws)

    def _timestamp(self) -> str:
        """Return an ISO-8601 UTC timestamp string."""
        return datetime.now(tz=timezone.utc).isoformat()

    async def send_step_start(
        self,
        execution_id: str,
        node_id: str,
        label: str,
    ) -> None:
        """Broadcast a step_start event."""
        await self.broadcast(execution_id, {
            "type": "step_start",
            "node_id": node_id,
            "label": label,
            "timestamp": self._timestamp(),
        })

    async def send_step_complete(
        self,
        execution_id: str,
        node_id: str,
        duration_ms: int,
        result_preview: str,
    ) -> None:
        """Broadcast a step_complete event."""
        await self.broadcast(execution_id, {
            "type": "step_complete",
            "node_id": node_id,
            "duration_ms": duration_ms,
            "result_preview": result_preview,
            "timestamp": self._timestamp(),
        })

    async def send_agent_streaming(
        self,
        execution_id: str,
        node_id: str,
        chunk: str,
    ) -> None:
        """Broadcast an agent_streaming event (incremental LLM output)."""
        await self.broadcast(execution_id, {
            "type": "agent_streaming",
            "node_id": node_id,
            "chunk": chunk,
            "timestamp": self._timestamp(),
        })

    async def send_execution_complete(
        self,
        execution_id: str,
        status: str,
        total_cost: float,
    ) -> None:
        """Broadcast an execution_complete event."""
        await self.broadcast(execution_id, {
            "type": "execution_complete",
            "status": status,
            "total_cost": total_cost,
            "timestamp": self._timestamp(),
        })

    async def send_execution_error(
        self,
        execution_id: str,
        error: str,
    ) -> None:
        """Broadcast an execution_error event."""
        await self.broadcast(execution_id, {
            "type": "execution_error",
            "error": error,
            "timestamp": self._timestamp(),
        })
