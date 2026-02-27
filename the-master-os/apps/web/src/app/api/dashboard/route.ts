import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/api-response';

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

interface CreditRow {
  id: string;
  workspace_id: string;
  amount: number;
  balance_after: number;
  transaction_type: string;
  created_at: string;
}

interface AuditLogRow {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  severity: string;
  user_id: string | null;
  created_at: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_url: string | null;
  is_active: boolean;
  created_at: string;
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
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
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

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 },
      );
    }

    const todayRange = getTodayRange();
    const weekRange = getWeekRange();

    // Parallel fetch all dashboard data
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
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(12),

      supabase
        .from('agents')
        .select('id, name, category, is_active')
        .is('deleted_at', null),

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
        .eq('status', 'published')
        .gte('scheduled_at', weekRange.start)
        .lt('scheduled_at', weekRange.end),

      checkFastapiHealth(),
    ]);

    // Process workspace data
    const workspaces = (workspacesResult.data ?? []) as WorkspaceRow[];
    const agents = (agentsResult.data ?? []) as AgentBasic[];
    const assignments = (assignmentsResult.data ?? []) as AssignmentBasic[];
    // Relations inferred as arrays by PostgREST parser, needs double cast
    const pipelineExecs = (pipelineExecsResult.data ?? []) as unknown as PipelineExecRow[];
    const creditTransactions = (creditsResult.data ?? []) as CreditRow[];
    const auditLogs = (auditLogsResult.data ?? []) as AuditLogRow[];
    const mcpConnections = (mcpConnectionsResult.data ?? []) as McpConnectionRow[];
    const contentSchedules = (contentSchedulesResult.data ?? []) as ContentScheduleRow[];
    const todayPipelineCount = todayPipelineCountResult.count ?? 0;

    // Credit balances per workspace
    const latestBalances = new Map<string, number>();
    for (const tx of creditTransactions) {
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

    // Enrich workspaces with agent counts, pipeline stats, credit balance
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

    // Agent pool summary
    const totalAgents = agents.length;
    const assignedAgentIds = new Set(assignments.map((a) => a.agent_id));
    const poolAgents = agents.filter((a) => !assignedAgentIds.has(a.id)).length;
    const activeAgents = assignments.filter(
      (a) => a.status === 'idle' || a.status === 'running',
    ).length;
    const pausedAgents = assignments.filter(
      (a) => a.status === 'paused' || a.status === 'error',
    ).length;

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {};
    for (const agent of agents) {
      categoryBreakdown[agent.category] =
        (categoryBreakdown[agent.category] ?? 0) + 1;
    }

    // Pipeline execution summary
    const runningPipelines = pipelineExecs.filter(
      (e) => e.status === 'running' || e.status === 'pending',
    ).length;
    const completedPipelines = pipelineExecs.filter(
      (e) => e.status === 'completed',
    ).length;
    const errorPipelines = pipelineExecs.filter(
      (e) => e.status === 'failed',
    ).length;

    // Credits summary
    let totalCredits = 0;
    for (const balance of latestBalances.values()) {
      totalCredits += balance;
    }
    const recentUsage = creditTransactions
      .filter((tx) => tx.transaction_type === 'usage')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    // MCP health summary
    const mcpTotal = mcpConnections.length;
    const mcpConnected = mcpConnections.filter(
      (c) => c.health_status === 'healthy' || c.health_status === 'active',
    ).length;

    // Supabase is healthy if we got this far
    const supabaseHealth: 'healthy' | 'unhealthy' = 'healthy';

    return NextResponse.json({
      data: {
        workspaces: {
          total: workspaces.length,
          list: workspacesWithMeta.slice(0, 12),
        },
        agents: {
          total: totalAgents,
          pool: poolAgents,
          active: activeAgents,
          paused: pausedAgents,
          category_breakdown: categoryBreakdown,
        },
        pipelines: {
          running: runningPipelines,
          completed: completedPipelines,
          error: errorPipelines,
          today_executions: todayPipelineCount,
          recent: pipelineExecs.slice(0, 5),
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
          supabase: supabaseHealth,
          mcp: {
            connected: mcpConnected,
            total: mcpTotal,
          },
        },
        audit_logs: auditLogs,
      },
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'dashboard.GET' } });
    return handleApiError(error, 'dashboard.GET');
  }
}
