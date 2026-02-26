"use client";

import { useEffect, useState } from "react";
import { CreditCard, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

// -- Types --
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

interface CreditsData {
  overview: CreditOverview;
  recent_transactions: CreditTransaction[];
  workspace_usage: WorkspaceUsage[];
}

// -- 거래 유형 라벨/색상 --
const TXN_TYPE_META: Record<string, { label: string; color: string }> = {
  charge: { label: "충전", color: "text-green-600" },
  usage: { label: "사용", color: "text-red-600" },
  refund: { label: "환불", color: "text-blue-600" },
  bonus: { label: "보너스", color: "text-purple-600" },
  adjustment: { label: "조정", color: "text-gray-600" },
};

// -- 숫자 포맷 --
function formatCredits(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

// -- 워크스페이스별 사용량 막대 차트 (CSS 기반) --
function WorkspaceUsageChart({ data }: { data: WorkspaceUsage[] }) {
  const maxUsed = Math.max(...data.map((d) => d.used_credits), 1);

  return (
    <div className="space-y-3">
      {data.map((ws) => {
        const widthPercent = (ws.used_credits / maxUsed) * 100;
        return (
          <div key={ws.workspace_id}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">{ws.workspace_name}</span>
              <span className="text-gray-500">{formatCredits(ws.used_credits)} 크레딧</span>
            </div>
            <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${String(widthPercent)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function BillingPage() {
  const [data, setData] = useState<CreditsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchCredits() {
      try {
        const res = await fetch("/api/credits");
        if (!res.ok) {
          throw new Error(`크레딧 조회 실패: ${res.status}`);
        }
        const json: CreditsData = await res.json();
        setData(json);
      } catch (err) {
        const message = err instanceof Error ? err.message : "알 수 없는 에러";
        console.error("[BillingPage] fetchCredits 실패:", message);
      } finally {
        setIsLoading(false);
      }
    }
    void fetchCredits();
  }, []);

  if (isLoading) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-gray-900">크레딧 / 과금</h2>
        <p className="mt-1 text-gray-500">마스터 크레딧 사용량과 비용을 추적합니다</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={`skel-${String(i)}`}>
              <CardContent className="pt-6">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="mt-2 h-4 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={CreditCard}
        title="크레딧 데이터를 불러올 수 없습니다"
        description="잠시 후 다시 시도해주세요."
      />
    );
  }

  const { overview, recent_transactions, workspace_usage } = data;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">크레딧 / 과금</h2>
      <p className="mt-1 text-gray-500">마스터 크레딧 사용량과 비용을 추적합니다</p>

      {/* KPI 카드 3개 */}
      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-100">
              <Wallet className="h-6 w-6 text-brand-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">총 잔액</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCredits(overview.total_balance)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">총 충전</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCredits(overview.total_charged)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
              <TrendingDown className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">총 사용</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCredits(overview.total_used)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* 최근 거래 내역 테이블 (2/3 너비) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>최근 거래 내역</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>워크스페이스</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead className="text-right">잔액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent_transactions.map((txn) => {
                  const meta = TXN_TYPE_META[txn.transaction_type] ?? {
                    label: txn.transaction_type,
                    color: "text-gray-600",
                  };
                  return (
                    <TableRow key={txn.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(txn.created_at).toLocaleDateString("ko-KR")}
                      </TableCell>
                      <TableCell>{txn.workspace_name}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{txn.description}</TableCell>
                      <TableCell className={`text-right font-mono ${meta.color}`}>
                        {txn.amount > 0 ? "+" : ""}
                        {formatCredits(txn.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-gray-500">
                        {formatCredits(txn.balance_after)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 워크스페이스별 소모량 차트 (1/3 너비) */}
        <Card>
          <CardHeader>
            <CardTitle>워크스페이스별 사용량</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkspaceUsageChart data={workspace_usage} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
