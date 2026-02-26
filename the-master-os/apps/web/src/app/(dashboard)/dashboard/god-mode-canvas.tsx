'use client';

import { useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeMouseHandler,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  WorkspaceNode,
  AgentPoolNode,
  type WorkspaceNodeType,
  type AgentPoolNodeType,
} from './canvas-nodes';
import type { WorkspaceOverview } from './types';

// ─── Props ───────────────────────────────────────────────────────

interface GodModeCanvasProps {
  workspaces: WorkspaceOverview[];
  agentPool: number;
}

// ─── Constants ───────────────────────────────────────────────────

const POOL_NODE_ID = 'agent-pool';
const WORKSPACE_NODE_WIDTH = 220;
const WORKSPACE_NODE_GAP = 40;
const POOL_Y = 30;
const WORKSPACE_Y = 220;

const nodeTypes: NodeTypes = {
  workspace: WorkspaceNode,
  agentPool: AgentPoolNode,
};

// ─── Layout helpers ──────────────────────────────────────────────

function buildNodes(
  workspaces: WorkspaceOverview[],
  agentPool: number
): Node[] {
  const totalWidth =
    workspaces.length * WORKSPACE_NODE_WIDTH +
    (workspaces.length - 1) * WORKSPACE_NODE_GAP;
  const startX = -totalWidth / 2;

  const poolNode: AgentPoolNodeType = {
    id: POOL_NODE_ID,
    type: 'agentPool',
    position: { x: 0, y: POOL_Y },
    data: {
      label: '미할당 에이전트',
      poolCount: agentPool,
    },
    draggable: true,
  };

  const workspaceNodes: WorkspaceNodeType[] = workspaces.map((ws, index) => ({
    id: `ws-${ws.id}`,
    type: 'workspace',
    position: {
      x: startX + index * (WORKSPACE_NODE_WIDTH + WORKSPACE_NODE_GAP),
      y: WORKSPACE_Y,
    },
    data: {
      label: ws.name,
      slug: ws.slug,
      description: ws.description,
      agentCount: ws.agent_count,
      activeAgents: ws.active_agents,
      isActive: ws.is_active,
    },
    draggable: true,
  }));

  return [poolNode, ...workspaceNodes];
}

function buildEdges(workspaces: WorkspaceOverview[]): Edge[] {
  return workspaces.map((ws) => ({
    id: `edge-pool-${ws.id}`,
    source: POOL_NODE_ID,
    target: `ws-${ws.id}`,
    type: 'default',
    animated: true,
    style: {
      stroke: '#a78bfa',
      strokeWidth: 2,
      strokeDasharray: '6 3',
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#a78bfa',
      width: 16,
      height: 16,
    },
  }));
}

// ─── Component ───────────────────────────────────────────────────

export function GodModeCanvas({ workspaces, agentPool }: GodModeCanvasProps) {
  const router = useRouter();

  const nodes = useMemo(
    () => buildNodes(workspaces, agentPool),
    [workspaces, agentPool]
  );

  const edges = useMemo(() => buildEdges(workspaces), [workspaces]);

  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    if (node.type === 'workspace' && node.data && typeof node.data === 'object' && 'slug' in node.data) {
      const slug = (node.data as { slug: string }).slug;
      router.push(`/workspaces/${slug}`);
    }
  }, [router]);

  // ─── Empty state ─────────────────────────────────────────────

  if (workspaces.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-gray-400">
            워크스페이스를 생성하면 여기에 시각화됩니다
          </p>
        </div>
      </div>
    );
  }

  // ─── Canvas ──────────────────────────────────────────────────

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      minZoom={0.3}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      className="bg-gray-50/50"
    >
      <Background color="#e5e7eb" gap={20} size={1} />
      <Controls
        showInteractive={false}
        className="!rounded-lg !border !border-gray-200 !shadow-sm"
      />
    </ReactFlow>
  );
}
