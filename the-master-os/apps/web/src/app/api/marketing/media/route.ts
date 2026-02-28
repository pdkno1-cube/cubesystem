import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { apiError, handleApiError, type ApiErrorBody } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// ── Types ──────────────────────────────────────────────────────────────────

type MediaType = 'image' | 'video';
type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
type ImageResolution = '1k' | '2k';
type VideoResolution = '480p' | '720p';

interface MediaGenerateRequest {
  type: MediaType;
  prompt: string;
  aspectRatio?: AspectRatio;
  resolution?: ImageResolution;
  n?: number;
  duration?: number;
  videoResolution?: VideoResolution;
  referenceImageUrl?: string;
}

interface MediaResultItem {
  url: string;
  duration?: number;
}

interface MediaGenerateResponse {
  success: boolean;
  type: MediaType;
  results: MediaResultItem[];
  model: string;
  message?: string;
}

// ── xAI API Response Types ─────────────────────────────────────────────────

interface XaiImageDataItem {
  url: string;
}

interface XaiImageResponse {
  data: XaiImageDataItem[];
  model: string;
}

interface XaiVideoCreateResponse {
  request_id: string;
  status: string;
}

interface XaiVideoPollResponse {
  status: string;
  video?: {
    url: string;
    duration: number;
  };
  model?: string;
  moderation?: string;
}

interface XaiErrorResponse {
  error?: {
    message?: string;
    type?: string;
  };
}

// ── Constants ──────────────────────────────────────────────────────────────

const XAI_IMAGE_GEN_URL = 'https://api.x.ai/v1/images/generations';
const XAI_IMAGE_EDIT_URL = 'https://api.x.ai/v1/images/edits';
const XAI_VIDEO_GEN_URL = 'https://api.x.ai/v1/videos/generations';
const XAI_IMAGE_MODEL = 'grok-imagine-image';
const XAI_VIDEO_MODEL = 'grok-imagine-video';

const VALID_ASPECT_RATIOS: ReadonlySet<string> = new Set<AspectRatio>([
  '1:1', '16:9', '9:16', '4:3', '3:4',
]);
const VALID_IMAGE_RESOLUTIONS: ReadonlySet<string> = new Set<ImageResolution>(['1k', '2k']);
const VALID_VIDEO_RESOLUTIONS: ReadonlySet<string> = new Set<VideoResolution>(['480p', '720p']);

