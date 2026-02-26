"""WebSocket endpoint for real-time pipeline execution streaming.

Security references:
  - AUTH-01: JWT verification via query parameter for WebSocket handshake
  - WS-01: Per-connection authentication before accepting

Route: /ws/execution/{execution_id}?token=<jwt>
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt

from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

# Keep-alive interval in seconds
_KEEPALIVE_INTERVAL_SECONDS = 30


def _verify_ws_token(token: str) -> dict[str, object]:
    """Verify a JWT token from WebSocket query parameters.

    Returns the decoded payload on success.
    Raises ValueError on any verification failure.
    """
    settings = get_settings()
    try:
        payload: dict[str, object] = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require_exp": True, "require_sub": True},
        )
    except JWTError as exc:
        logger.warning("WebSocket JWT verification failed: %s", exc)
        raise ValueError("Invalid or expired token") from exc

    sub = payload.get("sub")
    if not sub or not isinstance(sub, str):
        raise ValueError("Token missing required 'sub' claim")

    return payload


@router.websocket("/ws/execution/{execution_id}")
async def execution_websocket(
    websocket: WebSocket,
    execution_id: str,
) -> None:
    """WebSocket endpoint for streaming pipeline execution progress.

    Authentication is performed via a JWT token passed as a query parameter:
        ws://host/ws/execution/{execution_id}?token=<jwt>

    After successful authentication, the server:
    1. Sends an initial connection_ack message with current state
    2. Maintains keep-alive pings every 30 seconds
    3. Forwards execution events broadcast by the ConnectionManager
    4. Cleans up on disconnect
    """
    # --- Authentication ---
    token = websocket.query_params.get("token")
    if not token:
        logger.warning(
            "WebSocket connection rejected: missing token, execution_id=%s",
            execution_id,
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        claims = _verify_ws_token(token)
    except ValueError as exc:
        logger.warning(
            "WebSocket connection rejected: %s, execution_id=%s",
            exc,
            execution_id,
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = str(claims.get("sub", ""))

    # --- Connection Manager ---
    manager = websocket.app.state.ws_manager

    await manager.connect(execution_id, websocket)
    logger.info(
        "WebSocket authenticated: user_id=%s, execution_id=%s",
        user_id,
        execution_id,
    )

    # Send initial acknowledgement
    try:
        await websocket.send_json({
            "type": "connection_ack",
            "execution_id": execution_id,
            "user_id": user_id,
            "message": "Connected to execution stream",
        })
    except Exception:
        logger.error(
            "Failed to send connection_ack: execution_id=%s", execution_id
        )
        manager.disconnect(execution_id, websocket)
        return

    # --- Keep-alive + message loop ---
    try:
        while True:
            try:
                # Wait for client messages (ping/pong or control)
                # with a timeout for keep-alive
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=_KEEPALIVE_INTERVAL_SECONDS,
                )

                # Handle client-sent ping
                msg_type = data.get("type") if isinstance(data, dict) else None
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg_type == "disconnect":
                    logger.info(
                        "Client requested disconnect: execution_id=%s, user_id=%s",
                        execution_id,
                        user_id,
                    )
                    break

            except asyncio.TimeoutError:
                # No message received within interval; send server keep-alive
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    logger.info(
                        "Keep-alive failed, connection lost: execution_id=%s",
                        execution_id,
                    )
                    break

    except WebSocketDisconnect:
        logger.info(
            "WebSocket disconnected: user_id=%s, execution_id=%s",
            user_id,
            execution_id,
        )
    except Exception:
        logger.exception(
            "Unexpected WebSocket error: execution_id=%s", execution_id
        )
    finally:
        manager.disconnect(execution_id, websocket)
