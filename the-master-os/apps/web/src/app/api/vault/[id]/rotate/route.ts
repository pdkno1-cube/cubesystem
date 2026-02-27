import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { untyped } from '@/lib/supabase/untyped';
import { encrypt } from '@/lib/crypto';
import { apiError, handleApiError } from '@/lib/api-response';
import type { Database } from '@/types/database';

type SecretVaultRow = Database['public']['Tables']['secret_vault']['Row'];

const uuidSchema = z.string().uuid('유효하지 않은 시크릿 ID입니다.');

const rotateSchema = z.object({
  new_value: z.string().min(1, '새 시크릿 값은 필수입니다.'),
});

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

type RouteContext = { params: Promise<{ id: string }> };

// ── POST /api/vault/:id/rotate ──────────────────────────────────────

export async function POST(
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

    // Parse body
    const body: unknown = await request.json();
    const parseResult = rotateSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0];
      return apiError(
        'VALIDATION_ERROR',
        firstError?.message ?? '입력 값이 올바르지 않습니다.',
        400,
      );
    }

    // Check secret exists
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

    const { new_value } = parseResult.data;
    const now = new Date().toISOString();

    // Encrypt new value
    const {
      encryptedValue,
      iv: encIv,
      authTag: encAuthTag,
    } = encrypt(new_value);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { data: rawUpdated, error: updateError } = await untyped(supabase)
      .from('secret_vault')
      .update({
        encrypted_value: encryptedValue,
        iv: encIv,
        auth_tag: encAuthTag,
        key_version: existing.key_version + 1,
        last_rotated_at: now,
        updated_at: now,
      })
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
        `시크릿 로테이션 실패: ${err?.message ?? 'Unknown error'}`,
        500,
      );
    }

    const updated = rawUpdated as SecretVaultRow & {
      workspaces?: { id: string; name: string } | null;
    };
    const workspace_name = updated.workspaces?.name ?? '알 수 없음';
    const { workspaces: _ws, ...secretRow } = updated;

    // Record rotation in audit log
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await untyped(supabase).from('audit_logs').insert({
        user_id: user.id,
        action: 'vault.rotate',
        category: 'vault',
        resource_type: 'secret_vault',
        resource_id: id,
        details: {
          name: existing.name,
          old_key_version: existing.key_version,
          new_key_version: existing.key_version + 1,
        },
        severity: 'info',
      });
    } catch {
      // Audit logging failure must not block the operation
    }

    return NextResponse.json({
      data: sanitizeSecret({ ...secretRow, workspace_name }),
    });
  } catch (error) {
    return handleApiError(error, "vault.ROTATE");
  }
}
