"""Credit service — balance queries, deductions, and charges.

Operates on the ``credits`` ledger table (INSERT-only by design).
Each row stores:
  - transaction_type: 'usage' | 'charge' | 'refund' | 'allocation' | 'adjustment' | 'bonus'
  - amount: signed DECIMAL(18,6) — negative for usage, positive for charge/refund
  - balance_after: running balance DECIMAL(18,6) computed at insert time

Audit trail entries are written to ``audit_logs`` for every mutation.

Table DDL: supabase/migrations/20260226000006_create_credits_and_audit.sql
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from supabase._async.client import AsyncClient as SupabaseAsyncClient

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class InsufficientCreditsError(Exception):
    """Raised when a workspace's credit balance is below the required amount."""

    def __init__(self, balance: float, required: float) -> None:
        self.balance = balance
        self.required = required
        super().__init__(
            f"Insufficient credits: balance={balance}, required={required}"
        )


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CreditTransaction:
    """Immutable record of a single credit ledger entry."""

    id: str
    workspace_id: str
    transaction_type: str  # 'charge' | 'usage' | 'refund' | …
    amount: float
    balance_after: float
    description: str
    reference_id: str | None
    reference_type: str | None


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class CreditService:
    """Credit balance management backed by Supabase ``credits`` table.

    Uses the Supabase Python async client (service-role key) for all queries.
    """

    def __init__(self, supabase: SupabaseAsyncClient) -> None:
        self._sb = supabase

    # -- Queries ---------------------------------------------------------------

    async def get_balance(self, workspace_id: str) -> float:
        """Return the current credit balance for *workspace_id*.

        Strategy: fetch the most recent ``balance_after`` value (the ledger is
        append-only so the latest row always has the authoritative balance).
        Falls back to 0.0 if no rows exist.
        """
        result = (
            await self._sb.table("credits")
            .select("balance_after")
            .eq("workspace_id", workspace_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if result.data:
            return float(result.data[0]["balance_after"])
        return 0.0

    # -- Mutations -------------------------------------------------------------

    async def deduct(
        self,
        workspace_id: str,
        amount: float,
        description: str,
        *,
        reference_id: str | None = None,
        reference_type: str | None = None,
        agent_id: str | None = None,
        user_id: str | None = None,
    ) -> CreditTransaction:
        """Deduct *amount* credits from *workspace_id*.

        Raises:
            InsufficientCreditsError: if current balance < amount.
        """
        balance = await self.get_balance(workspace_id)
        if balance < amount:
            raise InsufficientCreditsError(balance=balance, required=amount)

        new_balance = round(balance - amount, 6)

        # INSERT ledger row (negative amount for usage)
        insert_payload: dict[str, object] = {
            "workspace_id": workspace_id,
            "transaction_type": "usage",
            "amount": round(-amount, 6),
            "balance_after": new_balance,
            "description": description,
            "reference_id": reference_id,
            "reference_type": reference_type,
        }
        if agent_id is not None:
            insert_payload["agent_id"] = agent_id
        if user_id is not None:
            insert_payload["created_by"] = user_id

        result = (
            await self._sb.table("credits")
            .insert(insert_payload)
            .execute()
        )

        # Audit trail
        await self._sb.table("audit_logs").insert({
            "workspace_id": workspace_id,
            "user_id": user_id,
            "agent_id": agent_id,
            "action": "credits.deducted",
            "category": "billing",
            "resource_type": "credits",
            "severity": "info",
            "details": {
                "amount": amount,
                "balance_after": new_balance,
                "description": description,
                "reference_id": reference_id,
                "reference_type": reference_type,
            },
        }).execute()

        logger.info(
            "Credits deducted: workspace=%s amount=%.6f balance_after=%.6f",
            workspace_id,
            amount,
            new_balance,
        )

        tx_data: dict[str, object] = result.data[0] if result.data else {}
        return CreditTransaction(
            id=str(tx_data.get("id", "")),
            workspace_id=workspace_id,
            transaction_type="usage",
            amount=round(-amount, 6),
            balance_after=new_balance,
            description=description,
            reference_id=reference_id,
            reference_type=reference_type,
        )

    async def charge(
        self,
        workspace_id: str,
        amount: float,
        description: str,
        *,
        user_id: str | None = None,
    ) -> CreditTransaction:
        """Add *amount* credits to *workspace_id* (top-up / purchase)."""
        balance = await self.get_balance(workspace_id)
        new_balance = round(balance + amount, 6)

        insert_payload: dict[str, object] = {
            "workspace_id": workspace_id,
            "transaction_type": "charge",
            "amount": round(amount, 6),
            "balance_after": new_balance,
            "description": description,
        }
        if user_id is not None:
            insert_payload["created_by"] = user_id

        result = (
            await self._sb.table("credits")
            .insert(insert_payload)
            .execute()
        )

        # Audit trail
        await self._sb.table("audit_logs").insert({
            "workspace_id": workspace_id,
            "user_id": user_id,
            "action": "credits.charged",
            "category": "billing",
            "resource_type": "credits",
            "severity": "info",
            "details": {
                "amount": amount,
                "balance_after": new_balance,
                "description": description,
            },
        }).execute()

        logger.info(
            "Credits charged: workspace=%s amount=%.6f balance_after=%.6f",
            workspace_id,
            amount,
            new_balance,
        )

        tx_data: dict[str, object] = result.data[0] if result.data else {}
        return CreditTransaction(
            id=str(tx_data.get("id", "")),
            workspace_id=workspace_id,
            transaction_type="charge",
            amount=round(amount, 6),
            balance_after=new_balance,
            description=description,
            reference_id=None,
            reference_type=None,
        )

    async def refund(
        self,
        workspace_id: str,
        amount: float,
        description: str,
        *,
        reference_id: str | None = None,
        reference_type: str | None = None,
        user_id: str | None = None,
    ) -> CreditTransaction:
        """Refund *amount* credits back to *workspace_id*."""
        balance = await self.get_balance(workspace_id)
        new_balance = round(balance + amount, 6)

        insert_payload: dict[str, object] = {
            "workspace_id": workspace_id,
            "transaction_type": "refund",
            "amount": round(amount, 6),
            "balance_after": new_balance,
            "description": description,
            "reference_id": reference_id,
            "reference_type": reference_type,
        }
        if user_id is not None:
            insert_payload["created_by"] = user_id

        result = (
            await self._sb.table("credits")
            .insert(insert_payload)
            .execute()
        )

        # Audit trail
        await self._sb.table("audit_logs").insert({
            "workspace_id": workspace_id,
            "user_id": user_id,
            "action": "credits.refunded",
            "category": "billing",
            "resource_type": "credits",
            "severity": "info",
            "details": {
                "amount": amount,
                "balance_after": new_balance,
                "description": description,
                "reference_id": reference_id,
                "reference_type": reference_type,
            },
        }).execute()

        logger.info(
            "Credits refunded: workspace=%s amount=%.6f balance_after=%.6f",
            workspace_id,
            amount,
            new_balance,
        )

        tx_data: dict[str, object] = result.data[0] if result.data else {}
        return CreditTransaction(
            id=str(tx_data.get("id", "")),
            workspace_id=workspace_id,
            transaction_type="refund",
            amount=round(amount, 6),
            balance_after=new_balance,
            description=description,
            reference_id=reference_id,
            reference_type=reference_type,
        )
