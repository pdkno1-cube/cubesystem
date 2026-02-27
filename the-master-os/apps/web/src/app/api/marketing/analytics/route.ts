import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

// ── Constants ─────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

// ── Helpers ───────────────────────────────────────────────────────────────

/** Extract YYYY-MM-DD date key from an ISO timestamp string. */
const toDateKey = (iso: string): string => iso.slice(0, 10);

// ── Supabase Row Types ────────────────────────────────────────────────────

interface ContentScheduleRow {
  id: string;
  channel: string;
  status: string;
  scheduled_at: string;
  published_at: string | null;
  created_at: string;
}

interface PipelineExecutionRow {
  id: string;
  credits_used: number;
  status: string;
  created_at: string;
}

interface ContentMetricRow {
  id: string;
  opens: number;
  clicks: number;
  impressions: number;
  created_at: string;
}

// ── Response Types ────────────────────────────────────────────────────────

interface ChannelBreakdown {
  channel: string;
  executions: number;
  credits: number;
}

interface AnalyticsOverview {
  total_executions: number;
  total_credits: number;
  email_open_rate: number;
  published_count: number;
  channel_breakdown: ChannelBreakdown[];
}

interface TimeseriesPoint {
  date: string;
  executions: number;
  published: number;
  email_opens: number;
}

type AnalyticsResponse =
  | { data: AnalyticsOverview }
  | { data: { points: TimeseriesPoint[] } };

// ── GET /api/marketing/analytics?type=overview|timeseries ─────────────────

export async function GET(
  request: Request,
): Promise<NextResponse<AnalyticsResponse | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id');
    if (!workspaceId) {
      return apiError('VALIDATION_ERROR', 'workspace_id is required', 400);
    }

    const queryType = searchParams.get('type') ?? 'overview';
    const days = searchParams.get('days') ?? '30';

    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';

    if (FASTAPI_URL) {
      // Proxy to FastAPI
      const endpoint = queryType === 'timeseries' ? 'timeseries' : 'overview';
      const params = new URLSearchParams({
        workspace_id: workspaceId,
        days,
      });
      const resp = await fetch(
        `${FASTAPI_URL}/orchestrate/marketing/analytics/${endpoint}?${params.toString()}`,
        { headers: { 'X-User-Id': user.id } },
      );
      if (!resp.ok) {
        const text = await resp.text();
        return apiError('FASTAPI_ERROR', text, resp.status);
      }
      const body = (await resp.json()) as AnalyticsResponse;
      return NextResponse.json(body);
    }

    // Dev fallback: direct Supabase queries
    const since = new Date(Date.now() - Number(days) * MS_PER_DAY).toISOString();

    if (queryType === 'timeseries') {
      return await handleTimeseries(supabase, workspaceId, since, Number(days));
    }
    return await handleOverview(supabase, workspaceId, since);
  } catch (error) {
    return handleApiError(error, 'marketing.analytics.GET');
  }
}

// ── Supabase fallback helpers ──────────────────────────────────────────────

