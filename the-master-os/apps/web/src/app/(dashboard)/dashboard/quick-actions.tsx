'use client';

import Link from 'next/link';
import { Plus, Bot, GitBranch } from 'lucide-react';

export function QuickActions() {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        onClick={() => {
          // TODO: Open workspace create dialog
        }}
      >
        <Plus className="h-4 w-4" />
        새 법인 생성
      </button>

      <Link
        href="/agents"
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        <Bot className="h-4 w-4" />
        에이전트 할당
      </Link>

      <Link
        href="/pipelines"
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        <GitBranch className="h-4 w-4" />
        파이프라인 실행
      </Link>
    </div>
  );
}
