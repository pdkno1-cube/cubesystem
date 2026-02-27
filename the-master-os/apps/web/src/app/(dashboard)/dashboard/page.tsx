import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { DashboardClient } from './dashboard-client';
import type { DashboardData, PipelineExecution, AuditLog } from './types';

interface AgentBasic {
  id: string;
  name: string;
  category: string;
  is_active: boolean;
}

interface AssignmentBasic {
  id: string;
  agent_id: string;
  workspace_id: string;
  status: string;
  is_active: boolean;
}

interface CreditTx {
  id: string;
  workspace_id: string;
  amount: number;
  balance_after: number;
  transaction_type: string;
  created_at: string;
}

interface WorkspaceBasic {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_url: string | null;
  is_active: boolean;
  created_at: string;
}

interface PipelineExecRow {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  total_credits: number;
  created_at: string;
  workspace_id: string;
  pipelines: { id: string; name: string; slug: string; category: string } | null;
  workspaces: { id: string; name: string; slug: string } | null;
}

interface McpConnectionRow {
  id: string;
  provider: string;
  is_active: boolean;
  health_status: string | null;
}

interface ContentScheduleRow {
  id: string;
  status: string;
  scheduled_at: string;
}

function getTodayRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function checkFastapiHealth(): Promise<'healthy' | 'unhealthy' | 'unknown'> {
  const fastapiUrl = process.env.FASTAPI_URL ?? '';
  if (!fastapiUrl) {
    return 'unknown';
  }
  try {
    const res = await fetch(`${fastapiUrl}/orchestrate/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    if (!res.ok) {
      return 'unhealthy';
    }
    const data = (await res.json()) as { status?: string };
    return data.status === 'healthy' ? 'healthy' : 'unhealthy';
  } catch {
    return 'unhealthy';
  }
}

function getEmptyDashboardData(): DashboardData {
  return {
    workspaces: { total: 0, list: [] },
    agents: { total: 0, pool: 0, active: 0, paused: 0, category_breakdown: {} },
    pipelines: { running: 0, completed: 0, error: 0, today_executions: 0, recent: [] },
    credits: { total_balance: 0, recent_usage: 0 },
    content: { published_this_week: 0 },
    system_health: { fastapi: 'unknown', supabase: 'unhealthy', mcp: { connected: 0, total: 0 } },
    audit_logs: [],
  };
}

export default async function DashboardPage() {
  let dashboardData: DashboardData;

  try {
    const supabase = await createClient();
    const todayRange = getTodayRange();
    const weekRange = getWeekRange();

    const [
      workspacesResult,
      agentsResult,
      assignmentsResult,
      pipelineExecsResult,
      todayPipelineCountResult,
      creditsResult,
      auditLogsResult,
      mcpConnectionsResult,
      contentSchedulesResult,
      fastapiHealthStatus,
    ] = await Promise.all([
      supabase
        .from('workspaces')
        .select('id, name, slug, description, icon_url, is_active, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(12),

      supabase
        .from('agents')
        .select('id, name, category, is_active'),

      supabase
        .from('agent_assignments')
        .select('id, agent_id, workspace_id, status, is_active')
        .eq('is_active', true),

      supabase
        .from('pipeline_executions')
        .select(
          `
          id,
          status,
          started_at,
          completed_at,
          total_credits,
          created_at,
          workspace_id,
          pipelines:pipeline_id(id, name, slug, category),
          workspaces:workspace_id(id, name, slug)
        `,
        )
        .order('created_at', { ascending: false })
        .limit(20),

      supabase
        .from('pipeline_executions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayRange.start)
        .lt('created_at', todayRange.end),

      supabase
        .from('credits')
        .select('id, workspace_id, amount, balance_after, transaction_type, created_at')
        .order('created_at', { ascending: false })
        .limit(50),

      supabase
        .from('audit_logs')
        .select('id, action, resource_type, resource_id, details, severity, user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(10),

      supabase
        .from('mcp_connections')
        .select('id, provider, is_active, health_status')
        .eq('is_active', true)
        .is('deleted_at', null),

      supabase
        .from('content_schedules')
        .select('id, status, scheduled_at')
        .in('status', ['published', 'completed'])
        .gte('scheduled_at', weekRange.start)
        .lt('scheduled_at', weekRange.end),

      checkFastapiHealth(),
    ]);

    const workspaces = (workspacesResult.data ?? []) as unknown as WorkspaceBasic[];
    const agents = (agentsResult.data ?? []) as unknown as AgentBasic[];
    const assignments = (assignmentsResult.data ?? []) as unknown as AssignmentBasic[];
    const pipelineExecs = (pipelineExecsResult.data ?? []) as unknown as PipelineExecRow[];
    const creditTxs = (creditsResult.data ?? []) as unknown as CreditTx[];
    const auditLogs = (auditLogsResult.data ?? []) as unknown as AuditLog[];
    const mcpConnections = (mcpConnectionsResult.data ?? []) as unknown as McpConnectionRow[];
    const contentSchedules = (contentSchedulesResult.data ?? []) as unknown as ContentScheduleRow[];
    const todayPipelineCount = todayPipelineCountResult.count ?? 0;

    // Credit balances per workspace
    const latestBalances = new Map<string, number>();
    for (const tx of creditTxs) {
      if (!latestBalances.has(tx.workspace_id)) {
        latestBalances.set(tx.workspace_id, tx.balance_after);
      }
    }

    // Pipeline stats per workspace
    const wsPipelineStats = new Map<string, { queued: number; running: number; completed: number; error: number }>();
    for (const exec of pipelineExecs) {
      const wsId = exec.workspace_id;
      if (!wsId) {
        continue;
      }
      const stats = wsPipelineStats.get(wsId) ?? { queued: 0, running: 0, completed: 0, error: 0 };
      if (exec.status === 'pending') {
        stats.queued += 1;
      } else if (exec.status === 'running') {
        stats.running += 1;
      } else if (exec.status === 'completed') {
        stats.completed += 1;
      } else if (exec.status === 'failed') {
        stats.error += 1;
      }
      wsPipelineStats.set(wsId, stats);
    }

    const assignedAgentIds = new Set(assignments.map((a) => a.agent_id));
    const poolCount = agents.filter((a) => !assignedAgentIds.has(a.id)).length;
    const activeCount = assignments.filter(
      (a) => a.status === 'idle' || a.status === 'running',
    ).length;
    const pausedCount = assignments.filter(
      (a) => a.status === 'paused' || a.status === 'error',
    ).length;

    const categoryBreakdown: Record<string, number> = {};
    for (const agent of agents) {
      categoryBreakdown[agent.category] = (categoryBreakdown[agent.category] ?? 0) + 1;
    }

    const runningPipelines = pipelineExecs.filter(
      (e) => e.status === 'running' || e.status === 'pending',
    ).length;
    const completedPipelines = pipelineExecs.filter(
      (e) => e.status === 'completed',
    ).length;
    const errorPipelines = pipelineExecs.filter(
      (e) => e.status === 'failed',
    ).length;

    let totalCredits = 0;
    for (const balance of latestBalances.values()) {
      totalCredits += balance;
    }
    const recentUsage = creditTxs
      .filter((tx) => tx.transaction_type === 'usage')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const workspacesWithMeta = workspaces.map((ws) => {
      const wsAssignments = assignments.filter((a) => a.workspace_id === ws.id);
      const pStats = wsPipelineStats.get(ws.id) ?? { queued: 0, running: 0, completed: 0, error: 0 };
      return {
        ...ws,
        agent_count: wsAssignments.length,
        active_agents: wsAssignments.filter(
          (a) => a.status === 'running' || a.status === 'idle',
        ).length,
        pipeline_queued: pStats.queued,
        pipeline_running: pStats.running,
        pipeline_completed: pStats.completed,
        pipeline_error: pStats.error,
        credit_balance: latestBalances.get(ws.id) ?? 0,
      };
    });

    // MCP health
    const mcpTotal = mcpConnections.length;
    const mcpConnected = mcpConnections.filter(
      (c) => c.health_status === 'healthy' || c.health_status === 'active',
    ).length;

    dashboardData = {
      workspaces: {
        total: workspaces.length,
        list: workspacesWithMeta.slice(0, 12),
      },
      agents: {
        total: agents.length,
        pool: poolCount,
        active: activeCount,
        paused: pausedCount,
        category_breakdown: categoryBreakdown,
      },
      pipelines: {
        running: runningPipelines,
        completed: completedPipelines,
        error: errorPipelines,
        today_executions: todayPipelineCount,
        recent: pipelineExecs.slice(0, 5) as unknown as PipelineExecution[],
      },
      credits: {
        total_balance: totalCredits,
        recent_usage: recentUsage,
      },
      content: {
        published_this_week: contentSchedules.length,
      },
      system_health: {
        fastapi: fastapiHealthStatus,
        supabase: 'healthy',
        mcp: {
          connected: mcpConnected,
          total: mcpTotal,
        },
      },
      audit_logs: auditLogs,
    };
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'dashboard.page.load' } });
    dashboardData = getEmptyDashboardData();
  }

  return <DashboardClient data={dashboardData} />;
}
