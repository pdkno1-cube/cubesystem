'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Filter, Bot } from 'lucide-react';
import { useAgentStore } from '@/stores/agent-store';
import { AgentCard } from './agent-card';
import { CreateAgentDialog } from './create-agent-dialog';
import { AssignAgentDialog } from './assign-agent-dialog';
import type { Database } from '@/types/database';

type AgentRow = Database['public']['Tables']['agents']['Row'];
type AssignmentRow = Database['public']['Tables']['agent_assignments']['Row'];

interface AgentWithAssignment extends AgentRow {
  agent_assignments?: Array<
    AssignmentRow & {
      workspaces?: {
        id: string;
        name: string;
        slug: string;
      } | null;
    }
  >;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface AgentPoolClientProps {
  initialAgents: AgentWithAssignment[];
  workspaces: Workspace[];
}

const STATUS_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'pool', label: '미할당' },
  { value: 'active', label: '가동중' },
  { value: 'paused', label: '정지' },
] as const;

const CATEGORY_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'planning', label: '기획토론' },
  { value: 'writing', label: '사업계획서' },
  { value: 'marketing', label: 'OSMU' },
  { value: 'audit', label: '감사행정' },
  { value: 'devops', label: 'DevOps' },
  { value: 'finance', label: '지주회사' },
  { value: 'ocr', label: 'OCR' },
  { value: 'scraping', label: '스크래핑' },
  { value: 'analytics', label: '분석' },
  { value: 'general', label: '일반' },
] as const;

export function AgentPoolClient({
  initialAgents,
  workspaces,
}: AgentPoolClientProps) {
  const { agents, filter, setFilter, fetchAgents, releaseAgent, deleteAgent } =
    useAgentStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);

  // Initialize store with server-fetched data
  useEffect(() => {
    useAgentStore.setState({ agents: initialAgents });
  }, [initialAgents]);

  const displayAgents = agents.length > 0 ? agents : initialAgents;

  const handleAssign = useCallback((agentId: string) => {
    setAssignTarget(agentId);
  }, []);

  const handleRelease = useCallback(
    async (agentId: string, workspaceId: string) => {
      await releaseAgent(agentId, workspaceId);
    },
    [releaseAgent]
  );

  const handleDelete = useCallback(
    async (agentId: string) => {
      await deleteAgent(agentId);
    },
    [deleteAgent]
  );

  const handleCreated = useCallback(() => {
    setIsCreateOpen(false);
    fetchAgents();
  }, [fetchAgents]);

  const handleAssigned = useCallback(() => {
    setAssignTarget(null);
    fetchAgents();
  }, [fetchAgents]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">에이전트 풀</h2>
          <p className="mt-1 text-sm text-gray-500">
            총 {displayAgents.length}개 에이전트
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          에이전트 등록
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <Filter className="h-4 w-4 text-gray-400" />

        {/* Status Filter */}
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter({ status: opt.value })}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter.status === opt.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Category Filter */}
        <select
          value={filter.category}
          onChange={(e) => setFilter({ category: e.target.value })}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Agent Grid */}
      {displayAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-16">
          <Bot className="h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm font-medium text-gray-500">
            등록된 에이전트가 없습니다
          </p>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            첫 에이전트 등록하기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {displayAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onAssign={handleAssign}
              onRelease={handleRelease}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <CreateAgentDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={handleCreated}
      />

      {/* Assign Dialog */}
      <AssignAgentDialog
        open={assignTarget !== null}
        agentId={assignTarget}
        workspaces={workspaces}
        onClose={() => setAssignTarget(null)}
        onAssigned={handleAssigned}
      />
    </div>
  );
}
