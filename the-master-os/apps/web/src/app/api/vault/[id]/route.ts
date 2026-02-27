import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { untyped } from '@/lib/supabase/untyped';
import { encrypt } from '@/lib/crypto';
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
  value: z.string().min(1).optional(),
  expires_at: z.string().datetime().nullable().optional(),
  auto_rotation: z.boolean().optional(),
  rotation_interval_days: z.number().int().min(1).max(365).optional(),
});

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Strips sensitive fields from a secret row.
 * SECURITY: encrypted_value, iv, auth_tag must never be exposed.
 */
function sanitizeSecret(
  secret: SecretVaultRow & { workspace_name?: string },
): Omit<SecretVaultRow, 'encrypted_value' | 'iv' | 'auth_tag'> & {
  workspace_name?: string;
} {
  const {
    encrypted_value: _enc,
    iv: _iv,
    auth_tag: _tag,
    ...safe
  } = secret;
  return safe;
}

/**
 * Records a vault access audit log entry (fire-and-forget).
 */
async function recordVaultAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  action: string,
  resourceId: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await untyped(supabase).from('audit_logs').insert({
      user_id: userId,
      action,
      category: 'vault',
      resource_type: 'secret_vault',
      resource_id: resourceId,
      details,
      severity: 'info',
    });
  } catch {
    // Audit logging failure must not block the operation
  }
}

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/vault/:id ──────────────────────────────────────────────

export async function GET(
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

    const { data: rawSecret, error: queryError } = await supabase
      .from('secret_vault')
      .select(
        `
        *,
        workspaces:workspace_id(id, name)
      `,
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (queryError || !rawSecret) {
      return apiError('NOT_FOUND', '시크릿을 찾을 수 없습니다.', 404);
    }

    const row = rawSecret as SecretVaultRow & {
      workspaces?: { id: string; name: string } | null;
    };
    const workspace_name = row.workspaces?.name ?? '알 수 없음';
    const { workspaces: _ws, ...secretRow } = row;

    // Update last_accessed_at (fire-and-forget)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    void untyped(supabase)
      .from('secret_vault')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', id);

    // Record vault read in audit log (fire-and-forget)
    void recordVaultAudit(supabase, user.id, 'vault.read', id, {
      name: secretRow.name,
    });

    return NextResponse.json({
      data: sanitizeSecret({ ...secretRow, workspace_name }),
    });
  } catch (error) {
    return handleApiError(error, "vault.GET_SINGLE");
  }
}

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
      .select('id, deleted_at, name')
      .eq('id', id)
      .single();

    const existing = rawExisting as Pick<SecretVaultRow, 'id' | 'deleted_at' | 'name'> | null;

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

    // Record vault delete in audit log
    void recordVaultAudit(supabase, user.id, 'vault.delete', id, {
      name: existing.name,
    });

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
      .select('id, deleted_at, key_version, name')
      .eq('id', id)
      .single();

    const existing = rawExisting as Pick<
      SecretVaultRow,
      'id' | 'deleted_at' | 'key_version' | 'name'
    > | null;

    if (!existing || existing.deleted_at) {
      return apiError('NOT_FOUND', '시크릿을 찾을 수 없습니다.', 404);
    }

    const { name, category, value, expires_at, auto_rotation, rotation_interval_days } =
      parseResult.data;

    // Build update payload (only include defined fields)
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const changedFields: string[] = [];

    if (name !== undefined) {
      updatePayload.name = name;
      changedFields.push('name');
    }
    if (category !== undefined) {
      updatePayload.category = category;
      changedFields.push('category');
    }
    if (expires_at !== undefined) {
      updatePayload.expires_at = expires_at;
      changedFields.push('expires_at');
    }
    if (auto_rotation !== undefined) {
      updatePayload.auto_rotation = auto_rotation;
      changedFields.push('auto_rotation');
    }
    if (rotation_interval_days !== undefined) {
      updatePayload.rotation_interval_days = rotation_interval_days;
      changedFields.push('rotation_interval_days');
    }

    // If value is updated, re-encrypt and bump key version
    if (value !== undefined) {
      const {
        encryptedValue,
        iv: encIv,
        authTag: encAuthTag,
      } = encrypt(value);
      updatePayload.encrypted_value = encryptedValue;
      updatePayload.iv = encIv;
      updatePayload.auth_tag = encAuthTag;
      updatePayload.key_version = existing.key_version + 1;
      updatePayload.last_rotated_at = new Date().toISOString();
      changedFields.push('value');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { data: rawUpdated, error: updateError } = await untyped(supabase)
      .from('secret_vault')
      .update(updatePayload)
      .eq('id', id)
      .select(
        `
        *,
        workspaces:workspace_id(id, name)
      `,
      )
      .single();

    if (updateError || !rawUpdated) {
      const err = updateError as { message?: string } | null;
      return apiError(
        'DB_ERROR',
        `시크릿 수정 실패: ${err?.message ?? 'Unknown error'}`,
        500,
      );
    }

    const updated = rawUpdated as SecretVaultRow & {
      workspaces?: { id: string; name: string } | null;
    };
    const workspace_name = updated.workspaces?.name ?? '알 수 없음';
    const { workspaces: _ws, ...secretRow } = updated;

    // Record vault update in audit log
    void recordVaultAudit(supabase, user.id, 'vault.update', id, {
      name: existing.name,
      changedFields,
    });

    return NextResponse.json({
      data: sanitizeSecret({ ...secretRow, workspace_name }),
    });
  } catch (error) {
    return handleApiError(error, "vault.PATCH");
  }
}
