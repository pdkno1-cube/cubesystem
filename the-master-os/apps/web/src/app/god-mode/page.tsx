import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { GodModeCanvas } from '@/app/(dashboard)/dashboard/god-mode-canvas';
import type { WorkspaceOverview, CanvasAgent } from '@/app/(dashboard)/dashboard/types';

// Same data fetching logic as dashboard but simplified
export default async function GodModePage() {
  let workspaces: WorkspaceOverview[] = [];
  let agentPool = 0;

  try {
    const supabase = await createClient();

    const [wsResult, agentsResult, assignmentsResult] = await Promise.all([
      supabase.from('workspaces').select('id, name, slug, description, icon_url, is_active, created_at').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('agents').select('id, name, category, model, is_active'),
      supabase.from('agent_assignments').select('id, agent_id, workspace_id, status, is_active').eq('is_active', true),
    ]);

    const wsData = wsResult.data ?? [];
    const agentsData = agentsResult.data ?? [];
    const assignmentsData = assignmentsResult.data ?? [];

    const assignedAgentIds = new Set(assignmentsData.map((a) => a.agent_id));
    agentPool = agentsData.filter((a) => !assignedAgentIds.has(a.id)).length;

    const wsAgentsMap = new Map<string, CanvasAgent[]>();
    for (const assignment of assignmentsData) {
      const agent = agentsData.find((a) => a.id === assignment.agent_id);
      if (!agent) { continue; }
      const list = wsAgentsMap.get(assignment.workspace_id) ?? [];
      list.push({
        id: agent.id,
        name: agent.name,
        model: (agent.model as string | null) ?? 'claude-sonnet-4-6',
        category: agent.category,
        status: (assignment.status === 'running' ? 'running'
          : assignment.status === 'idle' ? 'idle'
          : assignment.status === 'paused' ? 'paused' : 'error') as CanvasAgent['status'],
      });
      wsAgentsMap.set(assignment.workspace_id, list);
    }

    workspaces = wsData.map((ws) => ({
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      description: ws.description,
      icon_url: ws.icon_url,
      is_active: ws.is_active,
      created_at: ws.created_at,
      agent_count: (wsAgentsMap.get(ws.id) ?? []).length,
      active_agents: (wsAgentsMap.get(ws.id) ?? []).filter((a) => a.status === 'idle' || a.status === 'running').length,
      pipeline_queued: 0,
      pipeline_running: 0,
      pipeline_completed: 0,
      pipeline_error: 0,
      credit_balance: 0,
      assigned_agents: wsAgentsMap.get(ws.id) ?? [],
    }));
  } catch (err) {
    Sentry.captureException(err, { tags: { context: 'god-mode.page.load' } });
  }

  return (
    <div className="fixed inset-0 bg-gray-50">
      {/* Header bar */}
      <div className="absolute left-0 right-0 top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200 bg-white/90 px-6 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            대시보드로
          </Link>
          <div className="h-5 w-px bg-gray-200" />
          <h1 className="text-sm font-bold text-gray-900">God Mode — 조직 시각화</h1>
        </div>
        <p className="text-xs text-gray-400">마우스 휠로 확대/축소 · 노드를 클릭해 법인 이동 · + 버튼으로 에이전트 배정</p>
      </div>

      {/* Canvas */}
      <div className="h-full pt-14">
        <GodModeCanvas workspaces={workspaces} agentPool={agentPool} isFullscreen />
      </div>
    </div>
  );
}