const VIDEO_POLL_INTERVAL_MS = 2000;
const VIDEO_POLL_MAX_ATTEMPTS = 60;
const MIN_IMAGE_COUNT = 1;
const MAX_IMAGE_COUNT = 4;
const MIN_VIDEO_DURATION = 1;
const MAX_VIDEO_DURATION = 15;
const DEFAULT_VIDEO_RESOLUTION: VideoResolution = '720p';

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseXaiError(responseBody: string): string {
  try {
    const parsed = JSON.parse(responseBody) as XaiErrorResponse;
    if (parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Not JSON or no error field
  }
  return responseBody.slice(0, 500);
}

// ── Image Generation ───────────────────────────────────────────────────────

async function generateImages(
  apiKey: string,
  request: MediaGenerateRequest,
): Promise<MediaGenerateResponse> {
  const imageCount = Math.min(
    Math.max(request.n ?? MIN_IMAGE_COUNT, MIN_IMAGE_COUNT),
    MAX_IMAGE_COUNT,
  );

  const hasReference = Boolean(request.referenceImageUrl);
  const url = hasReference ? XAI_IMAGE_EDIT_URL : XAI_IMAGE_GEN_URL;

  const body: Record<string, unknown> = {
    model: XAI_IMAGE_MODEL,
    prompt: request.prompt,
    n: imageCount,
    response_format: 'url',
  };

  if (request.aspectRatio) {
    body.aspect_ratio = request.aspectRatio;
  }
  if (request.resolution) {
    body.resolution = request.resolution;
  }

  if (hasReference && request.referenceImageUrl) {
    body.image = {
      url: request.referenceImageUrl,
      type: 'image_url',
    };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    const errMessage = parseXaiError(errText);
    Sentry.captureException(
      new Error(`xAI image generation failed (${resp.status}): ${errMessage}`),
      { tags: { context: 'marketing.media.image', status: String(resp.status) } },
    );
    return {
      success: false,
      type: 'image',
      results: [],
      model: XAI_IMAGE_MODEL,
      message: `xAI 이미지 생성 실패 (${resp.status}): ${errMessage}`,
    };
  }

  const data = await resp.json() as XaiImageResponse;

  const results: MediaResultItem[] = data.data.map((item) => ({
    url: item.url,
  }));

  return {
    success: true,
    type: 'image',
    results,
    model: data.model ?? XAI_IMAGE_MODEL,
  };
}

// ── Video Generation ───────────────────────────────────────────────────────

async function generateVideo(
  apiKey: string,
  request: MediaGenerateRequest,
): Promise<MediaGenerateResponse> {
  const videoDuration = request.duration
    ? Math.min(Math.max(request.duration, MIN_VIDEO_DURATION), MAX_VIDEO_DURATION)
    : undefined;

  const body: Record<string, unknown> = {
    model: XAI_VIDEO_MODEL,
    prompt: request.prompt,
    resolution: request.videoResolution ?? DEFAULT_VIDEO_RESOLUTION,
  };

  if (videoDuration !== undefined) {
    body.duration = videoDuration;
  }
  if (request.aspectRatio) {
    body.aspect_ratio = request.aspectRatio;
  }
  if (request.referenceImageUrl) {
    body.image = {
      url: request.referenceImageUrl,
    };
  }

  // Step 1: Create video generation request
  const createResp = await fetch(XAI_VIDEO_GEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    const errMessage = parseXaiError(errText);
    Sentry.captureException(
      new Error(`xAI video creation failed (${createResp.status}): ${errMessage}`),
      { tags: { context: 'marketing.media.video.create', status: String(createResp.status) } },
    );
    return {
      success: false,
      type: 'video',
      results: [],
      model: XAI_VIDEO_MODEL,
      message: `xAI 비디오 생성 요청 실패 (${createResp.status}): ${errMessage}`,
    };
  }

  const createData = await createResp.json() as XaiVideoCreateResponse;
  const requestId = createData.request_id;

  if (!requestId) {
    Sentry.captureException(
      new Error('xAI video creation returned no request_id'),
      { tags: { context: 'marketing.media.video.create' } },
    );
    return {
      success: false,
      type: 'video',
      results: [],
      model: XAI_VIDEO_MODEL,
      message: 'xAI 비디오 생성 요청에서 request_id를 받지 못했습니다.',
    };
  }

  // Step 2: Poll for completion
  const pollUrl = `${XAI_VIDEO_GEN_URL}/${requestId}`;
  let moderationMessage: string | undefined;

  for (let attempt = 0; attempt < VIDEO_POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(VIDEO_POLL_INTERVAL_MS);

    let pollResp: Response;
    try {
      pollResp = await fetch(pollUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (fetchError) {
      Sentry.captureException(fetchError, {
        tags: { context: 'marketing.media.video.poll', attempt: String(attempt) },
      });
      continue;
    }

    if (!pollResp.ok) {
      const errText = await pollResp.text();
      // Transient errors during polling are retried
      if (attempt < VIDEO_POLL_MAX_ATTEMPTS - 1) {
        Sentry.addBreadcrumb({
          category: 'marketing.media.video.poll',
          message: `Poll attempt ${attempt + 1} failed (${pollResp.status}): ${errText.slice(0, 200)}`,
          level: 'warning',
        });
        continue;
      }
      const errMessage = parseXaiError(errText);
      Sentry.captureException(
        new Error(`xAI video poll exhausted (${pollResp.status}): ${errMessage}`),
        { tags: { context: 'marketing.media.video.poll' } },
      );
      return {
        success: false,
        type: 'video',
        results: [],
        model: XAI_VIDEO_MODEL,
        message: `xAI 비디오 상태 조회 실패 (${pollResp.status}): ${errMessage}`,
      };
    }

    const pollData = await pollResp.json() as XaiVideoPollResponse;

    if (pollData.moderation) {
      moderationMessage = pollData.moderation;
    }

    if (pollData.status === 'done') {
      if (!pollData.video?.url) {
        Sentry.captureException(
          new Error('xAI video poll returned done but no video URL'),
          { tags: { context: 'marketing.media.video.poll' } },
        );
        return {
          success: false,
          type: 'video',
          results: [],
          model: pollData.model ?? XAI_VIDEO_MODEL,
          message: 'xAI 비디오 생성이 완료되었지만 URL을 받지 못했습니다.',
        };
      }

      const result: MediaResultItem = {
        url: pollData.video.url,
        duration: pollData.video.duration,
      };

      return {
        success: true,
        type: 'video',
        results: [result],
        model: pollData.model ?? XAI_VIDEO_MODEL,
        message: moderationMessage
          ? `콘텐츠 검토 알림: ${moderationMessage}`
          : undefined,
      };
    }

    if (pollData.status === 'expired') {
      Sentry.captureException(
        new Error(`xAI video generation expired for request ${requestId}`),
        { tags: { context: 'marketing.media.video.poll' } },
      );
      return {
        success: false,
        type: 'video',
        results: [],
        model: pollData.model ?? XAI_VIDEO_MODEL,
        message: 'xAI 비디오 생성이 만료되었습니다. 다시 시도해 주세요.',
      };
    }

    // status is still 'pending' or similar — continue polling
  }

  // Exhausted all poll attempts
  Sentry.captureException(
    new Error(`xAI video poll timed out after ${VIDEO_POLL_MAX_ATTEMPTS} attempts for request ${requestId}`),
    { tags: { context: 'marketing.media.video.poll' } },
  );
  return {
    success: false,
    type: 'video',
    results: [],
    model: XAI_VIDEO_MODEL,
    message: `xAI 비디오 생성 시간 초과 (${VIDEO_POLL_MAX_ATTEMPTS * VIDEO_POLL_INTERVAL_MS / 1000}초). 나중에 다시 시도해 주세요.`,
  };
}

// ── Validation ─────────────────────────────────────────────────────────────

function validateRequest(
  body: MediaGenerateRequest,
): string | null {
  if (body.type !== 'image' && body.type !== 'video') {
    return 'type은 "image" 또는 "video"여야 합니다.';
  }

  if (!body.prompt || body.prompt.trim().length === 0) {
    return 'prompt는 필수입니다.';
  }

  if (body.aspectRatio && !VALID_ASPECT_RATIOS.has(body.aspectRatio)) {
    return `aspectRatio는 ${Array.from(VALID_ASPECT_RATIOS).join(', ')} 중 하나여야 합니다.`;
  }

  if (body.type === 'image') {
    if (body.resolution && !VALID_IMAGE_RESOLUTIONS.has(body.resolution)) {
      return `resolution은 ${Array.from(VALID_IMAGE_RESOLUTIONS).join(', ')} 중 하나여야 합니다.`;
    }
    if (body.n !== undefined && (body.n < MIN_IMAGE_COUNT || body.n > MAX_IMAGE_COUNT)) {
      return `n은 ${MIN_IMAGE_COUNT}~${MAX_IMAGE_COUNT} 사이여야 합니다.`;
    }
  }

  if (body.type === 'video') {
    if (body.duration !== undefined && (body.duration < MIN_VIDEO_DURATION || body.duration > MAX_VIDEO_DURATION)) {
      return `duration은 ${MIN_VIDEO_DURATION}~${MAX_VIDEO_DURATION}초 사이여야 합니다.`;
    }
    if (body.videoResolution && !VALID_VIDEO_RESOLUTIONS.has(body.videoResolution)) {
      return `videoResolution은 ${Array.from(VALID_VIDEO_RESOLUTIONS).join(', ')} 중 하나여야 합니다.`;
    }
  }

  return null;
}

// ── POST /api/marketing/media ──────────────────────────────────────────────

export async function POST(
  request: Request,
): Promise<NextResponse<{ data: MediaGenerateResponse } | ApiErrorBody>> {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError('UNAUTHORIZED', '인증이 필요합니다.', 401);
    }

    // Parse request body
    const body = await request.json() as MediaGenerateRequest;

    // Validate
    const validationError = validateRequest(body);
    if (validationError) {
      return apiError('VALIDATION_ERROR', validationError, 400);
    }

    // API key resolution
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          data: {
            success: false,
            type: body.type,
            results: [],
            model: body.type === 'image' ? XAI_IMAGE_MODEL : XAI_VIDEO_MODEL,
            message: 'xAI API key not configured',
          },
        },
        { status: 503 },
      );
    }

    // Dispatch to image or video generation
    let result: MediaGenerateResponse;

    if (body.type === 'image') {
      result = await generateImages(apiKey, body);
    } else {
      result = await generateVideo(apiKey, body);
    }

    const httpStatus = result.success ? 200 : 502;
    return NextResponse.json({ data: result }, { status: httpStatus });
  } catch (error) {
    return handleApiError(error, 'marketing.media.POST');
  }
}
