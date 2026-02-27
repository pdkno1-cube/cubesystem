"""Integration tests for the marketing router endpoints.

Creates a lightweight FastAPI app with only the marketing router to avoid
importing heavy dependencies (langgraph, etc.) pulled in by create_app().

Patches _supabase_client and _mcp_registry at the module level so that
actual Supabase and Resend connections are never established.
"""

from __future__ import annotations

from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.middleware.auth import AuthenticatedUser, get_current_user
from app.routers import marketing


# ---------------------------------------------------------------------------
# Lightweight test app — only the marketing router (no langgraph needed)
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        user_id="00000000-0000-0000-0000-000000000001",
        email="test@cubesystem.co.kr",
        role="owner",
        workspace_ids=["00000000-0000-0000-0000-000000000002"],
        raw_claims={},
    )


@pytest.fixture
def marketing_app(mock_user: AuthenticatedUser) -> FastAPI:
    app = FastAPI()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.include_router(marketing.router)
    return app


@pytest.fixture
async def client(
    marketing_app: FastAPI,
) -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(
        transport=ASGITransport(app=marketing_app),
        base_url="http://testserver",
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# Newsletter send
# ---------------------------------------------------------------------------


class TestNewsletterSend:
    async def test_missing_html_and_text_returns_422(
        self,
        client: AsyncClient,
    ) -> None:
        with (
            patch("app.routers.marketing._supabase_client"),
            patch("app.routers.marketing._mcp_registry"),
        ):
            response = await client.post(
                "/orchestrate/marketing/newsletter/send",
                json={"workspace_id": "ws-1", "subject": "Test"},
            )
        assert response.status_code == 422

    async def test_no_subscribers_returns_zero_sent(
        self,
        client: AsyncClient,
    ) -> None:
        mock_sb = MagicMock()
        # Build the subscriber query chain ending with empty data
        sub_chain = MagicMock()
        sub_chain.execute.return_value = MagicMock(data=[])
        for method in ("select", "eq", "is_", "contains"):
            getattr(sub_chain, method).return_value = sub_chain
        mock_sb.table.return_value = sub_chain

        with (
            patch("app.routers.marketing._supabase_client", return_value=mock_sb),
            patch("app.routers.marketing._mcp_registry"),
        ):
            response = await client.post(
                "/orchestrate/marketing/newsletter/send",
                json={
                    "workspace_id": "ws-1",
                    "subject": "Weekly Update",
                    "html": "<p>Hello!</p>",
                },
            )

        assert response.status_code == 202
        payload = response.json()
        assert payload["data"]["sent_count"] == 0
        assert payload["data"]["email_ids"] == []


# ---------------------------------------------------------------------------
# Subscribers
# ---------------------------------------------------------------------------


class TestAddSubscriber:
    async def test_successful_add_returns_201(
        self,
        client: AsyncClient,
    ) -> None:
        row = {
            "id": "sub-abc",
            "email": "user@test.com",
            "name": "Test User",
            "tags": [],
            "status": "active",
            "subscribed_at": "2026-02-27T00:00:00+00:00",
        }
        mock_sb = MagicMock()
        mock_sb.table.return_value.upsert.return_value.execute.return_value = MagicMock(
            data=[row]
        )

        with patch("app.routers.marketing._supabase_client", return_value=mock_sb):
            response = await client.post(
                "/orchestrate/marketing/subscribers?workspace_id=ws-1",
                json={"email": "user@test.com", "name": "Test User"},
            )

        assert response.status_code == 201
        payload = response.json()
        assert payload["data"]["email"] == "user@test.com"
        assert payload["data"]["status"] == "active"

    async def test_missing_email_returns_422(
        self,
        client: AsyncClient,
    ) -> None:
        with patch("app.routers.marketing._supabase_client"):
            response = await client.post(
                "/orchestrate/marketing/subscribers?workspace_id=ws-1",
                json={"name": "No Email"},
            )
        assert response.status_code == 422


class TestUnsubscribe:
    async def test_successful_unsubscribe(
        self,
        client: AsyncClient,
    ) -> None:
        mock_sb = MagicMock()
        chain = MagicMock()
        chain.execute.return_value = MagicMock(data=[{"email": "bye@test.com"}])
        for method in ("update", "eq"):
            getattr(chain, method).return_value = chain
        mock_sb.table.return_value = chain

        with patch("app.routers.marketing._supabase_client", return_value=mock_sb):
            response = await client.delete(
                "/orchestrate/marketing/subscribers/bye%40test.com?workspace_id=ws-1",
            )

        assert response.status_code == 200
        assert response.json()["data"]["unsubscribed"] is True


# ---------------------------------------------------------------------------
# Schedules
# ---------------------------------------------------------------------------


class TestCreateSchedule:
    async def test_successful_create_returns_201(
        self,
        client: AsyncClient,
    ) -> None:
        row = {
            "id": "sched-001",
            "workspace_id": "ws-1",
            "pipeline_id": None,
            "channel": "newsletter",
            "title": "Weekly Report",
            "content": {},
            "status": "pending",
            "scheduled_at": "2026-03-01T09:00:00+00:00",
            "recurrence": "none",
            "tags": [],
            "created_at": "2026-02-27T00:00:00+00:00",
        }
        mock_sb = MagicMock()
        mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[row]
        )

        with patch("app.routers.marketing._supabase_client", return_value=mock_sb):
            response = await client.post(
                "/orchestrate/marketing/schedules",
                json={
                    "workspace_id": "ws-1",
                    "channel": "newsletter",
                    "title": "Weekly Report",
                    "scheduled_at": "2026-03-01T09:00:00+00:00",
                },
            )

        assert response.status_code == 201
        payload = response.json()
        assert payload["data"]["channel"] == "newsletter"
        assert payload["data"]["status"] == "pending"

    async def test_invalid_channel_returns_422(
        self,
        client: AsyncClient,
    ) -> None:
        with patch("app.routers.marketing._supabase_client"):
            response = await client.post(
                "/orchestrate/marketing/schedules",
                json={
                    "workspace_id": "ws-1",
                    "channel": "fax",  # unsupported channel
                    "title": "Test",
                    "scheduled_at": "2026-03-01T09:00:00+00:00",
                },
            )
        assert response.status_code == 422


class TestListSchedules:
    async def test_returns_paginated_response(
        self,
        client: AsyncClient,
    ) -> None:
        mock_sb = MagicMock()
        chain = MagicMock()
        chain.execute.return_value = MagicMock(data=[], count=0)
        for method in ("select", "eq", "is_", "order", "range", "limit"):
            getattr(chain, method).return_value = chain
        mock_sb.table.return_value = chain

        with patch("app.routers.marketing._supabase_client", return_value=mock_sb):
            response = await client.get(
                "/orchestrate/marketing/schedules?workspace_id=ws-1",
            )

        assert response.status_code == 200
        payload = response.json()
        assert "data" in payload
        assert payload["total"] == 0
