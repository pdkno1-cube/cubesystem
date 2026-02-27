import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
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

// ---------------------------------------------------------------------------
// Types — FastAPI response
// ---------------------------------------------------------------------------

interface GeneratedMessage {
  agent_id: string;
  agent_role: string;
  message_content: string;
  reasoning: string;
  confidence_score: number;
}

interface GenerateMessagesApiResponse {
  data: {
    messages: GeneratedMessage[];
    round_number: number;
    llm_used: boolean;
  };
}

// ---------------------------------------------------------------------------
// POST — Generate next round of debate messages
// ---------------------------------------------------------------------------

export async function POST(
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

    // 1. Fetch debate
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

    if (debate.status === 'concluded') {
      return NextResponse.json(
        { error: { code: 'DEBATE_CONCLUDED', message: '이미 종료된 토론입니다.' } },
        { status: 400 }
      );
    }

    // 2. Fetch existing messages for context
    const { data: existingMessagesData } = await db
      .from('debate_messages')
      .select('*')
      .eq('debate_id', id)
      .order('sequence_order', { ascending: true });

    const existingMessages = (existingMessagesData ?? []) as DebateMessageRow[];

    // Determine current round & unique agents
    const agentIds = [...new Set(existingMessages.map((m) => m.agent_id))];
    const agentRoleMap: Record<string, string> = {};
    for (const msg of existingMessages) {
      agentRoleMap[msg.agent_id] = msg.agent_role;
    }

    const currentMaxSequence = existingMessages.length > 0
      ? Math.max(...existingMessages.map((m) => m.sequence_order))
      : -1;
    const roundNumber = Math.floor(currentMaxSequence / Math.max(agentIds.length, 1)) + 2;

    // 3. Fetch agent names
    const agentNameMap: Record<string, string> = {};
    if (agentIds.length > 0) {
      const { data: agentsData } = await db
        .from('agents')
        .select('id, name')
        .in('id', agentIds);

      for (const agent of (agentsData ?? []) as Array<{ id: string; name: string }>) {
        agentNameMap[agent.id] = agent.name;
      }
    }

    // Build agents payload for FastAPI
    const agentPayload = agentIds.map((agentId) => ({
      agent_id: agentId,
      agent_role: agentRoleMap[agentId] ?? 'realist',
      agent_name: agentNameMap[agentId] ?? 'Agent',
    }));

    // Build previous messages context
    const previousMessages = existingMessages.map((msg) => ({
      agent_name: agentNameMap[msg.agent_id] ?? 'Agent',
      agent_role: msg.agent_role,
      content: msg.message_content,
    }));

    const startSequenceOrder = currentMaxSequence + 1;

    // 4. Call FastAPI or fallback
    const FASTAPI_URL = process.env.FASTAPI_URL ?? '';
    let aiMessages: GeneratedMessage[] | null = null;

    if (FASTAPI_URL) {
      try {
        const fastapiRes = await fetch(
          `${FASTAPI_URL}/orchestrate/debates/generate-messages`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic: debate.topic,
              debate_id: id,
              agents: agentPayload,
              previous_messages: previousMessages,
              round_number: roundNumber,
              start_sequence_order: startSequenceOrder,
            }),
            signal: AbortSignal.timeout(30_000),
          }
        );

        if (fastapiRes.ok) {
          const fastapiJson = (await fastapiRes.json()) as GenerateMessagesApiResponse;
          aiMessages = fastapiJson.data.messages;
        } else {
          Sentry.captureMessage(
            `Debate next-round FastAPI returned ${fastapiRes.status}`,
            'warning'
          );
        }
      } catch (fastapiErr) {
        Sentry.captureException(fastapiErr, {
          tags: { context: 'debates.[id].POST.fastapi' },
        });
      }
    }

    // 5. Build new messages for DB
    const roles: Array<'optimist' | 'pessimist' | 'realist' | 'critic'> = [
      'optimist',
      'pessimist',
      'realist',
      'critic',
    ];

    const newMessages = agentIds.map((agentId, idx) => {
      const role = agentRoleMap[agentId] ?? roles[idx % roles.length] ?? 'realist';
      const aiMsg = aiMessages?.find(
        (m) => m.agent_id === agentId
      );

      return {
        debate_id: id,
        agent_id: agentId,
        agent_role: role,
        message_content:
          aiMsg?.message_content ??
          `라운드 ${roundNumber}: 토론 주제 "${debate.topic}"에 대해 ${role} 관점에서 추가 의견을 제시합니다.`,
        reasoning: aiMsg?.reasoning ?? `라운드 ${roundNumber} 자동 생성 메시지`,
        confidence_score: aiMsg?.confidence_score ?? 0.5,
        sequence_order: startSequenceOrder + idx,
      };
    });

    const { error: insertError } = await db
      .from('debate_messages')
      .insert(newMessages);

    if (insertError) {
      Sentry.captureException(insertError, {
        tags: { context: 'debates.[id].POST.insertMessages' },
      });
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: insertError.message } },
        { status: 500 }
      );
    }

    // 6. Fetch complete updated messages with agents
    const { data: allMessagesData } = await db
      .from('debate_messages')
      .select('*')
      .eq('debate_id', id)
      .order('sequence_order', { ascending: true });

    const allMessages = (allMessagesData ?? []) as DebateMessageRow[];
    const allAgentIds = [...new Set(allMessages.map((m) => m.agent_id))];
    let fullAgentsMap: Record<string, AgentSummary> = {};

    if (allAgentIds.length > 0) {
      const { data: fullAgentsData } = await db
        .from('agents')
        .select('id, name, icon, category')
        .in('id', allAgentIds);

      const agents = (fullAgentsData ?? []) as AgentSummary[];
      fullAgentsMap = Object.fromEntries(agents.map((a) => [a.id, a]));
    }

    const messagesWithAgent: DebateMessageWithAgent[] = allMessages.map((msg) => ({
      ...msg,
      agent: fullAgentsMap[msg.agent_id] ?? null,
    }));

    const result: DebateDetail = {
      ...debate,
      messages: messagesWithAgent,
    };

    return NextResponse.json({
      data: result,
      meta: {
        round_number: roundNumber,
        new_messages_count: newMessages.length,
        ai_generated: aiMessages !== null,
      },
    });
  } catch (error) {
    return handleApiError(error, 'debates.[id].POST');
  }
}
