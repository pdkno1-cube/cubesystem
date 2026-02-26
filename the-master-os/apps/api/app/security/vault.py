"""Secret Vault — AES-256-GCM encryption/decryption for API keys and secrets.

Matches the frontend implementation (apps/web/src/lib/crypto.ts) exactly:
- Algorithm: AES-256-GCM
- IV: 12 bytes (96 bits), randomly generated per encryption
- Auth tag: 16 bytes (128 bits)
- All binary values stored as base64 strings in the database

The master key is loaded from the VAULT_ENCRYPTION_KEY environment variable,
which must be a 64-character hex string (32 bytes).

DB schema reference: supabase/migrations/20260226000005_create_mcp_and_vault.sql
Columns: id, workspace_id, name, slug, encrypted_value, iv, auth_tag,
         key_version, category, service_name, description, expires_at, ...
"""

from __future__ import annotations

import base64
import logging
import os
import re
from typing import TYPE_CHECKING

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

if TYPE_CHECKING:
    from supabase import Client as SupabaseClient

logger = logging.getLogger(__name__)

_ALGORITHM = "aes-256-gcm"
_IV_LENGTH = 12  # 96 bits — recommended for GCM
_AUTH_TAG_LENGTH = 16  # 128 bits
_HEX_KEY_PATTERN = re.compile(r"^[0-9a-fA-F]{64}$")


class VaultError(Exception):
    """Base exception for vault operations."""


class VaultKeyError(VaultError):
    """Raised when the vault encryption key is missing or malformed."""


class VaultDecryptionError(VaultError):
    """Raised when decryption fails (tampered data, wrong key, etc.)."""


def _get_encryption_key() -> bytes:
    """Load and validate the 32-byte AES key from the environment.

    Raises:
        VaultKeyError: If VAULT_ENCRYPTION_KEY is missing or not a 64-char hex string.
    """
    hex_key = os.environ.get("VAULT_ENCRYPTION_KEY", "")
    if not hex_key:
        raise VaultKeyError(
            "VAULT_ENCRYPTION_KEY environment variable is not set. "
            "Provide a 64-character hex string (32 bytes)."
        )
    if not _HEX_KEY_PATTERN.match(hex_key):
        raise VaultKeyError(
            "VAULT_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)."
        )
    return bytes.fromhex(hex_key)


