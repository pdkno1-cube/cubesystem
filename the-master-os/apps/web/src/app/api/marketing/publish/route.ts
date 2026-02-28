import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

// ── Types ──────────────────────────────────────────────────────────────────

type PublishChannel = 'blog' | 'instagram' | 'twitter' | 'linkedin' | 'newsletter';

interface PublishRequestBody {
  scheduleId: string;
  channel: PublishChannel;
}

type PublishStatus = 'published' | 'not_configured' | 'error' | 'manual';

interface PublishResult {
  success: boolean;
  channel: PublishChannel;
  status: PublishStatus;
  message: string;
  externalUrl?: string;
}

interface VaultSecret {
  encrypted_value: string;
  iv: string;
  auth_tag: string;
  name: string;
  slug: string;
}

interface ContentScheduleRow {
  id: string;
  workspace_id: string;
  channel: string;
  title: string;
  content: Record<string, unknown>;
  status: string;
  tags: string[];
}

// ── Vault Helpers ──────────────────────────────────────────────────────────

/**
 * Look up secrets in secret_vault for a given workspace + service slug prefix.
 * Returns a map of slug -> decrypted value.
 */
async function getVaultSecrets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  slugPrefixes: string[],
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (const prefix of slugPrefixes) {
    const { data: secrets } = await supabase
      .from('secret_vault')
      .select('encrypted_value, iv, auth_tag, name, slug')
      .eq('workspace_id', workspaceId)
      .ilike('slug', `${prefix}%`)
      .is('deleted_at', null);

    if (secrets) {
      for (const secret of secrets as VaultSecret[]) {
        try {
          const decrypted = decrypt(
            secret.encrypted_value,
            secret.iv,
            secret.auth_tag,
          );
          results[secret.slug] = decrypted;
        } catch {
          // Decryption failure — skip this secret (VAULT_ENCRYPTION_KEY may differ)
          Sentry.captureMessage(`Failed to decrypt vault secret: ${secret.slug}`, {
            level: 'warning',
            tags: { context: 'marketing.publish.vault' },
          });
        }
      }
    }
  }

  return results;
}

/**
 * Get a config value from vault secrets first, then fall back to env var.
 */
function getConfigValue(
  vaultSecrets: Record<string, string>,
  vaultSlug: string,
  envKey: string,
): string | undefined {
  return vaultSecrets[vaultSlug] ?? process.env[envKey] ?? undefined;
}

// ── Channel Publishers ─────────────────────────────────────────────────────

async function publishNewsletter(
  schedule: ContentScheduleRow,
  userId: string,
): Promise<PublishResult> {
  const FASTAPI_URL = process.env.FASTAPI_URL ?? '';
  if (!FASTAPI_URL) {
    return {
      success: false,
      channel: 'newsletter',
      status: 'not_configured',
      message: '환경변수 설정 필요: FASTAPI_URL (뉴스레터 발송 서비스)',
    };
  }

  const content = schedule.content;
  const resp = await fetch(
    `${FASTAPI_URL}/orchestrate/marketing/newsletter/send`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
      body: JSON.stringify({
        workspace_id: schedule.workspace_id,
        subject: String(content.subject ?? schedule.title),
        html: String(content.html ?? ''),
        text: String(content.text ?? ''),
        tags: schedule.tags,
      }),
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    return {
      success: false,
      channel: 'newsletter',
      status: 'error',
      message: `뉴스레터 발송 실패: ${text}`,
    };
  }

  return {
    success: true,
    channel: 'newsletter',
    status: 'published',
    message: '뉴스레터가 성공적으로 발송되었습니다.',
  };
}

