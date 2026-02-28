'use client';
import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Bot, GitBranch, Plus, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CanvasAgent } from './types';

// ─── AgentPool ─────────────────────────────────────────────────────────────
export interface AgentPoolNodeData extends Record<string, unknown> {
  label: string;
  poolCount: number;
}
export type AgentPoolNodeType = Node<AgentPoolNodeData, 'agentPool'>;

function AgentPoolNodeComponent({ data }: NodeProps<AgentPoolNodeType>) {
  return (
    <div className="min-w-[200px] rounded-2xl border-2 border-dashed border-violet-400 bg-violet-950/80 px-5 py-4 text-center shadow-lg shadow-violet-900/30 backdrop-blur-sm">
      <div className="flex items-center justify-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/30">
          <Bot className="h-4 w-4 text-violet-300" />
        </div>
        <span className="text-sm font-semibold text-violet-200">{data.label}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-white">{data.poolCount}</p>
      <p className="text-xs text-violet-400">미배정 에이전트</p>
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-violet-400 !bg-violet-700" />
    </div>
  );
}
export const AgentPoolNode = memo(AgentPoolNodeComponent);

// ─── Workspace ──────────────────────────────────────────────────────────────
export interface WorkspaceNodeData extends Record<string, unknown> {
  wsId: string;
  label: string;
  slug: string;
  description: string | null;
  agentCount: number;
  activeAgents: number;
  pipelineRunning: number;
  pipelineCompleted: number;
  isActive: boolean;
  onAddAgent: (wsId: string) => void;
  onAddPipeline: (wsId: string) => void;
}
export type WorkspaceNodeType = Node<WorkspaceNodeData, 'workspace'>;

function WorkspaceNodeComponent({ data, selected }: NodeProps<WorkspaceNodeType>) {
  return (
    <div className={cn(
      'min-w-[260px] rounded-2xl border bg-white shadow-lg transition-shadow',
      selected ? 'border-indigo-400 shadow-indigo-200/60 shadow-xl' : 'border-indigo-200 hover:border-indigo-300 hover:shadow-xl'
    )}>
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-indigo-400 !bg-indigo-100" />

      {/* Header */}
      <div className="rounded-t-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏢</span>
            <span className="text-sm font-bold text-white truncate max-w-[160px]">{data.label}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
              onClick={(e) => { e.stopPropagation(); data.onAddAgent(data.wsId); }}
              title="에이전트 배정"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
              onClick={(e) => { e.stopPropagation(); data.onAddPipeline(data.wsId); }}
              title="파이프라인 추가"
            >
              <GitBranch className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100 border-t border-gray-100">
        <div className="flex items-center gap-1.5 px-3 py-2.5">
          <Bot className="h-3.5 w-3.5 text-indigo-500" />
          <div>
            <p className="text-xs font-semibold text-gray-900">{data.agentCount}</p>
            <p className="text-[10px] text-gray-400">에이전트</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2.5">
          <GitBranch className="h-3.5 w-3.5 text-amber-500" />
          <div>
            <p className="text-xs font-semibold text-gray-900">{data.pipelineRunning + data.pipelineCompleted}</p>
            <p className="text-[10px] text-gray-400">파이프라인</p>
          </div>
        </div>
      </div>

      {/* Active indicator */}
      {data.activeAgents > 0 ? (
        <div className="flex items-center gap-1.5 rounded-b-2xl bg-green-50 px-3 py-1.5">
          <Zap className="h-3 w-3 text-green-500" />
          <span className="text-[10px] font-medium text-green-700">{data.activeAgents}개 가동 중</span>
        </div>
      ) : (
        <div className="rounded-b-2xl px-3 py-1.5">
          <span className="text-[10px] text-gray-400">{data.description ?? '설명 없음'}</span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-indigo-400 !bg-indigo-100" />
    </div>
  );
}
export const WorkspaceNode = memo(WorkspaceNodeComponent);

// ─── Agent ──────────────────────────────────────────────────────────────────
export interface AgentNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  model: string;
  category: string;
  status: 'idle' | 'running' | 'paused' | 'error';
  wsId: string;
}
export type AgentNodeType = Node<AgentNodeData, 'agent'>;

const STATUS_CONFIG = {
  idle:    { dot: 'bg-green-400',  text: '대기', bg: 'bg-green-50',  border: 'border-green-200' },
  running: { dot: 'bg-blue-400 animate-pulse', text: '실행중', bg: 'bg-blue-50', border: 'border-blue-200' },
  paused:  { dot: 'bg-amber-400', text: '정지',  bg: 'bg-amber-50', border: 'border-amber-200' },
  error:   { dot: 'bg-red-400',   text: '오류',  bg: 'bg-red-50',   border: 'border-red-200'   },
} satisfies Record<CanvasAgent['status'], { dot: string; text: string; bg: string; border: string }>;

function AgentNodeComponent({ data }: NodeProps<AgentNodeType>) {
  const cfg = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.idle;
  return (
    <div className={cn('min-w-[155px] rounded-xl border bg-white px-3 py-2.5 shadow-md', cfg.border)}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-2 !border-gray-300 !bg-white" />
      <div className="flex items-center gap-2">
        <div className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md', cfg.bg)}>
          <Bot className="h-3.5 w-3.5 text-gray-600" />
        </div>
        <p className="truncate text-xs font-semibold text-gray-900">{data.name}</p>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', cfg.dot)} />
        <span className="text-[10px] text-gray-500 truncate">{cfg.text} · {data.model.split('-').slice(0,2).join('-')}</span>
      </div>
    </div>
  );
}
export const AgentNode = memo(AgentNodeComponent);

// ─── Pipeline ────────────────────────────────────────────────────────────────
export interface PipelineNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  category: string;
  slug: string;
  wsId: string;
}
export type PipelineNodeType = Node<PipelineNodeData, 'pipeline'>;

const PIPELINE_CATEGORY_COLOR: Record<string, string> = {
  planning: 'bg-purple-50 border-purple-200',
  writing: 'bg-blue-50 border-blue-200',
  marketing: 'bg-pink-50 border-pink-200',
  audit: 'bg-red-50 border-red-200',
  devops: 'bg-slate-50 border-slate-200',
  finance: 'bg-green-50 border-green-200',
  general: 'bg-amber-50 border-amber-200',
};
const DEFAULT_PIPELINE_COLOR = 'bg-amber-50 border-amber-200';

function PipelineNodeComponent({ data }: NodeProps<PipelineNodeType>) {
  const colorClass = PIPELINE_CATEGORY_COLOR[data.category] ?? DEFAULT_PIPELINE_COLOR;
  return (
    <div className={cn('min-w-[140px] rounded-xl border px-3 py-2.5 shadow-md', colorClass)}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-2 !border-gray-300 !bg-white" />
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-amber-100">
          <GitBranch className="h-3.5 w-3.5 text-amber-600" />
        </div>
        <p className="truncate text-xs font-semibold text-gray-900">{data.name}</p>
      </div>
      <div className="mt-1 text-[10px] text-gray-500 truncate">{data.category}</div>
    </div>
  );
}
export const PipelineNode = memo(PipelineNodeComponent);
