"""MCP Registry — factory and execution hub for external tool integrations.

The registry resolves MCP provider names (e.g., 'firecrawl', 'slack') to
concrete client instances, injecting API keys from the SecretVault.

DB schema reference: supabase/migrations/20260226000005_create_mcp_and_vault.sql
  - mcp_connections: provider, endpoint_url, config, secret_ref, auth_method
  - secret_vault: encrypted API keys decrypted via SecretVault class
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.mcp.base import MCPAuthenticationError, MCPClient, MCPExecutionError
from app.mcp.firecrawl import FireCrawlClient
from app.mcp.google_drive import GoogleDriveClient
from app.mcp.paddleocr import PaddleOCRClient
from app.mcp.slack import SlackClient

if TYPE_CHECKING:
    from supabase import Client as SupabaseClient

    from app.security.vault import SecretVault

logger = logging.getLogger(__name__)

# Mapping from provider name → client constructor
_CLIENT_FACTORIES: dict[str, type[FireCrawlClient | PaddleOCRClient | GoogleDriveClient | SlackClient]] = {
    "firecrawl": FireCrawlClient,
    "paddleocr": PaddleOCRClient,
    "google_drive": GoogleDriveClient,
    "slack": SlackClient,
}


class MCPRegistry:
    """Central hub for MCP client lifecycle: creation, caching, and execution.

    Typical usage::

        vault = SecretVault(supabase_client)
        registry = MCPRegistry(vault=vault, supabase_client=supabase_client)

        result = await registry.execute_tool(
            mcp_name="firecrawl",
            workspace_id="...",
            action="scrape",
            params={"url": "https://example.com"},
        )
    """

    def __init__(
        self,
        vault: SecretVault,
        supabase_client: SupabaseClient,
    ) -> None:
        self._vault = vault
        self._supabase = supabase_client
        # Cache: (provider, workspace_id) -> client instance
        self._client_cache: dict[tuple[str, str], MCPClient] = {}

    async def get_client(
        self,
        mcp_name: str,
        workspace_id: str,
    ) -> MCPClient:
        """Get or create an MCP client for the given provider and workspace.

        Looks up the mcp_connections table for endpoint/config, then resolves
        the API key from secret_vault via the secret_ref FK.

        Args:
            mcp_name: Provider identifier (e.g., 'firecrawl', 'slack').
            workspace_id: UUID of the workspace requesting the client.

        Returns:
            An initialized MCPClient instance.

        Raises:
            MCPExecutionError: If the provider is unknown or configuration is missing.
            MCPAuthenticationError: If the API key cannot be resolved.
        """
        cache_key = (mcp_name, workspace_id)

        if cache_key in self._client_cache:
            return self._client_cache[cache_key]

        if mcp_name not in _CLIENT_FACTORIES:
            raise MCPExecutionError(
                provider=mcp_name,
                action="get_client",
                detail=f"Unknown MCP provider '{mcp_name}'. "
                       f"Supported: {', '.join(sorted(_CLIENT_FACTORIES))}",
            )

        # Fetch connection config from mcp_connections
        connection = await self._get_connection(mcp_name, workspace_id)
        api_key = await self._resolve_api_key(connection, mcp_name, workspace_id)

        # Build config dict for the client
        client_config: dict[str, object] = {
            "api_key": api_key,
            "endpoint_url": connection.get("endpoint_url", ""),
            **(connection.get("config") or {}),
        }

        factory = _CLIENT_FACTORIES[mcp_name]
        client: MCPClient = factory(**client_config)

        self._client_cache[cache_key] = client
        logger.info(
            "Created MCP client: provider=%s, workspace=%s", mcp_name, workspace_id
        )
        return client

    async def execute_tool(
        self,
        mcp_name: str,
        workspace_id: str,
        action: str,
        params: dict[str, object],
    ) -> dict[str, object]:
        """Acquire a client and execute an action.

        Args:
            mcp_name: Provider identifier.
            workspace_id: UUID of the workspace.
            action: Action to perform (provider-specific).
            params: Action parameters.

        Returns:
            The action result dict.

        Raises:
            MCPExecutionError: On any execution failure.
        """
        client = await self.get_client(mcp_name, workspace_id)

        logger.info(
            "Executing MCP tool: provider=%s, action=%s, workspace=%s",
            mcp_name,
            action,
            workspace_id,
        )

        try:
            result = await client.execute(action, params)
        except MCPExecutionError:
            # Re-raise known MCP errors
            raise
        except Exception as exc:
            logger.exception(
                "Unexpected error in MCP execution: provider=%s, action=%s",
                mcp_name,
                action,
            )
            raise MCPExecutionError(
                provider=mcp_name,
                action=action,
                detail=f"Unexpected error: {exc}",
            ) from exc

        return result

    async def health_check(
        self,
        mcp_name: str,
        workspace_id: str,
    ) -> bool:
        """Run a health check for the given MCP provider.

        Returns:
            True if the provider is healthy.
        """
        try:
            client = await self.get_client(mcp_name, workspace_id)
            return await client.health_check()
        except (MCPExecutionError, MCPAuthenticationError):
            logger.warning(
                "Health check failed for provider=%s, workspace=%s",
                mcp_name,
                workspace_id,
            )
            return False

    async def health_check_all(
        self,
        workspace_id: str,
    ) -> dict[str, bool]:
        """Run health checks for all registered providers in a workspace.

        Returns:
            Dict mapping provider name to health status.
        """
        results: dict[str, bool] = {}
        for provider in _CLIENT_FACTORIES:
            results[provider] = await self.health_check(provider, workspace_id)
        return results

    def invalidate_cache(
        self,
        mcp_name: str | None = None,
        workspace_id: str | None = None,
    ) -> None:
        """Remove cached clients. Useful after API key rotation.

        If both args are None, clears the entire cache.
        """
        if mcp_name is None and workspace_id is None:
            self._client_cache.clear()
            return

        keys_to_remove = [
            k for k in self._client_cache
            if (mcp_name is None or k[0] == mcp_name)
            and (workspace_id is None or k[1] == workspace_id)
        ]
        for k in keys_to_remove:
            del self._client_cache[k]

    # -------------------------------------------------------------------------
    # Private helpers
    # -------------------------------------------------------------------------

    async def _get_connection(
        self,
        mcp_name: str,
        workspace_id: str,
    ) -> dict[str, object]:
        """Fetch the mcp_connections row for this provider + workspace."""
        result = (
            self._supabase.table("mcp_connections")
            .select("id, provider, endpoint_url, config, auth_method, secret_ref, status")
            .eq("provider", mcp_name)
            .eq("workspace_id", workspace_id)
            .eq("is_active", True)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )

        if not result.data:
            raise MCPExecutionError(
                provider=mcp_name,
                action="get_client",
                detail=f"No active MCP connection found for provider '{mcp_name}' "
                       f"in workspace '{workspace_id}'. "
                       "Please configure the connection first.",
            )

        return result.data[0]

    async def _resolve_api_key(
        self,
        connection: dict[str, object],
        mcp_name: str,
        workspace_id: str,
    ) -> str:
        """Resolve the API key from the secret_vault via secret_ref."""
        auth_method = connection.get("auth_method", "api_key")

        if auth_method == "none":
            return ""

        secret_ref = connection.get("secret_ref")
        if not secret_ref:
            raise MCPAuthenticationError(
                provider=mcp_name,
                action="get_client",
                detail="MCP connection has no secret_ref linked. "
                       "Please store the API key in the vault first.",
            )

        secret_data = await self._vault.get_secret_by_id(str(secret_ref))
        if not secret_data:
            raise MCPAuthenticationError(
                provider=mcp_name,
                action="get_client",
                detail=f"Secret (id={secret_ref}) not found or has been deleted.",
            )

        return secret_data["decrypted_value"]
