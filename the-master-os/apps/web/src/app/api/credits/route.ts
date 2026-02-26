import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface CreditTransaction {
  id: string;
  workspace_id: string;
  workspace_name: string;
  transaction_type: "charge" | "usage" | "refund" | "bonus" | "adjustment";
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

interface CreditOverview {
  total_balance: number;
  total_charged: number;
  total_used: number;
  currency: "credits";
}

interface WorkspaceUsage {
  workspace_id: string;
  workspace_name: string;
  used_credits: number;
}

interface CreditsResponse {
  overview: CreditOverview;
  recent_transactions: CreditTransaction[];
  workspace_usage: WorkspaceUsage[];
}

interface CreditsErrorResponse {
  error: { code: string; message: string };
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(): Promise<
  NextResponse<CreditsResponse | CreditsErrorResponse>
> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return errorResponse("UNAUTHORIZED", "인증이 필요합니다.", 401);
    }

    // Fetch all credits for overview calculation
    const { data: allCredits, error: creditsError } = await supabase
      .from("credits")
      .select("id, workspace_id, transaction_type, amount, balance_after, description, created_at")
      .order("created_at", { ascending: false });

    if (creditsError) {
      return errorResponse(
        "DB_ERROR",
        `크레딧 조회 실패: ${creditsError.message}`,
        500,
      );
    }

    const records = allCredits ?? [];

    // Overview: aggregate by transaction_type
    let totalCharged = 0;
    let totalUsed = 0;

    for (const record of records) {
      const type = record.transaction_type as string;
      const amount = Math.abs(record.amount as number);

      if (type === "charge" || type === "bonus") {
        totalCharged += amount;
      } else if (type === "usage") {
        totalUsed += amount;
      } else if (type === "refund") {
        totalCharged += amount; // refunds add back
      }
    }

    const totalBalance = totalCharged - totalUsed;

    const overview: CreditOverview = {
      total_balance: totalBalance,
      total_charged: totalCharged,
      total_used: totalUsed,
      currency: "credits",
    };

    // Recent transactions (top 20) — need workspace names
    const recentRecords = records.slice(0, 20);

    const workspaceIds = [
      ...new Set(
        records
          .map((r) => r.workspace_id as string | null)
          .filter((id): id is string => id !== null),
      ),
    ];

    const workspaceNameMap = new Map<string, string>();
    if (workspaceIds.length > 0) {
      const { data: workspaces } = await supabase
        .from("workspaces")
        .select("id, name")
        .in("id", workspaceIds);
      for (const ws of workspaces ?? []) {
        workspaceNameMap.set(ws.id as string, ws.name as string);
      }
    }

    const recentTransactions: CreditTransaction[] = recentRecords.map(
      (r) => ({
        id: r.id as string,
        workspace_id: r.workspace_id as string,
        workspace_name:
          workspaceNameMap.get(r.workspace_id as string) ?? "Unknown",
        transaction_type:
          r.transaction_type as CreditTransaction["transaction_type"],
        amount: r.amount as number,
        balance_after: r.balance_after as number,
        description: (r.description as string) ?? "",
        created_at: r.created_at as string,
      }),
    );

    // Workspace usage: aggregate usage by workspace_id
    const usageMap = new Map<string, number>();
    for (const record of records) {
      if ((record.transaction_type as string) === "usage") {
        const wsId = record.workspace_id as string;
        const current = usageMap.get(wsId) ?? 0;
        usageMap.set(wsId, current + Math.abs(record.amount as number));
      }
    }

    const workspaceUsage: WorkspaceUsage[] = [...usageMap.entries()].map(
      ([wsId, used]) => ({
        workspace_id: wsId,
        workspace_name: workspaceNameMap.get(wsId) ?? "Unknown",
        used_credits: used,
      }),
    );

    return NextResponse.json({
      overview,
      recent_transactions: recentTransactions,
      workspace_usage: workspaceUsage,
    });
  } catch {
    return errorResponse("INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.", 500);
  }
}
