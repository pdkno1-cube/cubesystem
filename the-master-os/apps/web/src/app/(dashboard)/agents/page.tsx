import * as Sentry from '@sentry/nextjs';
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
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'agents.page.load' } });
    agents = [];
    workspaces = [];
  }

  return (
    <AgentPoolClient
      initialAgents={agents}
      workspaces={workspaces}
    />
  );
}
