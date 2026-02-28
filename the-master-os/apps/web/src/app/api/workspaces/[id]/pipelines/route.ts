import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/workspaces/[id]/pipelines — assign pipeline to workspace
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { pipeline_id?: string };
  if (!body.pipeline_id) {
    return NextResponse.json({ error: 'pipeline_id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('workspace_pipelines')
    .upsert(
      { workspace_id: params.id, pipeline_id: body.pipeline_id, is_active: true },
      { onConflict: 'workspace_id,pipeline_id' },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/workspaces/[id]/pipelines — remove pipeline from workspace
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pipelineId = searchParams.get('pipeline_id');
  if (!pipelineId) {
    return NextResponse.json({ error: 'pipeline_id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('workspace_pipelines')
    .delete()
    .eq('workspace_id', params.id)
    .eq('pipeline_id', pipelineId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
