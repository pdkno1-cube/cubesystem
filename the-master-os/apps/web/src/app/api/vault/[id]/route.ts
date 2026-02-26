import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { untyped } from '@/lib/supabase/untyped';
import { apiError, handleApiError } from '@/lib/api-response';
import type { Database } from '@/types/database';

type SecretVaultRow = Database['public']['Tables']['secret_vault']['Row'];

// ── Zod Schemas ────────────────────────────────────────────────────

const uuidSchema = z.string().uuid('유효하지 않은 시크릿 ID입니다.');

const updateSecretSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z
    .enum([
      'api_key',
      'oauth_token',
      'password',
      'certificate',
      'webhook_secret',
      'other',
    ])
    .optional(),
});

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Strips sensitive fields from a secret row.
 * SECURITY: encrypted_value, iv, auth_tag must never be exposed.
 */
function sanitizeSecret(
  secret: SecretVaultRow,
): Omit<SecretVaultRow, 'encrypted_value' | 'iv' | 'auth_tag'> {
  const {
    encrypted_value: _enc,
    iv: _iv,
    auth_tag: _tag,
    ...safe
  } = secret;
  return safe;
}

type RouteContext = { params: Promise<{ id: string }> };

// ── DELETE /api/vault/:id (Soft Delete) ────────────────────────────

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const idResult = uuidSchema.safeParse(id);
    if (!idResult.success) {
      return apiError('INVALID_ID', '유효하지 않은 시크릿 ID입니다.', 400);
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    // Check if secret exists and is not already deleted
    const { data: rawExisting } = await supabase
      .from('secret_vault')
      .select('id, deleted_at')
      .eq('id', id)
      .single();

    const existing = rawExisting as Pick<SecretVaultRow, 'id' | 'deleted_at'> | null;

    if (!existing || existing.deleted_at) {
      return apiError('NOT_FOUND', '시크릿을 찾을 수 없습니다.', 404);
    }

    // Soft delete: set deleted_at
    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { error: deleteError } = await untyped(supabase)
      .from('secret_vault')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id);

    if (deleteError) {
      const err = deleteError as { message: string };
      return apiError(
        'DB_ERROR',
        `시크릿 삭제 실패: ${err.message}`,
        500,
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "vault.DELETE");
  }
}

// ── PATCH /api/vault/:id ───────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const idResult = uuidSchema.safeParse(id);
    if (!idResult.success) {
      return apiError('INVALID_ID', '유효하지 않은 시크릿 ID입니다.', 400);
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
    const parseResult = updateSecretSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0];
      return apiError(
        'VALIDATION_ERROR',
        firstError?.message ?? '입력 값이 올바르지 않습니다.',
        400,
      );
    }

    // Check if secret exists and is not deleted
    const { data: rawExisting } = await supabase
      .from('secret_vault')
      .select('id, deleted_at')
      .eq('id', id)
      .single();

    const existing = rawExisting as Pick<SecretVaultRow, 'id' | 'deleted_at'> | null;

    if (!existing || existing.deleted_at) {
      return apiError('NOT_FOUND', '시크릿을 찾을 수 없습니다.', 404);
    }

    const { name, category } = parseResult.data;

    // Build update payload (only include defined fields)
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) {
      updatePayload.name = name;
    }
    if (category !== undefined) {
      updatePayload.category = category;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { data: rawUpdated, error: updateError } = await untyped(supabase)
      .from('secret_vault')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !rawUpdated) {
      const err = updateError as { message?: string } | null;
      return apiError(
        'DB_ERROR',
        `시크릿 수정 실패: ${err?.message ?? 'Unknown error'}`,
        500,
      );
    }

    const updated = rawUpdated as SecretVaultRow;

    return NextResponse.json({
      data: sanitizeSecret(updated),
    });
  } catch (error) {
    return handleApiError(error, "vault.PATCH");
  }
}
