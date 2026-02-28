'use client';

import { useState, useCallback } from 'react';
import * as Sentry from '@sentry/nextjs';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Image, Video, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MediaGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
}

type MediaTab = 'image' | 'video';

interface ImageRequestBody {
  type: 'image';
  prompt: string;
  aspectRatio: string;
  resolution: string;
  n: number;
  referenceImageUrl: string | undefined;
}

interface VideoRequestBody {
  type: 'video';
  prompt: string;
  aspectRatio: string;
  videoResolution: string;
  duration: number;
  referenceImageUrl: string | undefined;
}

interface MediaApiResponse {
  images?: string[];
  videoUrl?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Select options
// ---------------------------------------------------------------------------

interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

const IMAGE_ASPECT_RATIOS: SelectOption<string>[] = [
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9 (Recommended)' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
];

const IMAGE_RESOLUTIONS: SelectOption<string>[] = [
  { value: '1k', label: '1k' },
  { value: '2k', label: '2k' },
];

const IMAGE_COUNTS: SelectOption<number>[] = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
];

const VIDEO_ASPECT_RATIOS: SelectOption<string>[] = [
  { value: '16:9', label: '16:9 (Recommended)' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
];

const VIDEO_RESOLUTIONS: SelectOption<string>[] = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
];

const VIDEO_DURATIONS: SelectOption<number>[] = [
  { value: 5, label: '5\uCD08' },
  { value: 8, label: '8\uCD08' },
  { value: 10, label: '10\uCD08' },
  { value: 15, label: '15\uCD08' },
];

// ---------------------------------------------------------------------------
// Shared field components
// ---------------------------------------------------------------------------

