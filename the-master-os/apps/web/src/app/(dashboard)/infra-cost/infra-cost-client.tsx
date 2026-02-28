'use client';

import { useState, useEffect, useCallback } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  RefreshCw,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Server,
  ArrowRight,
  Loader2,
  Mail,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { InfraStatusResponse, ServiceStatus } from '@/components/settings/infra-service-config';
import { STATUS_CONFIG } from '@/components/settings/infra-service-config';
import { ServiceCard } from '@/components/settings/ServiceCard';
import { StatusBadge } from '@/components/settings/StatusBadge';

// ─── 카테고리 색상 ────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  hosting: '#6366f1',
  backend: '#f59e0b',
  database: '#10b981',
  ai: '#8b5cf6',
  email: '#ec4899',
  monitoring: '#f97316',
  storage: '#06b6d4',
  media: '#e11d48',
};

const CATEGORY_LABELS: Record<string, string> = {
  hosting: '호스팅',
  backend: '백엔드',
  database: '데이터베이스',
  ai: 'AI/LLM',
  email: '이메일',
  monitoring: '모니터링',
  storage: '스토리지',
  media: '미디어 생성',
};

// ─── API 응답 타입 ────────────────────────────────────────────
interface HistoryServiceEntry {
  service_id: string;
  cost: number;
}

interface MonthlyHistoryEntry {
  month: string;
  year: number;
  totalCostUsd: number;
  services: HistoryServiceEntry[];
}

interface InfraHistoryResponse {
  history: MonthlyHistoryEntry[];
}

interface InfraAlertInfo {
  serviceId: string;
  serviceName: string;
  status: string;
  monthlyCostUsd: number;
  topMetricLabel: string;
  topMetricUsagePercent: number;
}

interface InfraAlertsApiResponse {
  alerts: InfraAlertInfo[];
  emailSent: boolean;
  reason?: string;
}

// ─── 실 데이터 → 차트 변환 ─────────────────────────────────────
const MONTH_LABELS: Record<string, string> = {
  '01': '1월', '02': '2월', '03': '3월', '04': '4월',
  '05': '5월', '06': '6월', '07': '7월', '08': '8월',
  '09': '9월', '10': '10월', '11': '11월', '12': '12월',
};
const DEFAULT_MONTH_LABEL = '';

