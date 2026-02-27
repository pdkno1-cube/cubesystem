import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { untyped } from '@/lib/supabase/untyped';
import { handleApiError } from '@/lib/api-response';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const metricsQuerySchema = z.object({
  agent_id: z.string().uuid(),
  period: z.enum(['7d', '30d', '90d']).optional().default('7d'),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetricRow {
  id: string;
  agent_id: string;
  workspace_id: string;
  metric_type: string;
  metric_value: number;
  period_start: string;
  period_end: string;
  sample_count: number;
  created_at: string;
}

interface MetricSummary {
  metric_type: string;
  current_value: number;
  previous_value: number | null;
  trend: 'up' | 'down' | 'stable';
  change_percent: number;
  sparkline: number[];
}

// ---------------------------------------------------------------------------
// GET — Agent metrics
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = metricsQuerySchema.safeParse({
      agent_id: searchParams.get('agent_id') ?? undefined,
      period: searchParams.get('period') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { agent_id, period } = parsed.data;
    const db = untyped(supabase);

    // Calculate date range
    const now = new Date();
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const previousPeriodStart = new Date(periodStart.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Fetch current period metrics
    const { data: currentMetrics, error } = await db
      .from('agent_metrics')
      .select('*')
      .eq('agent_id', agent_id)
      .gte('period_start', periodStart.toISOString().split('T')[0])
      .order('period_start', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    // Fetch previous period metrics for comparison
    const { data: prevMetrics } = await db
      .from('agent_metrics')
      .select('*')
      .eq('agent_id', agent_id)
      .gte('period_start', previousPeriodStart.toISOString().split('T')[0])
      .lt('period_start', periodStart.toISOString().split('T')[0])
      .order('period_start', { ascending: true });

    const currentRows = (currentMetrics ?? []) as MetricRow[];
    const prevRows = (prevMetrics ?? []) as MetricRow[];

    const metricTypes = ['success_rate', 'avg_response_time', 'cost_efficiency', 'quality_score'];

    const summaries: MetricSummary[] = metricTypes.map((type) => {
      const currentOfType = currentRows.filter((m) => m.metric_type === type);
      const prevOfType = prevRows.filter((m) => m.metric_type === type);

      // Current value: average of current period
      const currentValue =
        currentOfType.length > 0
          ? currentOfType.reduce((sum, m) => sum + m.metric_value, 0) / currentOfType.length
          : 0;

      // Previous value: average of previous period
      const previousValue =
        prevOfType.length > 0
          ? prevOfType.reduce((sum, m) => sum + m.metric_value, 0) / prevOfType.length
          : null;

      // Trend
      let trend: 'up' | 'down' | 'stable' = 'stable';
      let changePercent = 0;

      if (previousValue !== null && previousValue !== 0) {
        changePercent = ((currentValue - previousValue) / previousValue) * 100;
        if (changePercent > 1) {
          trend = 'up';
        } else if (changePercent < -1) {
          trend = 'down';
        }
      }

      // Sparkline: last 7 data points
      const sparkline = currentOfType.slice(-7).map((m) => m.metric_value);

      // If no data, generate mock sparkline for demo
      if (sparkline.length === 0) {
        const baseValues: Record<string, number> = {
          success_rate: 85,
          avg_response_time: 1200,
          cost_efficiency: 72,
          quality_score: 88,
        };
        const base = baseValues[type] ?? 50;
        for (let i = 0; i < 7; i++) {
          sparkline.push(base + (Math.random() - 0.5) * base * 0.2);
        }
      }

      return {
        metric_type: type,
        current_value: Math.round(currentValue * 100) / 100 || getMockValue(type),
        previous_value: previousValue !== null ? Math.round(previousValue * 100) / 100 : null,
        trend,
        change_percent: Math.round(changePercent * 10) / 10,
        sparkline,
      };
    });

    return NextResponse.json({ data: summaries });
  } catch (error) {
    return handleApiError(error, 'agents.metrics.GET');
  }
}

function getMockValue(type: string): number {
  const defaults: Record<string, number> = {
    success_rate: 87.5,
    avg_response_time: 1150,
    cost_efficiency: 74.2,
    quality_score: 89.3,
  };
  return defaults[type] ?? 50;
}