const LABEL_CLASS = 'block text-sm font-medium text-gray-700';
const INPUT_BASE =
  'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={LABEL_CLASS}>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MediaGeneratorDialog({ open, onClose }: MediaGeneratorDialogProps) {
  // Tab
  const [activeTab, setActiveTab] = useState<MediaTab>('image');

  // Shared state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Image form
  const [imagePrompt, setImagePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('1k');
  const [imageCount, setImageCount] = useState(1);
  const [imageRef, setImageRef] = useState('');
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);

  // Video form
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoAspectRatio, setVideoAspectRatio] = useState('16:9');
  const [videoResolution, setVideoResolution] = useState('720p');
  const [videoDuration, setVideoDuration] = useState(10);
  const [videoRef, setVideoRef] = useState('');
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        onClose();
      }
    },
    [onClose],
  );

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setGeneratedImages([]);
    setGeneratedVideo(null);

    try {
      const body: ImageRequestBody | VideoRequestBody =
        activeTab === 'image'
          ? {
              type: 'image',
              prompt: imagePrompt,
              aspectRatio,
              resolution,
              n: imageCount,
              referenceImageUrl: imageRef || undefined,
            }
          : {
              type: 'video',
              prompt: videoPrompt,
              aspectRatio: videoAspectRatio,
              videoResolution,
              duration: videoDuration,
              referenceImageUrl: videoRef || undefined,
            };

      const resp = await fetch('/api/marketing/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errorBody = (await resp.json().catch(() => ({}))) as { error?: string };
        const message = errorBody.error ?? `\uC694\uCCAD \uC2E4\uD328 (${resp.status})`;
        throw new Error(message);
      }

      const data = (await resp.json()) as MediaApiResponse;

      if (data.error) {
        throw new Error(data.error);
      }

      if (activeTab === 'image' && data.images) {
        setGeneratedImages(data.images);
      } else if (activeTab === 'video' && data.videoUrl) {
        setGeneratedVideo(data.videoUrl);
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { context: 'media.generator', mediaType: activeTab },
      });
      const message =
        err instanceof Error ? err.message : '\uBBF8\uB514\uC5B4 \uC0DD\uC131 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [
    activeTab,
    imagePrompt,
    aspectRatio,
    resolution,
    imageCount,
    imageRef,
    videoPrompt,
    videoAspectRatio,
    videoResolution,
    videoDuration,
    videoRef,
  ]);

  const isImageFormValid = imagePrompt.trim().length > 0;
  const isVideoFormValid = videoPrompt.trim().length > 0;
  const canSubmit =
    !isGenerating &&
    (activeTab === 'image' ? isImageFormValid : isVideoFormValid);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              AI \uBBF8\uB514\uC5B4 \uC0DD\uC131
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="mt-1 text-sm text-gray-500">
            xAI Grok Aurora\uB97C \uD65C\uC6A9\uD558\uC5EC \uB9C8\uCF00\uD305 \uC774\uBBF8\uC9C0\uC640 \uC601\uC0C1\uC744 \uC0DD\uC131\uD569\uB2C8\uB2E4.
          </Dialog.Description>

          {/* Tab Selector */}
          <div className="mt-5 flex rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => { setActiveTab('image'); }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                activeTab === 'image'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Image className="h-4 w-4" />
              \uC774\uBBF8\uC9C0 \uC0DD\uC131
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('video'); }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                activeTab === 'video'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Video className="h-4 w-4" />
              \uC601\uC0C1 \uC0DD\uC131
            </button>
          </div>

          {/* Image Tab Form */}
          {activeTab === 'image' ? (
            <div className="mt-5 space-y-4">
              {/* Prompt */}
              <div>
                <FieldLabel htmlFor="img-prompt">\uD504\uB86C\uD504\uD2B8</FieldLabel>
                <textarea
                  id="img-prompt"
                  rows={3}
                  required
                  placeholder="\uB9C8\uCF00\uD305 \uC774\uBBF8\uC9C0\uB97C \uC124\uBA85\uD574\uC8FC\uC138\uC694..."
                  value={imagePrompt}
                  onChange={(e) => { setImagePrompt(e.target.value); }}
                  className={cn(INPUT_BASE, 'resize-none')}
                />
              </div>

              {/* Aspect Ratio + Resolution row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel htmlFor="img-ratio">\uBE44\uC728</FieldLabel>
                  <select
                    id="img-ratio"
                    value={aspectRatio}
                    onChange={(e) => { setAspectRatio(e.target.value); }}
                    className={INPUT_BASE}
                  >
                    {IMAGE_ASPECT_RATIOS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="img-resolution">\uD574\uC0C1\uB3C4</FieldLabel>
                  <select
                    id="img-resolution"
                    value={resolution}
                    onChange={(e) => { setResolution(e.target.value); }}
                    className={INPUT_BASE}
                  >
                    {IMAGE_RESOLUTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Count */}
              <div>
                <FieldLabel htmlFor="img-count">\uC0DD\uC131 \uC218</FieldLabel>
                <select
                  id="img-count"
                  value={imageCount}
                  onChange={(e) => { setImageCount(Number(e.target.value)); }}
                  className={INPUT_BASE}
                >
                  {IMAGE_COUNTS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference image URL */}
              <div>
                <FieldLabel htmlFor="img-ref">\uCC38\uACE0 \uC774\uBBF8\uC9C0 URL</FieldLabel>
                <input
                  id="img-ref"
                  type="url"
                  placeholder="\uC774\uBBF8\uC9C0 \uD3B8\uC9D1 \uC2DC \uC6D0\uBCF8 URL"
                  value={imageRef}
                  onChange={(e) => { setImageRef(e.target.value); }}
                  className={INPUT_BASE}
                />
              </div>

              {/* Generate button */}
              <div>
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => { void handleGenerate(); }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Image className="h-4 w-4" />
                  \uC0DD\uC131\uD558\uAE30
                </button>
                <p className="mt-1.5 text-center text-[11px] text-gray-400">
                  Powered by Grok Aurora
                </p>
              </div>
            </div>
          ) : null}

          {/* Video Tab Form */}
          {activeTab === 'video' ? (
            <div className="mt-5 space-y-4">
              {/* Prompt */}
              <div>
                <FieldLabel htmlFor="vid-prompt">\uD504\uB86C\uD504\uD2B8</FieldLabel>
                <textarea
                  id="vid-prompt"
                  rows={3}
                  required
                  placeholder="\uB9C8\uCF00\uD305 \uC601\uC0C1\uC744 \uC124\uBA85\uD574\uC8FC\uC138\uC694..."
                  value={videoPrompt}
                  onChange={(e) => { setVideoPrompt(e.target.value); }}
                  className={cn(INPUT_BASE, 'resize-none')}
                />
              </div>

              {/* Aspect Ratio + Resolution row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel htmlFor="vid-ratio">\uBE44\uC728</FieldLabel>
                  <select
                    id="vid-ratio"
                    value={videoAspectRatio}
                    onChange={(e) => { setVideoAspectRatio(e.target.value); }}
                    className={INPUT_BASE}
                  >
                    {VIDEO_ASPECT_RATIOS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="vid-resolution">\uD574\uC0C1\uB3C4</FieldLabel>
                  <select
                    id="vid-resolution"
                    value={videoResolution}
                    onChange={(e) => { setVideoResolution(e.target.value); }}
                    className={INPUT_BASE}
                  >
                    {VIDEO_RESOLUTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Duration */}
              <div>
                <FieldLabel htmlFor="vid-duration">\uAE38\uC774</FieldLabel>
                <select
                  id="vid-duration"
                  value={videoDuration}
                  onChange={(e) => { setVideoDuration(Number(e.target.value)); }}
                  className={INPUT_BASE}
                >
                  {VIDEO_DURATIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference image URL */}
              <div>
                <FieldLabel htmlFor="vid-ref">\uCC38\uACE0 \uC774\uBBF8\uC9C0 URL</FieldLabel>
                <input
                  id="vid-ref"
                  type="url"
                  placeholder="\uC774\uBBF8\uC9C0\uB97C \uAE30\uBC18\uC73C\uB85C \uC601\uC0C1 \uC0DD\uC131 \uC2DC URL"
                  value={videoRef}
                  onChange={(e) => { setVideoRef(e.target.value); }}
                  className={INPUT_BASE}
                />
              </div>

              {/* Generate button */}
              <div>
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => { void handleGenerate(); }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Video className="h-4 w-4" />
                  \uC0DD\uC131\uD558\uAE30
                </button>
                <p className="mt-1.5 text-center text-[11px] text-gray-400">
                  Powered by Grok Aurora
                </p>
              </div>
            </div>
          ) : null}

          {/* Loading State */}
          {isGenerating ? (
            <div className="mt-6 flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
              <p className="mt-3 text-sm text-gray-500">
                {activeTab === 'image'
                  ? '\uC0DD\uC131 \uC911...'
                  : '\uC601\uC0C1 \uC0DD\uC131 \uC911... (\uCD5C\uB300 2\uBD84)'}
              </p>
            </div>
          ) : null}

          {/* Error State */}
          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : null}

          {/* Image Results */}
          {!isGenerating && generatedImages.length > 0 ? (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">
                \uC0DD\uC131 \uACB0\uACFC ({generatedImages.length}\uAC1C)
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {generatedImages.map((url, idx) => (
                  <a
                    key={`img-result-${idx}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative overflow-hidden rounded-lg border border-gray-200 transition-shadow hover:shadow-md"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`\uC0DD\uC131 \uC774\uBBF8\uC9C0 ${idx + 1}`}
                      className="h-auto w-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
                      <span className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 opacity-0 shadow transition-opacity group-hover:opacity-100">
                        \uC0C8 \uD0ED\uC5D0\uC11C \uC5F4\uAE30
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {/* Video Result */}
          {!isGenerating && generatedVideo ? (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">
                \uC0DD\uC131 \uACB0\uACFC
              </h3>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  src={generatedVideo}
                  controls
                  className="h-auto w-full"
                >
                  \uBE0C\uB77C\uC6B0\uC800\uAC00 \uBE44\uB514\uC624 \uD0DC\uADF8\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.
                </video>
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
