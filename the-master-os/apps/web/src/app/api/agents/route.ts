import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { untyped } from '@/lib/supabase/untyped';
import { handleApiError } from '@/lib/api-response';
import type { Database } from '@/types/database';

type AgentRow = Database['public']['Tables']['agents']['Row'];

interface AgentWithAssignments extends AgentRow {
  agent_assignments: Array<{
    id: string;
    workspace_id: string;
    status: string;
    is_active: boolean;
    position_x: number | null;
    position_y: number | null;
    workspaces: {
      id: string;
      name: string;
      slug: string;
    } | null;
  }>;
}

const agentFilterSchema = z.object({
  status: z.enum(['all', 'pool', 'active', 'paused']).optional().default('all'),
  category: z.string().optional().default('all'),
  workspace_id: z.string().uuid().optional(),
});

const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().nullable().optional(),
  category: z.enum([
    'planning',
    'writing',
    'marketing',
    'audit',
    'devops',
    'ocr',
    'scraping',
    'analytics',
    'finance',
    'general',
  ]),
  model_provider: z
    .enum(['openai', 'anthropic', 'google', 'local'])
    .optional()
    .default('anthropic'),
  model: z.string().min(1).optional().default('claude-sonnet'),
  system_prompt: z.string().min(1),
  parameters: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      max_tokens: z.number().min(1).optional(),
      top_p: z.number().min(0).max(1).optional(),
    })
    .optional()
    .default({}),
  cost_per_run: z.number().min(0).optional().default(1),
});


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
    const parsed = agentFilterSchema.safeParse({
      status: searchParams.get('status') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      workspace_id: searchParams.get('workspace_id') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const filter = parsed.data;

    // Base query: all non-deleted agents
    let query = supabase
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
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // Category filter
    if (filter.category !== 'all') {
      query = query.eq('category', filter.category);
    }

    const { data: rawAgents, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    const agents = (rawAgents ?? []) as unknown as AgentWithAssignments[];

    // Post-process status filter
    let filteredAgents = agents;

    if (filter.status !== 'all') {
      filteredAgents = filteredAgents.filter((agent) => {
        const activeAssignment = agent.agent_assignments?.find(
          (a) => a.is_active
        );

        switch (filter.status) {
          case 'pool':
            return !activeAssignment;
          case 'active':
            return (
              activeAssignment?.status === 'idle' ||
              activeAssignment?.status === 'running'
            );
          case 'paused':
            return (
              activeAssignment?.status === 'paused' ||
              activeAssignment?.status === 'error'
            );
          default:
            return true;
        }
      });
    }

    // Workspace filter
    if (filter.workspace_id) {
      filteredAgents = filteredAgents.filter((agent) => {
        return agent.agent_assignments?.some(
          (a) => a.workspace_id === filter.workspace_id && a.is_active
        );
      });
    }

    return NextResponse.json({ data: filteredAgents });
  } catch (error) {
    return handleApiError(error, "agents.GET");
  }
}

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
    const parsed = createAgentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const agentData = parsed.data;

    // Generate slug from name
    const slug = agentData.name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-|-$/g, '');

    const insertPayload: Database['public']['Tables']['agents']['Insert'] = {
      name: agentData.name,
      display_name: agentData.name,
      slug: `${slug}-${Date.now()}`,
      description: agentData.description ?? null,
      icon: agentData.icon ?? null,
      category: agentData.category,
      model_provider: agentData.model_provider,
      model: agentData.model,
      system_prompt: agentData.system_prompt,
      parameters: agentData.parameters,
      cost_per_run: agentData.cost_per_run,
      is_system: false,
      is_active: true,
      created_by: user.id,
    };

    const db = untyped(supabase);
    const { data: agentRows, error } = await db
      .from('agents')
      .insert(insertPayload)
      .select();

    if (error || !agentRows || agentRows.length === 0) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: error?.message ?? 'Insert failed' } },
        { status: 500 }
      );
    }

    const agent = (agentRows as AgentRow[])[0]!;

    // Audit log
    await db.from('audit_logs').insert({
      user_id: user.id,
      action: 'agent.create',
      category: 'agent',
      resource_type: 'agent',
      resource_id: agent.id,
      details: { name: agent.name, category: agent.category },
      severity: 'info',
    });

    return NextResponse.json({ data: agent }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "agents.POST");
  }
}
