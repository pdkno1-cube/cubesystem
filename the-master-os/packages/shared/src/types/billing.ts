// 크레딧 거래 유형
export type CreditTransactionType =
  | "charge"
  | "usage"
  | "refund"
  | "bonus"
  | "adjustment";

// 크레딧 거래
export interface CreditTransaction {
  id: string;
  workspace_id: string;
  transaction_type: CreditTransactionType;
  amount: number;
  balance_after: number;
  description: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
}

// 크레딧 잔액
export interface CreditBalance {
  workspace_id: string;
  balance: number;
  currency: "credits";
}
