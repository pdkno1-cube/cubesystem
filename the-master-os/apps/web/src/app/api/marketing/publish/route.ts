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

type PublishStatus = 'published' | 'not_configured' | 'error' | 'manual' | 'rate_limited';

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

// ── Rate Limit Helper ────────────────────────────────────────────────────────

/**
 * Checks a fetch Response for 429 (Too Many Requests) and returns a rate-limit
 * PublishResult if detected. Returns null if not rate-limited.
 */
function checkRateLimit(
  resp: Response,
  channel: PublishChannel,
): PublishResult | null {
  if (resp.status !== 429) {
    return null;
  }

  const retryAfter = resp.headers.get('Retry-After') ?? resp.headers.get('x-rate-limit-reset');
  const retryMsg = retryAfter
    ? ` Retry-After: ${retryAfter}초`
    : '';

  Sentry.captureMessage(`Rate limited by ${channel} API (429)`, {
    level: 'warning',
    tags: { context: 'marketing.publish.rateLimit', channel },
    extra: { retryAfter },
  });

  return {
    success: false,
    channel,
    status: 'rate_limited',
    message: `${channel} API 요청 한도 초과 (429).${retryMsg} 잠시 후 다시 시도하세요.`,
  };
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
      message: 'Channel not configured: set FASTAPI_URL (뉴스레터 발송 서비스)',
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

  const rateLimited = checkRateLimit(resp, 'newsletter');
  if (rateLimited) {
    return rateLimited;
  }

  if (!resp.ok) {
    const text = await resp.text();
    return {
      success: false,
      channel: 'newsletter',
      status: 'error',
      message: `뉴스레터 발송 실패 (${resp.status}): ${text.slice(0, 200)}`,
    };
  }

  return {
    success: true,
    channel: 'newsletter',
    status: 'published',
    message: '뉴스레터가 성공적으로 발송되었습니다.',
  };
}

// ── Twitter / X ──────────────────────────────────────────────────────────────

interface TwitterMediaResponse {
  media_id_string?: string;
}

interface TwitterTweetResponse {
  data?: { id?: string };
}

/**
 * Upload media to Twitter v1.1 media endpoint (if image_url is provided).
 * Returns the media_id_string or undefined.
 */
async function uploadTwitterMedia(
  imageUrl: string,
  bearerToken: string,
): Promise<string | undefined> {
  // Download the image first
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) {
    Sentry.captureMessage(`Failed to download image for Twitter media upload: ${imgResp.status}`, {
      level: 'warning',
      tags: { context: 'marketing.publish.twitter.media' },
    });
    return undefined;
  }

  const imgBuffer = await imgResp.arrayBuffer();
  const base64Data = Buffer.from(imgBuffer).toString('base64');

  // Upload via v1.1 media/upload (simple upload, base64)
  const uploadResp = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ media_data: base64Data }),
  });

  if (!uploadResp.ok) {
    Sentry.captureMessage(`Twitter media upload failed: ${uploadResp.status}`, {
      level: 'warning',
      tags: { context: 'marketing.publish.twitter.media' },
    });
    return undefined;
  }

  const mediaData = await uploadResp.json() as TwitterMediaResponse;
  return mediaData.media_id_string;
}

