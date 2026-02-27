import * as Sentry from '@sentry/nextjs';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { WorkspaceDetailClient } from './workspace-detail';
import type { WorkspaceWithStats, WorkspaceCategory, WorkspaceIcon } from '@/types/workspace';
import type { Database } from '@/types/database';

type AgentAssignment = Database['public']['Tables']['agent_assignments']['Row'];
type PipelineExecution = Database['public']['Tables']['pipeline_executions']['Row'];
type CreditTransaction = Database['public']['Tables']['credits']['Row'];

interface WorkspaceDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkspaceDetailPage({
  params,
}: WorkspaceDetailPageProps) {
  const { id } = await params;

  let workspaceWithStats: WorkspaceWithStats;
  let agents: AgentAssignment[] = [];
  let pipelines: PipelineExecution[] = [];
  let credits: CreditTransaction[] = [];

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      notFound();
    }

    const { data: rawWorkspace, error: wsError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .single();

    if (wsError || !rawWorkspace) {
      notFound();
    }

    const workspace = rawWorkspace as Record<string, unknown>;

    if (workspace.deleted_at) {
      notFound();
    }

    const [
      { data: rawAgents },
      { data: rawPipelines },
      { data: rawCredits },
      { count: activePipelineCount },
      { count: memberCount },
    ] = await Promise.all([
      supabase
        .from('agent_assignments')
        .select('*')
        .eq('workspace_id', id)
        .eq('is_active', true),
      supabase
        .from('pipeline_executions')
        .select('*')
        .eq('workspace_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('credits')
        .select('*')
        .eq('workspace_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('pipeline_executions')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', id)
        .in('status', ['pending', 'running']),
      supabase
        .from('workspace_members')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', id)
        .is('deleted_at', null),
    ]);

    agents = (rawAgents ?? []) as AgentAssignment[];
    pipelines = (rawPipelines ?? []) as PipelineExecution[];
    credits = (rawCredits ?? []) as CreditTransaction[];

    const settings = workspace.settings as Record<string, unknown> | null;
    const firstCredit = credits[0] as Record<string, unknown> | undefined;
    const creditBalance = firstCredit ? Number(firstCredit.balance_after) : 0;

    workspaceWithStats = {
      ...workspace,
      agent_count: agents.length,
      active_pipeline_count: activePipelineCount ?? 0,
      credit_balance: creditBalance,
      member_count: memberCount ?? 0,
      category: (settings?.category as WorkspaceCategory | undefined) ?? undefined,
      icon: (settings?.icon as WorkspaceIcon | undefined) ?? undefined,
    } as WorkspaceWithStats;
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'workspaces.detail.page.load' } });
    // Supabase 미연결 시 mock 데이터
    workspaceWithStats = {
      id, name: '엉클로지텍 (Mock)', slug: 'mock-workspace', description: 'Supabase 미연결 - Mock 데이터',
      icon_url: null, owner_id: 'user-001', status: 'active', is_active: true,
      settings: { category: 'logistics', icon: 'Truck' },
      created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z', deleted_at: null,
      agent_count: 3, active_pipeline_count: 1, credit_balance: 28500, member_count: 1,
      category: 'logistics', icon: 'Truck',
    };
  }

  return (
    <WorkspaceDetailClient
      workspace={workspaceWithStats}
      agents={agents}
      pipelines={pipelines}
      credits={credits}
    />
  );
}
