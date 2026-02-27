import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { DebatesClient } from './debates-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentSummary {
  id: string;
  name: string;
  icon: string | null;
  category: string;
}

interface DebateRow {
  id: string;
  workspace_id: string;
  topic: string;
  status: string;
  summary: string | null;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
}

export interface DebateListItem {
  id: string;
  workspace_id: string;
  topic: string;
  status: string;
  summary: string | null;
  conclusion: string | null;
  created_at: string;
  agents: AgentSummary[];
  message_count: number;
}

// ---------------------------------------------------------------------------
// Server Component
// ---------------------------------------------------------------------------

export default async function DebatesPage() {
  const debates: DebateListItem[] = [];
  let workspaceId = '';
  let agents: AgentSummary[] = [];

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Get primary workspace
      const { data: workspacesData } = await supabase
        .from('workspaces')
        .select('id')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1);

      if (workspacesData && workspacesData.length > 0) {
        workspaceId = workspacesData[0]?.id ?? '';
      }

      // Fetch debates directly from Supabase
      if (workspaceId) {
        const { data: debatesData } = await supabase
          .from('persona_debates')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(50);

        const debateRows = (debatesData ?? []) as unknown as DebateRow[];

        // For each debate, enrich with agent info + message count
        for (const debate of debateRows) {
          const { data: messages } = await supabase
            .from('debate_messages')
            .select('agent_id')
            .eq('debate_id', debate.id);

          const messageRows = (messages ?? []) as unknown as Array<{ agent_id: string }>;
          const uniqueAgentIds = [...new Set(messageRows.map((m) => m.agent_id))];

          let debateAgents: AgentSummary[] = [];
          if (uniqueAgentIds.length > 0) {
            const { data: agentsData } = await supabase
              .from('agents')
              .select('id, name, icon, category')
              .in('id', uniqueAgentIds);

            debateAgents = (agentsData ?? []) as AgentSummary[];
          }

          debates.push({
            id: debate.id,
            workspace_id: debate.workspace_id,
            topic: debate.topic,
            status: debate.status,
            summary: debate.summary,
            conclusion: debate.conclusion,
            created_at: debate.created_at,
            agents: debateAgents,
            message_count: messageRows.length,
          });
        }
      }

      // Fetch all agents for the "new debate" dialog
      const { data: agentsData } = await supabase
        .from('agents')
        .select('id, name, icon, category')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name', { ascending: true });

      agents = (agentsData ?? []) as AgentSummary[];
    }
  } catch (error) {
    Sentry.captureException(error, { tags: { context: 'debates.page.load' } });
  }

  return (
    <DebatesClient
      initialDebates={debates}
      workspaceId={workspaceId}
      availableAgents={agents}
    />
  );
}
