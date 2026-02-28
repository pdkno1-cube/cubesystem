"""Multi-provider LLM client for agent invocation.

Supports Anthropic (Messages API), OpenAI (Chat Completions API),
and Google Gemini (Generative AI API).
Clients are lazily initialised -- only created when the corresponding
API key is configured.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from fastapi import HTTPException, status

from app.config import Settings

if TYPE_CHECKING:
    from anthropic import AsyncAnthropic
    from google.generativeai import GenerativeModel
    from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Token pricing per 1 M tokens (input / output)
# ---------------------------------------------------------------------------
_MODEL_PRICING: dict[str, tuple[float, float]] = {
    # Anthropic
    "claude-sonnet-4-20250514": (3.00, 15.00),
    "claude-opus-4-20250514": (15.00, 75.00),
    "claude-haiku-3-20250310": (0.25, 1.25),
    # OpenAI
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4-turbo": (10.00, 30.00),
    "gpt-3.5-turbo": (0.50, 1.50),
    # Google Gemini
    "gemini-2.5-pro": (1.25, 10.00),
    "gemini-2.5-flash": (0.15, 0.60),
    "gemini-2.0-flash": (0.075, 0.30),
    "gemini-2.0-flash-lite": (0.0375, 0.15),
    "gemini-1.5-pro": (1.25, 5.00),
    "gemini-1.5-flash": (0.075, 0.30),
    "gemini-pro": (0.50, 1.50),
}

# Map of short model aliases → full Gemini model names
_GEMINI_MODEL_MAP: dict[str, str] = {
    "gemini-pro": "gemini-2.5-pro",
    "gemini-flash": "gemini-2.5-flash",
    "gemini-flash-lite": "gemini-2.0-flash-lite",
}


@dataclass(frozen=True, slots=True)
class LLMResponse:
    """Standardised response from any LLM provider."""

    content: str
    input_tokens: int
    output_tokens: int
    model: str
    cost: float


@dataclass
class LLMClient:
    """Multi-provider LLM client with lazy initialisation.

    Usage::

        client = LLMClient(settings)
        response = await client.invoke(agent_row, messages)
    """

    _settings: Settings
    _anthropic_client: AsyncAnthropic | None = field(default=None, init=False, repr=False)
    _openai_client: AsyncOpenAI | None = field(default=None, init=False, repr=False)
    _google_configured: bool = field(default=False, init=False, repr=False)

    # -- lazy accessors ------------------------------------------------

    def _get_anthropic(self) -> AsyncAnthropic:
        """Return (and lazily create) the Anthropic async client."""
        if self._anthropic_client is not None:
            return self._anthropic_client

        if not self._settings.anthropic_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "LLM_PROVIDER_UNAVAILABLE",
                    "message": "Anthropic API key is not configured",
                },
            )

        from anthropic import AsyncAnthropic  # noqa: WPS433 -- lazy import

        self._anthropic_client = AsyncAnthropic(api_key=self._settings.anthropic_api_key)
        logger.info("Anthropic client initialised")
        return self._anthropic_client

    def _get_openai(self) -> AsyncOpenAI:
        """Return (and lazily create) the OpenAI async client."""
        if self._openai_client is not None:
            return self._openai_client

        if not self._settings.openai_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "LLM_PROVIDER_UNAVAILABLE",
                    "message": "OpenAI API key is not configured",
                },
            )

        from openai import AsyncOpenAI  # noqa: WPS433 -- lazy import

        self._openai_client = AsyncOpenAI(api_key=self._settings.openai_api_key)
        logger.info("OpenAI client initialised")
        return self._openai_client

    def _get_google_model(self, model: str) -> GenerativeModel:
        """Return a Google Generative AI model, configuring the SDK if needed."""
        if not self._google_configured:
            if not self._settings.google_gemini_api_key:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={
                        "code": "LLM_PROVIDER_UNAVAILABLE",
                        "message": "Google Gemini API key is not configured",
                    },
                )

            import google.generativeai as genai  # noqa: WPS433 -- lazy import

            genai.configure(api_key=self._settings.google_gemini_api_key)
            object.__setattr__(self, "_google_configured", True)
            logger.info("Google Gemini SDK configured")

        from google.generativeai import GenerativeModel  # noqa: WPS433

        resolved_model = _GEMINI_MODEL_MAP.get(model, model)
        return GenerativeModel(resolved_model)

    # -- public API ----------------------------------------------------

    async def invoke(
        self,
        agent_row: dict[str, object],
        messages: list[dict[str, str]],
    ) -> LLMResponse:
        """Invoke an LLM provider based on the agent's configuration.

        Args:
            agent_row: Agent record from Supabase containing at least
                ``model_provider``, ``model``, ``system_prompt``, and
                ``parameters`` (dict with temperature / max_tokens / top_p).
            messages: List of ``{"role": ..., "content": ...}`` dicts.

        Returns:
            An ``LLMResponse`` with content, token counts, model, and cost.
        """
        provider = str(agent_row.get("model_provider", ""))
        model = str(agent_row.get("model", ""))
        system_prompt = str(agent_row.get("system_prompt", ""))
        params: dict[str, object] = dict(agent_row.get("parameters", {}) or {})  # type: ignore[arg-type]

        temperature = float(params.get("temperature", 0.7))
        max_tokens = int(params.get("max_tokens", 4096))
        top_p = float(params.get("top_p", 1.0))

        if provider == "anthropic":
            return await self._invoke_anthropic(
                model=model,
                system_prompt=system_prompt,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
            )
        if provider == "openai":
            return await self._invoke_openai(
                model=model,
                system_prompt=system_prompt,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
            )
        if provider == "google":
            return await self._invoke_google(
                model=model,
                system_prompt=system_prompt,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
            )

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "UNSUPPORTED_PROVIDER",
                "message": f"Model provider '{provider}' is not supported. "
                "Use 'anthropic', 'openai', or 'google'.",
            },
        )

    # -- private provider calls ----------------------------------------

    async def _invoke_anthropic(
        self,
        *,
        model: str,
        system_prompt: str,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
        top_p: float,
    ) -> LLMResponse:
        """Call Anthropic Messages API."""
        client = self._get_anthropic()

        try:
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                system=system_prompt,
                messages=messages,  # type: ignore[arg-type]
            )
        except Exception as exc:
            logger.error("Anthropic API call failed: %s", exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "code": "LLM_INVOCATION_FAILED",
                    "message": f"Anthropic API error: {exc}",
                },
            ) from exc

        content = ""
        for block in response.content:
            if block.type == "text":
                content += block.text

        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        cost = self._calculate_cost(model, input_tokens, output_tokens)

        return LLMResponse(
            content=content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=model,
            cost=cost,
        )

    async def _invoke_openai(
        self,
        *,
        model: str,
        system_prompt: str,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
        top_p: float,
    ) -> LLMResponse:
        """Call OpenAI Chat Completions API."""
        client = self._get_openai()

        full_messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt},
            *messages,
        ]

        try:
            response = await client.chat.completions.create(
                model=model,
                messages=full_messages,  # type: ignore[arg-type]
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
            )
        except Exception as exc:
            logger.error("OpenAI API call failed: %s", exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "code": "LLM_INVOCATION_FAILED",
                    "message": f"OpenAI API error: {exc}",
                },
            ) from exc

        choice = response.choices[0]
        content = choice.message.content or ""
        usage = response.usage

        input_tokens = usage.prompt_tokens if usage else 0
        output_tokens = usage.completion_tokens if usage else 0
        cost = self._calculate_cost(model, input_tokens, output_tokens)

        return LLMResponse(
            content=content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=model,
            cost=cost,
        )

    async def _invoke_google(
        self,
        *,
        model: str,
        system_prompt: str,
        messages: list[dict[str, str]],
        temperature: float,
        max_tokens: int,
        top_p: float,
    ) -> LLMResponse:
        """Call Google Gemini Generative AI API."""
        from google.generativeai.types import GenerationConfig  # noqa: WPS433

        gemini_model = self._get_google_model(model)

        # Convert OpenAI-style messages → Gemini contents format
        contents: list[dict[str, str]] = []
        for msg in messages:
            role = msg.get("role", "user")
            gemini_role = "model" if role == "assistant" else "user"
            contents.append({"role": gemini_role, "parts": msg.get("content", "")})

        generation_config = GenerationConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            top_p=top_p,
        )

        try:
            response = await gemini_model.generate_content_async(
                contents,
                generation_config=generation_config,
                system_instruction=system_prompt if system_prompt else None,
            )
        except Exception as exc:
            logger.error("Google Gemini API call failed: %s", exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "code": "LLM_INVOCATION_FAILED",
                    "message": f"Google Gemini API error: {exc}",
                },
            ) from exc

        content = response.text or ""

        # Extract token usage from usage_metadata
        usage_meta = getattr(response, "usage_metadata", None)
        input_tokens = getattr(usage_meta, "prompt_token_count", 0) if usage_meta else 0
        output_tokens = getattr(usage_meta, "candidates_token_count", 0) if usage_meta else 0

        resolved_model = _GEMINI_MODEL_MAP.get(model, model)
        cost = self._calculate_cost(resolved_model, input_tokens, output_tokens)

        return LLMResponse(
            content=content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=model,
            cost=cost,
        )

    # -- cost calculation ----------------------------------------------

    @staticmethod
    def _calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
        """Calculate the USD cost for a given model invocation.

        Pricing is per 1 M tokens. Unknown models default to zero cost
        (logged as warning).
        """
        pricing = _MODEL_PRICING.get(model)
        if pricing is None:
            logger.warning("No pricing data for model '%s'; cost reported as 0.0", model)
            return 0.0

        input_price_per_m, output_price_per_m = pricing
        cost = (input_tokens * input_price_per_m + output_tokens * output_price_per_m) / 1_000_000
        return round(cost, 6)
