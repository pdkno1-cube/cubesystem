"""Unit tests for ContentScheduler._dispatch_newsletter."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.scheduler import ContentScheduler


# ---------------------------------------------------------------------------
# Fixtures — scheduler needs sync .table()/.select() chain, async .execute()
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_settings() -> MagicMock:
    return MagicMock()


@pytest.fixture
def mock_mcp() -> AsyncMock:
    registry = AsyncMock()
    registry.execute_tool.return_value = {
        "sent_count": 2,
        "data": [{"id": "e1"}, {"id": "e2"}],
    }
    return registry


@pytest.fixture
def mock_supabase_sched() -> MagicMock:
    """Supabase mock suitable for the scheduler's sync-chain/async-execute pattern.

    The scheduler calls .table().select().eq()...execute() where everything
    except the final await execute() is synchronous.  Using plain MagicMock for
    the client and only making execute() an AsyncMock matches that pattern.
    """
    client = MagicMock()
    query = MagicMock()
    query.execute = AsyncMock(return_value=MagicMock(data=[], count=0))
    for method in (
        "select",
        "eq",
        "is_",
        "lte",
        "gte",
        "contains",
        "order",
        "range",
        "limit",
        "upsert",
        "insert",
        "update",
        "single",
    ):
        getattr(query, method).return_value = query
    client.table.return_value = query
    return client


def _make_scheduler(
    supabase: MagicMock,
    mcp_registry: AsyncMock | None,
    settings: MagicMock,
) -> ContentScheduler:
    return ContentScheduler(
        supabase=supabase,  # type: ignore[arg-type]
        mcp_registry=mcp_registry,  # type: ignore[arg-type]
        settings=settings,  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------------------
# _dispatch_newsletter
# ---------------------------------------------------------------------------


class TestDispatchNewsletter:
    async def test_no_html_or_text_raises_value_error(
        self,
        mock_supabase_sched: MagicMock,
        mock_mcp: AsyncMock,
        mock_settings: MagicMock,
    ) -> None:
        scheduler = _make_scheduler(mock_supabase_sched, mock_mcp, mock_settings)
        with pytest.raises(ValueError, match="no html or text content"):
            await scheduler._dispatch_newsletter(
                workspace_id="ws-1",
                content={"subject": "Test"},  # missing html/text
                schedule_id="sched-1",
            )

    async def test_no_subscribers_skips_send(
        self,
        mock_supabase_sched: MagicMock,
        mock_mcp: AsyncMock,
        mock_settings: MagicMock,
    ) -> None:
        # Default: execute returns data=[] — no active subscribers
        scheduler = _make_scheduler(mock_supabase_sched, mock_mcp, mock_settings)
        await scheduler._dispatch_newsletter(
            workspace_id="ws-1",
            content={"subject": "Test", "html": "<p>Hello</p>"},
            schedule_id="sched-1",
        )
        mock_mcp.execute_tool.assert_not_called()

    async def test_successful_send_single_chunk(
        self,
        mock_supabase_sched: MagicMock,
        mock_mcp: AsyncMock,
        mock_settings: MagicMock,
    ) -> None:
        # Override execute to return 2 active subscribers
        query = mock_supabase_sched.table.return_value
        query.execute.return_value = MagicMock(
            data=[
                {"email": "a@test.com", "name": "Alice"},
                {"email": "b@test.com", "name": "Bob"},
            ]
        )

        scheduler = _make_scheduler(mock_supabase_sched, mock_mcp, mock_settings)
        await scheduler._dispatch_newsletter(
            workspace_id="ws-1",
            content={"subject": "Weekly", "html": "<p>Hello!</p>"},
            schedule_id="sched-2",
        )

        # 2 subscribers → 1 chunk → execute_tool called once
        mock_mcp.execute_tool.assert_called_once()
        call_kwargs = mock_mcp.execute_tool.call_args.kwargs
        assert call_kwargs["action"] == "send_batch"
        assert call_kwargs["mcp_name"] == "resend"
        emails = call_kwargs["params"]["emails"]
        assert len(emails) == 2
        assert emails[0]["to"] == "a@test.com"
        assert emails[1]["to"] == "b@test.com"

    async def test_mcp_registry_none_returns_early(
        self,
        mock_supabase_sched: MagicMock,
        mock_settings: MagicMock,
    ) -> None:
        """When mcp_registry is None, dispatch silently returns without error."""
        scheduler = _make_scheduler(mock_supabase_sched, None, mock_settings)
        # Should NOT raise — just logs a warning and returns
        await scheduler._dispatch_newsletter(
            workspace_id="ws-1",
            content={"subject": "Test", "html": "<p>Hi</p>"},
            schedule_id="sched-3",
        )
