'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import {
  X,
  Save,
  Play,
  RotateCcw,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Braces,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/stores/agent-store';
import type { Database } from '@/types/database';

type AgentRow = Database['public']['Tables']['agents']['Row'];

// ─── 변수 파싱 ────────────────────────────────────────────────────────────────

const VARIABLE_REGEX = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

function extractVariables(prompt: string): string[] {
  const matches = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(VARIABLE_REGEX.source, 'g');
  while ((match = regex.exec(prompt)) !== null) {
    if (match[1]) {
      matches.add(match[1]);
    }
  }
  return Array.from(matches);
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface TestResult {
  content: string;
  tokens: { input: number; output: number };
  cost: number;
  model: string;
  elapsed_ms: number;
}

interface PromptEditorDialogProps {
  agent: AgentRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export function PromptEditorDialog({
  agent,
  open,
  onClose,
  onSaved,
}: PromptEditorDialogProps) {
  const { updatePrompt } = useAgentStore();

  const originalPrompt = agent?.system_prompt ?? '';
  const [prompt, setPrompt] = useState(originalPrompt);
  const [activeTab, setActiveTab] = useState<'edit' | 'test'>('edit');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 테스트 상태
  const [testMessage, setTestMessage] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 에이전트 변경 시 프롬프트 초기화
  useEffect(() => {
    setPrompt(agent?.system_prompt ?? '');
    setSaveError(null);
    setTestResult(null);
    setTestError(null);
    setActiveTab('edit');
  }, [agent?.id, agent?.system_prompt]);

  const isDirty = prompt !== originalPrompt;
  const variables = useMemo(() => extractVariables(prompt), [prompt]);
  const charCount = prompt.length;

  // ── 저장 ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!agent || !isDirty) { return; }
    if (prompt.trim().length === 0) {
      setSaveError('프롬프트 내용을 입력하세요.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await updatePrompt(agent.id, prompt.trim());
      onSaved();
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'promptEditor.save', agentId: agent.id } });
      setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }, [agent, isDirty, prompt, updatePrompt, onSaved]);

  // ── 초기화 ────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setPrompt(originalPrompt);
    setSaveError(null);
  }, [originalPrompt]);

  // ── 복사 ──────────────────────────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [prompt]);

  // ── 테스트 실행 ───────────────────────────────────────────────────────────

  const handleTest = useCallback(async () => {
    if (!agent || !testMessage.trim()) { return; }

    setIsTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const res = await fetch(`/api/agents/${agent.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_message: testMessage.trim(),
          system_prompt_override: isDirty ? prompt : undefined,
        }),
      });

      const json = await res.json() as {
        data?: TestResult;
        error?: { message: string };
      };

      if (!res.ok || json.error) {
        setTestError(json.error?.message ?? '테스트 실행에 실패했습니다.');
        return;
      }

      if (json.data) {
        setTestResult(json.data);
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'promptEditor.test' } });
      setTestError(err instanceof Error ? err.message : '테스트 실행에 실패했습니다.');
    } finally {
      setIsTesting(false);
    }
  }, [agent, testMessage, isDirty, prompt]);

  // ── 키보드 단축키 ─────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void handleSave();
      }
    },
    [handleSave]
  );

  if (!agent) { return null; }

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) { onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          onKeyDown={handleKeyDown}
          className="fixed left-1/2 top-1/2 z-50 flex h-[90vh] w-[90vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl focus:outline-none"
        >
          {/* ── 헤더 ──────────────────────────────────────────────────────── */}
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100">
                <Braces className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <Dialog.Title className="text-sm font-semibold text-gray-900">
                  프롬프트 편집
                </Dialog.Title>
                <p className="text-xs text-gray-500">
                  {agent.name}
                  <span className="mx-1.5 text-gray-300">·</span>
                  <span className="font-medium text-gray-600">{agent.model}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* 복사 버튼 */}
              <button
                type="button"
                onClick={() => { void handleCopy(); }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? '복사됨' : '복사'}
              </button>

              {/* 초기화 버튼 */}
              <button
                type="button"
                onClick={handleReset}
                disabled={!isDirty}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                원본으로
              </button>

              {/* 저장 버튼 */}
              <button
                type="button"
                onClick={() => { void handleSave(); }}
                disabled={isSaving || !isDirty}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Save className="h-3.5 w-3.5" />}
                {isSaving ? '저장 중...' : '저장 (⌘S)'}
              </button>

              <Dialog.Close asChild>
                <button
                  type="button"
                  className="ml-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* ── 탭 ───────────────────────────────────────────────────────── */}
          <Tabs.Root
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'edit' | 'test')}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Tabs.List className="flex shrink-0 items-center gap-1 border-b border-gray-100 px-6 pt-1">
              <Tabs.Trigger
                value="edit"
                className={cn(
                  'flex items-center gap-1.5 rounded-t-md px-4 py-2.5 text-xs font-medium transition-colors',
                  activeTab === 'edit'
                    ? 'border-b-2 border-brand-600 text-brand-600'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                편집
                {isDirty ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                ) : null}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="test"
                className={cn(
                  'flex items-center gap-1.5 rounded-t-md px-4 py-2.5 text-xs font-medium transition-colors',
                  activeTab === 'test'
                    ? 'border-b-2 border-brand-600 text-brand-600'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <Play className="h-3 w-3" />
                테스트
              </Tabs.Trigger>
            </Tabs.List>

            {/* ── 편집 탭 ────────────────────────────────────────────────── */}
            <Tabs.Content
              value="edit"
              className="flex min-h-0 flex-1 flex-col focus:outline-none"
            >
              {/* 에러 배너 */}
              {saveError ? (
                <div className="mx-6 mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {saveError}
                </div>
              ) : null}

              {/* 텍스트 에디터 */}
              <div className="relative min-h-0 flex-1 overflow-hidden px-6 py-4">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    setSaveError(null);
                  }}
                  spellCheck={false}
                  placeholder="에이전트 시스템 프롬프트를 입력하세요..."
                  className="h-full w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-4 font-mono text-[13px] leading-relaxed text-gray-800 placeholder-gray-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>

              {/* 하단 상태바 */}
              <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-6 py-2.5">
                {/* 감지된 변수 */}
                <div className="flex items-center gap-2">
                  {variables.length > 0 ? (
                    <>
                      <span className="text-[11px] text-gray-400">변수:</span>
                      {variables.map((v) => (
                        <span
                          key={v}
                          className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-amber-700"
                        >
                          {`{{${v}}}`}
                        </span>
                      ))}
                    </>
                  ) : (
                    <span className="text-[11px] text-gray-400">
                      변수 없음 — {'{{variable_name}}'} 형식으로 변수 삽입 가능
                    </span>
                  )}
                </div>

                {/* 글자수 */}
                <div className="flex items-center gap-3 text-[11px] text-gray-400">
                  {isDirty ? (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-600 font-medium">
                      수정됨
                    </span>
                  ) : null}
                  <span>{charCount.toLocaleString()}자</span>
                </div>
              </div>
            </Tabs.Content>

            {/* ── 테스트 탭 ───────────────────────────────────────────────── */}
            <Tabs.Content
              value="test"
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6 focus:outline-none"
            >
              {isDirty ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  저장되지 않은 변경사항이 있습니다. 테스트는 현재 편집 중인 프롬프트로 실행됩니다.
                </div>
              ) : null}

              {/* 테스트 입력 */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700">
                  테스트 메시지
                </label>
                <div className="flex gap-2">
                  <textarea
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        void handleTest();
                      }
                    }}
                    placeholder="에이전트에게 보낼 메시지를 입력하세요... (⌘Enter로 실행)"
                    rows={3}
                    className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 placeholder-gray-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                  <button
                    type="button"
                    onClick={() => { void handleTest(); }}
                    disabled={isTesting || !testMessage.trim()}
                    className="flex shrink-0 items-center gap-2 self-end rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isTesting
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Play className="h-4 w-4" />}
                    {isTesting ? '실행 중...' : '실행'}
                  </button>
                </div>
              </div>

              {/* 테스트 에러 */}
              {testError ? (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {testError}
                </div>
              ) : null}

              {/* 테스트 결과 */}
              {testResult ? (
                <div className="space-y-3">
                  {/* 메타 정보 */}
                  <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2">
                    <span className="text-xs text-gray-500">모델: <span className="font-medium text-gray-700">{testResult.model}</span></span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-500">입력: <span className="font-medium text-gray-700">{testResult.tokens.input.toLocaleString()} 토큰</span></span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-500">출력: <span className="font-medium text-gray-700">{testResult.tokens.output.toLocaleString()} 토큰</span></span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-500">비용: <span className="font-medium text-gray-700">${testResult.cost.toFixed(4)}</span></span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-500">{(testResult.elapsed_ms / 1000).toFixed(1)}초</span>
                  </div>

                  {/* 응답 내용 */}
                  <div className="rounded-xl border border-gray-200 bg-white">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                        <ChevronRight className="h-3.5 w-3.5 text-brand-500" />
                        에이전트 응답
                      </div>
                    </div>
                    <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-relaxed text-gray-800">
                      {testResult.content}
                    </pre>
                  </div>
                </div>
              ) : null}

              {/* 빈 상태 */}
              {!testResult && !testError && !isTesting ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-12">
                  <Play className="h-8 w-8 text-gray-300" />
                  <p className="text-sm text-gray-400">테스트 메시지를 입력하고 실행 버튼을 누르세요</p>
                  <p className="text-xs text-gray-300">⌘Enter로 빠르게 실행</p>
                </div>
              ) : null}
            </Tabs.Content>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
