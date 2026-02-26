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

// Mock data for dev mode (no Supabase)
function getMockDashboardData(): DashboardData {
  return {
    workspaces: {
      total: 2,
      list: [
        { id: 'ws-001', name: '엉클로지텍', slug: 'uncle-logitech', description: '물류 자동화', icon_url: null, is_active: true, created_at: '2026-03-01', agent_count: 3, active_agents: 2 },
        { id: 'ws-002', name: '디어버블', slug: 'dear-bubble', description: 'F&B 마케팅', icon_url: null, is_active: true, created_at: '2026-03-02', agent_count: 2, active_agents: 1 },
      ],
    },
    agents: {
      total: 6,
      pool: 2,
      active: 3,
      paused: 1,
      category_breakdown: { planning: 2, writing: 1, marketing: 1, audit: 1, ocr: 1 },
    },
    pipelines: {
      running: 1,
      completed: 5,
      error: 0,
      recent: [],
    },
    credits: {
      total_balance: 50000,
      recent_usage: 2350,
    },
    audit_logs: [],
  };
}

export default async function DashboardPage() {
  let dashboardData: DashboardData;

  try {
    const supabase = await createClient();

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
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(10),

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

    const workspaces = (workspacesResult.data ?? []) as unknown as WorkspaceBasic[];
    const agents = (agentsResult.data ?? []) as unknown as AgentBasic[];
    const assignments = (assignmentsResult.data ?? []) as unknown as AssignmentBasic[];
    const pipelineExecs = (pipelineExecsResult.data ?? []) as unknown as PipelineExecution[];
    const creditTxs = (creditsResult.data ?? []) as unknown as CreditTx[];
    const auditLogs = (auditLogsResult.data ?? []) as unknown as AuditLog[];

    const assignedAgentIds = new Set(assignments.map((a) => a.agent_id));
    const poolCount = agents.filter((a) => !assignedAgentIds.has(a.id)).length;
    const activeCount = assignments.filter(
      (a) => a.status === 'idle' || a.status === 'running'
    ).length;
    const pausedCount = assignments.filter(
      (a) => a.status === 'paused' || a.status === 'error'
    ).length;

    const categoryBreakdown: Record<string, number> = {};
    for (const agent of agents) {
      categoryBreakdown[agent.category] = (categoryBreakdown[agent.category] ?? 0) + 1;
    }

    const runningPipelines = pipelineExecs.filter(
      (e) => e.status === 'running' || e.status === 'pending'
    ).length;
    const completedPipelines = pipelineExecs.filter(
      (e) => e.status === 'completed'
    ).length;
    const errorPipelines = pipelineExecs.filter(
      (e) => e.status === 'failed'
    ).length;

    const latestBalances = new Map<string, number>();
    for (const tx of creditTxs) {
      if (!latestBalances.has(tx.workspace_id)) {
        latestBalances.set(tx.workspace_id, tx.balance_after);
      }
    }
    let totalCredits = 0;
    for (const balance of latestBalances.values()) {
      totalCredits += balance;
    }
    const recentUsage = creditTxs
      .filter((tx) => tx.transaction_type === 'usage')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

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

    dashboardData = {
      workspaces: {
        total: workspaces.length,
        list: workspacesWithMeta.slice(0, 6),
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
        recent: pipelineExecs,
      },
      credits: {
        total_balance: totalCredits,
        recent_usage: recentUsage,
      },
      audit_logs: auditLogs,
    };
  } catch {
    // Supabase 미연결 시 mock 데이터 사용
    dashboardData = getMockDashboardData();
  }

  return <DashboardClient data={dashboardData} />;
}
