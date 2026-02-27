import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { apiError, handleApiError, type ApiErrorBody } from "@/lib/api-response";

const RECENT_TRANSACTION_LIMIT = 50;
const DAILY_USAGE_DAYS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreditTransaction {
  id: string;
  workspace_id: string;
  workspace_name: string;
  agent_id: string | null;
  agent_name: string | null;
  reference_type: string | null;
  reference_id: string | null;
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
  month_used: number;
  daily_average: number;
  estimated_depletion_days: number | null;
  currency: "credits";
}

interface WorkspaceUsage {
  workspace_id: string;
  workspace_name: string;
  used_credits: number;
}

interface DailyUsage {
  date: string;
  usage: number;
}

interface AgentUsage {
  agent_id: string;
  agent_name: string;
  total_used: number;
  last_run_at: string;
}

interface CreditLimitInfo {
  workspace_id: string;
  workspace_name: string;
  monthly_limit: number;
  auto_stop: boolean;
  month_used: number;
  usage_ratio: number;
}

interface CreditsResponse {
  overview: CreditOverview;
  recent_transactions: CreditTransaction[];
  workspace_usage: WorkspaceUsage[];
  daily_usage: DailyUsage[];
  agent_usage_top10: AgentUsage[];
  credit_limits: CreditLimitInfo[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function getDaysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function toDateKey(isoStr: string): string {
  return isoStr.slice(0, 10);
}

// ---------------------------------------------------------------------------
// GET /api/credits
// ---------------------------------------------------------------------------

export async function GET(): Promise<
  NextResponse<CreditsResponse | ApiErrorBody>
> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "인증이 필요합니다.", 401);
    }

    // Fetch all credits for overview calculation
    const { data: allCredits, error: creditsError } = await supabase
      .from("credits")
      .select(
        "id, workspace_id, agent_id, transaction_type, amount, balance_after, description, reference_type, reference_id, created_at",
      )
      .order("created_at", { ascending: false });

    if (creditsError) {
      return apiError(
        "DB_ERROR",
        `크레딧 조회 실패: ${creditsError.message}`,
        500,
      );
    }

    const records = allCredits ?? [];

    // ----- Overview: aggregate by transaction_type -----
    const monthStart = getMonthStart();
    let totalCharged = 0;
    let totalUsed = 0;
    let monthUsed = 0;

    for (const record of records) {
      const type = record.transaction_type as string;
      const amount = Math.abs(record.amount as number);

      if (type === "charge" || type === "bonus") {
        totalCharged += amount;
      } else if (type === "usage") {
        totalUsed += amount;
        if ((record.created_at as string) >= monthStart) {
          monthUsed += amount;
        }
      } else if (type === "refund") {
        totalCharged += amount;
      }
    }

    const totalBalance = totalCharged - totalUsed;

    // ----- Daily usage (last 30 days) -----
    const thirtyDaysAgo = getDaysAgoISO(DAILY_USAGE_DAYS);
    const dailyMap = new Map<string, number>();

    // Prefill all 30 days with 0
    for (let i = DAILY_USAGE_DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dailyMap.set(toDateKey(d.toISOString()), 0);
    }

    for (const record of records) {
      if (
        (record.transaction_type as string) === "usage" &&
        (record.created_at as string) >= thirtyDaysAgo
      ) {
        const key = toDateKey(record.created_at as string);
        const prev = dailyMap.get(key) ?? 0;
        dailyMap.set(key, prev + Math.abs(record.amount as number));
      }
    }

    const dailyUsage: DailyUsage[] = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, usage]) => ({ date, usage: Math.round(usage * 100) / 100 }));

    // Daily average & estimated depletion
    const usageDays = dailyUsage.filter((d) => d.usage > 0);
    const dailyAverage =
      usageDays.length > 0
        ? usageDays.reduce((sum, d) => sum + d.usage, 0) / usageDays.length
        : 0;

    const estimatedDepletionDays =
      dailyAverage > 0 ? Math.ceil(totalBalance / dailyAverage) : null;

    const overview: CreditOverview = {
      total_balance: Math.round(totalBalance * 100) / 100,
      total_charged: Math.round(totalCharged * 100) / 100,
      total_used: Math.round(totalUsed * 100) / 100,
      month_used: Math.round(monthUsed * 100) / 100,
      daily_average: Math.round(dailyAverage * 100) / 100,
      estimated_depletion_days: estimatedDepletionDays,
      currency: "credits",
    };

    // ----- Workspace name map -----
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

    // ----- Agent name map -----
    const agentIds = [
      ...new Set(
        records
          .map((r) => r.agent_id as string | null)
          .filter((id): id is string => id !== null),
      ),
    ];

    const agentNameMap = new Map<string, string>();
    if (agentIds.length > 0) {
      const { data: agents } = await supabase
        .from("agents")
        .select("id, display_name")
        .in("id", agentIds);
      for (const ag of agents ?? []) {
        agentNameMap.set(ag.id as string, ag.display_name as string);
      }
    }

    // ----- Recent transactions -----
    const recentRecords = records.slice(0, RECENT_TRANSACTION_LIMIT);
    const recentTransactions: CreditTransaction[] = recentRecords.map(
      (r) => ({
        id: r.id as string,
        workspace_id: r.workspace_id as string,
        workspace_name:
          workspaceNameMap.get(r.workspace_id as string) ?? "Unknown",
        agent_id: (r.agent_id as string | null) ?? null,
        agent_name: r.agent_id
          ? (agentNameMap.get(r.agent_id as string) ?? null)
          : null,
        reference_type: (r.reference_type as string | null) ?? null,
        reference_id: (r.reference_id as string | null) ?? null,
        transaction_type:
          r.transaction_type as CreditTransaction["transaction_type"],
        amount: r.amount as number,
        balance_after: r.balance_after as number,
        description: (r.description as string) ?? "",
        created_at: r.created_at as string,
      }),
    );

    // ----- Workspace usage -----
    const wsUsageMap = new Map<string, number>();
    for (const record of records) {
      if ((record.transaction_type as string) === "usage") {
        const wsId = record.workspace_id as string;
        const current = wsUsageMap.get(wsId) ?? 0;
        wsUsageMap.set(wsId, current + Math.abs(record.amount as number));
      }
    }

    const workspaceUsage: WorkspaceUsage[] = [...wsUsageMap.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([wsId, used]) => ({
        workspace_id: wsId,
        workspace_name: workspaceNameMap.get(wsId) ?? "Unknown",
        used_credits: Math.round(used * 100) / 100,
      }));

    // ----- Agent usage top 10 -----
    const agentUsageMap = new Map<string, { total: number; lastRun: string }>();
    for (const record of records) {
      if (
        (record.transaction_type as string) === "usage" &&
        record.agent_id
      ) {
        const aid = record.agent_id as string;
        const existing = agentUsageMap.get(aid);
        if (existing) {
          existing.total += Math.abs(record.amount as number);
          if ((record.created_at as string) > existing.lastRun) {
            existing.lastRun = record.created_at as string;
          }
        } else {
          agentUsageMap.set(aid, {
            total: Math.abs(record.amount as number),
            lastRun: record.created_at as string,
          });
        }
      }
    }

    const agentUsageTop10: AgentUsage[] = [...agentUsageMap.entries()]
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 10)
      .map(([aid, info]) => ({
        agent_id: aid,
        agent_name: agentNameMap.get(aid) ?? "Unknown Agent",
        total_used: Math.round(info.total * 100) / 100,
        last_run_at: info.lastRun,
      }));

    // ----- Credit limits -----
    const { data: limitsData } = await supabase
      .from("credit_limits")
      .select("workspace_id, monthly_limit, auto_stop");

    // Per-workspace month usage
    const wsMonthUsageMap = new Map<string, number>();
    for (const record of records) {
      if (
        (record.transaction_type as string) === "usage" &&
        (record.created_at as string) >= monthStart
      ) {
        const wsId = record.workspace_id as string;
        const prev = wsMonthUsageMap.get(wsId) ?? 0;
        wsMonthUsageMap.set(wsId, prev + Math.abs(record.amount as number));
      }
    }

    const creditLimits: CreditLimitInfo[] = (limitsData ?? []).map((lim) => {
      const wsId = lim.workspace_id as string;
      const limit = Number(lim.monthly_limit) || 0;
      const used = wsMonthUsageMap.get(wsId) ?? 0;
      return {
        workspace_id: wsId,
        workspace_name: workspaceNameMap.get(wsId) ?? "Unknown",
        monthly_limit: limit,
        auto_stop: lim.auto_stop as boolean,
        month_used: Math.round(used * 100) / 100,
        usage_ratio: limit > 0 ? Math.round((used / limit) * 10000) / 100 : 0,
      };
    });

    // Also include workspaces that have usage but no limit set
    for (const wsId of workspaceIds) {
      const hasLimit = creditLimits.some((l) => l.workspace_id === wsId);
      if (!hasLimit) {
        const used = wsMonthUsageMap.get(wsId) ?? 0;
        creditLimits.push({
          workspace_id: wsId,
          workspace_name: workspaceNameMap.get(wsId) ?? "Unknown",
          monthly_limit: 0,
          auto_stop: false,
          month_used: Math.round(used * 100) / 100,
          usage_ratio: 0,
        });
      }
    }

    return NextResponse.json({
      overview,
      recent_transactions: recentTransactions,
      workspace_usage: workspaceUsage,
      daily_usage: dailyUsage,
      agent_usage_top10: agentUsageTop10,
      credit_limits: creditLimits,
    });
  } catch (error) {
    return handleApiError(error, "credits.GET");
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/credits — Update credit limit for a workspace
// ---------------------------------------------------------------------------

interface PatchBody {
  workspace_id: string;
  monthly_limit: number;
  auto_stop: boolean;
}

interface CreditLimitResult {
  workspace_id: string;
  monthly_limit: number;
  auto_stop: boolean;
}

export async function PATCH(
  request: NextRequest,
): Promise<NextResponse<{ data: CreditLimitResult } | ApiErrorBody>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "인증이 필요합니다.", 401);
    }

    const body = (await request.json()) as PatchBody;

    if (!body.workspace_id || typeof body.monthly_limit !== "number") {
      return apiError(
        "VALIDATION_ERROR",
        "workspace_id와 monthly_limit(숫자)가 필요합니다.",
        400,
      );
    }

    if (body.monthly_limit < 0) {
      return apiError(
        "VALIDATION_ERROR",
        "monthly_limit는 0 이상이어야 합니다.",
        400,
      );
    }

    const { data, error } = await supabase
      .from("credit_limits")
      .upsert(
        {
          workspace_id: body.workspace_id,
          monthly_limit: body.monthly_limit,
          auto_stop: body.auto_stop ?? false,
          created_by: user.id,
        },
        { onConflict: "workspace_id" },
      )
      .select("workspace_id, monthly_limit, auto_stop")
      .single();

    if (error) {
      Sentry.captureException(error, { tags: { context: "credits.PATCH" } });
      return apiError("DB_ERROR", `크레딧 한도 저장 실패: ${error.message}`, 500);
    }

    return NextResponse.json({
      data: {
        workspace_id: data.workspace_id as string,
        monthly_limit: Number(data.monthly_limit),
        auto_stop: data.auto_stop as boolean,
      },
    });
  } catch (error) {
    return handleApiError(error, "credits.PATCH");
  }
}
