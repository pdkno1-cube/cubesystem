'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';

// ─── Node data types ─────────────────────────────────────────────

export type WorkspaceNodeData = {
  label: string;
  slug: string;
  description: string | null;
  agentCount: number;
  activeAgents: number;
  isActive: boolean;
};

export type AgentPoolNodeData = {
  label: string;
  poolCount: number;
};

export type WorkspaceNodeType = Node<WorkspaceNodeData, 'workspace'>;
export type AgentPoolNodeType = Node<AgentPoolNodeData, 'agentPool'>;

// ─── WorkspaceNode ───────────────────────────────────────────────

function WorkspaceNodeComponent({ data }: NodeProps<WorkspaceNodeType>) {
  return (
    <div className="min-w-[200px] rounded-xl border border-brand-200 bg-white px-4 py-3 shadow-md transition-shadow hover:shadow-lg">
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-2 !border-brand-400 !bg-brand-100"
      />

      <div className="flex items-center gap-2">
        <span className="text-base" role="img" aria-label="workspace">
          🏢
        </span>
        <span className="text-sm font-semibold text-gray-900 truncate max-w-[140px]">
          {data.label}
        </span>
      </div>

      <p className="mt-1 text-xs text-gray-600">
        에이전트: <span className="font-medium text-brand-700">{data.agentCount}</span>
        /<span className="font-medium text-green-600">{data.activeAgents}</span> 가동
      </p>

      <div className="mt-2 border-t border-gray-100 pt-2">
        <p className="text-xs text-gray-400 truncate max-w-[180px]">
          {data.description ?? '설명 없음'}
        </p>
      </div>
    </div>
  );
}

export const WorkspaceNode = memo(WorkspaceNodeComponent);

// ─── AgentPoolNode ───────────────────────────────────────────────

function AgentPoolNodeComponent({ data }: NodeProps<AgentPoolNodeType>) {
  return (
    <div className="min-w-[180px] rounded-xl border-2 border-dashed border-purple-300 bg-purple-50 px-5 py-3 shadow-sm text-center">
      <div className="flex items-center justify-center gap-2">
        <span className="text-base" role="img" aria-label="agent pool">
          🤖
        </span>
        <span className="text-sm font-semibold text-purple-800">
          {data.label}
        </span>
      </div>

      <p className="mt-1 text-lg font-bold text-purple-700">
        {data.poolCount}
        <span className="ml-1 text-xs font-normal text-purple-500">개</span>
      </p>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-2 !border-purple-400 !bg-purple-200"
      />
    </div>
  );
}

export const AgentPoolNode = memo(AgentPoolNodeComponent);
