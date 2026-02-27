"""Application configuration via pydantic-settings.

All settings are loaded from environment variables or .env file.
Required fields without defaults will cause startup failure if missing.
"""

from __future__ import annotations

import logging
import sys
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Centralised application settings.

    Secrets (api_secret_key, supabase_service_role_key, vault_encryption_key, etc.)
    are **required** -- the application refuses to start without them.

    Security review refs: P0-07 (CORS validation), P0-11 (API_DEBUG default false),
    P0-08 (docs disabled in production).
    """

    # --- FastAPI ---
    api_host: str = "0.0.0.0"  # noqa: S104  -- bind address, not a credential
    api_port: int = 8000
    api_env: Literal["development", "staging", "production"] = "development"
    api_debug: bool = False  # P0-11: default false (security review)
    api_cors_origins: list[str] = ["http://localhost:3000"]
    api_secret_key: str  # required -- no default
    api_rate_limit_per_minute: int = 100
    api_workers: int = 4

    # --- Supabase ---
    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    # --- Redis / Celery ---
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = ""  # empty = Celery disabled (sync fallback)
    celery_result_backend: str = ""  # defaults to celery_broker_url if empty

    # --- Scheduler ---
    enable_scheduler: bool = False  # vault rotation scheduler (ENABLE_SCHEDULER)

    # --- Sentry ---
    sentry_dsn: str = ""
    sentry_environment: str = "development"
    sentry_traces_sample_rate: float = 0.1

    # --- Vault / Encryption ---
    vault_encryption_key: str  # required -- AES-256 master key (Base64, 32 bytes)
    vault_key_rotation_days: int = 90

    # --- JWT ---
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30

    # --- LLM Providers ---
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # --- Logging ---
    log_level: str = "INFO"
    log_format: Literal["json", "text"] = "json"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    def validate_production_cors(self) -> None:
        """P0-07: Block wildcard / localhost origins in production."""
        if self.api_env != "production":
            return
        for origin in self.api_cors_origins:
            if origin == "*" or "localhost" in origin:
                logger.critical(
                    "FATAL: Production CORS contains wildcard or localhost: %s",
                    origin,
                )
                sys.exit(1)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton of application settings."""
    return Settings()  # type: ignore[call-arg]
