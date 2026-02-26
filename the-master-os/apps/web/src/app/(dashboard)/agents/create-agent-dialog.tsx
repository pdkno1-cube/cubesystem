'use client';

import { useState, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus } from 'lucide-react';
import { useAgentStore } from '@/stores/agent-store';
import type { Database } from '@/types/database';

type AgentCategory = Database['public']['Tables']['agents']['Row']['category'];
type ModelProvider =
  Database['public']['Tables']['agents']['Row']['model_provider'];

interface CreateAgentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const CATEGORIES: Array<{ value: AgentCategory; label: string }> = [
  { value: 'planning', label: '기획토론' },
  { value: 'writing', label: '사업계획서' },
  { value: 'marketing', label: 'OSMU 마케팅' },
  { value: 'audit', label: '감사행정' },
  { value: 'devops', label: 'DevOps' },
  { value: 'ocr', label: 'OCR' },
  { value: 'scraping', label: '스크래핑' },
  { value: 'analytics', label: '분석' },
  { value: 'finance', label: '지주회사' },
  { value: 'general', label: '일반' },
];

const MODELS: Array<{
  provider: ModelProvider;
  name: string;
  label: string;
}> = [
  { provider: 'anthropic', name: 'claude-opus', label: 'Claude Opus' },
  { provider: 'anthropic', name: 'claude-sonnet', label: 'Claude Sonnet' },
  { provider: 'anthropic', name: 'claude-haiku', label: 'Claude Haiku' },
  { provider: 'openai', name: 'gpt-4o', label: 'GPT-4o' },
  { provider: 'openai', name: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { provider: 'google', name: 'gemini-pro', label: 'Gemini Pro' },
  { provider: 'local', name: 'local-llm', label: '로컬 LLM' },
];

interface FormState {
  name: string;
  description: string;
  category: AgentCategory;
  modelIndex: number;
  systemPrompt: string;
}

export function CreateAgentDialog({
  open,
  onClose,
  onCreated,
}: CreateAgentDialogProps) {
  const { createAgent } = useAgentStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    name: '',
    description: '',
    category: 'general',
    modelIndex: 1, // Claude Sonnet default
    systemPrompt: '',
  });

  const resetForm = useCallback(() => {
    setForm({
      name: '',
      description: '',
      category: 'general',
      modelIndex: 1,
      systemPrompt: '',
    });
    setFormError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);

      if (!form.name.trim()) {
        setFormError('에이전트 이름을 입력하세요.');
        return;
      }
      if (!form.systemPrompt.trim()) {
        setFormError('시스템 프롬프트를 입력하세요.');
        return;
      }

      const selectedModel = MODELS[form.modelIndex];
      if (!selectedModel) {
        setFormError('모델을 선택하세요.');
        return;
      }

      setIsSubmitting(true);

      try {
        await createAgent({
          name: form.name.trim(),
          description: form.description.trim() || null,
          category: form.category,
          model_provider: selectedModel.provider,
          model: selectedModel.name,
          system_prompt: form.systemPrompt.trim(),
        });

        resetForm();
        onCreated();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '에이전트 생성에 실패했습니다.';
        setFormError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, createAgent, resetForm, onCreated]
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        resetForm();
        onClose();
      }
    },
    [resetForm, onClose]
  );

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              에이전트 등록
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
            새로운 AI 에이전트를 등록합니다.
          </Dialog.Description>

          {/* Error */}
          {formError ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Name */}
            <div>
              <label
                htmlFor="agent-name"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                id="agent-name"
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="예: OptimistAgent"
                maxLength={100}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {/* Category */}
            <div>
              <label
                htmlFor="agent-category"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                카테고리 <span className="text-red-500">*</span>
              </label>
              <select
                id="agent-category"
                value={form.category}
                onChange={(e) =>
                  updateField('category', e.target.value as AgentCategory)
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="agent-description"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                역할 설명
              </label>
              <input
                id="agent-description"
                type="text"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="예: 사업 아이디어의 긍정적 측면 분석"
                maxLength={500}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {/* Model */}
            <div>
              <label
                htmlFor="agent-model"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                사용 모델 <span className="text-red-500">*</span>
              </label>
              <select
                id="agent-model"
                value={form.modelIndex}
                onChange={(e) =>
                  updateField('modelIndex', Number(e.target.value))
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {MODELS.map((model, idx) => (
                  <option key={model.name} value={idx}>
                    {model.label} ({model.provider})
                  </option>
                ))}
              </select>
            </div>

            {/* System Prompt */}
            <div>
              <label
                htmlFor="agent-prompt"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                시스템 프롬프트 <span className="text-red-500">*</span>
              </label>
              <textarea
                id="agent-prompt"
                value={form.systemPrompt}
                onChange={(e) => updateField('systemPrompt', e.target.value)}
                placeholder="에이전트의 역할과 행동 지침을 입력하세요..."
                rows={4}
                required
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
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
                <Plus className="h-4 w-4" />
                {isSubmitting ? '등록 중...' : '등록하기'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
