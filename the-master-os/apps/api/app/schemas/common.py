"""Common Pydantic v2 schemas shared across the application."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Base response wrappers
# ---------------------------------------------------------------------------


class BaseResponse(BaseModel, Generic[T]):
    """Standard envelope for single-item API responses."""

    data: T
    meta: dict[str, Any] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard envelope for paginated list responses."""

    data: list[T]
    total: int
    page: int
    limit: int

    model_config = {"from_attributes": True}


class ErrorDetail(BaseModel):
    """Structured error detail (returned inside ErrorResponse)."""

    code: str
    message: str


class ErrorResponse(BaseModel):
    """Top-level error response wrapper.

    Example:
        {"error": {"code": "NOT_FOUND", "message": "Resource not found"}}
    """

    error: ErrorDetail


# ---------------------------------------------------------------------------
# Health check schemas
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    """Minimal health check response."""

    status: str = "healthy"
    version: str = "0.1.0"
    timestamp: datetime


class ServiceStatus(BaseModel):
    """Individual service health status."""

    name: str
    status: str  # "healthy" | "degraded" | "down"
    latency_ms: float | None = None
    message: str = ""


class DetailedHealthResponse(BaseModel):
    """Detailed health check with per-service breakdown."""

    status: str  # "healthy" | "degraded" | "down"
    version: str = "0.1.0"
    timestamp: datetime
    services: list[ServiceStatus]
