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

        // ── Batch: fetch ALL debate_messages in one query ──────────────
        const debateIds = debateRows.map((d) => d.id);

        if (debateIds.length > 0) {
          const { data: allMessages } = await supabase
            .from('debate_messages')
            .select('debate_id, agent_id')
            .in('debate_id', debateIds);

          const messageRows = (allMessages ?? []) as unknown as Array<{
            debate_id: string;
            agent_id: string;
          }>;

          // Group messages by debate_id
          const messagesByDebate = new Map<
            string,
            Array<{ debate_id: string; agent_id: string }>
          >();
          for (const msg of messageRows) {
            const existing = messagesByDebate.get(msg.debate_id) ?? [];
            existing.push(msg);
            messagesByDebate.set(msg.debate_id, existing);
          }

          // ── Batch: fetch ALL unique agents in one query ──────────────
          const allAgentIds = [...new Set(messageRows.map((m) => m.agent_id))];
          const agentMap = new Map<string, AgentSummary>();

          if (allAgentIds.length > 0) {
            const { data: agentsData } = await supabase
              .from('agents')
              .select('id, name, icon, category')
              .in('id', allAgentIds);

            for (const agent of (agentsData ?? []) as AgentSummary[]) {
              agentMap.set(agent.id, agent);
            }
          }

          // ── Map: assemble DebateListItem from in-memory data ─────────
          for (const debate of debateRows) {
            const debateMessages = messagesByDebate.get(debate.id) ?? [];
            const uniqueIds = [...new Set(debateMessages.map((m) => m.agent_id))];
            const debateAgents = uniqueIds
              .map((aid) => agentMap.get(aid))
              .filter((a): a is AgentSummary => a !== undefined);

            debates.push({
              id: debate.id,
              workspace_id: debate.workspace_id,
              topic: debate.topic,
              status: debate.status,
              summary: debate.summary,
              conclusion: debate.conclusion,
              created_at: debate.created_at,
              agents: debateAgents,
              message_count: debateMessages.length,
            });
          }
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
