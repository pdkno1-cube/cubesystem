'use client';

import { useMemo, useCallback, useState } from 'react';
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
import * as Sentry from '@sentry/nextjs';
import { Maximize2, X, Bot, Check, GitBranch } from 'lucide-react';
import Link from 'next/link';

import {
  WorkspaceNode,
  AgentPoolNode,
  AgentNode,
  PipelineNode,
  type WorkspaceNodeType,
  type AgentPoolNodeType,
  type AgentNodeType,
  type PipelineNodeType,
} from './canvas-nodes';
import type { WorkspaceOverview, CanvasAgent } from './types';

// ─── Constants ───────────────────────────────────────────────────────────────
const POOL_NODE_ID = 'agent-pool';
const WS_WIDTH = 260;
const WS_GAP = 80;
const AGENT_WIDTH = 155;
const AGENT_GAP = 12;
const POOL_Y = 20;
const WS_Y = 240;
const AGENT_Y = 440;
const PIPELINE_Y = 620;
const PIPELINE_WIDTH = 140;
const PIPELINE_GAP = 12;
const MAX_AGENTS_SHOWN = 4;
const MAX_PIPELINES_SHOWN = 3;

const nodeTypes: NodeTypes = {
  workspace: WorkspaceNode,
  agentPool: AgentPoolNode,
  agent: AgentNode,
  pipeline: PipelineNode,
};

// ─── Layout builders ─────────────────────────────────────────────────────────
function buildNodes(
  workspaces: WorkspaceOverview[],
  agentPool: number,
  onAddAgent: (wsId: string) => void,
  onAddPipeline: (wsId: string) => void,
): Node[] {
  const totalWidth = workspaces.length * WS_WIDTH + (workspaces.length - 1) * WS_GAP;
  const startX = -totalWidth / 2;

  const poolNode: AgentPoolNodeType = {
    id: POOL_NODE_ID,
    type: 'agentPool',
    position: { x: -100, y: POOL_Y },
    data: { label: '미할당 에이전트', poolCount: agentPool },
    draggable: true,
  };

  const wsNodes: WorkspaceNodeType[] = [];
  const agentNodes: AgentNodeType[] = [];
  const pipelineNodes: PipelineNodeType[] = [];

  workspaces.forEach((ws, wsIdx) => {
    const wsX = startX + wsIdx * (WS_WIDTH + WS_GAP);
    const wsCenter = wsX + WS_WIDTH / 2;

    wsNodes.push({
      id: `ws-${ws.id}`,
      type: 'workspace',
      position: { x: wsX, y: WS_Y },
      data: {
        wsId: ws.id,
        label: ws.name,
        slug: ws.slug,
        description: ws.description,
        agentCount: ws.agent_count,
        activeAgents: ws.active_agents,
        pipelineRunning: ws.pipeline_running,
        pipelineCompleted: ws.pipeline_completed,
        isActive: ws.is_active,
        onAddAgent,
        onAddPipeline,
      },
      draggable: true,
    });

    // Agent nodes — FIXED: include wsId in node ID to prevent dedup across workspaces
    const agents = (ws.assigned_agents ?? []).slice(0, MAX_AGENTS_SHOWN);
    const na = agents.length;
    if (na > 0) {
      const aGroupWidth = na * AGENT_WIDTH + (na - 1) * AGENT_GAP;
      const aGroupStartX = wsCenter - aGroupWidth / 2;
      agents.forEach((agent, agentIdx) => {
        agentNodes.push({
          id: `agent-${ws.id}-${agent.id}`,
          type: 'agent',
          position: { x: aGroupStartX + agentIdx * (AGENT_WIDTH + AGENT_GAP), y: AGENT_Y },
          data: { ...agent, wsId: ws.id },
          draggable: true,
        });
      });
    }

    // Pipeline nodes
    const pipelines = (ws.assigned_pipelines ?? []).slice(0, MAX_PIPELINES_SHOWN);
    const np = pipelines.length;
    if (np > 0) {
      const pGroupWidth = np * PIPELINE_WIDTH + (np - 1) * PIPELINE_GAP;
      const pGroupStartX = wsCenter - pGroupWidth / 2;
      pipelines.forEach((pipeline, pIdx) => {
        pipelineNodes.push({
          id: `pipeline-${ws.id}-${pipeline.id}`,
          type: 'pipeline',
          position: { x: pGroupStartX + pIdx * (PIPELINE_WIDTH + PIPELINE_GAP), y: PIPELINE_Y },
          data: { ...pipeline, wsId: ws.id },
          draggable: true,
        });
      });
    }
  });

  return [poolNode, ...wsNodes, ...agentNodes, ...pipelineNodes];
}

