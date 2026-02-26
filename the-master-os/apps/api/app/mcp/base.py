"""Base protocol and exceptions for MCP clients.

Every MCP integration (FireCrawl, PaddleOCR, Google Drive, Slack, etc.)
must implement the MCPClient protocol.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


class MCPExecutionError(Exception):
    """Raised when an MCP tool execution fails.

    Attributes:
        provider: The MCP provider name (e.g., 'firecrawl').
        action: The action that was attempted (e.g., 'scrape').
        detail: Human-readable error detail.
    """

    def __init__(self, provider: str, action: str, detail: str) -> None:
        self.provider = provider
        self.action = action
        self.detail = detail
        super().__init__(f"MCP [{provider}] action '{action}' failed: {detail}")


class MCPConnectionError(MCPExecutionError):
    """Raised when the MCP provider is unreachable or returns a connection error."""


class MCPAuthenticationError(MCPExecutionError):
    """Raised when the API key or credentials are invalid/expired."""


@runtime_checkable
class MCPClient(Protocol):
    """Protocol that all MCP tool clients must satisfy.

    Each client wraps a specific external service and exposes a uniform
    execute/health_check interface for the MCPRegistry.
    """

    @property
    def provider_name(self) -> str:
        """Return the provider identifier (e.g., 'firecrawl', 'slack')."""
        ...

    async def execute(self, action: str, params: dict[str, object]) -> dict[str, object]:
        """Execute a named action with the given parameters.

        Args:
            action: The action to perform (provider-specific).
            params: Action parameters.

        Returns:
            A dict containing the action result.

        Raises:
            MCPExecutionError: If the action fails.
        """
        ...

    async def health_check(self) -> bool:
        """Check whether the external service is reachable and authenticated.

        Returns:
            True if healthy, False otherwise.
        """
        ...
