"""Shared pytest fixtures for The Master OS API tests."""

from __future__ import annotations

from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.middleware.auth import AuthenticatedUser, get_current_user


# ---------------------------------------------------------------------------
# Test user fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_user() -> AuthenticatedUser:
    """A fake authenticated user for dependency overrides."""
    return AuthenticatedUser(
        user_id="00000000-0000-0000-0000-000000000001",
        email="test@cubesystem.co.kr",
        role="owner",
        workspace_ids=["00000000-0000-0000-0000-000000000002"],
        raw_claims={},
    )


# ---------------------------------------------------------------------------
# Supabase mock
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_supabase() -> MagicMock:
    """A synchronous Supabase client mock returning empty data by default."""
    client = MagicMock()
    # Default: table().select().eq()...execute() → empty data
    query = MagicMock()
    query.execute.return_value = MagicMock(data=[], count=0)
    query.select.return_value = query
    query.eq.return_value = query
    query.is_.return_value = query
    query.contains.return_value = query
    query.order.return_value = query
    query.range.return_value = query
    query.limit.return_value = query
    query.upsert.return_value = query
    query.insert.return_value = query
    query.update.return_value = query
    query.single.return_value = query
    client.table.return_value = query
    return client


@pytest.fixture
def mock_supabase_async() -> AsyncMock:
    """An async Supabase client mock."""
    client = AsyncMock()
    query = AsyncMock()
    query.execute.return_value = AsyncMock(data=[], count=0)
    for method in ("select", "eq", "is_", "lte", "gte", "contains", "order",
                   "range", "limit", "upsert", "insert", "update", "single"):
        getattr(query, method).return_value = query
    client.table.return_value = query
    return client


# ---------------------------------------------------------------------------
# FastAPI test client with auth override
# ---------------------------------------------------------------------------


@pytest.fixture
def test_app(mock_user: AuthenticatedUser) -> FastAPI:
    """Create the FastAPI app with authentication dependency overridden."""
    from app.main import create_app

    app = create_app()
    # Override JWT auth so tests don't need a real token
    app.dependency_overrides[get_current_user] = lambda: mock_user
    return app


@pytest.fixture
async def async_client(
    test_app: FastAPI,
) -> AsyncGenerator[AsyncClient, None]:
    """Async httpx client pointed at the test app."""
    async with AsyncClient(
        transport=ASGITransport(app=test_app),
        base_url="http://testserver",
    ) as client:
        yield client
