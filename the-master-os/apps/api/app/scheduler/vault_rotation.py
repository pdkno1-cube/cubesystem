"""Vault auto-rotation job — rotates secrets whose rotation interval has elapsed.

Runs hourly via APScheduler.  For each secret with ``auto_rotation=true``
and ``(now - last_rotated_at) > rotation_interval_days``:
  1. Generate a new random API-key-style value (uuid4-based).
  2. Encrypt with AES-256-GCM using the existing vault master key.
  3. Increment ``key_version``, update ``last_rotated_at``.
  4. Write an audit log entry (``vault.auto_rotate``).

Error handling:
  - Individual secret failures do NOT block other rotations.
  - All errors are logged via ``logger.warning`` / ``logger.exception``
    (Sentry captures these automatically when DSN is configured).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from app.security.vault import SecretVault, VaultError

if TYPE_CHECKING:
    from supabase._async.client import AsyncClient as SupabaseAsyncClient

logger = logging.getLogger(__name__)


def _generate_api_key() -> str:
    """Generate a new API key in uuid4-based format.

    Format: ``tmos_<uuid4_hex>`` — 40 characters total, URL-safe.
    """
    return f"tmos_{uuid.uuid4().hex}"


async def run_vault_rotation(supabase: SupabaseAsyncClient) -> None:
    """Main rotation job entry point.

    Args:
        supabase: Async Supabase client instance.
    """
    now = datetime.now(tz=timezone.utc)
    logger.info("Vault rotation check started at %s", now.isoformat())

    try:
        # Query secrets due for rotation:
        #   auto_rotation = true
        #   deleted_at IS NULL
        #   (now - last_rotated_at) > rotation_interval_days  OR  last_rotated_at IS NULL
        #
        # We fetch all eligible secrets and filter in Python to handle the
        # interval comparison (Supabase REST API date arithmetic is limited).
        result = await (
            supabase.table("secret_vault")
            .select(
                "id, workspace_id, name, encrypted_value, iv, auth_tag, "
                "key_version, rotation_interval_days, last_rotated_at, created_at"
            )
            .eq("auto_rotation", True)
            .is_("deleted_at", "null")
            .execute()
        )
    except Exception:
        logger.exception("Vault rotation: failed to query secrets due for rotation")
        return

    secrets: list[dict[str, Any]] = result.data or []
    if not secrets:
        logger.debug("Vault rotation: no auto-rotation secrets found")
        return

    rotated_count = 0
    skipped_count = 0
    error_count = 0

    for secret in secrets:
        try:
            should_rotate = _should_rotate(secret, now)
            if not should_rotate:
                skipped_count += 1
                continue

            await _rotate_single_secret(supabase, secret, now)
            rotated_count += 1
        except Exception:
            error_count += 1
            logger.exception(
                "Vault rotation: failed to rotate secret_id=%s name=%s",
                secret.get("id"),
                secret.get("name"),
            )

    logger.info(
        "Vault rotation completed: rotated=%d skipped=%d errors=%d total=%d",
        rotated_count,
        skipped_count,
        error_count,
        len(secrets),
    )


def _should_rotate(secret: dict[str, Any], now: datetime) -> bool:
    """Determine whether a secret is due for rotation."""
    interval_days: int = int(secret.get("rotation_interval_days", 90))
    last_rotated_raw = secret.get("last_rotated_at")

    if last_rotated_raw is None:
        # Never rotated — check against created_at
        created_raw = secret.get("created_at")
        if created_raw is None:
            return True
        reference = datetime.fromisoformat(str(created_raw))
    else:
        reference = datetime.fromisoformat(str(last_rotated_raw))

    # Ensure timezone-aware comparison
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)

    elapsed_days = (now - reference).total_seconds() / 86400
    return elapsed_days >= interval_days


async def _rotate_single_secret(
    supabase: SupabaseAsyncClient,
    secret: dict[str, Any],
    now: datetime,
) -> None:
    """Rotate a single secret: generate new value, encrypt, update DB, audit."""
    secret_id: str = str(secret["id"])
    workspace_id: str = str(secret["workspace_id"])
    secret_name: str = str(secret["name"])
    current_version: int = int(secret.get("key_version", 1))
    new_version = current_version + 1

    # 1. Generate new secret value
    new_plaintext = _generate_api_key()

    # 2. Encrypt with AES-256-GCM (reuses the existing master key)
    try:
        # Create a sync Supabase-less vault instance just for encryption
        vault = SecretVault.__new__(SecretVault)
        # Initialize encryption components manually (avoids needing a supabase client)
        from app.security.vault import _get_encryption_key

        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        key = _get_encryption_key()
        vault._aesgcm = AESGCM(key)
        encrypted = vault.encrypt(new_plaintext)
    except VaultError:
        logger.exception(
            "Vault rotation: encryption failed for secret_id=%s", secret_id
        )
        raise

    # 3. Update the secret in the database
    update_data = {
        "encrypted_value": encrypted["encrypted_value"],
        "iv": encrypted["iv"],
        "auth_tag": encrypted["auth_tag"],
        "key_version": new_version,
        "last_rotated_at": now.isoformat(),
    }

    await (
        supabase.table("secret_vault")
        .update(update_data)
        .eq("id", secret_id)
        .execute()
    )

    logger.info(
        "Vault rotation: rotated secret_id=%s name=%s version=%d->%d",
        secret_id,
        secret_name,
        current_version,
        new_version,
    )

    # 4. Write audit log entry
    await _write_audit_log(
        supabase,
        workspace_id=workspace_id,
        action="vault.auto_rotate",
        resource_type="secret_vault",
        resource_id=secret_id,
        details={
            "secret_name": secret_name,
            "old_version": current_version,
            "new_version": new_version,
            "rotation_interval_days": int(secret.get("rotation_interval_days", 90)),
        },
    )


async def _write_audit_log(
    supabase: SupabaseAsyncClient,
    *,
    workspace_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    details: dict[str, object],
) -> None:
    """Write an audit log entry for the rotation event."""
    try:
        await (
            supabase.table("audit_logs")
            .insert({
                "workspace_id": workspace_id,
                "action": action,
                "category": "security",
                "resource_type": resource_type,
                "resource_id": resource_id,
                "details": details,
                "severity": "info",
            })
            .execute()
        )
    except Exception:
        logger.warning(
            "Vault rotation: failed to write audit log for secret_id=%s",
            resource_id,
            exc_info=True,
        )
