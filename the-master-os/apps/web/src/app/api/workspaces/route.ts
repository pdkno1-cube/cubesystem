import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError } from '@/lib/api-response';

// ── Zod Schemas ────────────────────────────────────────────────────

const createWorkspaceSchema = z.object({
  name: z
    .string()
    .min(1, '워크스페이스 이름은 필수입니다.')
    .max(100, '이름은 100자 이하여야 합니다.'),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'slug는 소문자, 숫자, 하이픈만 허용됩니다.')
    .max(100)
    .optional(),
  description: z.string().max(500).optional(),
  category: z
    .enum(['corporation', 'logistics', 'it', 'fnb', 'ecommerce', 'marketing', 'finance', 'other'])
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
});

// ── Helpers ────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60)
    .concat('-', Date.now().toString(36));
}

// ── GET /api/workspaces ────────────────────────────────────────────

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    // Fetch workspaces (RLS auto-applied via owner_id matching auth.uid())
    const { data: workspaces, error: wsError } = await supabase
      .from('workspaces')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (wsError) {
      return apiError(
        'DB_ERROR',
        `워크스페이스 조회 실패: ${wsError.message}`,
        500,
      );
    }

    const workspacesWithStats = await Promise.all(
      (workspaces ?? []).map(async (ws) => {
        // Agent count for this workspace
        const { count: agentCount } = await supabase
          .from('agent_assignments')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', ws.id)
          .eq('is_active', true)
          .is('deleted_at', null);

        // Active pipeline count
        const { count: pipelineCount } = await supabase
          .from('pipeline_executions')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', ws.id)
          .in('status', ['pending', 'running']);

        // Credit balance (latest transaction)
        const { data: creditData } = await supabase
          .from('credits')
          .select('balance_after')
          .eq('workspace_id', ws.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const settings = ws.settings as Record<string, unknown>;

        return {
          ...ws,
          agent_count: agentCount ?? 0,
          active_pipeline_count: pipelineCount ?? 0,
          credit_balance:
            creditData && creditData.length > 0
              ? (creditData[0]?.balance_after ?? 0)
              : 0,
          category: (settings?.category as string) ?? undefined,
          icon: (settings?.icon as string) ?? undefined,
        };
      }),
    );

    return NextResponse.json({
      data: workspacesWithStats,
      count: workspacesWithStats.length,
    });
  } catch (error) {
    return handleApiError(error, "workspaces.GET");
  }
}

// ── POST /api/workspaces ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    // Parse & validate request body
    const body: unknown = await request.json();
    const parseResult = createWorkspaceSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0];
      return apiError(
        'VALIDATION_ERROR',
        firstError?.message ?? '입력 값이 올바르지 않습니다.',
        400,
      );
    }

    const { name, slug, description, category, icon } = parseResult.data;
    const finalSlug = slug ?? generateSlug(name);

    // Insert workspace
    const { data: workspace, error: insertError } = await supabase
      .from('workspaces')
      .insert({
        name,
        slug: finalSlug,
        description: description ?? null,
        icon_url: icon ?? null,
        owner_id: user.id,
        settings: {
          category: category ?? 'other',
          icon: icon ?? 'Building2',
        },
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return apiError(
          'DUPLICATE_SLUG',
          '이미 사용 중인 slug입니다. 다른 이름을 사용해주세요.',
          409,
        );
      }
      return apiError(
        'DB_ERROR',
        `워크스페이스 생성 실패: ${insertError.message}`,
        500,
      );
    }

    // NOTE: workspace_members owner entry is auto-created by DB trigger
    // (trg_workspace_auto_owner in migration 000002). No explicit INSERT needed.

    const settings = workspace.settings as Record<string, unknown>;

    return NextResponse.json(
      {
        data: {
          ...workspace,
          agent_count: 0,
          active_pipeline_count: 0,
          credit_balance: 0,
          category: (settings?.category as string) ?? 'other',
          icon: (settings?.icon as string) ?? 'Building2',
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, "workspaces.POST");
  }
}
