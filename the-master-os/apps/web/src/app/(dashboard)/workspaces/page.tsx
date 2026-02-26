import { createClient } from '@/lib/supabase/server';
import { WorkspaceListClient } from './workspace-list';
import type { WorkspaceWithStats, WorkspaceCategory, WorkspaceIcon } from '@/types/workspace';

export default async function WorkspacesPage() {
  let initialWorkspaces: WorkspaceWithStats[] = [];

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: rawWorkspaces } = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: false });

      const workspaces = (rawWorkspaces ?? []).filter(
        (ws: Record<string, unknown>) => !ws.deleted_at,
      );

      if (workspaces.length > 0) {
        initialWorkspaces = await Promise.all(
          workspaces.map(async (ws: Record<string, unknown>) => {
            const { count: agentCount } = await supabase
              .from('agent_assignments')
              .select('*', { count: 'exact', head: true })
              .eq('workspace_id', ws.id as string)
              .eq('is_active', true);

            const { count: pipelineCount } = await supabase
              .from('pipeline_executions')
              .select('*', { count: 'exact', head: true })
              .eq('workspace_id', ws.id as string)
              .in('status', ['pending', 'running']);

            const { data: creditData } = await supabase
              .from('credits')
              .select('balance_after')
              .eq('workspace_id', ws.id as string)
              .order('created_at', { ascending: false })
              .limit(1);

            const settings = ws.settings as Record<string, unknown> | null;

            return {
              ...ws,
              agent_count: agentCount ?? 0,
              active_pipeline_count: pipelineCount ?? 0,
              credit_balance:
                creditData && creditData.length > 0
                  ? (creditData[0]?.balance_after ?? 0)
                  : 0,
              category: (settings?.category as WorkspaceCategory | undefined) ?? undefined,
              icon: (settings?.icon as WorkspaceIcon | undefined) ?? undefined,
            } as WorkspaceWithStats;
          }),
        );
      }
    }
  } catch {
    // Supabase 미연결 시 mock 데이터
    initialWorkspaces = [
      {
        id: 'ws-001', name: '엉클로지텍', slug: 'uncle-logitech', description: '물류/유통 자동화 법인',
        icon_url: null, owner_id: 'user-001', is_active: true, settings: { category: 'logistics', icon: 'Truck' },
        created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z', deleted_at: null,
        agent_count: 3, active_pipeline_count: 1, credit_balance: 28500, category: 'logistics', icon: 'Truck',
      },
      {
        id: 'ws-002', name: '디어버블', slug: 'dear-bubble', description: 'F&B 브랜드 마케팅',
        icon_url: null, owner_id: 'user-001', is_active: true, settings: { category: 'fnb', icon: 'UtensilsCrossed' },
        created_at: '2026-03-02T00:00:00Z', updated_at: '2026-03-02T00:00:00Z', deleted_at: null,
        agent_count: 2, active_pipeline_count: 0, credit_balance: 14200, category: 'fnb', icon: 'UtensilsCrossed',
      },
    ];
  }

  return <WorkspaceListClient initialWorkspaces={initialWorkspaces} />;
}
