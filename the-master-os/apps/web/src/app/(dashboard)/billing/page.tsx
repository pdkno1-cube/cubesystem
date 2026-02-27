"use client";

import { useEffect, useState, useCallback } from "react";
import * as Sentry from "@sentry/nextjs";
import {
  Wallet,
  CalendarDays,
  TrendingDown,
  Clock,
  Bot,
  Save,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/app/(dashboard)/dashboard/stat-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";

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

interface CreditsData {
  overview: CreditOverview;
  recent_transactions: CreditTransaction[];
  workspace_usage: WorkspaceUsage[];
  daily_usage: DailyUsage[];
  agent_usage_top10: AgentUsage[];
  credit_limits: CreditLimitInfo[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TXN_TYPE_META: Record<string, { label: string; color: string }> = {
  charge: { label: "충전", color: "text-green-600" },
  usage: { label: "사용", color: "text-red-600" },
  refund: { label: "환불", color: "text-blue-600" },
  bonus: { label: "보너스", color: "text-purple-600" },
  adjustment: { label: "조정", color: "text-gray-600" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCredits(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR");
}

function formatDateShort(dateStr: string): string {
  // "2026-02-15" -> "2/15"
  const parts = dateStr.split("-");
  const month = parts[1] ?? "01";
  const day = parts[2] ?? "01";
  return `${String(Number(month))}/${String(Number(day))}`;
}

function depletionLabel(days: number | null): string {
  if (days === null) {
    return "N/A";
  }
  if (days > 365) {
    return "1년+";
  }
  return `${String(days)}일`;
}

function progressVariant(ratio: number): "default" | "warning" | "danger" {
  if (ratio >= 90) {
    return "danger";
  }
  if (ratio >= 70) {
    return "warning";
  }
  return "default";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCards({ overview }: { overview: CreditOverview }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={Wallet}
        label="총 잔여 크레딧"
        value={formatCredits(overview.total_balance)}
        color="brand"
        subValue={`총 충전: ${formatCredits(overview.total_charged)}`}
      />
      <StatCard
        icon={CalendarDays}
        label="이번 달 사용량"
        value={formatCredits(overview.month_used)}
        suffix="크레딧"
        color="red"
      />
      <StatCard
        icon={TrendingDown}
        label="일 평균 사용량"
        value={formatCredits(overview.daily_average)}
        suffix="크레딧/일"
        color="amber"
      />
      <StatCard
        icon={Clock}
        label="예상 소진일"
        value={depletionLabel(overview.estimated_depletion_days)}
        color="purple"
        subValue={
          overview.estimated_depletion_days !== null
            ? `일평균 ${formatCredits(overview.daily_average)} 기준`
            : "사용 이력 없음"
        }
      />
    </div>
  );
}

function DailyUsageChart({ data }: { data: DailyUsage[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>최근 30일 사용량 트렌드</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateShort}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(v: number) => formatCredits(v)}
              />
              <Tooltip
                formatter={(value: number) => [
                  `${formatCredits(value)} 크레딧`,
                  "사용량",
                ]}
                labelFormatter={(label: string) => `날짜: ${String(label)}`}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  fontSize: "13px",
                }}
              />
              <Line
                type="monotone"
                dataKey="usage"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#6366f1" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkspaceUsageBarChart({ data }: { data: WorkspaceUsage[] }) {
  const chartData = data.map((ws) => ({
    name:
      ws.workspace_name.length > 12
        ? `${ws.workspace_name.slice(0, 12)}...`
        : ws.workspace_name,
    크레딧: ws.used_credits,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>워크스페이스별 사용량</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            사용 데이터가 없습니다
          </p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickFormatter={(v: number) => formatCredits(v)}
                />
                <Tooltip
                  formatter={(value: number) => [
                    `${formatCredits(value)} 크레딧`,
                    "사용량",
                  ]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e5e7eb",
                    fontSize: "13px",
                  }}
                />
                <Bar dataKey="크레딧" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentUsageTable({ data }: { data: AgentUsage[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-brand-600" />
          에이전트별 사용량 Top 10
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            에이전트 사용 이력이 없습니다
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>에이전트</TableHead>
                <TableHead className="text-right">총 사용량</TableHead>
                <TableHead className="text-right">최근 실행</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((agent, idx) => (
                <TableRow key={agent.agent_id}>
                  <TableCell className="font-mono text-gray-400">
                    {String(idx + 1)}
                  </TableCell>
                  <TableCell className="font-medium text-gray-800">
                    {agent.agent_name}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    {formatCredits(agent.total_used)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-gray-500">
                    {formatDate(agent.last_run_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function TransactionHistory({
  transactions,
}: {
  transactions: CreditTransaction[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>트랜잭션 히스토리</CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            거래 내역이 없습니다
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>에이전트</TableHead>
                  <TableHead>파이프라인</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-right">크레딧</TableHead>
                  <TableHead className="text-right">잔액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn) => {
                  const meta = TXN_TYPE_META[txn.transaction_type] ?? {
                    label: txn.transaction_type,
                    color: "text-gray-600",
                  };
                  return (
                    <TableRow key={txn.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(txn.created_at)}
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {txn.agent_name ?? "-"}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {txn.reference_type === "pipeline"
                          ? (txn.reference_id ?? "-").slice(0, 8)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.color} bg-opacity-10`}
                        >
                          {meta.label}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm text-gray-600">
                        {txn.description}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${meta.color}`}
                      >
                        {txn.amount > 0 ? "+" : ""}
                        {formatCredits(txn.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-gray-400">
                        {formatCredits(txn.balance_after)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Credit Limit Settings
// ---------------------------------------------------------------------------

interface LimitRowState {
  workspace_id: string;
  workspace_name: string;
  monthly_limit: string;
  auto_stop: boolean;
  month_used: number;
  usage_ratio: number;
  saving: boolean;
  dirty: boolean;
}

function CreditLimitSettings({
  initialLimits,
  onSaved,
}: {
  initialLimits: CreditLimitInfo[];
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<LimitRowState[]>(() =>
    initialLimits.map((lim) => ({
      workspace_id: lim.workspace_id,
      workspace_name: lim.workspace_name,
      monthly_limit: String(lim.monthly_limit),
      auto_stop: lim.auto_stop,
      month_used: lim.month_used,
      usage_ratio: lim.usage_ratio,
      saving: false,
      dirty: false,
    })),
  );

  const updateRow = useCallback(
    (wsId: string, patch: Partial<LimitRowState>) => {
      setRows((prev) =>
        prev.map((r) =>
          r.workspace_id === wsId ? { ...r, ...patch, dirty: true } : r,
        ),
      );
    },
    [],
  );

  const handleSave = useCallback(
    async (row: LimitRowState) => {
      setRows((prev) =>
        prev.map((r) =>
          r.workspace_id === row.workspace_id ? { ...r, saving: true } : r,
        ),
      );

      try {
        const res = await fetch("/api/credits", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: row.workspace_id,
            monthly_limit: Number(row.monthly_limit) || 0,
            auto_stop: row.auto_stop,
          }),
        });

        if (!res.ok) {
          throw new Error(`크레딧 한도 저장 실패: ${String(res.status)}`);
        }

        setRows((prev) =>
          prev.map((r) =>
            r.workspace_id === row.workspace_id
              ? { ...r, saving: false, dirty: false }
              : r,
          ),
        );
        onSaved();
      } catch (err) {
        Sentry.captureException(err, {
          tags: { context: "billing.creditLimitSave" },
        });
        setRows((prev) =>
          prev.map((r) =>
            r.workspace_id === row.workspace_id ? { ...r, saving: false } : r,
          ),
        );
      }
    },
    [onSaved],
  );

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>워크스페이스별 크레딧 한도</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-sm text-gray-400">
            워크스페이스가 없습니다
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>워크스페이스별 크레딧 한도 설정</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {rows.map((row) => {
            const limitNum = Number(row.monthly_limit) || 0;
            const ratio =
              limitNum > 0
                ? Math.round((row.month_used / limitNum) * 10000) / 100
                : 0;

            return (
              <div
                key={row.workspace_id}
                className="rounded-lg border border-gray-100 bg-gray-50/50 p-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800">
                    {row.workspace_name}
                  </h4>
                  <span className="text-xs text-gray-400">
                    이번 달: {formatCredits(row.month_used)} 크레딧
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                    <span>사용률</span>
                    <span>
                      {limitNum > 0
                        ? `${String(ratio)}%`
                        : "한도 미설정"}
                    </span>
                  </div>
                  <Progress
                    value={limitNum > 0 ? ratio : 0}
                    variant={progressVariant(ratio)}
                  />
                </div>

                {/* Controls */}
                <div className="mt-4 flex flex-wrap items-end gap-4">
                  <div className="min-w-[180px] flex-1">
                    <Input
                      label="월간 한도 (크레딧)"
                      type="number"
                      min={0}
                      step={100}
                      value={row.monthly_limit}
                      onChange={(e) => {
                        updateRow(row.workspace_id, {
                          monthly_limit: e.target.value,
                        });
                      }}
                      placeholder="0 = 무제한"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <label
                      htmlFor={`auto-stop-${row.workspace_id}`}
                      className="text-sm text-gray-600"
                    >
                      한도 초과 시 자동정지
                    </label>
                    <Switch
                      id={`auto-stop-${row.workspace_id}`}
                      checked={row.auto_stop}
                      onCheckedChange={(checked: boolean) => {
                        updateRow(row.workspace_id, { auto_stop: checked });
                      }}
                    />
                  </div>

                  <Button
                    size="sm"
                    variant={row.dirty ? "primary" : "secondary"}
                    isLoading={row.saving}
                    disabled={!row.dirty || row.saving}
                    onClick={() => {
                      void handleSave(row);
                    }}
                  >
                    <Save className="h-4 w-4" />
                    저장
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function BillingPageSkeleton() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">크레딧 / 과금</h2>
      <p className="mt-1 text-gray-500">
        마스터 크레딧 사용량과 비용을 추적합니다
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={`skel-kpi-${String(i)}`}
            className="rounded-xl border border-gray-200 bg-white p-5"
          >
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="mt-4 h-7 w-24" />
            <Skeleton className="mt-2 h-4 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-72 w-full rounded-lg" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-72 w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const [data, setData] = useState<CreditsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/credits");
      if (!res.ok) {
        throw new Error(`크레딧 조회 실패: ${String(res.status)}`);
      }
      const json: CreditsData = (await res.json()) as CreditsData;
      setData(json);
    } catch (err) {
      Sentry.captureException(err, { tags: { context: "billing.fetch" } });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCredits();
  }, [fetchCredits]);

  if (isLoading) {
    return <BillingPageSkeleton />;
  }

  if (!data) {
    return (
      <EmptyState
        icon={Wallet}
        title="크레딧 데이터를 불러올 수 없습니다"
        description="잠시 후 다시 시도해주세요."
      />
    );
  }

  const {
    overview,
    recent_transactions,
    workspace_usage,
    daily_usage,
    agent_usage_top10,
    credit_limits,
  } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">크레딧 / 과금</h2>
        <p className="mt-1 text-gray-500">
          마스터 크레딧 사용량과 비용을 추적합니다
        </p>
      </div>

      {/* KPI Cards (4) */}
      <KpiCards overview={overview} />

      {/* Charts Row: Daily Usage Trend + Workspace Bar Chart */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DailyUsageChart data={daily_usage} />
        <WorkspaceUsageBarChart data={workspace_usage} />
      </div>

      {/* Agent Usage Top 10 + Credit Limit Settings */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AgentUsageTable data={agent_usage_top10} />
        <CreditLimitSettings
          initialLimits={credit_limits}
          onSaved={() => {
            void fetchCredits();
          }}
        />
      </div>

      {/* Transaction History */}
      <TransactionHistory transactions={recent_transactions} />
    </div>
  );
}