function convertHistoryToChart(
  history: MonthlyHistoryEntry[],
  currentTotal: number,
): Array<{ month: string; cost: number; projected: number }> {
  const now = new Date();
  const currentMonthKey = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const result: Array<{ month: string; cost: number; projected: number }> = [];

  for (const entry of history) {
    const entryKey = `${String(entry.year)}-${entry.month}`;
    const label = MONTH_LABELS[entry.month] ?? DEFAULT_MONTH_LABEL;
    const isFuture = entryKey > currentMonthKey;

    result.push({
      month: isFuture ? `${label}(예측)` : label,
      cost: isFuture ? 0 : entry.totalCostUsd,
      projected: entry.totalCostUsd,
    });
  }

  // Add projections for 3 months after the last entry
  const lastEntry = history[history.length - 1];
  if (lastEntry) {
    const lastDate = new Date(lastEntry.year, parseInt(lastEntry.month, 10) - 1, 1);
    for (let i = 1; i <= 3; i++) {
      const d = new Date(lastDate.getFullYear(), lastDate.getMonth() + i, 1);
      const mKey = `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      // Skip if this month is already in the history
      const alreadyExists = history.some(
        (h) => `${String(h.year)}-${h.month}` === mKey,
      );
      if (alreadyExists) {
        continue;
      }

      const label = MONTH_LABELS[String(d.getMonth() + 1).padStart(2, '0')] ?? DEFAULT_MONTH_LABEL;
      const factor = 1 + i * 0.05;
      const projected = Math.round(currentTotal * factor * 100) / 100;
      result.push({ month: `${label}(예측)`, cost: 0, projected });
    }
  }

  return result;
}

// ─── 예상 비용 추이 (정적 시뮬레이션 — DB 데이터 없을 때 폴백) ──────
function generateCostHistory(currentTotal: number): Array<{ month: string; cost: number; projected: number }> {
  const now = new Date();
  const months: Array<{ month: string; cost: number; projected: number }> = [];

  for (let i = 5; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString('ko-KR', { month: 'short' });
    // 과거 추이 시뮬레이션 (현재 비용 기준 점진적 증가 패턴)
    const factor = 0.6 + (5 - i) * 0.08;
    const cost = Math.round(currentTotal * factor * 100) / 100;
    months.push({ month: label, cost, projected: cost });
  }

  // 이번 달
  const currentLabel = now.toLocaleDateString('ko-KR', { month: 'short' });
  months.push({ month: currentLabel, cost: currentTotal, projected: currentTotal });

  // 다음 3개월 예측
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = d.toLocaleDateString('ko-KR', { month: 'short' });
    const factor = 1 + i * 0.05;
    const projected = Math.round(currentTotal * factor * 100) / 100;
    months.push({ month: `${label}(예측)`, cost: 0, projected });
  }

  return months;
}

// ─── 전체 상태 계산 ─────────────────────────────────────────
function overallStatus(data: InfraStatusResponse): ServiceStatus {
  const order: ServiceStatus[] = ['critical', 'warning', 'caution', 'good', 'stable'];
  for (const s of order) {
    if (data.services.some((svc) => svc.status === s)) {
      return s;
    }
  }
  return 'stable';
}

// ─── 예산 알림 타입 ──────────────────────────────────────────
interface BudgetAlert {
  serviceName: string;
  status: ServiceStatus;
  message: string;
  usagePercent: number;
}

function extractAlerts(data: InfraStatusResponse): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  for (const svc of data.services) {
    if (svc.status === 'caution' || svc.status === 'warning' || svc.status === 'critical') {
      const topMetric = svc.metrics.reduce(
        (max, m) => (m.usagePercent > max.usagePercent ? m : max),
        svc.metrics[0] ?? { label: '', usagePercent: 0 },
      );
      alerts.push({
        serviceName: svc.name,
        status: svc.status,
        message: `${topMetric.label} ${topMetric.usagePercent}% 사용 — ${svc.upgrade.triggerCondition}`,
        usagePercent: topMetric.usagePercent,
      });
    }
  }
  return alerts.sort((a, b) => b.usagePercent - a.usagePercent);
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────
export function InfraCostClient() {
  const [data, setData] = useState<InfraStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realHistory, setRealHistory] = useState<MonthlyHistoryEntry[] | null>(null);
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [alertBanner, setAlertBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch infra status and history in parallel
      const [statusRes, historyRes] = await Promise.all([
        fetch('/api/settings/infra-status', { cache: 'no-store' }),
        fetch('/api/settings/infra-history?months=9', { cache: 'no-store' }).catch(() => null),
      ]);

      if (!statusRes.ok) {
        throw new Error(`HTTP ${String(statusRes.status)}`);
      }
      const json: InfraStatusResponse = await statusRes.json();
      setData(json);

      // Process history data (non-blocking)
      if (historyRes && historyRes.ok) {
        try {
          const historyJson = (await historyRes.json()) as InfraHistoryResponse;
          if (historyJson.history && historyJson.history.length > 0) {
            setRealHistory(historyJson.history);
          }
        } catch (histErr) {
          Sentry.captureException(histErr, { tags: { context: 'infra-cost.fetch-history' } });
          // History fetch failure is non-critical; fall back to simulation
        }
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'infra-cost.fetch' } });
      setError('인프라 데이터를 불러오는 데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSendAlertEmail = useCallback(async () => {
    setIsSendingAlert(true);
    setAlertBanner(null);
    try {
      const res = await fetch('/api/settings/infra-alerts', {
        method: 'POST',
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${String(res.status)}`);
      }
      const json = (await res.json()) as InfraAlertsApiResponse;

      if (json.emailSent) {
        setAlertBanner({
          type: 'success',
          message: `알림 이메일이 발송되었습니다. (${String(json.alerts.length)}개 서비스)`,
        });
      } else if (json.alerts.length === 0) {
        setAlertBanner({
          type: 'info',
          message: '주의 이상 상태의 서비스가 없어 알림을 발송하지 않았습니다.',
        });
      } else {
        setAlertBanner({
          type: 'info',
          message: json.reason ?? '알림 이메일 발송을 건너뛰었습니다.',
        });
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'infra-cost.send-alert' } });
      setAlertBanner({
        type: 'error',
        message: '알림 발송 중 오류가 발생했습니다.',
      });
    } finally {
      setIsSendingAlert(false);
      // Auto-dismiss banner after 6 seconds
      setTimeout(() => {
        setAlertBanner(null);
      }, 6000);
    }
  }, []);

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-32 gap-3 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>인프라 현황 불러오는 중...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
        <p className="mt-3 text-sm text-red-700">{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const status = overallStatus(data);
  const statusCfg = STATUS_CONFIG[status];
  const alerts = extractAlerts(data);
  const costHistory = realHistory
    ? convertHistoryToChart(realHistory, data.totalMonthlyCostUsd)
    : generateCostHistory(data.totalMonthlyCostUsd);
  const freeCount = data.services.filter((s) => s.monthlyCostUsd === 0).length;
  const paidCount = data.services.length - freeCount;

  // 카테고리별 비용 분포
  const categoryMap = new Map<string, number>();
  for (const svc of data.services) {
    const prev = categoryMap.get(svc.category) ?? 0;
    categoryMap.set(svc.category, prev + svc.monthlyCostUsd);
  }
  const categoryData = Array.from(categoryMap.entries())
    .map(([cat, cost]) => ({
      name: CATEGORY_LABELS[cat] ?? cat,
      value: Math.round(cost * 100) / 100,
      color: CATEGORY_COLORS[cat] ?? '#9ca3af',
    }))
    .filter((d) => d.value > 0);

  const updatedAt = new Date(data.lastUpdated).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="space-y-6">
      {/* ─── 페이지 헤더 ─────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
              <Server className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">인프라 비용 대시보드</h1>
              <p className="text-sm text-gray-500">
                모든 외부 서비스의 요금제 · 사용량 · 예상 비용을 한눈에 확인합니다
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} size="md" />
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {/* ─── KPI 카드 4개 ──────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 총 월 비용 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <DollarSign className="h-4 w-4" />
            이번 달 예상 비용
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            ${data.totalMonthlyCostUsd.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            무료 {freeCount}개 · 유료 {paidCount}개
          </p>
        </div>

        {/* 전체 상태 */}
        <div className={`rounded-xl border p-5 shadow-sm ${statusCfg.bgClass} ${statusCfg.borderClass}`}>
          <div className={`flex items-center gap-2 text-sm ${statusCfg.textClass}`}>
            {status === 'stable' || status === 'good' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            전체 인프라 상태
          </div>
          <p className={`mt-2 text-2xl font-bold ${statusCfg.textClass}`}>
            {statusCfg.label}
          </p>
          <p className={`mt-1 text-xs ${statusCfg.textClass} opacity-70`}>
            {statusCfg.description}
          </p>
        </div>

        {/* 서비스 수 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Server className="h-4 w-4" />
            모니터링 서비스
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{data.services.length}개</p>
          <div className="mt-1 flex gap-2 text-xs text-gray-400">
            <span>🟢 {data.services.filter((s) => s.status === 'stable').length}</span>
            <span>🔵 {data.services.filter((s) => s.status === 'good').length}</span>
            <span>🟡 {data.services.filter((s) => s.status === 'caution').length}</span>
            <span>🟠 {data.services.filter((s) => s.status === 'warning').length}</span>
            <span>🔴 {data.services.filter((s) => s.status === 'critical').length}</span>
          </div>
        </div>

        {/* 알림 수 */}
        <div className={`rounded-xl border p-5 shadow-sm ${
          alerts.length > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'
        }`}>
          <div className={`flex items-center gap-2 text-sm ${
            alerts.length > 0 ? 'text-orange-600' : 'text-gray-500'
          }`}>
            <AlertTriangle className="h-4 w-4" />
            예산 알림
          </div>
          <p className={`mt-2 text-3xl font-bold ${
            alerts.length > 0 ? 'text-orange-700' : 'text-gray-900'
          }`}>
            {alerts.length}건
          </p>
          <p className="mt-1 text-xs text-gray-400">
            주의 이상 서비스
          </p>
        </div>
      </div>

      {/* ─── 알림 이메일 결과 배너 ────────────────────────────── */}
      {alertBanner && (
        <div
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
            alertBanner.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : alertBanner.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-blue-200 bg-blue-50 text-blue-700'
          }`}
        >
          {alertBanner.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : alertBanner.type === 'error' ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <Mail className="h-4 w-4 shrink-0" />
          )}
          <p className="text-sm">{alertBanner.message}</p>
          <button
            onClick={() => { setAlertBanner(null); }}
            className="ml-auto shrink-0 text-xs opacity-60 hover:opacity-100"
          >
            닫기
          </button>
        </div>
      )}

      {/* ─── 예산 알림 배너 ────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              예산 알림
            </h3>
            <button
              onClick={handleSendAlertEmail}
              disabled={isSendingAlert}
              className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-50 transition-colors disabled:opacity-50"
            >
              {isSendingAlert ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="h-3.5 w-3.5" />
              )}
              예산 알림 발송
            </button>
          </div>
          {alerts.map((alert) => {
            const cfg = STATUS_CONFIG[alert.status];
            return (
              <div
                key={alert.serviceName}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${cfg.bgClass} ${cfg.borderClass}`}
              >
                <span className="text-lg">{cfg.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${cfg.textClass}`}>{alert.serviceName}</p>
                  <p className={`text-xs ${cfg.textClass} opacity-80`}>{alert.message}</p>
                </div>
                <div className={`shrink-0 text-sm font-bold ${cfg.textClass}`}>
                  {alert.usagePercent}%
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── 비용 추이 + 카테고리 분포 ─────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* 비용 추이 차트 (2/3) */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-500" />
                비용 추이 & 예측
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {realHistory ? '실 데이터 기반' : '시뮬레이션 (DB 연동 시 실데이터 표시)'}
                {' '}· 최근 6개월 + 3개월 예측
              </p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={costHistory} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorProjected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a5b4fc" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#a5b4fc" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v: number) => `$${v}`} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  formatter={(value: number, name: string) => [
                    `$${value.toFixed(2)}`,
                    name === 'cost' ? '실제 비용' : '예측 비용',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="projected"
                  stroke="#a5b4fc"
                  strokeDasharray="5 5"
                  fill="url(#colorProjected)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#6366f1"
                  fill="url(#colorCost)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 카테고리별 비용 분포 (1/3) */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">카테고리별 비용 분포</h3>
          {categoryData.length > 0 ? (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {categoryData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, '월 비용']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1.5">
                {categoryData.map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="text-gray-600">{cat.name}</span>
                    </div>
                    <span className="font-medium text-gray-900">${cat.value.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-400" />
              <p className="mt-2 text-sm font-medium text-gray-600">모든 서비스 무료</p>
              <p className="text-xs text-gray-400">유료 서비스가 없습니다</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── 서비스 카드 그리드 ─────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Server className="h-4 w-4 text-gray-400" />
          서비스별 상세 ({data.services.length}개)
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {data.services.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      </div>

      {/* ─── 업그레이드 로드맵 ──────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-indigo-500" />
          업그레이드 로드맵
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          서비스 성장에 따른 예상 업그레이드 순서와 비용 변화입니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-medium text-gray-500">서비스</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-500">현재 플랜</th>
                <th className="text-left py-2 pr-4 font-medium text-gray-500">다음 플랜</th>
                <th className="text-right py-2 pr-4 font-medium text-gray-500">추가 비용</th>
                <th className="text-left py-2 font-medium text-gray-500">트리거 조건</th>
              </tr>
            </thead>
            <tbody>
              {data.services.map((svc) => (
                <tr key={svc.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span>{svc.logoEmoji}</span>
                      <span className="font-medium text-gray-900">{svc.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600">{svc.currentPlan}</td>
                  <td className="py-2.5 pr-4">
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700 font-medium">
                      {svc.upgrade.nextPlan}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-medium text-gray-900">
                    {svc.upgrade.nextPlanCostUsd > 0
                      ? `+$${svc.upgrade.nextPlanCostUsd}/월`
                      : '사용량 기반'}
                  </td>
                  <td className="py-2.5 text-gray-500">{svc.upgrade.triggerCondition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── 하단 메타 ────────────────────────────────────── */}
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-400 leading-relaxed">
          마지막 업데이트: {updatedAt} &middot; 비용 추이 차트의 예측값은 현재 사용량 기반 단순 추정입니다.
          정확한 비용은 각 서비스 콘솔에서 확인하세요. &middot;
          실시간 사용량 연동: 환경변수 또는 서비스 API 통합으로 활성화 가능합니다.
        </p>
      </div>
    </div>
  );
}
