'use client';

import Link from 'next/link';
import { Bot, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentSummaryProps {
  total: number;
  pool: number;
  active: number;
  paused: number;
  categoryBreakdown: Record<string, number>;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  planning: { label: '기획토론', color: 'bg-purple-500' },
  writing: { label: '사업계획서', color: 'bg-blue-500' },
  marketing: { label: 'OSMU', color: 'bg-pink-500' },
  audit: { label: '감사행정', color: 'bg-amber-500' },
  devops: { label: 'DevOps', color: 'bg-green-500' },
  ocr: { label: 'OCR', color: 'bg-cyan-500' },
  scraping: { label: '스크래핑', color: 'bg-orange-500' },
  analytics: { label: '분석', color: 'bg-indigo-500' },
  finance: { label: '지주회사', color: 'bg-emerald-500' },
  general: { label: '일반', color: 'bg-gray-500' },
};

const STATUS_ITEMS: Array<{
  key: 'pool' | 'active' | 'paused';
  label: string;
  dotColor: string;
}> = [
  { key: 'pool', label: '미할당', dotColor: 'bg-gray-400' },
  { key: 'active', label: '가동중', dotColor: 'bg-green-400' },
  { key: 'paused', label: '정지', dotColor: 'bg-red-400' },
];

export function AgentSummary({
  total,
  pool,
  active,
  paused,
  categoryBreakdown,
}: AgentSummaryProps) {
  const statusCounts = { pool, active, paused };

  // Sort categories by count descending
  const sortedCategories = Object.entries(categoryBreakdown).sort(
    ([, a], [, b]) => b - a
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          에이전트 풀 요약
        </h3>
        <Link
          href="/agents"
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          전체보기
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Status Summary */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {STATUS_ITEMS.map((item) => (
          <div
            key={item.key}
            className="rounded-lg border border-gray-100 p-3 text-center"
          >
            <div className="flex items-center justify-center gap-1.5">
              <span
                className={cn('h-2 w-2 rounded-full', item.dotColor)}
              />
              <span className="text-xs text-gray-500">{item.label}</span>
            </div>
            <p className="mt-1 text-lg font-bold text-gray-900">
              {statusCounts[item.key]}
            </p>
          </div>
        ))}
      </div>

      {/* Category Breakdown - Horizontal Bars */}
      <div className="mt-5">
        <p className="mb-3 text-xs font-medium text-gray-500">
          카테고리별 비율 (총 {total})
        </p>

        {sortedCategories.length === 0 ? (
          <div className="flex flex-col items-center py-6">
            <Bot className="h-8 w-8 text-gray-300" />
            <p className="mt-2 text-xs text-gray-400">등록된 에이전트 없음</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sortedCategories.map(([category, count]) => {
              const config = CATEGORY_LABELS[category] ?? {
                label: category,
                color: 'bg-gray-500',
              };
              const percentage = total > 0 ? (count / total) * 100 : 0;

              return (
                <div key={category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-700">
                      {config.label}
                    </span>
                    <span className="text-gray-500">
                      {count}개 ({percentage.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        config.color
                      )}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
