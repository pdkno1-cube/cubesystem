import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { untyped } from '@/lib/supabase/untyped';
import { z } from 'zod';
import type { Database } from '@/types/database';

type AssignmentRow = Database['public']['Tables']['agent_assignments']['Row'];

const assignAgentSchema = z.object({
  agent_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  position_x: z.number().optional().default(0),
  position_y: z.number().optional().default(0),
});

export async function POST(request: NextRequest) {
  try {
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
    const parsed = assignAgentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { agent_id, workspace_id, position_x, position_y } = parsed.data;

    // Verify agent exists and is not deleted
    const { data: agentRows, error: agentError } = await db
      .from('agents')
      .select('id, name')
      .eq('id', agent_id)
      .is('deleted_at', null);

    const agentData = (agentRows as Array<{ id: string; name: string }> | null)?.[0];

    if (agentError || !agentData) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '에이전트를 찾을 수 없습니다.' } },
        { status: 404 }
      );
    }

    // Verify workspace exists
    const { data: wsRows, error: wsError } = await db
      .from('workspaces')
      .select('id, name')
      .eq('id', workspace_id)
      .is('deleted_at', null);

    const wsData = (wsRows as Array<{ id: string; name: string }> | null)?.[0];

    if (wsError || !wsData) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '워크스페이스를 찾을 수 없습니다.' } },
        { status: 404 }
      );
    }

    // Deactivate any existing active assignment for this agent
    await db
      .from('agent_assignments')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('agent_id', agent_id)
      .eq('is_active', true);

    // Create new assignment
    const { data: assignmentRows, error: assignError } = await db
      .from('agent_assignments')
      .insert({
        agent_id,
        workspace_id,
        assigned_by: user.id,
        position_x,
        position_y,
        status: 'idle',
        is_active: true,
        config_override: {},
      })
      .select();

    const assignment = (assignmentRows as AssignmentRow[] | null)?.[0];

    if (assignError || !assignment) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: assignError?.message ?? 'Insert failed' } },
        { status: 500 }
      );
    }

    // Audit log
    await db.from('audit_logs').insert({
      workspace_id,
      user_id: user.id,
      agent_id,
      action: 'agent.assign',
      category: 'agent',
      resource_type: 'agent_assignment',
      resource_id: assignment.id,
      details: {
        agent_name: agentData.name,
        workspace_name: wsData.name,
        position_x,
        position_y,
      },
      severity: 'info',
    });

    return NextResponse.json({ data: assignment }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    );
  }
}
