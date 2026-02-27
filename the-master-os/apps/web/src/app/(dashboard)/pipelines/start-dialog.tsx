'use client';

import { useState, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Play } from 'lucide-react';
import type { PipelineWithMeta } from './page';

// ---------------------------------------------------------------------------
// Category-specific placeholder text
// ---------------------------------------------------------------------------

const INPUT_PLACEHOLDERS: Record<string, string> = {
  grant_factory: 'AI 솔루션 정부조달 공고 검색',
  document_verification: '사업자등록증 PDF 검증',
  osmu_marketing: '신규 AI 서비스 마케팅 콘텐츠 생성',
  auto_healing: 'API 키 만료 감지',
};

const DEFAULT_PLACEHOLDER = '파이프라인에 전달할 입력 데이터를 입력하세요 (JSON 또는 자연어)';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SimpleWorkspace {
  id: string;
  name: string;
  slug: string;
}

interface StartDialogProps {
  open: boolean;
  pipeline: PipelineWithMeta | null;
  workspaces: SimpleWorkspace[];
  onClose: () => void;
  onExecute: (pipelineId: string, workspaceId: string, inputData: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StartDialog({
  open,
  pipeline,
  workspaces,
  onClose,
  onExecute,
}: StartDialogProps) {
  const [workspaceId, setWorkspaceId] = useState('');
  const [inputData, setInputData] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setWorkspaceId('');
    setInputData('');
    setFormError(null);
    setIsSubmitting(false);
  }, []);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        resetForm();
        onClose();
      }
    },
    [resetForm, onClose],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);

      if (!pipeline) { return; }

      if (!workspaceId) {
        setFormError('워크스페이스를 선택하세요.');
        return;
      }

      if (!inputData.trim()) {
        setFormError('입력 데이터를 입력하세요.');
        return;
      }

      setIsSubmitting(true);

      try {
        await onExecute(pipeline.id, workspaceId, inputData.trim());
        resetForm();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '파이프라인 실행에 실패했습니다.';
        setFormError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [pipeline, workspaceId, inputData, onExecute, resetForm],
  );

  if (!pipeline) { return null; }

  const placeholder = INPUT_PLACEHOLDERS[pipeline.category] ?? DEFAULT_PLACEHOLDER;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              파이프라인 실행
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
            {pipeline.name} 파이프라인을 실행합니다.
          </Dialog.Description>

          {/* Pipeline info */}
          <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">{pipeline.description}</p>
            <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
              <span>스텝 {pipeline.graph_definition?.nodes?.length ?? 0}개</span>
              <span>에이전트 {pipeline.required_agents?.length ?? 0}개</span>
              <span>MCP {pipeline.required_mcps?.length ?? 0}개</span>
            </div>
          </div>

          {/* Error */}
          {formError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Workspace */}
            <div>
              <label
                htmlFor="pipeline-workspace"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                워크스페이스 <span className="text-red-500">*</span>
              </label>
              <select
                id="pipeline-workspace"
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">워크스페이스를 선택하세요</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Input data */}
            <div>
              <label
                htmlFor="pipeline-input"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                입력 데이터 <span className="text-red-500">*</span>
              </label>
              <textarea
                id="pipeline-input"
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder={placeholder}
                rows={4}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                JSON 형식 또는 자연어로 입력할 수 있습니다.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {isSubmitting ? '실행 중...' : '실행'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
