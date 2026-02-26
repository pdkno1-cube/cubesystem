"""Billing module — credit management and cost calculation.

Provides:
  - CreditService: credit balance queries, deductions, and charges
  - CostCalculator: LLM token cost and pipeline cost computation
  - InsufficientCreditsError: raised when balance < required amount
"""

from .cost_calculator import CostCalculator, TokenUsage
from .credits import CreditService, CreditTransaction, InsufficientCreditsError

__all__ = [
    "CostCalculator",
    "CreditService",
    "CreditTransaction",
    "InsufficientCreditsError",
    "TokenUsage",
]
