'use client';

import { useState, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetricSummary {
  metric_type: string;
  current_value: number;
  previous_value: number | null;
  trend: 'up' | 'down' | 'stable';
  change_percent: number;
  sparkline: number[];
}

// ---------------------------------------------------------------------------
// Metric config
// ---------------------------------------------------------------------------

interface MetricConfig {
  label: string;
  unit: string;
  color: string;
  fillColor: string;
  format: (v: number) => string;
  inverseTrend?: boolean; // for metrics where "down" is good (e.g. response time)
}

const METRIC_CONFIGS: Record<string, MetricConfig> = {
  success_rate: {
    label: '성공률',
    unit: '%',
    color: '#22c55e',
    fillColor: '#dcfce7',
    format: (v: number) => `${v.toFixed(1)}%`,
  },
  avg_response_time: {
    label: '평균 응답시간',
    unit: 'ms',
    color: '#3b82f6',
    fillColor: '#dbeafe',
    format: (v: number) => `${Math.round(v)}ms`,
    inverseTrend: true,
  },
  cost_efficiency: {
    label: '비용 효율성',
    unit: '점',
    color: '#8b5cf6',
    fillColor: '#ede9fe',
    format: (v: number) => v.toFixed(1),
  },
  quality_score: {
    label: '품질 점수',
    unit: '점',
    color: '#f59e0b',
    fillColor: '#fef3c7',
    format: (v: number) => v.toFixed(1),
  },
};

const DEFAULT_METRIC_CONFIG: MetricConfig = {
  label: '메트릭',
  unit: '',
  color: '#6b7280',
  fillColor: '#f3f4f6',
  format: (v: number) => v.toFixed(1),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AgentScorecardProps {
  agentId: string;
}

export function AgentScorecard({ agentId }: AgentScorecardProps) {
  const [metrics, setMetrics] = useState<MetricSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');

  useEffect(() => {
    let cancelled = false;

    async function fetchMetrics() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/agents/metrics?agent_id=${agentId}&period=${period}`
        );
        if (!res.ok) {
          throw new Error('Failed to fetch metrics');
        }
        const json: unknown = await res.json();
        const result = json as { data?: MetricSummary[] };
        if (!cancelled) {
          setMetrics(result.data ?? []);
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags: { context: 'agent.scorecard.fetch' },
        });
        if (!cancelled) {
          setMetrics([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchMetrics();

    return () => {
      cancelled = true;
    };
  }, [agentId, period]);

  return (
    <div className="border-b border-gray-100 px-6 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <BarChart3 className="h-3.5 w-3.5" />
          스코어카드
        </h4>
        <div className="flex items-center gap-1 rounded-md bg-gray-100 p-0.5">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                period === p
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((metric) => (
            <MetricCard key={metric.metric_type} metric={metric} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricCard
// ---------------------------------------------------------------------------

interface MetricCardProps {
  metric: MetricSummary;
}

function MetricCard({ metric }: MetricCardProps) {
  const config = METRIC_CONFIGS[metric.metric_type] ?? DEFAULT_METRIC_CONFIG;

  // For inverse metrics (response time), down is good
  const isPositive = config.inverseTrend
    ? metric.trend === 'down'
    : metric.trend === 'up';
  const isNegative = config.inverseTrend
    ? metric.trend === 'up'
    : metric.trend === 'down';

  const sparklineData = metric.sparkline.map((value, idx) => ({
    idx,
    value,
  }));

  return (
    <div className="rounded-lg bg-gray-50 px-3 py-3">
      {/* Label */}
      <p className="text-[10px] font-medium text-gray-500">{config.label}</p>

      {/* Value + Trend */}
      <div className="mt-1 flex items-end justify-between">
        <p className="text-lg font-bold text-gray-900">
          {config.format(metric.current_value)}
        </p>
        {metric.change_percent !== 0 ? (
          <span
            className={cn(
              'flex items-center gap-0.5 text-[10px] font-medium',
              isPositive
                ? 'text-green-600'
                : isNegative
                  ? 'text-red-600'
                  : 'text-gray-500'
            )}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : isNegative ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {Math.abs(metric.change_percent).toFixed(1)}%
          </span>
        ) : null}
      </div>

      {/* Sparkline */}
      {sparklineData.length > 1 ? (
        <div className="mt-2 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData}>
              <defs>
                <linearGradient
                  id={`gradient-${metric.metric_type}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={config.color}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={config.color}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={config.color}
                fill={`url(#gradient-${metric.metric_type})`}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}
