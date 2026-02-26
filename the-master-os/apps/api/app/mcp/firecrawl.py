"""FireCrawl MCP Client — web crawling and scraping via FireCrawl API.

Supported actions:
  - scrape: Extract content from a single URL
  - crawl: Crawl multiple pages from a starting URL
  - search: Search the web and return structured results

FireCrawl API reference: https://docs.firecrawl.dev/api-reference
"""

from __future__ import annotations

import logging

import httpx

from app.mcp.base import MCPConnectionError, MCPExecutionError

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://api.firecrawl.dev/v1"
_DEFAULT_TIMEOUT = 60.0  # seconds
_SUPPORTED_ACTIONS = frozenset({"scrape", "crawl", "search"})


class FireCrawlClient:
    """HTTP client for the FireCrawl web scraping API.

    Args:
        api_key: FireCrawl API key.
        endpoint_url: Override base URL (defaults to https://api.firecrawl.dev/v1).
        **kwargs: Additional config options (ignored gracefully).
    """

    def __init__(
        self,
        api_key: str,
        endpoint_url: str = "",
        **kwargs: object,
    ) -> None:
        self._api_key = api_key
        self._base_url = endpoint_url.rstrip("/") if endpoint_url else _DEFAULT_BASE_URL
        self._timeout = float(kwargs.get("timeout", _DEFAULT_TIMEOUT))  # type: ignore[arg-type]

    @property
    def provider_name(self) -> str:
        return "firecrawl"

    async def execute(self, action: str, params: dict[str, object]) -> dict[str, object]:
        """Execute a FireCrawl action.

        Args:
            action: One of 'scrape', 'crawl', 'search'.
            params: Action-specific parameters.
                - scrape: {"url": str, "formats": list[str]}
                - crawl: {"url": str, "limit": int}
                - search: {"query": str, "limit": int}

        Returns:
            The FireCrawl API response as a dict.

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
            "scrape": self._scrape,
            "crawl": self._crawl,
            "search": self._search,
        }[action]

        return await handler(params)

    async def health_check(self) -> bool:
        """Verify connectivity to the FireCrawl API."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self._base_url}/scrape",
                    headers=self._headers(),
                )
                # A 401 means the key is invalid; 405/200/etc. means reachable
                return resp.status_code != 401
        except httpx.HTTPError as exc:
            logger.warning("FireCrawl health check failed: %s", exc)
            return False

    # -------------------------------------------------------------------------
    # Private action handlers
    # -------------------------------------------------------------------------

    async def _scrape(self, params: dict[str, object]) -> dict[str, object]:
        """Scrape a single URL and return its content."""
        url = params.get("url")
        if not url or not isinstance(url, str):
            raise MCPExecutionError(
                provider=self.provider_name,
                action="scrape",
                detail="Missing required parameter 'url' (string).",
            )

        formats = params.get("formats", ["markdown"])
        payload: dict[str, object] = {"url": url, "formats": formats}

        if "waitFor" in params:
            payload["waitFor"] = params["waitFor"]
        if "onlyMainContent" in params:
            payload["onlyMainContent"] = params["onlyMainContent"]

        return await self._post("/scrape", payload)

    async def _crawl(self, params: dict[str, object]) -> dict[str, object]:
        """Crawl pages starting from a URL."""
        url = params.get("url")
        if not url or not isinstance(url, str):
            raise MCPExecutionError(
                provider=self.provider_name,
                action="crawl",
                detail="Missing required parameter 'url' (string).",
            )

        limit = int(params.get("limit", 10))  # type: ignore[arg-type]
        payload: dict[str, object] = {"url": url, "limit": limit}

        if "excludePaths" in params:
            payload["excludePaths"] = params["excludePaths"]
        if "includePaths" in params:
            payload["includePaths"] = params["includePaths"]

        return await self._post("/crawl", payload)

    async def _search(self, params: dict[str, object]) -> dict[str, object]:
        """Search the web via FireCrawl."""
        query = params.get("query")
        if not query or not isinstance(query, str):
            raise MCPExecutionError(
                provider=self.provider_name,
                action="search",
                detail="Missing required parameter 'query' (string).",
            )

        limit = int(params.get("limit", 5))  # type: ignore[arg-type]
        payload: dict[str, object] = {"query": query, "limit": limit}

        return await self._post("/search", payload)

    # -------------------------------------------------------------------------
    # HTTP helpers
    # -------------------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    async def _post(self, path: str, payload: dict[str, object]) -> dict[str, object]:
        """Send a POST request to the FireCrawl API."""
        url = f"{self._base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, headers=self._headers(), json=payload)

                if resp.status_code == 401:
                    raise MCPExecutionError(
                        provider=self.provider_name,
                        action=path.strip("/"),
                        detail="Authentication failed. Check your FireCrawl API key.",
                    )

                if resp.status_code == 429:
                    raise MCPExecutionError(
                        provider=self.provider_name,
                        action=path.strip("/"),
                        detail="Rate limit exceeded. Please retry later.",
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
                detail=f"Connection failed: {exc}",
            ) from exc
        except httpx.TimeoutException as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action=path.strip("/"),
                detail=f"Request timed out after {self._timeout}s",
            ) from exc
        except MCPExecutionError:
            raise
        except httpx.HTTPError as exc:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=path.strip("/"),
                detail=f"HTTP error: {exc}",
            ) from exc