async function publishBlog(
  schedule: ContentScheduleRow,
  vaultSecrets: Record<string, string>,
): Promise<PublishResult> {
  const platform = getConfigValue(vaultSecrets, 'blog-platform', 'BLOG_PLATFORM');

  if (!platform) {
    return {
      success: true,
      channel: 'blog',
      status: 'manual',
      message: '블로그 플랫폼 미설정. BLOG_PLATFORM 환경변수를 wordpress, ghost, medium 중 하나로 설정하세요. 수동 발행이 필요합니다.',
    };
  }

  const content = schedule.content;
  const title = String(content.title ?? schedule.title);
  const body = String(content.html ?? content.body ?? content.text ?? '');

  if (platform === 'wordpress') {
    const wpUrl = getConfigValue(vaultSecrets, 'wordpress-url', 'WORDPRESS_URL');
    const wpToken = getConfigValue(vaultSecrets, 'wordpress-token', 'WORDPRESS_TOKEN');

    if (!wpUrl || !wpToken) {
      return {
        success: false,
        channel: 'blog',
        status: 'not_configured',
        message: '환경변수 설정 필요: WORDPRESS_URL, WORDPRESS_TOKEN',
      };
    }

    const resp = await fetch(`${wpUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${wpToken}`,
      },
      body: JSON.stringify({
        title,
        content: body,
        status: 'publish',
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return {
        success: false,
        channel: 'blog',
        status: 'error',
        message: `WordPress 발행 실패 (${resp.status}): ${errText.slice(0, 200)}`,
      };
    }

    const wpData = await resp.json() as { link?: string };
    return {
      success: true,
      channel: 'blog',
      status: 'published',
      message: 'WordPress 블로그에 발행되었습니다.',
      externalUrl: wpData.link,
    };
  }

  if (platform === 'ghost') {
    const ghostUrl = getConfigValue(vaultSecrets, 'ghost-url', 'GHOST_URL');
    const ghostKey = getConfigValue(vaultSecrets, 'ghost-admin-key', 'GHOST_ADMIN_KEY');

    if (!ghostUrl || !ghostKey) {
      return {
        success: false,
        channel: 'blog',
        status: 'not_configured',
        message: '환경변수 설정 필요: GHOST_URL, GHOST_ADMIN_KEY',
      };
    }

    const resp = await fetch(`${ghostUrl}/ghost/api/v3/admin/posts/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Ghost ${ghostKey}`,
      },
      body: JSON.stringify({
        posts: [{ title, html: body, status: 'published' }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return {
        success: false,
        channel: 'blog',
        status: 'error',
        message: `Ghost 발행 실패 (${resp.status}): ${errText.slice(0, 200)}`,
      };
    }

    const ghostData = await resp.json() as { posts?: Array<{ url?: string }> };
    const postUrl = ghostData.posts?.[0]?.url;
    return {
      success: true,
      channel: 'blog',
      status: 'published',
      message: 'Ghost 블로그에 발행되었습니다.',
      externalUrl: postUrl,
    };
  }

  // Medium — uses Bearer token (Integration Token)
  if (platform === 'medium') {
    const mediumToken = getConfigValue(vaultSecrets, 'medium-token', 'MEDIUM_TOKEN');

    if (!mediumToken) {
      return {
        success: false,
        channel: 'blog',
        status: 'not_configured',
        message: '환경변수 설정 필요: MEDIUM_TOKEN (Integration Token)',
      };
    }

    // Get the authenticated user's ID first
    const meResp = await fetch('https://api.medium.com/v1/me', {
      headers: { 'Authorization': `Bearer ${mediumToken}` },
    });

    if (!meResp.ok) {
      return {
        success: false,
        channel: 'blog',
        status: 'error',
        message: `Medium 인증 실패 (${meResp.status})`,
      };
    }

    const meData = await meResp.json() as { data?: { id?: string } };
    const mediumUserId = meData.data?.id;
    if (!mediumUserId) {
      return {
        success: false,
        channel: 'blog',
        status: 'error',
        message: 'Medium 사용자 ID를 가져올 수 없습니다.',
      };
    }

    const postResp = await fetch(
      `https://api.medium.com/v1/users/${mediumUserId}/posts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mediumToken}`,
        },
        body: JSON.stringify({
          title,
          contentFormat: 'html',
          content: body,
          publishStatus: 'public',
          tags: schedule.tags.slice(0, 5),
        }),
      },
    );

    if (!postResp.ok) {
      const errText = await postResp.text();
      return {
        success: false,
        channel: 'blog',
        status: 'error',
        message: `Medium 발행 실패 (${postResp.status}): ${errText.slice(0, 200)}`,
      };
    }

    const postData = await postResp.json() as { data?: { url?: string } };
    return {
      success: true,
      channel: 'blog',
      status: 'published',
      message: 'Medium에 발행되었습니다.',
      externalUrl: postData.data?.url,
    };
  }

  return {
    success: true,
    channel: 'blog',
    status: 'manual',
    message: `지원되지 않는 블로그 플랫폼: ${platform}. wordpress, ghost, medium 중 선택하세요.`,
  };
}

async function publishInstagram(
  schedule: ContentScheduleRow,
  vaultSecrets: Record<string, string>,
): Promise<PublishResult> {
  const accessToken = getConfigValue(vaultSecrets, 'instagram-access-token', 'INSTAGRAM_ACCESS_TOKEN');
  const igUserId = getConfigValue(vaultSecrets, 'instagram-user-id', 'INSTAGRAM_USER_ID');

  if (!accessToken || !igUserId) {
    return {
      success: false,
      channel: 'instagram',
      status: 'not_configured',
      message: '환경변수 설정 필요: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID (Facebook Graph API)',
    };
  }

  const content = schedule.content;
  const caption = String(content.caption ?? content.text ?? schedule.title);
  const imageUrl = String(content.image_url ?? content.media_url ?? '');

  if (!imageUrl) {
    return {
      success: false,
      channel: 'instagram',
      status: 'error',
      message: '이미지 URL이 필요합니다. content에 image_url 필드를 추가하세요.',
    };
  }

  // Step 1: Create media container
  const containerResp = await fetch(
    `https://graph.facebook.com/v18.0/${igUserId}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }),
    },
  );

  if (!containerResp.ok) {
    const errText = await containerResp.text();
    return {
      success: false,
      channel: 'instagram',
      status: 'error',
      message: `Instagram 미디어 컨테이너 생성 실패 (${containerResp.status}): ${errText.slice(0, 200)}`,
    };
  }

  const containerData = await containerResp.json() as { id?: string };
  const containerId = containerData.id;
  if (!containerId) {
    return {
      success: false,
      channel: 'instagram',
      status: 'error',
      message: 'Instagram 미디어 컨테이너 ID를 받지 못했습니다.',
    };
  }

  // Step 2: Publish the container
  const publishResp = await fetch(
    `https://graph.facebook.com/v18.0/${igUserId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    },
  );

  if (!publishResp.ok) {
    const errText = await publishResp.text();
    return {
      success: false,
      channel: 'instagram',
      status: 'error',
      message: `Instagram 발행 실패 (${publishResp.status}): ${errText.slice(0, 200)}`,
    };
  }

  const publishData = await publishResp.json() as { id?: string };
  return {
    success: true,
    channel: 'instagram',
    status: 'published',
    message: 'Instagram에 성공적으로 발행되었습니다.',
    externalUrl: `https://www.instagram.com/p/${publishData.id ?? ''}`,
  };
}

async function publishTwitter(
  schedule: ContentScheduleRow,
  vaultSecrets: Record<string, string>,
): Promise<PublishResult> {
  const apiKey = getConfigValue(vaultSecrets, 'twitter-api-key', 'TWITTER_API_KEY');
  const apiSecret = getConfigValue(vaultSecrets, 'twitter-api-secret', 'TWITTER_API_SECRET');
  const accessToken = getConfigValue(vaultSecrets, 'twitter-access-token', 'TWITTER_ACCESS_TOKEN');
  const accessSecret = getConfigValue(vaultSecrets, 'twitter-access-secret', 'TWITTER_ACCESS_SECRET');
  const bearerToken = getConfigValue(vaultSecrets, 'twitter-bearer-token', 'TWITTER_BEARER_TOKEN');

  // Prefer OAuth 2.0 Bearer Token for simplicity, fall back to OAuth 1.0a
  const authToken = bearerToken ?? accessToken;

  if (!authToken) {
    return {
      success: false,
      channel: 'twitter',
      status: 'not_configured',
      message: '환경변수 설정 필요: TWITTER_BEARER_TOKEN 또는 TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET',
    };
  }

  // For OAuth 1.0a, all four keys are needed
  if (!bearerToken && (!apiKey || !apiSecret || !accessToken || !accessSecret)) {
    return {
      success: false,
      channel: 'twitter',
      status: 'not_configured',
      message: '환경변수 설정 필요: OAuth 1.0a 사용 시 TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET 모두 필요',
    };
  }

  const content = schedule.content;
  const tweetText = String(content.text ?? content.caption ?? schedule.title).slice(0, 280);

  const resp = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ text: tweetText }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return {
      success: false,
      channel: 'twitter',
      status: 'error',
      message: `Twitter 발행 실패 (${resp.status}): ${errText.slice(0, 200)}`,
    };
  }

  const tweetData = await resp.json() as { data?: { id?: string } };
  const tweetId = tweetData.data?.id;
  return {
    success: true,
    channel: 'twitter',
    status: 'published',
    message: 'Twitter에 성공적으로 발행되었습니다.',
    externalUrl: tweetId ? `https://twitter.com/i/web/status/${tweetId}` : undefined,
  };
}

