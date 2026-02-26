import { NextResponse } from 'next/server';
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

export async function GET() {
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

    // Parallel fetch all dashboard data
    const [
      workspacesResult,
      agentsResult,
      assignmentsResult,
      pipelineExecsResult,
      creditsResult,
      auditLogsResult,
    ] = await Promise.all([
      supabase
        .from('workspaces')
        .select('id, name, slug, description, icon_url, is_active, created_at')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(10),

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
          pipelines:pipeline_id(id, name, slug, category),
          workspaces:workspace_id(id, name, slug)
        `
        )
        .order('created_at', { ascending: false })
        .limit(5),

      supabase
        .from('credits')
        .select('id, workspace_id, amount, balance_after, transaction_type, created_at')
        .order('created_at', { ascending: false })
        .limit(20),

      supabase
        .from('audit_logs')
        .select('id, action, resource_type, resource_id, details, severity, user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    // Process workspace data
    const workspaces = (workspacesResult.data ?? []) as unknown as WorkspaceRow[];
    const agents = (agentsResult.data ?? []) as unknown as AgentBasic[];
    const assignments = (assignmentsResult.data ?? []) as unknown as AssignmentBasic[];
    const pipelineExecs = (pipelineExecsResult.data ?? []) as unknown as PipelineExecRow[];
    const creditTransactions = (creditsResult.data ?? []) as unknown as CreditRow[];
    const auditLogs = (auditLogsResult.data ?? []) as unknown as AuditLogRow[];

    // Enrich workspaces with agent counts
    const workspacesWithMeta = workspaces.map((ws) => {
      const wsAssignments = assignments.filter((a) => a.workspace_id === ws.id);
      return {
        ...ws,
        agent_count: wsAssignments.length,
        active_agents: wsAssignments.filter(
          (a) => a.status === 'running' || a.status === 'idle'
        ).length,
      };
    });

    // Agent pool summary
    const totalAgents = agents.length;
    const assignedAgentIds = new Set(assignments.map((a) => a.agent_id));
    const poolAgents = agents.filter((a) => !assignedAgentIds.has(a.id)).length;
    const activeAgents = assignments.filter(
      (a) => a.status === 'idle' || a.status === 'running'
    ).length;
    const pausedAgents = assignments.filter(
      (a) => a.status === 'paused' || a.status === 'error'
    ).length;

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {};
    for (const agent of agents) {
      categoryBreakdown[agent.category] =
        (categoryBreakdown[agent.category] ?? 0) + 1;
    }

    // Pipeline execution summary
    const runningPipelines = pipelineExecs.filter(
      (e) => e.status === 'running' || e.status === 'pending'
    ).length;
    const completedPipelines = pipelineExecs.filter(
      (e) => e.status === 'completed'
    ).length;
    const errorPipelines = pipelineExecs.filter(
      (e) => e.status === 'failed'
    ).length;

    // Credits summary
    const latestBalances = new Map<string, number>();
    for (const tx of creditTransactions) {
      if (!latestBalances.has(tx.workspace_id)) {
        latestBalances.set(tx.workspace_id, tx.balance_after);
      }
    }
    let totalCredits = 0;
    for (const balance of latestBalances.values()) {
      totalCredits += balance;
    }

    const recentUsage = creditTransactions
      .filter((tx) => tx.transaction_type === 'usage')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    return NextResponse.json({
      data: {
        workspaces: {
          total: workspaces.length,
          list: workspacesWithMeta.slice(0, 6),
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
          recent: pipelineExecs,
        },
        credits: {
          total_balance: totalCredits,
          recent_usage: recentUsage,
        },
        audit_logs: auditLogs,
      },
    });
  } catch (error) {
    return handleApiError(error, "dashboard.GET");
  }
}
