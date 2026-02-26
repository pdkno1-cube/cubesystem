import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { untyped } from '@/lib/supabase/untyped';
import { z } from 'zod';

const releaseAgentSchema = z.object({
  agent_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
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
    const parsed = releaseAgentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { agent_id, workspace_id } = parsed.data;

    // Find the active assignment
    const { data: assignmentRows, error: findError } = await db
      .from('agent_assignments')
      .select('id')
      .eq('agent_id', agent_id)
      .eq('workspace_id', workspace_id)
      .eq('is_active', true);

    const assignmentData = (assignmentRows as Array<{ id: string }> | null)?.[0];

    if (findError || !assignmentData) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: '해당 워크스페이스에 할당된 에이전트를 찾을 수 없습니다.',
          },
        },
        { status: 404 }
      );
    }

    // Deactivate assignment
    const { error: updateError } = await db
      .from('agent_assignments')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignmentData.id);

    if (updateError) {
      return NextResponse.json(
        { error: { code: 'DB_ERROR', message: updateError.message } },
        { status: 500 }
      );
    }

    // Get agent and workspace names for audit log
    const [agentResult, wsResult] = await Promise.all([
      db.from('agents').select('name').eq('id', agent_id).single(),
      db.from('workspaces').select('name').eq('id', workspace_id).single(),
    ]);

    const agentName = (agentResult.data as { name: string } | null)?.name ?? agent_id;
    const wsName = (wsResult.data as { name: string } | null)?.name ?? workspace_id;

    // Audit log
    await db.from('audit_logs').insert({
      workspace_id,
      user_id: user.id,
      agent_id,
      action: 'agent.release',
      category: 'agent',
      resource_type: 'agent_assignment',
      resource_id: assignmentData.id,
      details: {
        agent_name: agentName,
        workspace_name: wsName,
      },
      severity: 'info',
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