async function publishLinkedIn(
  schedule: ContentScheduleRow,
  vaultSecrets: Record<string, string>,
): Promise<PublishResult> {
  const accessToken = getConfigValue(vaultSecrets, 'linkedin-access-token', 'LINKEDIN_ACCESS_TOKEN');
  const personUrn = getConfigValue(vaultSecrets, 'linkedin-person-urn', 'LINKEDIN_PERSON_URN');

  if (!accessToken) {
    return {
      success: false,
      channel: 'linkedin',
      status: 'not_configured',
      message: '환경변수 설정 필요: LINKEDIN_ACCESS_TOKEN',
    };
  }

  // If no person URN provided, try to fetch it from the API
  let authorUrn = personUrn;
  if (!authorUrn) {
    const meResp = await fetch('https://api.linkedin.com/v2/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!meResp.ok) {
      return {
        success: false,
        channel: 'linkedin',
        status: 'error',
        message: `LinkedIn 프로필 조회 실패 (${meResp.status}). LINKEDIN_PERSON_URN을 직접 설정해 보세요.`,
      };
    }

    const meData = await meResp.json() as { id?: string };
    if (!meData.id) {
      return {
        success: false,
        channel: 'linkedin',
        status: 'error',
        message: 'LinkedIn 사용자 ID를 가져올 수 없습니다.',
      };
    }
    authorUrn = `urn:li:person:${meData.id}`;
  }

  const content = schedule.content;
  const text = String(content.text ?? content.caption ?? schedule.title);
  const articleUrl = content.url ? String(content.url) : undefined;

  // Build the UGC post payload
  const shareContent: Record<string, unknown> = {
    shareCommentary: { text },
    shareMediaCategory: articleUrl ? 'ARTICLE' : 'NONE',
  };

  if (articleUrl) {
    shareContent.media = [
      {
        status: 'READY',
        originalUrl: articleUrl,
        title: { text: String(content.title ?? schedule.title) },
      },
    ];
  }

  const resp = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': shareContent,
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return {
      success: false,
      channel: 'linkedin',
      status: 'error',
      message: `LinkedIn 발행 실패 (${resp.status}): ${errText.slice(0, 200)}`,
    };
  }

  const postData = await resp.json() as { id?: string };
  return {
    success: true,
    channel: 'linkedin',
    status: 'published',
    message: 'LinkedIn에 성공적으로 발행되었습니다.',
    externalUrl: postData.id
      ? `https://www.linkedin.com/feed/update/${postData.id}`
      : undefined,
  };
}

