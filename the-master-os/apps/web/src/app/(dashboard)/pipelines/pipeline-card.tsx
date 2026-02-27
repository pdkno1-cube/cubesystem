'use client';

import { Play, Users, Plug, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PipelineWithMeta } from './page';

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------

interface CategoryConfig {
  icon: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  iconBg: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  grant_factory: {
    icon: '\u{1F3DB}\uFE0F', // classical building
    label: '정부조달',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconBg: 'bg-blue-100',
  },
  document_verification: {
    icon: '\u{1F4C4}', // page facing up
    label: '서류검증',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    iconBg: 'bg-emerald-100',
  },
  osmu_marketing: {
    icon: '\u{1F4E2}', // loudspeaker
    label: 'OSMU 마케팅',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    iconBg: 'bg-purple-100',
  },
  auto_healing: {
    icon: '\u{1F527}', // wrench
    label: '자동복구',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    iconBg: 'bg-orange-100',
  },
};

const DEFAULT_CATEGORY: CategoryConfig = {
  icon: '\u{2699}\uFE0F', // gear
  label: '커스텀',
  color: 'text-gray-700',
  bgColor: 'bg-gray-50',
  borderColor: 'border-gray-200',
  iconBg: 'bg-gray-100',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PipelineCardProps {
  pipeline: PipelineWithMeta;
  isExecuting: boolean;
  onStart: (pipeline: PipelineWithMeta) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelineCard({ pipeline, isExecuting, onStart }: PipelineCardProps) {
  const config = CATEGORY_CONFIG[pipeline.category] ?? DEFAULT_CATEGORY;
  const nodeCount = pipeline.graph_definition?.nodes?.length ?? 0;
  const agentCount = pipeline.required_agents?.length ?? 0;
  const mcpCount = pipeline.required_mcps?.length ?? 0;

  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md',
        config.borderColor,
      )}
    >
      {/* Header: Icon + Category badge */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg text-lg',
              config.iconBg,
            )}
          >
            {config.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-gray-900">
              {pipeline.name}
            </h3>
            <span
              className={cn(
                'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium',
                config.bgColor,
                config.color,
              )}
            >
              {config.label}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="mt-3 line-clamp-2 text-xs text-gray-500">
        {pipeline.description}
      </p>

      {/* Metadata badges */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          <span>에이전트 {agentCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <Plug className="h-3.5 w-3.5" />
          <span>MCP {mcpCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          <span>스텝 {nodeCount}</span>
        </div>
      </div>

      {/* Execute button */}
      <div className="mt-4">
        <button
          type="button"
          disabled={isExecuting}
          onClick={() => onStart(pipeline)}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            isExecuting
              ? 'cursor-not-allowed bg-gray-100 text-gray-400'
              : 'bg-brand-600 text-white hover:bg-brand-700',
          )}
        >
          <Play className="h-4 w-4" />
          {isExecuting ? '실행 중...' : '실행'}
        </button>
      </div>
    </div>
  );
}
