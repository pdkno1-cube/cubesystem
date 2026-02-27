'use client';

import { useCallback, useEffect } from 'react';
import { Activity, CreditCard, Mail, CheckCircle2, Loader2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { StatCard } from '@/app/(dashboard)/dashboard/stat-card';
import {
  useMarketingStore,
  CHANNEL_COLORS,
  type ScheduleChannel,
} from '@/stores/marketingStore';

// ---------------------------------------------------------------------------
// Chart color palette (hex for recharts)
// ---------------------------------------------------------------------------

const CHART_COLORS: Record<string, string> = {
  blog: '#3b82f6',
  instagram: '#ec4899',
  newsletter: '#22c55e',
  shortform: '#a855f7',
  twitter: '#0ea5e9',
  linkedin: '#6366f1',
};

const PIE_FALLBACK_COLORS = ['#3b82f6', '#ec4899', '#22c55e', '#a855f7', '#0ea5e9', '#6366f1'];

// ---------------------------------------------------------------------------
// AnalyticsPanel
// ---------------------------------------------------------------------------

interface AnalyticsPanelProps {
  workspaceId: string;
}

export function AnalyticsPanel({ workspaceId }: AnalyticsPanelProps) {
  const {
    analyticsOverview,
    analyticsTimeseries,
    analyticsLoading,
    setAnalyticsOverview,
    setAnalyticsTimeseries,
    setAnalyticsLoading,
  } = useMarketingStore();

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const params = new URLSearchParams({
        workspace_id: workspaceId,
        days: '30',
      });

      const [overviewResp, timeseriesResp] = await Promise.all([
        fetch(`/api/marketing/analytics?${params.toString()}&type=overview`),
        fetch(`/api/marketing/analytics?${params.toString()}&type=timeseries`),
      ]);

      if (overviewResp.ok) {
        const overviewBody = (await overviewResp.json()) as {
          data: typeof analyticsOverview;
        };
        setAnalyticsOverview(overviewBody.data);
      }

      if (timeseriesResp.ok) {
        const tsBody = (await timeseriesResp.json()) as {
          data: { points: typeof analyticsTimeseries };
        };
        setAnalyticsTimeseries(tsBody.data.points);
      }
    } finally {
      setAnalyticsLoading(false);
    }
  }, [workspaceId, setAnalyticsOverview, setAnalyticsTimeseries, setAnalyticsLoading]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  if (analyticsLoading && !analyticsOverview) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
        <span className="ml-2 text-sm text-gray-500">성과 데이터 로딩 중...</span>
      </div>
    );
  }

  const overview = analyticsOverview ?? {
    total_executions: 0,
    total_credits: 0,
    email_open_rate: 0,
    published_count: 0,
    channel_breakdown: [],
  };

  const openRatePct = Math.round(overview.email_open_rate * 100);

  // Bar chart data: channel breakdown
  const barData = overview.channel_breakdown.map((cb) => ({
    name: CHANNEL_COLORS[cb.channel as ScheduleChannel]?.label ?? cb.channel,
    executions: cb.executions,
    fill: CHART_COLORS[cb.channel] ?? '#94a3b8',
  }));

  // Pie chart data: credits by channel
  const pieData = overview.channel_breakdown
    .filter((cb) => cb.credits > 0)
    .map((cb) => ({
      name: CHANNEL_COLORS[cb.channel as ScheduleChannel]?.label ?? cb.channel,
      value: cb.credits,
      fill: CHART_COLORS[cb.channel] ?? '#94a3b8',
    }));

  // Timeseries: shorten date labels to MM-DD
  const lineData = analyticsTimeseries.map((p) => ({
    ...p,
    label: p.date.slice(5), // MM-DD
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Activity}
          label="총 실행"
          value={overview.total_executions}
          suffix="회"
          subValue="최근 30일"
          color="brand"
        />
        <StatCard
          icon={CreditCard}
          label="크레딧 소모"
          value={overview.total_credits}
          subValue="최근 30일"
          color="amber"
        />
        <StatCard
          icon={Mail}
          label="이메일 오픈율"
          value={openRatePct}
          suffix="%"
          subValue="발송 대비 오픈"
          color="green"
        />
        <StatCard
          icon={CheckCircle2}
          label="발행 완료"
          value={overview.published_count}
          suffix="건"
          subValue="최근 30일"
          color="purple"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Channel execution bar chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">채널별 실행 현황</h3>
          {barData.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">데이터 없음</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="executions" name="실행 수" radius={[4, 4, 0, 0]}>
                  {barData.map((entry, idx) => (
                    <Cell key={`bar-${idx}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Credit pie chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">채널별 크레딧 분포</h3>
          {pieData.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">데이터 없음</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((entry, idx) => (
                    <Cell
                      key={`pie-${idx}`}
                      fill={entry.fill || PIE_FALLBACK_COLORS[idx % PIE_FALLBACK_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value} 크레딧`} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Timeseries line chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">일별 추이 (30일)</h3>
        {lineData.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">데이터 없음</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                labelFormatter={(label: string) => `${label}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="executions"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                name="실행"
              />
              <Line
                type="monotone"
                dataKey="published"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                name="발행"
              />
              <Line
                type="monotone"
                dataKey="email_opens"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                name="이메일 오픈"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
