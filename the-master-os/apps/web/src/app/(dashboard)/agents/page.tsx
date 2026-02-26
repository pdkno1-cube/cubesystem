import { createClient } from '@/lib/supabase/server';
import { AgentPoolClient } from './agent-pool';
import type { Database } from '@/types/database';

type AgentRow = Database['public']['Tables']['agents']['Row'];
type AssignmentRow = Database['public']['Tables']['agent_assignments']['Row'];

type AgentWithAssignment = AgentRow & {
  agent_assignments?: Array<
    AssignmentRow & {
      workspaces?: {
        id: string;
        name: string;
        slug: string;
      } | null;
    }
  >;
};

interface SimpleWorkspace {
  id: string;
  name: string;
  slug: string;
}

export default async function AgentsPage() {
  let agents: AgentWithAssignment[] = [];
  let workspaces: SimpleWorkspace[] = [];

  try {
    const supabase = await createClient();

    const { data: agentsData } = await supabase
      .from('agents')
      .select(
        `
        *,
        agent_assignments!left(
          id,
          workspace_id,
          status,
          is_active,
          position_x,
          position_y,
          workspaces:workspace_id(id, name, slug)
        )
      `
      )
      .order('created_at', { ascending: false });

    const { data: workspacesData } = await supabase
      .from('workspaces')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('name', { ascending: true });

    agents = (agentsData ?? []) as AgentWithAssignment[];
    workspaces = (workspacesData ?? []) as SimpleWorkspace[];
  } catch {
    // Supabase 미연결 시 mock 데이터
    agents = [
      { id: 'agent-001', name: '기획 에이전트', display_name: '기획 에이전트', slug: 'planner', description: '사업계획서 및 전략 문서 작성', icon: null, category: 'planning', model_provider: 'anthropic', model: 'claude-sonnet-4-6', system_prompt: '', parameters: {}, is_system: true, is_active: true, cost_per_run: 150, created_by: null, created_at: '2026-03-01', updated_at: '2026-03-01', deleted_at: null, agent_assignments: [] },
      { id: 'agent-002', name: '마케팅 에이전트', display_name: '마케팅 에이전트', slug: 'marketer', description: '콘텐츠 생성 및 마케팅 자동화', icon: null, category: 'marketing', model_provider: 'openai', model: 'gpt-4o', system_prompt: '', parameters: {}, is_system: true, is_active: true, cost_per_run: 120, created_by: null, created_at: '2026-03-01', updated_at: '2026-03-01', deleted_at: null, agent_assignments: [] },
      { id: 'agent-003', name: 'OCR 에이전트', display_name: 'OCR 에이전트', slug: 'ocr-agent', description: '문서 스캔 및 데이터 추출', icon: null, category: 'ocr', model_provider: 'local', model: 'paddleocr', system_prompt: '', parameters: {}, is_system: true, is_active: true, cost_per_run: 50, created_by: null, created_at: '2026-03-01', updated_at: '2026-03-01', deleted_at: null, agent_assignments: [] },
      { id: 'agent-004', name: '감사 에이전트', display_name: '감사 에이전트', slug: 'auditor', description: '재무/규정 감사 자동화', icon: null, category: 'audit', model_provider: 'anthropic', model: 'claude-sonnet-4-6', system_prompt: '', parameters: {}, is_system: true, is_active: true, cost_per_run: 200, created_by: null, created_at: '2026-03-01', updated_at: '2026-03-01', deleted_at: null, agent_assignments: [] },
    ] as AgentWithAssignment[];
    workspaces = [
      { id: 'ws-001', name: '엉클로지텍', slug: 'uncle-logitech' },
      { id: 'ws-002', name: '디어버블', slug: 'dear-bubble' },
    ];
  }

  return (
    <AgentPoolClient
      initialAgents={agents}
      workspaces={workspaces}
    />
  );
}
