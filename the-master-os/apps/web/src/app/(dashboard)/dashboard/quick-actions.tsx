'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Bot,
  GitBranch,
  CalendarDays,
  Plug,
  X,
  Loader2,
} from 'lucide-react';
import * as Sentry from '@sentry/nextjs';

interface CreateWorkspaceFormState {
  name: string;
  description: string;
  isSubmitting: boolean;
  error: string | null;
}

function CreateWorkspaceDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<CreateWorkspaceFormState>({
    name: '',
    description: '',
    isSubmitting: false,
    error: null,
  });

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!form.name.trim()) {
        setForm((prev) => ({ ...prev, error: '이름은 필수입니다.' }));
        return;
      }

      setForm((prev) => ({ ...prev, isSubmitting: true, error: null }));

      try {
        const res = await fetch('/api/workspaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || undefined,
          }),
        });

        if (!res.ok) {
          const body = (await res.json()) as {
            error?: { message?: string };
          };
          const message =
            body.error?.message ?? '워크스페이스 생성에 실패했습니다.';
          setForm((prev) => ({ ...prev, isSubmitting: false, error: message }));
          return;
        }

        onClose();
        router.refresh();
      } catch (error) {
        Sentry.captureException(error, {
          tags: { context: 'dashboard.quickAction.createWorkspace' },
        });
        setForm((prev) => ({
          ...prev,
          isSubmitting: false,
          error: '네트워크 오류가 발생했습니다.',
        }));
      }
    },
    [form.name, form.description, onClose, router],
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            새 워크스페이스 생성
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="ws-name"
              className="block text-sm font-medium text-gray-700"
            >
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              id="ws-name"
              type="text"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="예: 엉클로지텍"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              maxLength={100}
              disabled={form.isSubmitting}
            />
          </div>

          <div>
            <label
              htmlFor="ws-desc"
              className="block text-sm font-medium text-gray-700"
            >
              설명
            </label>
            <textarea
              id="ws-desc"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="워크스페이스에 대한 간단한 설명"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              rows={3}
              maxLength={500}
              disabled={form.isSubmitting}
            />
          </div>

          {form.error ? (
            <p className="text-sm text-red-600">{form.error}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={form.isSubmitting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={form.isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {form.isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              생성
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function QuickActions() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          onClick={() => {
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          새 법인 생성
        </button>

        <Link
          href="/pipelines"
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <GitBranch className="h-4 w-4" />
          파이프라인 실행
        </Link>

        <Link
          href="/agents"
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Bot className="h-4 w-4" />
          에이전트 배정
        </Link>

        <Link
          href="/marketing"
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <CalendarDays className="h-4 w-4" />
          콘텐츠 캘린더
        </Link>

        <Link
          href="/settings"
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Plug className="h-4 w-4" />
          MCP 허브
        </Link>
      </div>

      <CreateWorkspaceDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
        }}
      />
    </>
  );
}
