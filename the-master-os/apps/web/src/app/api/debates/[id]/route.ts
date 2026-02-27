import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { untyped } from '@/lib/supabase/untyped';
import { handleApiError } from '@/lib/api-response';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DebateRow {
  id: string;
  workspace_id: string;
  pipeline_execution_id: string | null;
  topic: string;
  status: string;
  summary: string | null;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
}

interface DebateMessageRow {
  id: string;
  debate_id: string;
  agent_id: string;
  agent_role: string;
  message_content: string;
  reasoning: string | null;
  confidence_score: number;
  sequence_order: number;
  created_at: string;
}

interface AgentSummary {
  id: string;
  name: string;
  icon: string | null;
  category: string;
}

interface DebateMessageWithAgent extends DebateMessageRow {
  agent: AgentSummary | null;
}

interface DebateDetail extends DebateRow {
  messages: DebateMessageWithAgent[];
}

// ---------------------------------------------------------------------------
// GET — Debate detail with messages
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const db = untyped(supabase);

    // Fetch debate
    const { data: debateRows, error: debateError } = await db
      .from('persona_debates')
      .select('*')
      .eq('id', id)
      .limit(1);

    if (debateError) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: debateError.message } },
        { status: 500 }
      );
    }

    const debateArr = debateRows as DebateRow[] | null;
    if (!debateArr || debateArr.length === 0) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '토론을 찾을 수 없습니다.' } },
        { status: 404 }
      );
    }

    const debate = debateArr[0]!;

    // Fetch messages ordered by sequence
    const { data: messagesData, error: msgError } = await db
      .from('debate_messages')
      .select('*')
      .eq('debate_id', id)
      .order('sequence_order', { ascending: true });

    if (msgError) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: msgError.message } },
        { status: 500 }
      );
    }

    const messageRows = (messagesData ?? []) as DebateMessageRow[];

    // Fetch all referenced agents
    const agentIds = [...new Set(messageRows.map((m) => m.agent_id))];
    let agentsMap: Record<string, AgentSummary> = {};

    if (agentIds.length > 0) {
      const { data: agentsData } = await db
        .from('agents')
        .select('id, name, icon, category')
        .in('id', agentIds);

      const agents = (agentsData ?? []) as AgentSummary[];
      agentsMap = Object.fromEntries(agents.map((a) => [a.id, a]));
    }

    // Attach agent info to messages
    const messagesWithAgent: DebateMessageWithAgent[] = messageRows.map((msg) => ({
      ...msg,
      agent: agentsMap[msg.agent_id] ?? null,
    }));

    const result: DebateDetail = {
      ...debate,
      messages: messagesWithAgent,
    };

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error, 'debates.[id].GET');
  }
}