async function publishTwitter(
  schedule: ContentScheduleRow,
  vaultSecrets: Record<string, string>,
): Promise<PublishResult> {
  const bearerToken = getConfigValue(vaultSecrets, 'twitter-bearer-token', 'TWITTER_BEARER_TOKEN');
  const apiKey = getConfigValue(vaultSecrets, 'twitter-api-key', 'TWITTER_API_KEY');
  const apiSecret = getConfigValue(vaultSecrets, 'twitter-api-secret', 'TWITTER_API_SECRET');

  if (!bearerToken) {
    return {
      success: false,
      channel: 'twitter',
      status: 'not_configured',
      message: 'Channel not configured: set TWITTER_BEARER_TOKEN',
    };
  }

  // Log if API key/secret are also provided (useful for future OAuth 1.0a support)
  if (apiKey && apiSecret) {
    Sentry.addBreadcrumb({
      category: 'marketing.publish.twitter',
      message: 'TWITTER_API_KEY and TWITTER_API_SECRET detected (available for future OAuth 1.0a)',
      level: 'info',
    });
  }

  const content = schedule.content;
  const tweetText = String(content.text ?? content.caption ?? schedule.title).slice(0, 280);

  // Optional media attachment
  const imageUrl = content.image_url ?? content.media_url;
  let mediaId: string | undefined;

  if (imageUrl && typeof imageUrl === 'string' && imageUrl.length > 0) {
    mediaId = await uploadTwitterMedia(imageUrl, bearerToken);
  }

  // Build tweet payload
  const tweetPayload: Record<string, unknown> = { text: tweetText };
  if (mediaId) {
    tweetPayload.media = { media_ids: [mediaId] };
  }

  const resp = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
    },
    body: JSON.stringify(tweetPayload),
  });

  const rateLimited = checkRateLimit(resp, 'twitter');
  if (rateLimited) {
    return rateLimited;
  }

  if (!resp.ok) {
    const errText = await resp.text();
    return {
      success: false,
      channel: 'twitter',
      status: 'error',
      message: `Twitter 발행 실패 (${resp.status}): ${errText.slice(0, 200)}`,
    };
  }

  const tweetData = await resp.json() as TwitterTweetResponse;
  const tweetId = tweetData.data?.id;
  return {
    success: true,
    channel: 'twitter',
    status: 'published',
    message: 'Twitter에 성공적으로 발행되었습니다.',
    externalUrl: tweetId ? `https://twitter.com/i/web/status/${tweetId}` : undefined,
  };
}

// ── LinkedIn ─────────────────────────────────────────────────────────────────

interface LinkedInProfileResponse {
  id?: string;
}

interface LinkedInPostResponse {
  id?: string;
}