function buildEdges(workspaces: WorkspaceOverview[]): Edge[] {
  const edges: Edge[] = [];

  workspaces.forEach((ws) => {
    // Pool → Workspace
    edges.push({
      id: `pool-ws-${ws.id}`,
      source: POOL_NODE_ID,
      target: `ws-${ws.id}`,
      animated: true,
      style: { stroke: '#a78bfa', strokeWidth: 2, strokeDasharray: '6 3' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#a78bfa', width: 14, height: 14 },
    });

    // Workspace → Agent (FIXED: wsId in node ID)
    (ws.assigned_agents ?? []).slice(0, MAX_AGENTS_SHOWN).forEach((agent) => {
      const color = agent.status === 'running' ? '#3b82f6'
        : agent.status === 'error' ? '#ef4444'
        : agent.status === 'paused' ? '#f59e0b'
        : '#22c55e';
      edges.push({
        id: `ws-agent-${ws.id}-${agent.id}`,
        source: `ws-${ws.id}`,
        target: `agent-${ws.id}-${agent.id}`,
        animated: agent.status === 'running',
        style: { stroke: color, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
      });
    });

    // Workspace → Pipeline
    (ws.assigned_pipelines ?? []).slice(0, MAX_PIPELINES_SHOWN).forEach((pipeline) => {
      edges.push({
        id: `ws-pipeline-${ws.id}-${pipeline.id}`,
        source: `ws-${ws.id}`,
        target: `pipeline-${ws.id}-${pipeline.id}`,
        animated: false,
        style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '4 2' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b', width: 12, height: 12 },
      });
    });
  });

  return edges;
}

// ─── Assign Agent Dialog ──────────────────────────────────────────────────────
interface AssignDialogProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onAssigned: () => void;
}

function AssignAgentDialog({ workspaceId, workspaceName, onClose, onAssigned }: AssignDialogProps) {
  const [agents, setAgents] = useState<CanvasAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);

  // Fetch pool agents on mount
  useMemo(() => {
    fetch('/api/agents?status=pool')
      .then((r) => r.json())
      .then((j: { data?: CanvasAgent[] }) => {
        setAgents(j.data ?? []);
        setLoading(false);
      })
      .catch((e: unknown) => {
        Sentry.captureException(e, { tags: { context: 'god-mode-canvas.fetchPoolAgents' } });
        setLoading(false);
      });
  }, []);

  const assign = async (agentId: string) => {
    setAssigning(agentId);
    try {
      await fetch('/api/agents/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, workspace_id: workspaceId }),
      });
      onAssigned();
    } catch (e: unknown) {
      Sentry.captureException(e, { tags: { context: 'god-mode-canvas.assign' } });
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">에이전트 배정</h3>
            <p className="text-xs text-gray-500">{workspaceName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {loading ? (
            <p className="py-4 text-center text-sm text-gray-400">로딩 중...</p>
          ) : agents.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">배정 가능한 에이전트가 없습니다</p>
          ) : (
            agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => { void assign(agent.id); }}
                disabled={assigning === agent.id}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
                  <Bot className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{agent.name}</p>
                  <p className="text-xs text-gray-400">{agent.model}</p>
                </div>
                {assigning === agent.id ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                ) : (
                  <Check className="h-4 w-4 text-gray-300" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Assign Pipeline Dialog ───────────────────────────────────────────────────
interface AssignPipelineDialogProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onAssigned: () => void;
}

interface PipelineBasic {
  id: string;
  name: string;
  category: string;
  slug: string;
}

interface PipelinesApiResponse {
  data?: PipelineBasic[];
}

function AssignPipelineDialog({ workspaceId, workspaceName, onClose, onAssigned }: AssignPipelineDialogProps) {
  const [pipelines, setPipelines] = useState<PipelineBasic[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);

  useMemo(() => {
    fetch('/api/pipelines')
      .then((r) => r.json())
      .then((j: PipelinesApiResponse) => {
        setPipelines(j.data ?? []);
        setLoading(false);
      })
      .catch((e: unknown) => {
        Sentry.captureException(e, { tags: { context: 'god-mode-canvas.fetchPipelines' } });
        setLoading(false);
      });
  }, []);

  const assign = async (pipelineId: string) => {
    setAssigning(pipelineId);
    try {
      await fetch(`/api/workspaces/${workspaceId}/pipelines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_id: pipelineId }),
      });
      onAssigned();
    } catch (e: unknown) {
      Sentry.captureException(e, { tags: { context: 'god-mode-canvas.assignPipeline' } });
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">파이프라인 추가</h3>
            <p className="text-xs text-gray-500">{workspaceName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {loading ? (
            <p className="py-4 text-center text-sm text-gray-400">로딩 중...</p>
          ) : pipelines.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">사용 가능한 파이프라인이 없습니다</p>
          ) : (
            pipelines.map((pipeline) => (
              <button
                key={pipeline.id}
                type="button"
                onClick={() => { void assign(pipeline.id); }}
                disabled={assigning === pipeline.id}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 text-left transition-colors hover:border-amber-300 hover:bg-amber-50 disabled:opacity-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                  <GitBranch className="h-4 w-4 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{pipeline.name}</p>
                  <p className="text-xs text-gray-400">{pipeline.category}</p>
                </div>
                {assigning === pipeline.id ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                ) : (
                  <Check className="h-4 w-4 text-gray-300" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface GodModeCanvasProps {
  workspaces: WorkspaceOverview[];
  agentPool: number;
  isFullscreen?: boolean;
}

export function GodModeCanvas({ workspaces, agentPool, isFullscreen = false }: GodModeCanvasProps) {
  const router = useRouter();
  const [assignTarget, setAssignTarget] = useState<{ id: string; name: string } | null>(null);
  const [pipelineAssignTarget, setPipelineAssignTarget] = useState<{ id: string; name: string } | null>(null);

  const handleAddAgent = useCallback((wsId: string) => {
    const ws = workspaces.find((w) => w.id === wsId);
    if (ws) { setAssignTarget({ id: wsId, name: ws.name }); }
  }, [workspaces]);

  const handleAddPipeline = useCallback((wsId: string) => {
    const ws = workspaces.find((w) => w.id === wsId);
    if (ws) { setPipelineAssignTarget({ id: wsId, name: ws.name }); }
  }, [workspaces]);

  const nodes = useMemo(
    () => buildNodes(workspaces, agentPool, handleAddAgent, handleAddPipeline),
    [workspaces, agentPool, handleAddAgent, handleAddPipeline],
  );
  const edges = useMemo(() => buildEdges(workspaces), [workspaces]);

  const handleNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    if (node.type === 'workspace') {
      const d = node.data as { slug: string };
      router.push(`/workspaces/${d.slug}`);
    }
  }, [router]);

  if (workspaces.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">워크스페이스를 생성하면 여기에 시각화됩니다</p>
      </div>
    );
  }

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-gray-50"
      >
        <Background color="#e5e7eb" gap={20} size={1} />
        <Controls showInteractive={false} className="!rounded-xl !border !border-gray-200 !shadow-sm" />

        {/* Full-screen toggle */}
        {!isFullscreen ? (
          <Link
            href="/god-mode"
            className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 backdrop-blur-sm transition-colors hover:bg-white"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            전체화면
          </Link>
        ) : null}
      </ReactFlow>

      {assignTarget ? (
        <AssignAgentDialog
          workspaceId={assignTarget.id}
          workspaceName={assignTarget.name}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => { setAssignTarget(null); router.refresh(); }}
        />
      ) : null}

      {pipelineAssignTarget ? (
        <AssignPipelineDialog
          workspaceId={pipelineAssignTarget.id}
          workspaceName={pipelineAssignTarget.name}
          onClose={() => setPipelineAssignTarget(null)}
          onAssigned={() => { setPipelineAssignTarget(null); router.refresh(); }}
        />
      ) : null}
    </>
  );
}
