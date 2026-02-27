"""Google Drive Folder Policy for The Master OS.

Enforces the standard folder tree:
  The Master OS/
  ├── pipelines/{pipeline-id}/{YYYY-MM}/
  ├── agents/{agent-name}/
  ├── exports/
  └── archive/   ← 90일 후 자동 이동

Naming rules:
  - Lowercase + hyphens only
  - Max 50 characters
  - No spaces or special characters

Security ref: P0 — service account accesses only designated folders.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

_SLUG_RE = re.compile(r"[^a-z0-9-]")
_MAX_NAME_LEN = 50

ROOT_FOLDER_NAME = "The Master OS"
ARCHIVE_DAYS = 90  # days before moving to archive


def slugify(name: str) -> str:
    """Convert an arbitrary name to lowercase-hyphen slug format.

    Examples:
        "BlogAgent" -> "blogagent"
        "pipe-abc 123" -> "pipe-abc-123"
        "OSMU_2026" -> "osmu-2026"
    """
    slug = name.lower().replace(" ", "-").replace("_", "-")
    slug = _SLUG_RE.sub("", slug)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug[:_MAX_NAME_LEN]


def pipeline_folder_path(pipeline_id: str, dt: datetime | None = None) -> list[str]:
    """Return path components for a pipeline execution folder.

    Args:
        pipeline_id: Pipeline execution ID (will be slugified).
        dt: Date to use for YYYY-MM component (defaults to now UTC).

    Returns:
        e.g. ["The Master OS", "pipelines", "osmu-abc123", "2026-02"]
    """
    if dt is None:
        dt = datetime.now(tz=timezone.utc)
    month_str = dt.strftime("%Y-%m")
    return [ROOT_FOLDER_NAME, "pipelines", slugify(pipeline_id), month_str]


def agent_folder_path(agent_name: str) -> list[str]:
    """Return path components for an agent's dedicated folder.

    Args:
        agent_name: Agent class name or display name.

    Returns:
        e.g. ["The Master OS", "agents", "blog-agent"]
    """
    return [ROOT_FOLDER_NAME, "agents", slugify(agent_name)]


def exports_folder_path() -> list[str]:
    """Return path to the shared exports folder."""
    return [ROOT_FOLDER_NAME, "exports"]


def archive_folder_path() -> list[str]:
    """Return path to the archive folder (90-day retention)."""
    return [ROOT_FOLDER_NAME, "archive"]


def validate_folder_name(name: str) -> str:
    """Validate and normalise a folder name according to naming policy.

    Raises:
        ValueError: If the slug is empty after normalisation.

    Returns:
        Normalised slug string (max 50 chars, lowercase-hyphen).
    """
    slug = slugify(name)
    if not slug:
        raise ValueError(
            f"Invalid folder name '{name}': must contain at least one alphanumeric character."
        )
    return slug
