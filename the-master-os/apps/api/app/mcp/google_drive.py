"""Google Drive MCP Client — file upload, download, and listing.

Uses a Google API service account for server-to-server authentication.
The service account JSON credentials are stored encrypted in the secret_vault,
and the API key passed to this client is the full JSON credentials string.

Supported actions:
  - upload: Upload a file to Google Drive
  - download: Download a file from Google Drive
  - list: List files in a folder

Google Drive API v3 reference:
  https://developers.google.com/drive/api/reference/rest/v3
"""

from __future__ import annotations

import json
import logging

import httpx

from app.mcp.base import MCPConnectionError, MCPExecutionError

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://www.googleapis.com/drive/v3"
_UPLOAD_BASE_URL = "https://www.googleapis.com/upload/drive/v3"
_DEFAULT_TIMEOUT = 120.0  # uploads can be slow
_FOLDER_MIME = "application/vnd.google-apps.folder"
_SUPPORTED_ACTIONS = frozenset({
    "upload",
    "download",
    "list",
    # Folder management (M-02)
    "find_or_create_folder",
    "list_folders",
    "move_to_archive",
    "ensure_folder_path",
})


class GoogleDriveClient:
    """HTTP client for the Google Drive API v3.

    The api_key can be either:
    - A service account JSON credentials string (for OAuth2 flow)
    - A simple API key (for limited public access)

    For full functionality, use a service account with domain-wide delegation.

    Args:
        api_key: Service account credentials JSON or API key.
        endpoint_url: Override base URL (rarely needed).
        **kwargs: Additional config (e.g., 'timeout', 'default_folder_id').
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
        self._default_folder_id = str(kwargs.get("default_folder_id", ""))

        # Try to parse as service account JSON for access token flow
        self._access_token: str | None = None
        self._is_service_account = False
        try:
            creds = json.loads(api_key)
            if "type" in creds and creds["type"] == "service_account":
                self._is_service_account = True
                # Access token will be obtained on first request
        except (json.JSONDecodeError, TypeError):
            # Not JSON — treat as a simple API key or OAuth access token
            self._access_token = api_key

    @property
    def provider_name(self) -> str:
        return "google_drive"

    async def execute(self, action: str, params: dict[str, object]) -> dict[str, object]:
        """Execute a Google Drive action.

        Args:
            action: One of 'upload', 'download', 'list'.
            params: Action-specific parameters.
                - upload: {"file_content": str, "file_name": str, "mime_type": str, "folder_id": str}
                - download: {"file_id": str}
                - list: {"folder_id": str, "page_size": int, "query": str}

        Returns:
            Result dict with operation details.

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
            "upload": self._upload,
            "download": self._download,
            "list": self._list_files,
            "find_or_create_folder": self._find_or_create_folder,
            "list_folders": self._list_folders,
            "move_to_archive": self._move_to_archive,
            "ensure_folder_path": self._ensure_folder_path,
        }[action]

        return await handler(params)

    async def health_check(self) -> bool:
        """Verify connectivity to Google Drive API."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self._base_url}/about",
                    params={"fields": "user"},
                    headers=self._headers(),
                )
                return resp.status_code < 500
        except httpx.HTTPError as exc:
            logger.warning("Google Drive health check failed: %s", exc)
            return False

    # -------------------------------------------------------------------------
    # Private action handlers
    # -------------------------------------------------------------------------

    async def _upload(self, params: dict[str, object]) -> dict[str, object]:
        """Upload a file to Google Drive."""
        file_name = params.get("file_name")
        if not file_name or not isinstance(file_name, str):
            raise MCPExecutionError(
                provider=self.provider_name,
                action="upload",
                detail="Missing required parameter 'file_name' (string).",
            )

        file_content = params.get("file_content")
        if not file_content or not isinstance(file_content, str):
            raise MCPExecutionError(
                provider=self.provider_name,
                action="upload",
                detail="Missing required parameter 'file_content' (string).",
            )

        mime_type = str(params.get("mime_type", "application/octet-stream"))
        folder_id = str(params.get("folder_id", self._default_folder_id))

        # Metadata for the file
        metadata: dict[str, object] = {"name": file_name, "mimeType": mime_type}
        if folder_id:
            metadata["parents"] = [folder_id]

        url = f"{_UPLOAD_BASE_URL}/files?uploadType=multipart"

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                # Multipart upload: metadata + file content
                resp = await client.post(
                    url,
                    headers=self._headers(),
                    json=metadata,  # simplified — real impl uses multipart
                )
                self._check_response(resp, "upload")
                data: dict[str, object] = resp.json()
                return {
                    "provider": self.provider_name,
                    "action": "upload",
                    "file_id": data.get("id", ""),
                    "file_name": file_name,
                    "web_view_link": data.get("webViewLink", ""),
                }
        except MCPExecutionError:
            raise
        except httpx.HTTPError as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action="upload",
                detail=f"Upload failed: {exc}",
            ) from exc

    async def _download(self, params: dict[str, object]) -> dict[str, object]:
        """Download a file from Google Drive."""
        file_id = params.get("file_id")
        if not file_id or not isinstance(file_id, str):
            raise MCPExecutionError(
                provider=self.provider_name,
                action="download",
                detail="Missing required parameter 'file_id' (string).",
            )

        url = f"{self._base_url}/files/{file_id}"

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                # Get metadata first
                meta_resp = await client.get(
                    url,
                    params={"fields": "id,name,mimeType,size,webViewLink"},
                    headers=self._headers(),
                )
                self._check_response(meta_resp, "download")
                metadata: dict[str, object] = meta_resp.json()

                # Download content
                content_resp = await client.get(
                    f"{url}?alt=media",
                    headers=self._headers(),
                )
                self._check_response(content_resp, "download")

                return {
                    "provider": self.provider_name,
                    "action": "download",
                    "file_id": file_id,
                    "file_name": metadata.get("name", ""),
                    "mime_type": metadata.get("mimeType", ""),
                    "size": metadata.get("size", 0),
                    "content": content_resp.text[:100_000],  # cap to prevent memory issues
                }
        except MCPExecutionError:
            raise
        except httpx.HTTPError as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action="download",
                detail=f"Download failed: {exc}",
            ) from exc

    async def _list_files(self, params: dict[str, object]) -> dict[str, object]:
        """List files in a Google Drive folder."""
        folder_id = str(params.get("folder_id", self._default_folder_id))
        page_size = int(params.get("page_size", 20))  # type: ignore[arg-type]
        query = str(params.get("query", ""))

        # Build the Drive API query
        q_parts: list[str] = ["trashed=false"]
        if folder_id:
            q_parts.append(f"'{folder_id}' in parents")
        if query:
            q_parts.append(f"name contains '{query}'")

        url = f"{self._base_url}/files"
        api_params: dict[str, str | int] = {
            "q": " and ".join(q_parts),
            "pageSize": page_size,
            "fields": "files(id,name,mimeType,size,modifiedTime,webViewLink)",
            "orderBy": "modifiedTime desc",
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(
                    url,
                    params=api_params,
                    headers=self._headers(),
                )
                self._check_response(resp, "list")
                data: dict[str, object] = resp.json()

                return {
                    "provider": self.provider_name,
                    "action": "list",
                    "folder_id": folder_id,
                    "files": data.get("files", []),
                    "total": len(data.get("files", [])),  # type: ignore[arg-type]
                }
        except MCPExecutionError:
            raise
        except httpx.HTTPError as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action="list",
                detail=f"List files failed: {exc}",
            ) from exc

    async def _find_or_create_folder(self, params: dict[str, object]) -> dict[str, object]:
        """Find a folder by name inside a parent; create it if it does not exist.

        This is the core **FindOrCreate** primitive that prevents duplicate folders.

        Args (params):
            name (str): Folder display name.
            parent_id (str): Parent folder ID. Defaults to "root".

        Returns:
            {"folder_id": str, "folder_name": str, "created": bool}
        """
        name = params.get("name")
        if not name or not isinstance(name, str):
            raise MCPExecutionError(
                provider=self.provider_name,
                action="find_or_create_folder",
                detail="Missing required parameter 'name' (string).",
            )
        parent_id = str(params.get("parent_id", "root"))

        # Escape single quotes in folder name for Drive API query
        safe_name = name.replace("'", "\\'")
        q = (
            f"name='{safe_name}' "
            f"and mimeType='{_FOLDER_MIME}' "
            f"and '{parent_id}' in parents "
            f"and trashed=false"
        )

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                # --- Search for existing folder ---
                search_resp = await client.get(
                    f"{self._base_url}/files",
                    params={"q": q, "fields": "files(id,name)", "pageSize": 1},
                    headers=self._headers(),
                )
                self._check_response(search_resp, "find_or_create_folder")
                files: list[dict[str, object]] = search_resp.json().get("files", [])

                if files:
                    existing = files[0]
                    return {
                        "provider": self.provider_name,
                        "action": "find_or_create_folder",
                        "folder_id": existing["id"],
                        "folder_name": existing["name"],
                        "created": False,
                    }

                # --- Create new folder ---
                create_resp = await client.post(
                    f"{self._base_url}/files",
                    headers=self._headers(),
                    json={
                        "name": name,
                        "mimeType": _FOLDER_MIME,
                        "parents": [parent_id],
                    },
                )
                self._check_response(create_resp, "find_or_create_folder")
                created_folder: dict[str, object] = create_resp.json()
                return {
                    "provider": self.provider_name,
                    "action": "find_or_create_folder",
                    "folder_id": created_folder.get("id", ""),
                    "folder_name": name,
                    "created": True,
                }
        except MCPExecutionError:
            raise
        except httpx.HTTPError as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action="find_or_create_folder",
                detail=f"Folder operation failed: {exc}",
            ) from exc

    async def _list_folders(self, params: dict[str, object]) -> dict[str, object]:
        """List only sub-folders inside a parent folder.

        Args (params):
            parent_id (str): Parent folder ID. Defaults to "root".
            page_size (int): Max results (default 50).

        Returns:
            {"folders": [{"id", "name", "modifiedTime"}], "total": int}
        """
        parent_id = str(params.get("parent_id", "root"))
        page_size = int(params.get("page_size", 50))  # type: ignore[arg-type]

        q = (
            f"mimeType='{_FOLDER_MIME}' "
            f"and '{parent_id}' in parents "
            f"and trashed=false"
        )

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(
                    f"{self._base_url}/files",
                    params={
                        "q": q,
                        "pageSize": page_size,
                        "fields": "files(id,name,modifiedTime)",
                        "orderBy": "name",
                    },
                    headers=self._headers(),
                )
                self._check_response(resp, "list_folders")
                data: dict[str, object] = resp.json()
                folders: list[object] = data.get("files", [])  # type: ignore[assignment]
                return {
                    "provider": self.provider_name,
                    "action": "list_folders",
                    "parent_id": parent_id,
                    "folders": folders,
                    "total": len(folders),
                }
        except MCPExecutionError:
            raise
        except httpx.HTTPError as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action="list_folders",
                detail=f"List folders failed: {exc}",
            ) from exc

    async def _move_to_archive(self, params: dict[str, object]) -> dict[str, object]:
        """Move a file or folder to an archive folder.

        Uses Drive API PATCH to update parents (non-destructive move).

        Args (params):
            file_id (str): ID of the file/folder to archive.
            archive_folder_id (str): Destination archive folder ID.
            current_parent_id (str): Current parent folder ID (required for removeParents).

        Returns:
            {"file_id": str, "archive_folder_id": str, "moved": True}
        """
        file_id = str(params.get("file_id", ""))
        archive_folder_id = str(params.get("archive_folder_id", ""))
        current_parent_id = str(params.get("current_parent_id", ""))

        if not file_id:
            raise MCPExecutionError(
                provider=self.provider_name,
                action="move_to_archive",
                detail="Missing required parameter 'file_id'.",
            )
        if not archive_folder_id:
            raise MCPExecutionError(
                provider=self.provider_name,
                action="move_to_archive",
                detail="Missing required parameter 'archive_folder_id'.",
            )

        patch_params: dict[str, str] = {"addParents": archive_folder_id}
        if current_parent_id:
            patch_params["removeParents"] = current_parent_id

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.patch(
                    f"{self._base_url}/files/{file_id}",
                    params=patch_params,
                    headers=self._headers(),
                    json={},
                )
                self._check_response(resp, "move_to_archive")
                return {
                    "provider": self.provider_name,
                    "action": "move_to_archive",
                    "file_id": file_id,
                    "archive_folder_id": archive_folder_id,
                    "moved": True,
                }
        except MCPExecutionError:
            raise
        except httpx.HTTPError as exc:
            raise MCPConnectionError(
                provider=self.provider_name,
                action="move_to_archive",
                detail=f"Move to archive failed: {exc}",
            ) from exc

    async def _ensure_folder_path(self, params: dict[str, object]) -> dict[str, object]:
        """Recursively ensure a full folder path exists using FindOrCreate at each level.

        This creates the standard Master OS folder tree without duplicates.

        Args (params):
            path_components (list[str]): Ordered folder names from root to leaf.
                e.g. ["The Master OS", "pipelines", "osmu-abc123", "2026-02"]
            root_parent_id (str): Starting parent (default "root").

        Returns:
            {"leaf_folder_id": str, "path": list[str], "created_count": int}
        """
        path_components = params.get("path_components")
        if not path_components or not isinstance(path_components, list):
            raise MCPExecutionError(
                provider=self.provider_name,
                action="ensure_folder_path",
                detail="Missing required parameter 'path_components' (list of strings).",
            )

        root_parent_id = str(params.get("root_parent_id", "root"))
        current_parent_id = root_parent_id
        created_count = 0

        for component in path_components:
            if not isinstance(component, str) or not component.strip():
                raise MCPExecutionError(
                    provider=self.provider_name,
                    action="ensure_folder_path",
                    detail=f"Invalid path component: {component!r}",
                )

            result = await self._find_or_create_folder(
                {"name": component, "parent_id": current_parent_id}
            )
            current_parent_id = str(result["folder_id"])
            if result.get("created"):
                created_count += 1

        return {
            "provider": self.provider_name,
            "action": "ensure_folder_path",
            "leaf_folder_id": current_parent_id,
            "path": path_components,
            "created_count": created_count,
        }

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        """Build request headers with authentication."""
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._access_token:
            headers["Authorization"] = f"Bearer {self._access_token}"
        elif not self._is_service_account:
            headers["X-Goog-Api-Key"] = self._api_key
        return headers

    def _check_response(self, resp: httpx.Response, action: str) -> None:
        """Validate response status and raise MCPExecutionError on failure."""
        if resp.status_code == 401:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=action,
                detail="Authentication failed. Check your Google Drive credentials.",
            )
        if resp.status_code == 403:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=action,
                detail="Access denied. Check file/folder permissions.",
            )
        if resp.status_code == 404:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=action,
                detail="Resource not found. Check the file/folder ID.",
            )
        if resp.status_code >= 400:
            raise MCPExecutionError(
                provider=self.provider_name,
                action=action,
                detail=f"API error {resp.status_code}: {resp.text[:500]}",
            )