async function publishLinkedIn(
  schedule: ContentScheduleRow,
  vaultSecrets: Record<string, string>,
): Promise<PublishResult> {
  const accessToken = getConfigValue(vaultSecrets, 'linkedin-access-token', 'LINKEDIN_ACCESS_TOKEN');
  const organizationId = getConfigValue(vaultSecrets, 'linkedin-organization-id', 'LINKEDIN_ORGANIZATION_ID');
  const personUrn = getConfigValue(vaultSecrets, 'linkedin-person-urn', 'LINKEDIN_PERSON_URN');

  if (!accessToken) {
    return {
      success: false,
      channel: 'linkedin',
      status: 'not_configured',
      message: 'Channel not configured: set LINKEDIN_ACCESS_TOKEN',
    };
  }

  // Determine the author URN: prefer organization, fall back to person, then API lookup
  let authorUrn: string | undefined;

  if (organizationId) {
    authorUrn = `urn:li:organization:${organizationId}`;
  } else if (personUrn) {
    authorUrn = personUrn.startsWith('urn:li:') ? personUrn : `urn:li:person:${personUrn}`;
  } else {
    // Fetch person ID from the API
    const meResp = await fetch('https://api.linkedin.com/v2/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    const meRateLimited = checkRateLimit(meResp, 'linkedin');
    if (meRateLimited) {
      return meRateLimited;
    }

    if (!meResp.ok) {
      return {
        success: false,
        channel: 'linkedin',
        status: 'error',
        message: `LinkedIn 프로필 조회 실패 (${meResp.status}). LINKEDIN_PERSON_URN 또는 LINKEDIN_ORGANIZATION_ID를 직접 설정하세요.`,
      };
    }

    const meData = await meResp.json() as LinkedInProfileResponse;
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
  const imageUrl = content.image_url ?? content.media_url;

  // Determine media category and build media array
  let shareMediaCategory: 'ARTICLE' | 'IMAGE' | 'NONE' = 'NONE';
  const mediaArray: Array<Record<string, unknown>> = [];

  if (articleUrl) {
    shareMediaCategory = 'ARTICLE';
    mediaArray.push({
      status: 'READY',
      originalUrl: articleUrl,
      title: { text: String(content.title ?? schedule.title) },
    });
  } else if (imageUrl && typeof imageUrl === 'string' && imageUrl.length > 0) {
    shareMediaCategory = 'IMAGE';
    mediaArray.push({
      status: 'READY',
      originalUrl: imageUrl,
      title: { text: String(content.title ?? schedule.title) },
    });
  }

  // Build the UGC post payload
  const shareContent: Record<string, unknown> = {
    shareCommentary: { text },
    shareMediaCategory,
  };

  if (mediaArray.length > 0) {
    shareContent.media = mediaArray;
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

  const rateLimited = checkRateLimit(resp, 'linkedin');
  if (rateLimited) {
    return rateLimited;
  }

  if (!resp.ok) {
    const errText = await resp.text();
    return {
      success: false,
      channel: 'linkedin',
      status: 'error',
      message: `LinkedIn 발행 실패 (${resp.status}): ${errText.slice(0, 200)}`,
    };
  }

  const postData = await resp.json() as LinkedInPostResponse;
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

// ── Instagram ────────────────────────────────────────────────────────────────

interface InstagramContainerResponse {
  id?: string;
  error?: { message?: string };
}

interface InstagramPublishResponse {
  id?: string;
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
      message: 'Channel not configured: set INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID',
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
    `https://graph.facebook.com/v21.0/${igUserId}/media`,
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

  const containerRateLimited = checkRateLimit(containerResp, 'instagram');
  if (containerRateLimited) {
    return containerRateLimited;
  }

  if (!containerResp.ok) {
    const errText = await containerResp.text();
    return {
      success: false,
      channel: 'instagram',
      status: 'error',
      message: `Instagram 미디어 컨테이너 생성 실패 (${containerResp.status}): ${errText.slice(0, 200)}`,
    };
  }

  const containerData = await containerResp.json() as InstagramContainerResponse;
  const containerId = containerData.id;
  if (!containerId) {
    return {
      success: false,
      channel: 'instagram',
      status: 'error',
      message: `Instagram 미디어 컨테이너 ID를 받지 못했습니다. ${containerData.error?.message ?? ''}`.trim(),
    };
  }

  // Step 2: Publish the container
  const publishResp = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    },
  );

  const publishRateLimited = checkRateLimit(publishResp, 'instagram');
  if (publishRateLimited) {
    return publishRateLimited;
  }

  if (!publishResp.ok) {
    const errText = await publishResp.text();
    return {
      success: false,
      channel: 'instagram',
      status: 'error',
      message: `Instagram 발행 실패 (${publishResp.status}): ${errText.slice(0, 200)}`,
    };
  }

  const publishData = await publishResp.json() as InstagramPublishResponse;
  return {
    success: true,
    channel: 'instagram',
    status: 'published',
    message: 'Instagram에 성공적으로 발행되었습니다.',
    externalUrl: publishData.id
      ? `https://www.instagram.com/p/${publishData.id}`
      : undefined,
  };
}

// ── Blog ─────────────────────────────────────────────────────────────────────

interface WordPressPostResponse {
  link?: string;
}

interface GhostPostResponse {
  posts?: Array<{ url?: string }>;
}

interface MediumMeResponse {
  data?: { id?: string };
}

interface MediumPostResponse {
  data?: { url?: string };
}

interface HashnodePublishResponse {
  data?: {
    publishPost?: {
      post?: { url?: string };
    };
  };
  errors?: Array<{ message?: string }>;
}

interface WebhookResponse {
  url?: string;
  externalUrl?: string;
}

async function publishBlog(
  schedule: ContentScheduleRow,
  vaultSecrets: Record<string, string>,
): Promise<PublishResult> {
  const platform = getConfigValue(vaultSecrets, 'blog-platform', 'BLOG_PLATFORM');

  // If no platform is set, check for generic webhook fallback (BLOG_API_URL + BLOG_API_TOKEN)
  if (!platform) {
    const blogApiUrl = getConfigValue(vaultSecrets, 'blog-api-url', 'BLOG_API_URL');
    const blogApiToken = getConfigValue(vaultSecrets, 'blog-api-token', 'BLOG_API_TOKEN');

    if (blogApiUrl && blogApiToken) {
      // Generic webhook fallback
      return publishBlogWebhook(schedule, blogApiUrl, blogApiToken);
    }

    return {
      success: false,
      channel: 'blog',
      status: 'not_configured',
      message: 'Channel not configured: set BLOG_PLATFORM (wordpress, ghost, medium, hashnode) 또는 BLOG_API_URL + BLOG_API_TOKEN (generic webhook)',
    };
  }

  const content = schedule.content;
  const title = String(content.title ?? schedule.title);
  const htmlBody = String(content.html ?? content.body ?? content.text ?? '');
  const markdownBody = String(content.markdown ?? content.text ?? htmlBody);

  // ── WordPress ──
  if (platform === 'wordpress') {
    return publishBlogWordPress(title, htmlBody, vaultSecrets);
  }

  // ── Ghost ──
  if (platform === 'ghost') {
    return publishBlogGhost(title, htmlBody, vaultSecrets);
  }

  // ── Medium ──
  if (platform === 'medium') {
    return publishBlogMedium(title, htmlBody, schedule.tags, vaultSecrets);
  }

  // ── Hashnode ──
  if (platform === 'hashnode') {
    return publishBlogHashnode(title, markdownBody, schedule.tags, vaultSecrets);
  }

  // ── Generic webhook (with BLOG_PLATFORM set to 'webhook') ──
  if (platform === 'webhook') {
    const blogApiUrl = getConfigValue(vaultSecrets, 'blog-api-url', 'BLOG_API_URL');
    const blogApiToken = getConfigValue(vaultSecrets, 'blog-api-token', 'BLOG_API_TOKEN');

    if (!blogApiUrl || !blogApiToken) {
      return {
        success: false,
        channel: 'blog',
        status: 'not_configured',
        message: 'Channel not configured: set BLOG_API_URL, BLOG_API_TOKEN',
      };
    }

    return publishBlogWebhook(schedule, blogApiUrl, blogApiToken);
  }

  return {
    success: false,
    channel: 'blog',
    status: 'not_configured',
    message: `지원되지 않는 블로그 플랫폼: ${platform}. wordpress, ghost, medium, hashnode, webhook 중 선택하세요.`,
  };
}

async function publishBlogWordPress(
  title: string,
  body: string,
  vaultSecrets: Record<string, string>,
): Promise<PublishResult> {
  const wpUrl = getConfigValue(vaultSecrets, 'wordpress-url', 'WORDPRESS_URL');
  const wpToken = getConfigValue(vaultSecrets, 'wordpress-token', 'WORDPRESS_TOKEN');

  if (!wpUrl || !wpToken) {
    return {
      success: false,
      channel: 'blog',
      status: 'not_configured',
      message: 'Channel not configured: set WORDPRESS_URL, WORDPRESS_TOKEN',
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

  const rateLimited = checkRateLimit(resp, 'blog');
  if (rateLimited) {
    return rateLimited;
  }

  if (!resp.ok) {
    const errText = await resp.text();
    return {
      success: false,
      channel: 'blog',
      status: 'error',
      message: `WordPress 발행 실패 (${resp.status}): ${errText.slice(0, 200)}`,
    };
  }

  const wpData = await resp.json() as WordPressPostResponse;
  return {
    success: true,
    channel: 'blog',
    status: 'published',
    message: 'WordPress 블로그에 발행되었습니다.',
    externalUrl: wpData.link,
  };
}

async function publishBlogGhost(
  title: string,
  body: string,
  vaultSecrets: Record<string, string>,
): Promise<PublishResult> {
  const ghostUrl = getConfigValue(vaultSecrets, 'ghost-url', 'GHOST_URL');
  const ghostKey = getConfigValue(vaultSecrets, 'ghost-admin-key', 'GHOST_ADMIN_KEY');

  if (!ghostUrl || !ghostKey) {
    return {
      success: false,
      channel: 'blog',
      status: 'not_configured',
      message: 'Channel not configured: set GHOST_URL, GHOST_ADMIN_KEY',
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

  const rateLimited = checkRateLimit(resp, 'blog');
  if (rateLimited) {
    return rateLimited;
  }

  if (!resp.ok) {
    const errText = await resp.text();
    return {
      success: false,
      channel: 'blog',
      status: 'error',
      message: `Ghost 발행 실패 (${resp.status}): ${errText.slice(0, 200)}`,
    };
  }

  const ghostData = await resp.json() as GhostPostResponse;
  const postUrl = ghostData.posts?.[0]?.url;
  return {
    success: true,
    channel: 'blog',
    status: 'published',
    message: 'Ghost 블로그에 발행되었습니다.',
    externalUrl: postUrl,
  };
}

async function publishBlogMedium(
  title: string,
  body: string,
  tags: string[],
  vaultSecrets: Record<string, string>,
): Promise<PublishResult> {
  const mediumToken = getConfigValue(vaultSecrets, 'medium-token', 'MEDIUM_TOKEN');

  if (!mediumToken) {
    return {
      success: false,
      channel: 'blog',
      status: 'not_configured',
      message: 'Channel not configured: set MEDIUM_TOKEN (Integration Token)',
    };
  }

  // Get the authenticated user's ID first
  const meResp = await fetch('https://api.medium.com/v1/me', {
    headers: { 'Authorization': `Bearer ${mediumToken}` },
  });

  const meRateLimited = checkRateLimit(meResp, 'blog');
  if (meRateLimited) {
    return meRateLimited;
  }

  if (!meResp.ok) {
    return {
      success: false,
      channel: 'blog',
      status: 'error',
      message: `Medium 인증 실패 (${meResp.status})`,
    };
  }

  const meData = await meResp.json() as MediumMeResponse;
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
        tags: tags.slice(0, 5),
      }),
    },
  );

  const postRateLimited = checkRateLimit(postResp, 'blog');
  if (postRateLimited) {
    return postRateLimited;
  }

  if (!postResp.ok) {
    const errText = await postResp.text();
    return {
      success: false,
      channel: 'blog',
      status: 'error',
      message: `Medium 발행 실패 (${postResp.status}): ${errText.slice(0, 200)}`,
    };
  }

  const postData = await postResp.json() as MediumPostResponse;
  return {
    success: true,
    channel: 'blog',
    status: 'published',
    message: 'Medium에 발행되었습니다.',
    externalUrl: postData.data?.url,
  };
}

/**
 * Publish to Hashnode via their GraphQL API.
 * Requires HASHNODE_TOKEN and HASHNODE_PUBLICATION_ID.
 */
async function publishBlogHashnode(
  title: string,
  markdownContent: string,
  tags: string[],
  vaultSecrets: Record<string, string>,
): Promise<PublishResult> {
  const hashnodeToken = getConfigValue(vaultSecrets, 'hashnode-token', 'HASHNODE_TOKEN');
  const publicationId = getConfigValue(vaultSecrets, 'hashnode-publication-id', 'HASHNODE_PUBLICATION_ID');

  if (!hashnodeToken || !publicationId) {
    return {
      success: false,
      channel: 'blog',
      status: 'not_configured',
      message: 'Channel not configured: set HASHNODE_TOKEN, HASHNODE_PUBLICATION_ID',
    };
  }

  // Build tags array for Hashnode (each tag needs slug + name)
  const hashnodeTags = tags.slice(0, 5).map((tag) => ({
    slug: tag.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    name: tag,
  }));

  const mutation = `
    mutation PublishPost($input: PublishPostInput!) {
      publishPost(input: $input) {
        post {
          url
          title
          id
        }
      }
    }
  `;

  const resp = await fetch('https://gql.hashnode.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': hashnodeToken,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        input: {
          title,
          contentMarkdown: markdownContent,
          publicationId,
          tags: hashnodeTags,
        },
      },
    }),
  });

  const rateLimited = checkRateLimit(resp, 'blog');
  if (rateLimited) {
    return rateLimited;
  }

  if (!resp.ok) {
    const errText = await resp.text();
    return {
      success: false,
      channel: 'blog',
      status: 'error',
      message: `Hashnode 발행 실패 (${resp.status}): ${errText.slice(0, 200)}`,
    };
  }

  const data = await resp.json() as HashnodePublishResponse;

  if (data.errors && data.errors.length > 0) {
    const errMsg = data.errors.map((e) => e.message ?? 'Unknown error').join('; ');
    return {
      success: false,
      channel: 'blog',
      status: 'error',
      message: `Hashnode GraphQL 오류: ${errMsg.slice(0, 200)}`,
    };
  }

  const postUrl = data.data?.publishPost?.post?.url;
  return {
    success: true,
    channel: 'blog',
    status: 'published',
    message: 'Hashnode에 발행되었습니다.',
    externalUrl: postUrl,
  };
}

