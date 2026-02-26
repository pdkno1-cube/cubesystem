"""PaddleOCR MCP Client — document OCR text extraction.

Supports both a local PaddleOCR HTTP server and external API endpoints.

Supported actions:
  - extract_text: Extract raw text from an image/document
  - extract_structured: Extract structured key-value pairs from a document

Expected server API (local PaddleOCR server):
  POST /predict/ocr  — full OCR extraction
  POST /predict/structure  — structured document extraction
"""

from __future__ import annotations

import logging

import httpx

from app.mcp.base import MCPConnectionError, MCPExecutionError

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "http://localhost:8866"
_DEFAULT_TIMEOUT = 120.0  # OCR can be slow for large documents
_SUPPORTED_ACTIONS = frozenset({"extract_text", "extract_structured"})


class PaddleOCRClient:
    """HTTP client for a PaddleOCR service (local or remote).

    Args:
        api_key: API key (may be empty for local servers with auth_method='none').
        endpoint_url: Base URL of the PaddleOCR server.
        **kwargs: Additional config (e.g., 'timeout', 'language').
    """

    def __init__(
        self,
        api_key: str = "",
        endpoint_url: str = "",
        **kwargs: object,
    ) -> None:
        self._api_key = api_key
        self._base_url = (endpoint_url.rstrip("/") if endpoint_url else _DEFAULT_BASE_URL)
        self._timeout = float(kwargs.get("timeout", _DEFAULT_TIMEOUT))  # type: ignore[arg-type]
        self._language = str(kwargs.get("language", "korean"))

    @property
    def provider_name(self) -> str:
        return "paddleocr"

    async def execute(self, action: str, params: dict[str, object]) -> dict[str, object]:
        """Execute a PaddleOCR action.

        Args:
            action: One of 'extract_text', 'extract_structured'.
            params: Action-specific parameters.
                - extract_text: {"image_url": str} or {"image_base64": str}
                - extract_structured: {"image_url": str, "template": str}

        Returns:
            Extracted text/structured data as a dict.

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
            "extract_text": self._extract_text,
            "extract_structured": self._extract_structured,
        }[action]

        return await handler(params)

    async def health_check(self) -> bool:
        """Verify connectivity to the PaddleOCR server."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self._base_url}/health",
                    headers=self._headers(),
                )
                return resp.status_code < 500
        except httpx.HTTPError as exc:
            logger.warning("PaddleOCR health check failed: %s", exc)
            return False

    # -------------------------------------------------------------------------
    # Private action handlers
    # -------------------------------------------------------------------------

    async def _extract_text(self, params: dict[str, object]) -> dict[str, object]:
        """Extract raw text from an image or document."""
        payload = self._build_image_payload(params, action="extract_text")
        payload["language"] = self._language

        result = await self._post("/predict/ocr", payload)

        # Normalize response to a consistent format
        return {
            "provider": self.provider_name,
            "action": "extract_text",
            "text": result.get("text", ""),
            "regions": result.get("regions", []),
            "confidence": result.get("confidence", 0.0),
            "raw": result,
        }

    async def _extract_structured(self, params: dict[str, object]) -> dict[str, object]:
        """Extract structured key-value pairs from a document."""
        payload = self._build_image_payload(params, action="extract_structured")
        payload["language"] = self._language

        template = params.get("template")
        if template and isinstance(template, str):
            payload["template"] = template

        result = await self._post("/predict/structure", payload)

        return {
            "provider": self.provider_name,
            "action": "extract_structured",
            "fields": result.get("fields", {}),
            "confidence": result.get("confidence", 0.0),
            "raw": result,
        }

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    def _build_image_payload(
        self,
        params: dict[str, object],
        action: str,
    ) -> dict[str, object]:
        """Build the image payload from either URL or base64 input."""
        image_url = params.get("image_url")
        image_base64 = params.get("image_base64")

        if image_url and isinstance(image_url, str):
            return {"image_url": image_url}
        if image_base64 and isinstance(image_base64, str):
            return {"image_base64": image_base64}

        raise MCPExecutionError(
            provider=self.provider_name,
            action=action,
            detail="Provide either 'image_url' (string) or 'image_base64' (string).",
        )

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    async def _post(self, path: str, payload: dict[str, object]) -> dict[str, object]:
        """Send a POST request to the PaddleOCR server."""
        url = f"{self._base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, headers=self._headers(), json=payload)

                if resp.status_code == 401:
                    raise MCPExecutionError(
                        provider=self.provider_name,
                        action=path.strip("/"),
                        detail="Authentication failed. Check your PaddleOCR API key.",
                    )

                if resp.status_code >= 400:
                    raise MCPExecutionError(
                        provider=self.provider_name,
                        action=path.strip("/"),
                        detail=f"API error {resp.status_code}: {resp.text[:500]}",
                    )

                return resp.json()  # type: ignore[no-any-return]

        except httpx.ConnectError as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action=path.strip("/"),
                detail=f"Connection to PaddleOCR server failed: {exc}",
            ) from exc
        except httpx.TimeoutException as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action=path.strip("/"),
                detail=f"OCR request timed out after {self._timeout}s",
            ) from exc
        except MCPExecutionError:
            raise
        except httpx.HTTPError as exc:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=path.strip("/"),
                detail=f"HTTP error: {exc}",
            ) from exc
