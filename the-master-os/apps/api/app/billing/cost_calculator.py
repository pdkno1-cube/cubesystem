"""Cost calculator for LLM token usage and agent execution.

Computes costs at three granularities:
  1. Per-LLM-call (model + input/output tokens)
  2. Per-agent-step (agent base cost + LLM cost)
  3. Per-pipeline (sum of all step costs)

All monetary values are in USD and rounded to 6 decimal places.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class TokenUsage:
    """Token counts for a single LLM invocation."""

    input_tokens: int
    output_tokens: int


# ---------------------------------------------------------------------------
# Model pricing — USD per 1 million tokens
# Source: provider pricing pages (snapshot 2025-05)
# ---------------------------------------------------------------------------
MODEL_PRICING: dict[str, dict[str, float]] = {
    # Anthropic
    "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
    "claude-opus-4-20250514": {"input": 15.0, "output": 75.0},
    "claude-haiku-4-5-20251001": {"input": 0.8, "output": 4.0},
    # OpenAI
    "gpt-4o": {"input": 2.5, "output": 10.0},
    "gpt-4o-mini": {"input": 0.15, "output": 0.6},
}


class CostCalculator:
    """Stateless calculator for agent and pipeline execution costs."""

    def calculate_llm_cost(self, model: str, usage: TokenUsage) -> float:
        """Compute LLM cost in USD from token usage.

        Args:
            model: Model identifier (must exist in MODEL_PRICING).
            usage: Input/output token counts.

        Returns:
            Cost in USD rounded to 6 decimals.  Returns 0.0 for unknown models.
        """
        pricing = MODEL_PRICING.get(model)
        if not pricing:
            logger.warning("Unknown model '%s' — returning zero cost", model)
            return 0.0

        input_cost = (usage.input_tokens / 1_000_000) * pricing["input"]
        output_cost = (usage.output_tokens / 1_000_000) * pricing["output"]
        return round(input_cost + output_cost, 6)

    def calculate_total_cost(
        self, agent_cost_per_run: float, llm_cost: float
    ) -> float:
        """Compute total cost for a single agent step.

        Args:
            agent_cost_per_run: Base cost defined in the agents table.
            llm_cost: LLM token cost returned by :meth:`calculate_llm_cost`.

        Returns:
            Combined cost rounded to 6 decimals.
        """
        return round(agent_cost_per_run + llm_cost, 6)

    def calculate_pipeline_cost(self, step_costs: list[float]) -> float:
        """Compute total pipeline cost as the sum of all step costs.

        Args:
            step_costs: Individual cost of each completed step.

        Returns:
            Aggregated cost rounded to 6 decimals.
        """
        return round(sum(step_costs), 6)
