"""Unit tests for Resend Email MCP client."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.mcp.base import MCPExecutionError
from app.mcp.resend import ResendClient


@pytest.fixture
def client() -> ResendClient:
    return ResendClient(api_key="re_test_key_123")


# ---------------------------------------------------------------------------
# Action dispatch
# ---------------------------------------------------------------------------


class TestUnsupportedAction:
    async def test_raises_mcp_execution_error(self, client: ResendClient) -> None:
        with pytest.raises(MCPExecutionError) as exc_info:
            await client.execute("delete", {})
        assert "delete" in str(exc_info.value)
        assert exc_info.value.provider == "resend"


# ---------------------------------------------------------------------------
# send action
# ---------------------------------------------------------------------------


class TestSendAction:
    async def test_missing_to_raises_error(self, client: ResendClient) -> None:
        with pytest.raises(MCPExecutionError, match="to"):
            await client.execute("send", {"subject": "Test", "html": "<p>hi</p>"})

    async def test_missing_subject_raises_error(self, client: ResendClient) -> None:
        with pytest.raises(MCPExecutionError, match="subject"):
            await client.execute("send", {"to": "user@example.com", "html": "<p>hi</p>"})

    async def test_missing_content_raises_error(self, client: ResendClient) -> None:
        with pytest.raises(MCPExecutionError, match="html.*text"):
            await client.execute("send", {"to": "user@example.com", "subject": "Hello"})

    async def test_successful_send(self, client: ResendClient) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"id": "email_123"}

        mock_http = AsyncMock()
        mock_http.__aenter__.return_value = mock_http
        mock_http.__aexit__.return_value = None
        mock_http.post.return_value = mock_response

        with patch("app.mcp.resend.httpx.AsyncClient", return_value=mock_http):
            result = await client.execute(
                "send",
                {
                    "to": "user@example.com",
                    "subject": "Test Newsletter",
                    "html": "<p>Hello!</p>",
                },
            )

        assert result["email_id"] == "email_123"
        assert result["subject"] == "Test Newsletter"
        assert result["provider"] == "resend"

    async def test_to_as_list(self, client: ResendClient) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"id": "email_456"}

        mock_http = AsyncMock()
        mock_http.__aenter__.return_value = mock_http
        mock_http.__aexit__.return_value = None
        mock_http.post.return_value = mock_response

        with patch("app.mcp.resend.httpx.AsyncClient", return_value=mock_http):
            result = await client.execute(
                "send",
                {
                    "to": ["a@example.com", "b@example.com"],
                    "subject": "Batch",
                    "text": "Hello",
                },
            )

        assert isinstance(result["to"], list)
        assert len(result["to"]) == 2  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# send_batch action
# ---------------------------------------------------------------------------


class TestSendBatchAction:
    async def test_missing_emails_raises_error(self, client: ResendClient) -> None:
        with pytest.raises(MCPExecutionError, match="emails"):
            await client.execute("send_batch", {})

    async def test_too_many_emails_raises_error(self, client: ResendClient) -> None:
        emails = [{"to": f"user{i}@test.com"} for i in range(101)]
        with pytest.raises(MCPExecutionError, match="100"):
            await client.execute("send_batch", {"emails": emails})

    async def test_non_dict_email_raises_error(self, client: ResendClient) -> None:
        with pytest.raises(MCPExecutionError, match="dict"):
            await client.execute("send_batch", {"emails": ["not-a-dict"]})

    async def test_successful_batch(self, client: ResendClient) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [{"id": "e1"}, {"id": "e2"}],
        }

        mock_http = AsyncMock()
        mock_http.__aenter__.return_value = mock_http
        mock_http.__aexit__.return_value = None
        mock_http.post.return_value = mock_response

        emails = [
            {"to": "a@test.com", "subject": "Hi", "html": "<p>Hi</p>"},
            {"to": "b@test.com", "subject": "Hi", "html": "<p>Hi</p>"},
        ]

        with patch("app.mcp.resend.httpx.AsyncClient", return_value=mock_http):
            result = await client.execute("send_batch", {"emails": emails})

        assert result["sent_count"] == 2
        assert result["provider"] == "resend"


# ---------------------------------------------------------------------------
# _check_response
# ---------------------------------------------------------------------------


class TestCheckResponse:
    def test_401_raises_auth_error(self, client: ResendClient) -> None:
        resp = MagicMock()
        resp.status_code = 401
        with pytest.raises(MCPExecutionError, match="Authentication"):
            client._check_response(resp, "send")

    def test_429_raises_rate_limit_error(self, client: ResendClient) -> None:
        resp = MagicMock()
        resp.status_code = 429
        with pytest.raises(MCPExecutionError, match="rate limit"):
            client._check_response(resp, "send")

    def test_422_raises_validation_error(self, client: ResendClient) -> None:
        resp = MagicMock()
        resp.status_code = 422
        resp.text = "Validation failed"
        with pytest.raises(MCPExecutionError, match="Validation"):
            client._check_response(resp, "send")

    def test_200_does_not_raise(self, client: ResendClient) -> None:
        resp = MagicMock()
        resp.status_code = 200
        client._check_response(resp, "send")  # Should not raise
