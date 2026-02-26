"""Slack MCP Client — message and notification delivery via Slack.

Supports both:
  - Incoming Webhooks (simple, no bot token needed)
  - Slack Web API (chat.postMessage, for richer interactions)

Supported actions:
  - send_message: Send a message to a specific channel
  - send_notification: Send a formatted notification (e.g., pipeline result alerts)

Slack API reference:
  - Webhooks: https://api.slack.com/messaging/webhooks
  - Web API: https://api.slack.com/methods/chat.postMessage
"""

from __future__ import annotations

import logging

import httpx

from app.mcp.base import MCPConnectionError, MCPExecutionError

logger = logging.getLogger(__name__)

_SLACK_API_BASE = "https://slack.com/api"
_DEFAULT_TIMEOUT = 30.0
_SUPPORTED_ACTIONS = frozenset({"send_message", "send_notification"})


class SlackClient:
    """HTTP client for Slack messaging.

    The api_key can be either:
    - A Bot User OAuth Token (xoxb-...) for the Web API
    - A Webhook URL (https://hooks.slack.com/...) for incoming webhooks

    The client auto-detects the mode based on the api_key format.

    Args:
        api_key: Slack bot token or webhook URL.
        endpoint_url: Override base URL (rarely needed).
        **kwargs: Additional config (e.g., 'default_channel', 'timeout').
    """

    def __init__(
        self,
        api_key: str,
        endpoint_url: str = "",
        **kwargs: object,
    ) -> None:
        self._api_key = api_key
        self._timeout = float(kwargs.get("timeout", _DEFAULT_TIMEOUT))  # type: ignore[arg-type]
        self._default_channel = str(kwargs.get("default_channel", "#general"))

        # Detect whether api_key is a webhook URL or a bot token
        self._is_webhook = api_key.startswith("https://hooks.slack.com/")
        self._webhook_url = api_key if self._is_webhook else ""
        self._base_url = endpoint_url.rstrip("/") if endpoint_url else _SLACK_API_BASE

    @property
    def provider_name(self) -> str:
        return "slack"

    async def execute(self, action: str, params: dict[str, object]) -> dict[str, object]:
        """Execute a Slack action.

        Args:
            action: One of 'send_message', 'send_notification'.
            params: Action-specific parameters.
                - send_message: {"channel": str, "text": str, "blocks": list}
                - send_notification: {"channel": str, "title": str, "body": str,
                                      "severity": str, "fields": dict}

        Returns:
            Slack API response as a dict.

        Raises:
            MCPExecutionError: On invalid action or API error.
        """
        if action not in _SUPPORTED_ACTIONS:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=action,
                detail=f"Unsupported action '{action}'. "
                       f"Supported: {', '.join(sorted(_SUPPORTED_ACTIONS))}",
            )

        handler = {
            "send_message": self._send_message,
            "send_notification": self._send_notification,
        }[action]

        return await handler(params)

    async def health_check(self) -> bool:
        """Verify Slack connectivity.

        For bot tokens, calls auth.test.
        For webhooks, there's no reliable check — returns True if the URL is set.
        """
        if self._is_webhook:
            return bool(self._webhook_url)

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{self._base_url}/auth.test",
                    headers=self._headers(),
                )
                data = resp.json()
                return bool(data.get("ok", False))
        except httpx.HTTPError as exc:
            logger.warning("Slack health check failed: %s", exc)
            return False

    # -------------------------------------------------------------------------
    # Private action handlers
    # -------------------------------------------------------------------------

    async def _send_message(self, params: dict[str, object]) -> dict[str, object]:
        """Send a plain text or block-kit message to a Slack channel."""
        text = params.get("text")
        if not text or not isinstance(text, str):
            raise MCPExecutionError(
                provider=self.provider_name,
                action="send_message",
                detail="Missing required parameter 'text' (string).",
            )

        channel = str(params.get("channel", self._default_channel))
        blocks = params.get("blocks")

        if self._is_webhook:
            return await self._send_via_webhook(text, blocks)

        payload: dict[str, object] = {"channel": channel, "text": text}
        if blocks and isinstance(blocks, list):
            payload["blocks"] = blocks

        return await self._post_api("/chat.postMessage", payload, "send_message")

    async def _send_notification(self, params: dict[str, object]) -> dict[str, object]:
        """Send a formatted notification with title, body, severity, and fields."""
        title = str(params.get("title", "Notification"))
        body = str(params.get("body", ""))
        severity = str(params.get("severity", "info"))
        fields = params.get("fields", {})
        channel = str(params.get("channel", self._default_channel))

        # Map severity to color
        color_map: dict[str, str] = {
            "info": "#36a64f",      # green
            "warning": "#ffcc00",   # yellow
            "error": "#ff0000",     # red
            "critical": "#8b0000",  # dark red
        }
        color = color_map.get(severity, "#36a64f")

        # Build Slack attachment
        attachment_fields: list[dict[str, object]] = []
        if isinstance(fields, dict):
            for key, value in fields.items():
                attachment_fields.append({
                    "title": str(key),
                    "value": str(value),
                    "short": True,
                })

        attachments: list[dict[str, object]] = [{
            "color": color,
            "title": f"[{severity.upper()}] {title}",
            "text": body,
            "fields": attachment_fields,
            "footer": "The Master OS",
        }]

        text = f"[{severity.upper()}] {title}: {body}"

        if self._is_webhook:
            webhook_payload: dict[str, object] = {
                "text": text,
                "attachments": attachments,
            }
            return await self._send_via_webhook_raw(webhook_payload, "send_notification")

        payload: dict[str, object] = {
            "channel": channel,
            "text": text,
            "attachments": attachments,
        }

        return await self._post_api("/chat.postMessage", payload, "send_notification")

    # -------------------------------------------------------------------------
    # HTTP helpers
    # -------------------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        """Build headers for Slack Web API calls."""
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json; charset=utf-8",
        }

    async def _send_via_webhook(
        self,
        text: str,
        blocks: object = None,
    ) -> dict[str, object]:
        """Send a message via incoming webhook."""
        payload: dict[str, object] = {"text": text}
        if blocks and isinstance(blocks, list):
            payload["blocks"] = blocks
        return await self._send_via_webhook_raw(payload, "send_message")

    async def _send_via_webhook_raw(
        self,
        payload: dict[str, object],
        action: str,
    ) -> dict[str, object]:
        """Send a raw payload to the webhook URL."""
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    self._webhook_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )

                if resp.status_code == 403:
                    raise MCPExecutionError(
                        provider=self.provider_name,
                        action=action,
                        detail="Webhook URL is invalid or revoked.",
                    )

                if resp.status_code >= 400:
                    raise MCPExecutionError(
                        provider=self.provider_name,
                        action=action,
                        detail=f"Webhook error {resp.status_code}: {resp.text[:200]}",
                    )

                return {
                    "provider": self.provider_name,
                    "action": action,
                    "ok": True,
                    "delivery_method": "webhook",
                }

        except httpx.ConnectError as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action=action,
                detail=f"Webhook connection failed: {exc}",
            ) from exc
        except httpx.TimeoutException as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action=action,
                detail=f"Webhook request timed out after {self._timeout}s",
            ) from exc
        except MCPExecutionError:
            raise
        except httpx.HTTPError as exc:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=action,
                detail=f"HTTP error: {exc}",
            ) from exc

    async def _post_api(
        self,
        path: str,
        payload: dict[str, object],
        action: str,
    ) -> dict[str, object]:
        """Send a POST request to the Slack Web API."""
        url = f"{self._base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, headers=self._headers(), json=payload)

                if resp.status_code == 401:
                    raise MCPExecutionError(
                        provider=self.provider_name,
                        action=action,
                        detail="Authentication failed. Check your Slack bot token.",
                    )

                if resp.status_code >= 400:
                    raise MCPExecutionError(
                        provider=self.provider_name,
                        action=action,
                        detail=f"API error {resp.status_code}: {resp.text[:200]}",
                    )

                data: dict[str, object] = resp.json()

                # Slack API returns 200 with ok=false for errors
                if not data.get("ok", False):
                    error = data.get("error", "unknown_error")
                    raise MCPExecutionError(
                        provider=self.provider_name,
                        action=action,
                        detail=f"Slack API error: {error}",
                    )

                return {
                    "provider": self.provider_name,
                    "action": action,
                    "ok": True,
                    "delivery_method": "web_api",
                    "channel": data.get("channel", ""),
                    "ts": data.get("ts", ""),
                }

        except httpx.ConnectError as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action=action,
                detail=f"Slack API connection failed: {exc}",
            ) from exc
        except httpx.TimeoutException as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action=action,
                detail=f"Slack API request timed out after {self._timeout}s",
            ) from exc
        except MCPExecutionError:
            raise
        except httpx.HTTPError as exc:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=action,
                detail=f"HTTP error: {exc}",
            ) from exc
