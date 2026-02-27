import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { untyped } from '@/lib/supabase/untyped';
import { handleApiError } from '@/lib/api-response';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const debateFilterSchema = z.object({
  workspace_id: z.string().uuid().optional(),
  status: z.enum(['active', 'concluded', 'all']).optional().default('all'),
});

const createDebateSchema = z.object({
  workspace_id: z.string().uuid(),
  topic: z.string().min(1).max(500),
  agent_ids: z.array(z.string().uuid()).min(2).max(8),
});

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

interface AgentSummary {
  id: string;
  name: string;
  icon: string | null;
  category: string;
}

interface DebateWithAgents extends DebateRow {
  agents: AgentSummary[];
  message_count: number;
}

// ---------------------------------------------------------------------------
// GET — List debates
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const parsed = debateFilterSchema.safeParse({
      workspace_id: searchParams.get('workspace_id') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const filter = parsed.data;
    const db = untyped(supabase);

    let query = db
      .from('persona_debates')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter.workspace_id) {
      query = query.eq('workspace_id', filter.workspace_id);
    }

    if (filter.status !== 'all') {
      query = query.eq('status', filter.status);
    }

    const { data: debates, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    const debateRows = (debates ?? []) as DebateRow[];

    // For each debate, fetch message count + participating agents
    const debatesWithAgents: DebateWithAgents[] = [];

    for (const debate of debateRows) {
      const { data: messages } = await db
        .from('debate_messages')
        .select('agent_id')
        .eq('debate_id', debate.id);

      const messageRows = (messages ?? []) as Array<{ agent_id: string }>;
      const uniqueAgentIds = [...new Set(messageRows.map((m) => m.agent_id))];

      let agents: AgentSummary[] = [];
      if (uniqueAgentIds.length > 0) {
        const { data: agentsData } = await db
          .from('agents')
          .select('id, name, icon, category')
          .in('id', uniqueAgentIds);

        agents = (agentsData ?? []) as AgentSummary[];
      }

      debatesWithAgents.push({
        ...debate,
        agents,
        message_count: messageRows.length,
      });
    }

    return NextResponse.json({ data: debatesWithAgents });
  } catch (error) {
    return handleApiError(error, 'debates.GET');
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
// POST — Create a new debate (with AI message generation)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
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

    const body: unknown = await request.json();
    const parsed = createDebateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { workspace_id, topic, agent_ids } = parsed.data;
    const db = untyped(supabase);

    // Create debate row
    const { data: debateRows, error: debateError } = await db
      .from('persona_debates')
      .insert({
        workspace_id,
        topic,
        status: 'active',
      })
      .select();

    if (debateError || !debateRows || debateRows.length === 0) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: debateError?.message ?? 'Insert failed' } },
        { status: 500 }
      );
    }

    const debate = (debateRows as DebateRow[])[0]!;

    // Assign roles to agents (round-robin)
    const roles: Array<'optimist' | 'pessimist' | 'realist' | 'critic'> = [
      'optimist',
      'pessimist',
      'realist',
      'critic',
    ];

    // Fetch agent names for FastAPI request
    const { data: agentsData } = await db
      .from('agents')
      .select('id, name')
      .in('id', agent_ids);

    const agentNameMap: Record<string, string> = {};
    for (const agent of (agentsData ?? []) as Array<{ id: string; name: string }>) {
      agentNameMap[agent.id] = agent.name;
    }

    const agentPayload = agent_ids.map((agentId, idx) => ({
      agent_id: agentId,
      agent_role: roles[idx % roles.length] as string,
      agent_name: agentNameMap[agentId] ?? `Agent ${idx + 1}`,
    }));

    // Try FastAPI for AI-generated messages
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
              topic,
              debate_id: debate.id,
              agents: agentPayload,
              previous_messages: [],
              round_number: 1,
              start_sequence_order: 0,
            }),
            signal: AbortSignal.timeout(30_000),
          }
        );

        if (fastapiRes.ok) {
          const fastapiJson = (await fastapiRes.json()) as GenerateMessagesApiResponse;
          aiMessages = fastapiJson.data.messages;
        } else {
          Sentry.captureMessage(
            `Debate FastAPI returned ${fastapiRes.status}`,
            'warning'
          );
        }
      } catch (fastapiErr) {
        Sentry.captureException(fastapiErr, {
          tags: { context: 'debates.POST.fastapi' },
        });
      }
    }

    // Build messages for DB insertion
    const dbMessages = agent_ids.map((agentId, idx) => {
      const role = roles[idx % roles.length] as string;
      const aiMsg = aiMessages?.find(
        (m) => m.agent_id === agentId && m.agent_role === role
      );

      return {
        debate_id: debate.id,
        agent_id: agentId,
        agent_role: role,
        message_content:
          aiMsg?.message_content ??
          `토론 주제 "${topic}"에 대한 ${role} 관점으로 참여합니다.`,
        reasoning: aiMsg?.reasoning ?? '초기 참여 메시지',
        confidence_score: aiMsg?.confidence_score ?? 0.5,
        sequence_order: idx,
      };
    });

    const { error: msgError } = await db
      .from('debate_messages')
      .insert(dbMessages);

    if (msgError) {
      Sentry.captureException(msgError, {
        tags: { context: 'debates.POST.initialMessages' },
      });
    }

    // Audit log
    await db.from('audit_logs').insert({
      user_id: user.id,
      action: 'debate.create',
      category: 'agent',
      resource_type: 'persona_debate',
      resource_id: debate.id,
      details: {
        topic,
        agent_count: agent_ids.length,
        ai_generated: aiMessages !== null,
      },
      severity: 'info',
    });

    return NextResponse.json({ data: debate }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'debates.POST');
  }
}