class SecretVault:
    """Manages encryption, decryption, and storage of secrets in the secret_vault table.

    Uses AES-256-GCM for authenticated encryption, compatible with the
    frontend TypeScript implementation.

    Args:
        supabase_client: Authenticated Supabase client instance.
        master_key_hex: Optional override for the master key (64-char hex).
                        If not provided, reads from VAULT_ENCRYPTION_KEY env var.
    """

    def __init__(
        self,
        supabase_client: SupabaseClient,
        master_key_hex: str | None = None,
    ) -> None:
        if master_key_hex is not None:
            if not _HEX_KEY_PATTERN.match(master_key_hex):
                raise VaultKeyError(
                    "master_key_hex must be exactly 64 hex characters (32 bytes)."
                )
            self._key = bytes.fromhex(master_key_hex)
        else:
            self._key = _get_encryption_key()

        self._aesgcm = AESGCM(self._key)
        self._supabase = supabase_client

    # -------------------------------------------------------------------------
    # Encryption / Decryption (compatible with frontend crypto.ts)
    # -------------------------------------------------------------------------

    def encrypt(self, plaintext: str) -> dict[str, str]:
        """Encrypt a plaintext string using AES-256-GCM.

        Returns:
            Dict with keys 'encrypted_value', 'iv', 'auth_tag' — all base64-encoded.
        """
        iv = os.urandom(_IV_LENGTH)
        # AESGCM.encrypt appends the auth tag to the ciphertext
        ciphertext_with_tag = self._aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)

        # Split: ciphertext is everything except the last 16 bytes (auth tag)
        ciphertext = ciphertext_with_tag[:-_AUTH_TAG_LENGTH]
        auth_tag = ciphertext_with_tag[-_AUTH_TAG_LENGTH:]

        return {
            "encrypted_value": base64.b64encode(ciphertext).decode("ascii"),
            "iv": base64.b64encode(iv).decode("ascii"),
            "auth_tag": base64.b64encode(auth_tag).decode("ascii"),
        }

    def decrypt(
        self,
        encrypted_value: str,
        iv: str,
        auth_tag: str,
    ) -> str:
        """Decrypt an AES-256-GCM encrypted value.

        Args:
            encrypted_value: Base64-encoded ciphertext.
            iv: Base64-encoded initialization vector.
            auth_tag: Base64-encoded authentication tag.

        Returns:
            The original plaintext string.

        Raises:
            VaultDecryptionError: If decryption or authentication fails.
        """
        try:
            iv_bytes = base64.b64decode(iv)
            ciphertext_bytes = base64.b64decode(encrypted_value)
            tag_bytes = base64.b64decode(auth_tag)

            # AESGCM.decrypt expects ciphertext + auth_tag concatenated
            combined = ciphertext_bytes + tag_bytes
            plaintext_bytes = self._aesgcm.decrypt(iv_bytes, combined, None)
            return plaintext_bytes.decode("utf-8")
        except Exception as exc:
            logger.error("Vault decryption failed: %s", type(exc).__name__)
            raise VaultDecryptionError(
                "Failed to decrypt secret. The data may be corrupted or the key is wrong."
            ) from exc

    # -------------------------------------------------------------------------
    # Database operations
    # -------------------------------------------------------------------------

    async def store_secret(
        self,
        workspace_id: str,
        name: str,
        value: str,
        *,
        slug: str | None = None,
        category: str = "api_key",
        service_name: str | None = None,
        description: str | None = None,
        created_by: str | None = None,
    ) -> dict[str, str]:
        """Encrypt and store a secret in the secret_vault table.

        Uses upsert on (workspace_id, name) so existing secrets are updated.

        Args:
            workspace_id: UUID of the workspace that owns this secret.
            name: Human-readable name (e.g., 'firecrawl_api_key').
            value: The plaintext secret to encrypt and store.
            slug: URL-safe slug (defaults to name if not provided).
            category: One of 'api_key', 'oauth_token', 'password',
                      'certificate', 'webhook_secret', 'other'.
            service_name: Optional service identifier (e.g., 'firecrawl').
            description: Optional description of the secret.
            created_by: UUID of the user who created this secret.

        Returns:
            The upserted row as a dict.
        """
        encrypted = self.encrypt(value)

        row: dict[str, str | int | None] = {
            "workspace_id": workspace_id,
            "name": name,
            "slug": slug or name.lower().replace(" ", "-"),
            "encrypted_value": encrypted["encrypted_value"],
            "iv": encrypted["iv"],
            "auth_tag": encrypted["auth_tag"],
            "key_version": 1,
            "category": category,
        }
        if service_name is not None:
            row["service_name"] = service_name
        if description is not None:
            row["description"] = description
        if created_by is not None:
            row["created_by"] = created_by

        result = (
            self._supabase.table("secret_vault")
            .upsert(row, on_conflict="workspace_id,name")
            .execute()
        )
        logger.info(
            "Stored secret '%s' for workspace %s (service=%s)",
            name,
            workspace_id,
            service_name,
        )
        return result.data[0] if result.data else {}

    async def get_secret(
        self,
        workspace_id: str,
        name: str,
    ) -> str | None:
        """Retrieve and decrypt a secret from the vault.

        Args:
            workspace_id: UUID of the workspace.
            name: The secret name (e.g., 'firecrawl_api_key').

        Returns:
            The decrypted plaintext, or None if the secret doesn't exist.
        """
        result = (
            self._supabase.table("secret_vault")
            .select("encrypted_value, iv, auth_tag")
            .eq("workspace_id", workspace_id)
            .eq("name", name)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )

        if not result.data:
            logger.warning(
                "Secret '%s' not found for workspace %s", name, workspace_id
            )
            return None

        row = result.data[0]
        return self.decrypt(
            encrypted_value=row["encrypted_value"],
            iv=row["iv"],
            auth_tag=row["auth_tag"],
        )

    async def get_secret_by_id(self, secret_id: str) -> dict[str, str] | None:
        """Retrieve a secret row by its UUID (for mcp_connections.secret_ref lookups).

        Returns:
            Dict with 'decrypted_value' and metadata, or None if not found.
        """
        result = (
            self._supabase.table("secret_vault")
            .select("id, workspace_id, name, encrypted_value, iv, auth_tag, service_name")
            .eq("id", secret_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )

        if not result.data:
            return None

        row = result.data[0]
        decrypted = self.decrypt(
            encrypted_value=row["encrypted_value"],
            iv=row["iv"],
            auth_tag=row["auth_tag"],
        )
        return {
            "id": row["id"],
            "workspace_id": row["workspace_id"],
            "name": row["name"],
            "service_name": row.get("service_name", ""),
            "decrypted_value": decrypted,
        }

    async def delete_secret(
        self,
        workspace_id: str,
        name: str,
    ) -> bool:
        """Soft-delete a secret by setting deleted_at.

        Returns:
            True if a row was updated, False if not found.
        """
        result = (
            self._supabase.table("secret_vault")
            .update({"deleted_at": "now()"})
            .eq("workspace_id", workspace_id)
            .eq("name", name)
            .is_("deleted_at", "null")
            .execute()
        )
        deleted = bool(result.data)
        if deleted:
            logger.info(
                "Soft-deleted secret '%s' for workspace %s", name, workspace_id
            )
        return deleted