async function handleOverview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  since: string,
): Promise<NextResponse<{ data: AnalyticsOverview } | ApiErrorBody>> {
  // Schedules
  const { data: rawSchedules } = await supabase
    .from('content_schedules')
    .select('channel, status')
    .eq('workspace_id', workspaceId)
    .gte('created_at', since)
    .is('deleted_at', null);

  const schedules = (rawSchedules ?? []) as Pick<ContentScheduleRow, 'channel' | 'status'>[];
  const channelMap = new Map<string, number>();
  let publishedCount = 0;
  for (const s of schedules) {
    channelMap.set(s.channel, (channelMap.get(s.channel) ?? 0) + 1);
    if (s.status === 'completed') {
      publishedCount++;
    }
  }

  // Executions
  const { data: rawExecutions } = await supabase
    .from('pipeline_executions')
    .select('credits_used')
    .eq('workspace_id', workspaceId)
    .gte('created_at', since);

  const executions = (rawExecutions ?? []) as Pick<PipelineExecutionRow, 'credits_used'>[];
  const totalExecutions = executions.length;
  const totalCredits = executions.reduce(
    (sum, e) => sum + Number(e.credits_used ?? 0),
    0,
  );

  // Metrics (newsletter opens/impressions from aggregated content_metrics)
  const { data: rawMetrics } = await supabase
    .from('content_metrics')
    .select('opens, impressions')
    .eq('workspace_id', workspaceId)
    .eq('channel', 'newsletter')
    .gte('created_at', since);

  const metrics = (rawMetrics ?? []) as Pick<ContentMetricRow, 'opens' | 'impressions'>[];
  const totalImpressions = metrics.reduce(
    (sum, m) => sum + Number(m.impressions ?? 0),
    0,
  );
  const totalOpens = metrics.reduce(
    (sum, m) => sum + Number(m.opens ?? 0),
    0,
  );
  const openRate = totalImpressions > 0 ? totalOpens / totalImpressions : 0;

  const totalSchedules = schedules.length || 1;
  const channelBreakdown: ChannelBreakdown[] = Array.from(channelMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([channel, count]) => ({
      channel,
      executions: count,
      credits: Math.round((totalCredits * (count / totalSchedules)) * 100) / 100,
    }));

  return NextResponse.json({
    data: {
      total_executions: totalExecutions,
      total_credits: Math.round(totalCredits * 100) / 100,
      email_open_rate: Math.round(openRate * 10000) / 10000,
      published_count: publishedCount,
      channel_breakdown: channelBreakdown,
    },
  });
}

async function handleTimeseries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  since: string,
  days: number,
): Promise<NextResponse<{ data: { points: TimeseriesPoint[] } } | ApiErrorBody>> {
  const { data: rawExecutions } = await supabase
    .from('pipeline_executions')
    .select('created_at')
    .eq('workspace_id', workspaceId)
    .gte('created_at', since);

  const { data: rawSchedules } = await supabase
    .from('content_schedules')
    .select('published_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'completed')
    .gte('created_at', since)
    .is('deleted_at', null);

  const { data: rawMetrics } = await supabase
    .from('content_metrics')
    .select('created_at, opens')
    .eq('workspace_id', workspaceId)
    .eq('channel', 'newsletter')
    .gte('created_at', since);

  const executions = (rawExecutions ?? []) as Pick<PipelineExecutionRow, 'created_at'>[];
  const schedules = (rawSchedules ?? []) as Pick<ContentScheduleRow, 'published_at'>[];
  const metrics = (rawMetrics ?? []) as Pick<ContentMetricRow, 'created_at' | 'opens'>[];

  const execByDay = new Map<string, number>();
  for (const e of executions) {
    const day = toDateKey(String(e.created_at ?? ''));
    if (day) {
      execByDay.set(day, (execByDay.get(day) ?? 0) + 1);
    }
  }

  const pubByDay = new Map<string, number>();
  for (const s of schedules) {
    const day = toDateKey(String(s.published_at ?? ''));
    if (day) {
      pubByDay.set(day, (pubByDay.get(day) ?? 0) + 1);
    }
  }

  const opensByDay = new Map<string, number>();
  for (const m of metrics) {
    const day = toDateKey(String(m.created_at ?? ''));
    if (day) {
      opensByDay.set(day, (opensByDay.get(day) ?? 0) + Number(m.opens ?? 0));
    }
  }

  const now = Date.now();
  const points: TimeseriesPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = toDateKey(new Date(now - (days - 1 - i) * MS_PER_DAY).toISOString());
    points.push({
      date: d,
      executions: execByDay.get(d) ?? 0,
      published: pubByDay.get(d) ?? 0,
      email_opens: opensByDay.get(d) ?? 0,
    });
  }

  return NextResponse.json({ data: { points } });
}
