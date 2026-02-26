import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { untyped } from '@/lib/supabase/untyped';
import { z } from 'zod';
import type { Database } from '@/types/database';

type AgentRow = Database['public']['Tables']['agents']['Row'];

const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().nullable().optional(),
  category: z
    .enum([
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
    ])
    .optional(),
  model_provider: z.enum(['openai', 'anthropic', 'google', 'local']).optional(),
  model: z.string().min(1).optional(),
  system_prompt: z.string().min(1).optional(),
  parameters: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      max_tokens: z.number().min(1).optional(),
      top_p: z.number().min(0).max(1).optional(),
    })
    .optional(),
  is_active: z.boolean().optional(),
  cost_per_run: z.number().min(0).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
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

    const { data: agent, error } = await supabase
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
          assigned_by,
          created_at,
          workspaces:workspace_id(id, name, slug)
        )
      `
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '에이전트를 찾을 수 없습니다.' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: agent });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const db = untyped(supabase);

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
    const parsed = updateAgentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { data: agents, error } = await db
      .from('agents')
      .update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .is('deleted_at', null)
      .select();

    const agentRows = agents as AgentRow[] | null;

    if (error || !agentRows || agentRows.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'DB_ERROR',
            message: error?.message ?? '에이전트를 찾을 수 없습니다.',
          },
        },
        { status: error ? 500 : 404 }
      );
    }

    const agent = agentRows[0]!;

    // Audit log
    await db.from('audit_logs').insert({
      user_id: user.id,
      action: 'agent.update',
      category: 'agent',
      resource_type: 'agent',
      resource_id: id,
      details: { updated_fields: Object.keys(parsed.data) },
      severity: 'info',
    });

    return NextResponse.json({ data: agent });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const db = untyped(supabase);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 }
      );
    }

    // Soft delete: set deleted_at
    const { data: agents, error } = await db
      .from('agents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null)
      .select();

    const agentRows = agents as AgentRow[] | null;

    if (error || !agentRows || agentRows.length === 0) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '에이전트를 찾을 수 없습니다.' } },
        { status: 404 }
      );
    }

    const agent = agentRows[0]!;

    // Also deactivate any active assignments
    await db
      .from('agent_assignments')
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq('agent_id', id)
      .eq('is_active', true);

    // Audit log
    await db.from('audit_logs').insert({
      user_id: user.id,
      action: 'agent.delete',
      category: 'agent',
      resource_type: 'agent',
      resource_id: id,
      details: { name: agent.name },
      severity: 'warning',
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    );
  }
}
