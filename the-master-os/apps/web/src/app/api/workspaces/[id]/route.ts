import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { untyped } from '@/lib/supabase/untyped';
import { apiError, handleApiError } from '@/lib/api-response';
import type { Database } from '@/types/database';

type WorkspaceRow = Database['public']['Tables']['workspaces']['Row'];
type CreditRow = Database['public']['Tables']['credits']['Row'];

// ── Zod Schemas ────────────────────────────────────────────────────

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  category: z
    .enum(['logistics', 'it', 'fnb', 'ecommerce', 'marketing', 'finance', 'other'])
    .optional(),
  icon: z
    .enum([
      'Building2',
      'Truck',
      'Monitor',
      'UtensilsCrossed',
      'ShoppingCart',
      'Megaphone',
      'Landmark',
      'Briefcase',
    ])
    .optional(),
  settings: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'archived', 'suspended']).optional(),
});

const uuidSchema = z.string().uuid('유효하지 않은 워크스페이스 ID입니다.');

// ── Helpers ────────────────────────────────────────────────────────

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/workspaces/:id ────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const idResult = uuidSchema.safeParse(id);
    if (!idResult.success) {
      return apiError('INVALID_ID', '유효하지 않은 워크스페이스 ID입니다.', 400);
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    // Fetch workspace (RLS auto-applied)
    const { data: rawWorkspace, error: wsError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .single();

    const workspace = rawWorkspace as WorkspaceRow | null;

    if (wsError || !workspace || workspace.deleted_at) {
      return apiError(
        'NOT_FOUND',
        '워크스페이스를 찾을 수 없습니다.',
        404,
      );
    }

    // Parallel stat queries
    const [
      { count: agentCount },
      { count: pipelineCount },
      { data: rawCreditData },
      { count: memberCount },
    ] = await Promise.all([
      // Agent count
      supabase
        .from('agent_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', id)
        .eq('is_active', true),
      // Active pipeline count
      supabase
        .from('pipeline_executions')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', id)
        .in('status', ['pending', 'running']),
      // Credit balance
      supabase
        .from('credits')
        .select('balance_after')
        .eq('workspace_id', id)
        .order('created_at', { ascending: false })
        .limit(1),
      // Member count
      supabase
        .from('workspace_members')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', id)
        .is('deleted_at', null),
    ]);

    const creditData = (rawCreditData ?? []) as Pick<CreditRow, 'balance_after'>[];
    const settings = workspace.settings as Record<string, unknown> | null;

    return NextResponse.json({
      data: {
        ...workspace,
        agent_count: agentCount ?? 0,
        active_pipeline_count: pipelineCount ?? 0,
        credit_balance:
          creditData.length > 0
            ? Number(creditData[0]?.balance_after ?? 0)
            : 0,
        member_count: memberCount ?? 0,
        category: (settings?.category as string) ?? undefined,
        icon: (settings?.icon as string) ?? undefined,
      },
    });
  } catch (error) {
    return handleApiError(error, "workspaces-id.GET");
  }
}

// ── PATCH /api/workspaces/:id ──────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const idResult = uuidSchema.safeParse(id);
    if (!idResult.success) {
      return apiError('INVALID_ID', '유효하지 않은 워크스페이스 ID입니다.', 400);
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    // Parse & validate request body
    const body: unknown = await request.json();
    const parseResult = updateWorkspaceSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0];
      return apiError(
        'VALIDATION_ERROR',
        firstError?.message ?? '입력 값이 올바르지 않습니다.',
        400,
      );
    }

    const { name, description, category, icon, settings, status } = parseResult.data;

    // Fetch existing workspace to merge settings
    const { data: rawExisting } = await supabase
      .from('workspaces')
      .select('settings, deleted_at, status')
      .eq('id', id)
      .single();

    const existing = rawExisting as Pick<WorkspaceRow, 'settings' | 'deleted_at' | 'status'> | null;

    if (!existing || existing.deleted_at) {
      return apiError('NOT_FOUND', '워크스페이스를 찾을 수 없습니다.', 404);
    }

    const existingSettings = existing.settings as Record<string, unknown> | null;
    const mergedSettings = {
      ...(existingSettings ?? {}),
      ...(settings ?? {}),
      ...(category ? { category } : {}),
      ...(icon ? { icon } : {}),
    };

    // Build update payload (only include defined fields)
    const updatePayload: Record<string, unknown> = {
      settings: mergedSettings,
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) { updatePayload.name = name; }
    if (description !== undefined) { updatePayload.description = description; }
    if (icon !== undefined) { updatePayload.icon_url = icon; }
    if (status !== undefined) {
      updatePayload.status = status;
      // When restoring from archived, also restore is_active and clear deleted_at
      if (status === 'active') {
        updatePayload.is_active = true;
        updatePayload.deleted_at = null;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { data: rawUpdated, error: updateError } = await untyped(supabase)
      .from('workspaces')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    const updated = rawUpdated as WorkspaceRow | null;

    if (updateError || !updated) {
      return apiError(
        'DB_ERROR',
        `워크스페이스 수정 실패: ${updateError?.message ?? 'Unknown error'}`,
        500,
      );
    }

    // Fetch member count for the response
    const { count: memberCount } = await supabase
      .from('workspace_members')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', id)
      .is('deleted_at', null);

    const updatedSettings = updated.settings as Record<string, unknown> | null;

    return NextResponse.json({
      data: {
        ...updated,
        agent_count: 0,
        active_pipeline_count: 0,
        credit_balance: 0,
        member_count: memberCount ?? 0,
        category: (updatedSettings?.category as string) ?? undefined,
        icon: (updatedSettings?.icon as string) ?? undefined,
      },
    });
  } catch (error) {
    return handleApiError(error, "workspaces-id.PATCH");
  }
}

// ── DELETE /api/workspaces/:id (Archive — sets status to 'archived') ─

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const idResult = uuidSchema.safeParse(id);
    if (!idResult.success) {
      return apiError('INVALID_ID', '유효하지 않은 워크스페이스 ID입니다.', 400);
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    // Archive: set status to 'archived', deleted_at, and is_active to false
    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { error: deleteError } = await untyped(supabase)
      .from('workspaces')
      .update({ deleted_at: now, is_active: false, status: 'archived', updated_at: now })
      .eq('id', id);

    if (deleteError) {
      return apiError(
        'DB_ERROR',
        `워크스페이스 아카이브 실패: ${(deleteError as { message: string }).message}`,
        500,
      );
    }

    // Deactivate all agent assignments for this workspace
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await untyped(supabase)
      .from('agent_assignments')
      .update({ is_active: false, deleted_at: now, updated_at: now })
      .eq('workspace_id', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "workspaces-id.DELETE");
  }
}