/**
 * Generic webhook blog publisher.
 * POSTs the schedule content as JSON to BLOG_API_URL with Bearer token BLOG_API_TOKEN.
 */
async function publishBlogWebhook(
  schedule: ContentScheduleRow,
  apiUrl: string,
  apiToken: string,
): Promise<PublishResult> {
  const content = schedule.content;
  const title = String(content.title ?? schedule.title);
  const htmlBody = String(content.html ?? content.body ?? content.text ?? '');
  const markdownBody = String(content.markdown ?? '');

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      title,
      content: htmlBody,
      markdown: markdownBody || undefined,
      tags: schedule.tags,
      metadata: {
        schedule_id: schedule.id,
        workspace_id: schedule.workspace_id,
        channel: 'blog',
      },
    }),
  });

  const rateLimited = checkRateLimit(resp, 'blog');
  if (rateLimited) {
    return rateLimited;
  }

  if (!resp.ok) {
    const errText = await resp.text();
    return {
      success: false,
      channel: 'blog',
      status: 'error',
      message: `Blog webhook 발행 실패 (${resp.status}): ${errText.slice(0, 200)}`,
    };
  }

  // Try to parse response for an external URL
  let externalUrl: string | undefined;
  try {
    const respData = await resp.json() as WebhookResponse;
    externalUrl = respData.url ?? respData.externalUrl;
  } catch {
    // Response may not be JSON — that's fine
  }

  return {
    success: true,
    channel: 'blog',
    status: 'published',
    message: 'Blog webhook을 통해 발행되었습니다.',
    externalUrl,
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
      blog: ['blog-', 'wordpress-', 'ghost-', 'medium-', 'hashnode-'],
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
    } else if (result.status === 'error' || result.status === 'rate_limited') {
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

    const httpStatus = result.success
      ? 200
      : result.status === 'not_configured'
        ? 200
        : result.status === 'rate_limited'
          ? 429
          : 502;
    return NextResponse.json({ data: result }, { status: httpStatus });
  } catch (error) {
    return handleApiError(error, 'marketing.publish.POST');
  }
}
