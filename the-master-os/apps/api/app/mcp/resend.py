"""Resend Email MCP Client — transactional and batch email delivery.

Uses the Resend REST API (https://resend.com/docs/api-reference/emails).
The api_key is the Resend API Key (re_*...) stored in SecretVault.

Supported actions:
  - send:       Send a single transactional email
  - send_batch: Send up to 100 emails in a single API call

Security ref: P0 — Resend API key stored in SecretVault, never in env vars directly.
"""

from __future__ import annotations

import logging

import httpx

from app.mcp.base import MCPConnectionError, MCPExecutionError

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.resend.com"
_DEFAULT_TIMEOUT = 30.0
_SUPPORTED_ACTIONS = frozenset({"send", "send_batch"})


class ResendClient:
    """HTTP client for the Resend email API.

    Args:
        api_key: Resend API key (``re_*`` format).
        endpoint_url: Override base URL (for testing).
        **kwargs: Optional config (e.g., ``default_from``, ``timeout``).
    """

    def __init__(
        self,
        api_key: str,
        endpoint_url: str = "",
        **kwargs: object,
    ) -> None:
        self._api_key = api_key
        self._base_url = endpoint_url.rstrip("/") if endpoint_url else _BASE_URL
        self._timeout = float(kwargs.get("timeout", _DEFAULT_TIMEOUT))  # type: ignore[arg-type]
        self._default_from = str(kwargs.get("default_from", "The Master OS <noreply@updates.cubesystem.co.kr>"))

    @property
    def provider_name(self) -> str:
        return "resend"

    async def execute(self, action: str, params: dict[str, object]) -> dict[str, object]:
        """Execute a Resend email action.

        Args:
            action: One of 'send', 'send_batch'.
            params:
                - send: {"to": str|list, "subject": str, "html": str,
                         "text": str, "from": str (optional)}
                - send_batch: {"emails": list[dict]} — each dict same as send params

        Returns:
            Result dict with email IDs and delivery status.

        Raises:
            MCPExecutionError: On invalid action or API error.
        """
        if action not in _SUPPORTED_ACTIONS:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=action,
                detail=f"Unsupported action '{action}'. Supported: {', '.join(sorted(_SUPPORTED_ACTIONS))}",
            )

        handler = {
            "send": self._send,
            "send_batch": self._send_batch,
        }[action]

        return await handler(params)

    async def health_check(self) -> bool:
        """Verify Resend API key is valid."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self._base_url}/domains",
                    headers=self._headers(),
                )
                return resp.status_code < 500
        except httpx.HTTPError as exc:
            logger.warning("Resend health check failed: %s", exc)
            return False

    # -------------------------------------------------------------------------
    # Action handlers
    # -------------------------------------------------------------------------

    async def _send(self, params: dict[str, object]) -> dict[str, object]:
        """Send a single email via Resend."""
        to = params.get("to")
        if not to:
            raise MCPExecutionError(
                provider=self.provider_name,
                action="send",
                detail="Missing required parameter 'to' (string or list of strings).",
            )
        subject = params.get("subject")
        if not subject or not isinstance(subject, str):
            raise MCPExecutionError(
                provider=self.provider_name,
                action="send",
                detail="Missing required parameter 'subject' (string).",
            )

        html = params.get("html", "")
        text = params.get("text", "")
        if not html and not text:
            raise MCPExecutionError(
                provider=self.provider_name,
                action="send",
                detail="At least one of 'html' or 'text' is required.",
            )

        payload: dict[str, object] = {
            "from": str(params.get("from", self._default_from)),
            "to": [to] if isinstance(to, str) else to,
            "subject": subject,
        }
        if html:
            payload["html"] = str(html)
        if text:
            payload["text"] = str(text)
        if params.get("reply_to"):
            payload["reply_to"] = str(params["reply_to"])

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    f"{self._base_url}/emails",
                    headers=self._headers(),
                    json=payload,
                )
                self._check_response(resp, "send")
                data: dict[str, object] = resp.json()
                return {
                    "provider": self.provider_name,
                    "action": "send",
                    "email_id": data.get("id", ""),
                    "to": payload["to"],
                    "subject": subject,
                }
        except MCPExecutionError:
            raise
        except httpx.HTTPError as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action="send",
                detail=f"Email send failed: {exc}",
            ) from exc

    async def _send_batch(self, params: dict[str, object]) -> dict[str, object]:
        """Send up to 100 emails in a single Resend batch request."""
        emails = params.get("emails")
        if not emails or not isinstance(emails, list):
            raise MCPExecutionError(
                provider=self.provider_name,
                action="send_batch",
                detail="Missing required parameter 'emails' (list of email objects).",
            )
        if len(emails) > 100:
            raise MCPExecutionError(
                provider=self.provider_name,
                action="send_batch",
                detail=f"Batch size {len(emails)} exceeds Resend limit of 100.",
            )

        # Normalise each email object
        batch: list[dict[str, object]] = []
        default_from = self._default_from
        for i, email in enumerate(emails):
            if not isinstance(email, dict):
                raise MCPExecutionError(
                    provider=self.provider_name,
                    action="send_batch",
                    detail=f"Email at index {i} must be a dict.",
                )
            to = email.get("to")
            batch.append({
                "from": str(email.get("from", default_from)),
                "to": [to] if isinstance(to, str) else to,
                "subject": str(email.get("subject", "")),
                "html": str(email.get("html", "")),
                "text": str(email.get("text", "")),
            })

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    f"{self._base_url}/emails/batch",
                    headers=self._headers(),
                    json=batch,
                )
                self._check_response(resp, "send_batch")
                data: dict[str, object] = resp.json()
                return {
                    "provider": self.provider_name,
                    "action": "send_batch",
                    "data": data.get("data", []),
                    "sent_count": len(batch),
                }
        except MCPExecutionError:
            raise
        except httpx.HTTPError as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action="send_batch",
                detail=f"Batch email send failed: {exc}",
            ) from exc

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    def _check_response(self, resp: httpx.Response, action: str) -> None:
        """Validate response and raise on error."""
        if resp.status_code == 401:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=action,
                detail="Authentication failed. Check your Resend API key.",
            )
        if resp.status_code == 422:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=action,
                detail=f"Validation error: {resp.text[:500]}",
            )
        if resp.status_code == 429:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=action,
                detail="Resend rate limit exceeded. Try again later.",
            )
        if resp.status_code >= 400:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=action,
                detail=f"Resend API error {resp.status_code}: {resp.text[:500]}",
            )