// ── Main Route Handler ─────────────────────────────────────────────────────

const VALID_CHANNELS: ReadonlySet<string> = new Set<PublishChannel>([
  'blog',
  'instagram',
  'twitter',
  'linkedin',
  'newsletter',
]);

export async function POST(
  request: Request,
): Promise<NextResponse<{ data: PublishResult } | ApiErrorBody>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    const body = await request.json() as PublishRequestBody;

    if (!body.scheduleId || !body.channel) {
      return apiError('VALIDATION_ERROR', 'scheduleId와 channel은 필수입니다.', 400);
    }

    if (!VALID_CHANNELS.has(body.channel)) {
      return apiError(
        'VALIDATION_ERROR',
        `지원되지 않는 채널: ${body.channel}. 사용 가능: blog, instagram, twitter, linkedin, newsletter`,
        400,
      );
    }

    // Fetch the schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from('content_schedules')
      .select('id, workspace_id, channel, title, content, status, tags')
      .eq('id', body.scheduleId)
      .is('deleted_at', null)
      .single();

    if (scheduleError || !schedule) {
      return apiError(
        'NOT_FOUND',
        `스케줄을 찾을 수 없습니다: ${body.scheduleId}`,
        404,
      );
    }

    const scheduleRow = schedule as ContentScheduleRow;

    // Look up vault secrets for the channel
    const channelVaultPrefixes: Record<PublishChannel, string[]> = {
      blog: ['blog-', 'wordpress-', 'ghost-', 'medium-'],
      instagram: ['instagram-'],
      twitter: ['twitter-'],
      linkedin: ['linkedin-'],
      newsletter: [],
    };

    const prefixes = channelVaultPrefixes[body.channel];
    let vaultSecrets: Record<string, string> = {};
    if (prefixes.length > 0) {
      vaultSecrets = await getVaultSecrets(supabase, scheduleRow.workspace_id, prefixes);
    }

    // Update schedule status to 'running'
    await supabase
      .from('content_schedules')
      .update({ status: 'running' })
      .eq('id', body.scheduleId);

    // Dispatch to channel-specific publisher
    let result: PublishResult;

    switch (body.channel) {
      case 'newsletter': {
        result = await publishNewsletter(scheduleRow, user.id);
        break;
      }
      case 'blog': {
        result = await publishBlog(scheduleRow, vaultSecrets);
        break;
      }
      case 'instagram': {
        result = await publishInstagram(scheduleRow, vaultSecrets);
        break;
      }
      case 'twitter': {
        result = await publishTwitter(scheduleRow, vaultSecrets);
        break;
      }
      case 'linkedin': {
        result = await publishLinkedIn(scheduleRow, vaultSecrets);
        break;
      }
      default: {
        result = {
          success: false,
          channel: body.channel,
          status: 'error',
          message: `지원되지 않는 채널: ${body.channel}`,
        };
      }
    }

    // Update schedule status based on result
    if (result.success && (result.status === 'published' || result.status === 'manual')) {
      await supabase
        .from('content_schedules')
        .update({
          status: 'completed',
          published_at: new Date().toISOString(),
        })
        .eq('id', body.scheduleId);
    } else if (result.status === 'error') {
      await supabase
        .from('content_schedules')
        .update({
          status: 'failed',
          error_message: result.message,
        })
        .eq('id', body.scheduleId);

      Sentry.captureMessage(`Channel publish failed: ${body.channel}`, {
        level: 'error',
        tags: { context: 'marketing.publish', channel: body.channel },
        extra: { scheduleId: body.scheduleId, result },
      });
    } else if (result.status === 'not_configured') {
      // Revert to pending — not_configured is not a failure, just needs setup
      await supabase
        .from('content_schedules')
        .update({ status: 'pending' })
        .eq('id', body.scheduleId);
    }

    // Write audit log (fire-and-forget)
    void supabase
      .from('audit_logs')
      .insert({
        user_id: user.id,
        workspace_id: scheduleRow.workspace_id,
        action: `marketing.publish.${body.channel}`,
        category: 'marketing',
        resource_type: 'content_schedule',
        resource_id: body.scheduleId,
        details: {
          channel: body.channel,
          status: result.status,
          success: result.success,
          externalUrl: result.externalUrl ?? null,
        },
        severity: result.success ? 'info' : 'warning',
      })
      .then(() => {
        // audit log written
      });

    const httpStatus = result.success ? 200 : result.status === 'not_configured' ? 200 : 502;
    return NextResponse.json({ data: result }, { status: httpStatus });
  } catch (error) {
    return handleApiError(error, 'marketing.publish.POST');
  }
}
