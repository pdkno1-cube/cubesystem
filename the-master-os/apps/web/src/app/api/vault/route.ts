import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { untyped } from '@/lib/supabase/untyped';
import { encrypt } from '@/lib/crypto';
import { apiError, handleApiError } from '@/lib/api-response';
import type { Database } from '@/types/database';

type SecretVaultRow = Database['public']['Tables']['secret_vault']['Row'];

// ── Zod Schemas ────────────────────────────────────────────────────

const createSecretSchema = z.object({
  name: z
    .string()
    .min(1, '시크릿 이름은 필수입니다.')
    .max(200, '이름은 200자 이하여야 합니다.'),
  workspace_id: z
    .string()
    .uuid('유효하지 않은 워크스페이스 ID입니다.'),
  category: z
    .enum([
      'api_key',
      'oauth_token',
      'password',
      'certificate',
      'webhook_secret',
      'other',
    ])
    .optional()
    .default('api_key'),
  value: z
    .string()
    .min(1, '시크릿 값은 필수입니다.'),
  expires_at: z.string().datetime().optional(),
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

/**
 * Strips sensitive fields (encrypted_value, iv, auth_tag) from a secret row.
 * SECURITY: These fields must never be exposed through the API response.
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
 * Records a vault access audit log entry.
 * Fire-and-forget: failures are logged but do not block the response.
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

// ── GET /api/vault ─────────────────────────────────────────────────

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    // Fetch secrets with workspace name via join
    const { data: secrets, error: queryError } = await supabase
      .from('secret_vault')
      .select(
        `
        *,
        workspaces:workspace_id(id, name)
      `,
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (queryError) {
      return apiError(
        'DB_ERROR',
        `시크릿 조회 실패: ${queryError.message}`,
        500,
      );
    }

    // Map results: strip encrypted fields, flatten workspace name
    const sanitized = (secrets ?? []).map((row) => {
      const rawRow = row as SecretVaultRow & {
        workspaces?: { id: string; name: string } | null;
      };
      const workspace_name = rawRow.workspaces?.name ?? '알 수 없음';
      const { workspaces: _ws, ...secretRow } = rawRow;
      return sanitizeSecret({ ...secretRow, workspace_name });
    });

    // Record vault list access in audit log (fire-and-forget)
    void recordVaultAudit(supabase, user.id, 'vault.list', null, {
      count: sanitized.length,
    });

    return NextResponse.json({
      data: sanitized,
      total: sanitized.length,
    });
  } catch (error) {
    return handleApiError(error, "vault.GET");
  }
}

// ── POST /api/vault ────────────────────────────────────────────────

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
    const parseResult = createSecretSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0];
      return apiError(
        'VALIDATION_ERROR',
        firstError?.message ?? '입력 값이 올바르지 않습니다.',
        400,
      );
    }

    const { name, workspace_id, category, value, expires_at } = parseResult.data;
    const slug = generateSlug(name);

    // AES-256-GCM encryption — value is never stored in plaintext
    const {
      encryptedValue,
      iv: encIv,
      authTag: encAuthTag,
    } = encrypt(value);

    const insertPayload: Record<string, unknown> = {
      name,
      slug,
      workspace_id,
      category,
      encrypted_value: encryptedValue,
      iv: encIv,
      auth_tag: encAuthTag,
      key_version: 1,
      created_by: user.id,
    };

    if (expires_at) {
      insertPayload.expires_at = expires_at;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { data: rawSecret, error: insertError } = await untyped(supabase)
      .from('secret_vault')
      .insert(insertPayload)
      .select(
        `
        *,
        workspaces:workspace_id(id, name)
      `,
      )
      .single();

    if (insertError) {
      const err = insertError as { message: string; code?: string };
      if (err.code === '23505') {
        return apiError(
          'DUPLICATE_SECRET',
          '이미 동일한 이름의 시크릿이 존재합니다.',
          409,
        );
      }
      return apiError(
        'DB_ERROR',
        `시크릿 생성 실패: ${err.message}`,
        500,
      );
    }

    const created = rawSecret as SecretVaultRow & {
      workspaces?: { id: string; name: string } | null;
    };
    const workspace_name = created.workspaces?.name ?? '알 수 없음';
    const { workspaces: _ws, ...secretRow } = created;

    // Record vault create in audit log (fire-and-forget)
    void recordVaultAudit(supabase, user.id, 'vault.create', created.id, {
      name,
      category,
      workspace_id,
    });

    return NextResponse.json(
      { data: sanitizeSecret({ ...secretRow, workspace_name }) },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, "vault.POST");
  }
}
