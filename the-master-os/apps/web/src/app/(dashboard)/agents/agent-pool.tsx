'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Filter, Bot, Users } from 'lucide-react';
import { useAgentStore } from '@/stores/agent-store';
import { AgentCard } from './agent-card';
import { CreateAgentDialog } from './create-agent-dialog';
import { AssignAgentDialog } from './assign-agent-dialog';
import { PromptEditorDialog } from './prompt-editor-dialog';
import { SwarmTemplateDialog } from '@/components/agents/SwarmTemplateDialog';
import { AgentDetailPanel } from '@/components/agents/AgentDetailPanel';
import { PageHero } from '@/components/ui/PageHero';
import { cn } from '@/lib/utils';
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

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type PoolStatus = 'all' | 'pool' | 'active' | 'paused';

function getAgentPoolStatus(agent: AgentWithAssignment): PoolStatus {
  const activeAssignment = agent.agent_assignments?.find((a) => a.is_active);
  if (!activeAssignment) {
    return 'pool';
  }
  if (
    activeAssignment.status === 'idle' ||
    activeAssignment.status === 'running'
  ) {
    return 'active';
  }
  return 'paused';
}

const STATUS_TABS: Array<{
  value: PoolStatus;
  label: string;
  dotColor: string;
}> = [
  { value: 'all', label: '전체', dotColor: '' },
  { value: 'pool', label: '미배정', dotColor: 'bg-gray-400' },
  { value: 'active', label: '실행중', dotColor: 'bg-green-400' },
  { value: 'paused', label: '정지', dotColor: 'bg-red-400' },
];

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentPoolClient({
  initialAgents,
  workspaces,
}: AgentPoolClientProps) {
  const { agents, filter, setFilter, fetchAgents, releaseAgent, deleteAgent } =
    useAgentStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSwarmOpen, setIsSwarmOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentWithAssignment | null>(null);
  const [promptEditorAgent, setPromptEditorAgent] = useState<AgentWithAssignment | null>(null);

  // Initialize store with server-fetched data
  useEffect(() => {
    useAgentStore.setState({ agents: initialAgents });
  }, [initialAgents]);

  const displayAgents = agents.length > 0 ? agents : initialAgents;

  // Client-side status filter (the API filter only handles category;
  // status is post-processed so we do it client-side for instant tab switching)
  const [statusTab, setStatusTab] = useState<PoolStatus>('all');

  const filteredAgents = useMemo(() => {
    if (statusTab === 'all') {
      return displayAgents;
    }
    return displayAgents.filter(
      (agent) => getAgentPoolStatus(agent) === statusTab
    );
  }, [displayAgents, statusTab]);

  // Count per status for tab badges
  const statusCounts = useMemo(() => {
    const counts: Record<PoolStatus, number> = {
      all: displayAgents.length,
      pool: 0,
      active: 0,
      paused: 0,
    };
    for (const agent of displayAgents) {
      const status = getAgentPoolStatus(agent);
      if (status === 'pool') {
        counts.pool++;
      } else if (status === 'active') {
        counts.active++;
      } else {
        counts.paused++;
      }
    }
    return counts;
  }, [displayAgents]);

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
      // Close detail panel if the deleted agent was selected
      setSelectedAgent((prev) => (prev?.id === agentId ? null : prev));
    },
    [deleteAgent]
  );

  const handleCreated = useCallback(() => {
    setIsCreateOpen(false);
    void fetchAgents();
  }, [fetchAgents]);

  const handleSwarmCreated = useCallback(() => {
    setIsSwarmOpen(false);
    void fetchAgents();
  }, [fetchAgents]);

  const handleAssigned = useCallback(() => {
    setAssignTarget(null);
    void fetchAgents();
  }, [fetchAgents]);

  const handleSelectAgent = useCallback((agent: AgentWithAssignment) => {
    setSelectedAgent(agent);
  }, []);

  const handleEditPrompt = useCallback((agent: AgentWithAssignment) => {
    setPromptEditorAgent(agent);
  }, []);

  const handlePromptSaved = useCallback(() => {
    setPromptEditorAgent(null);
    void fetchAgents();
  }, [fetchAgents]);

  const handleDetailClose = useCallback(() => {
    setSelectedAgent(null);
  }, []);

  const handleDetailAssigned = useCallback(() => {
    void fetchAgents();
    setSelectedAgent(null);
  }, [fetchAgents]);

  const handleDetailReleased = useCallback(() => {
    void fetchAgents();
    setSelectedAgent(null);
  }, [fetchAgents]);

  return (
    <div className="animate-fade-in space-y-6">
      {/* Hero */}
      <PageHero
        badge="에이전트 관리"
        title="에이전트 풀"
        subtitle="AI 에이전트를 생성하고 법인에 배정합니다"
        variant="purple"
        stats={[
          { label: '전체', value: displayAgents.length },
          { label: '가동중', value: statusCounts.active },
          { label: '미배정', value: statusCounts.pool },
        ]}
      />

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setIsSwarmOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Users className="h-4 w-4" />
          스웜 템플릿
        </button>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          에이전트 등록
        </button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <Filter className="h-4 w-4 text-gray-400" />

        {/* Status Tabs */}
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          {STATUS_TABS.map((tab) => {
            const count = statusCounts[tab.value];
            const isActive = statusTab === tab.value;

            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusTab(tab.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {tab.dotColor ? (
                  <span
                    className={cn('h-1.5 w-1.5 rounded-full', tab.dotColor)}
                  />
                ) : null}
                {tab.label}
                <span
                  className={cn(
                    'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px]',
                    isActive
                      ? 'bg-brand-100 text-brand-700'
                      : 'bg-gray-200 text-gray-500'
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
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
      <div
        className={cn(
          'transition-all duration-300',
          selectedAgent ? 'mr-[420px]' : ''
        )}
      >
        {filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-16">
            <Bot className="h-12 w-12 text-gray-300" />
            <p className="mt-4 text-sm font-medium text-gray-500">
              {statusTab !== 'all'
                ? `'${STATUS_TABS.find((t) => t.value === statusTab)?.label ?? ''}' 상태의 에이전트가 없습니다`
                : '등록된 에이전트가 없습니다'}
            </p>
            {statusTab === 'all' ? (
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                첫 에이전트 등록하기
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStatusTab('all')}
                className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                전체 보기
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onAssign={handleAssign}
                onRelease={handleRelease}
                onDelete={handleDelete}
                onSelect={handleSelectAgent}
                onEditPrompt={handleEditPrompt}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedAgent ? (
        <AgentDetailPanel
          agent={selectedAgent}
          workspaces={workspaces}
          onClose={handleDetailClose}
          onAssigned={handleDetailAssigned}
          onReleased={handleDetailReleased}
        />
      ) : null}

      {/* Create Dialog */}
      <CreateAgentDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={handleCreated}
      />

      {/* Swarm Template Dialog */}
      <SwarmTemplateDialog
        open={isSwarmOpen}
        onClose={() => setIsSwarmOpen(false)}
        onCreated={handleSwarmCreated}
      />

      {/* Assign Dialog */}
      <AssignAgentDialog
        open={assignTarget !== null}
        agentId={assignTarget}
        workspaces={workspaces}
        onClose={() => setAssignTarget(null)}
        onAssigned={handleAssigned}
      />

      {/* Prompt Editor Dialog */}
      <PromptEditorDialog
        agent={promptEditorAgent}
        open={promptEditorAgent !== null}
        onClose={() => setPromptEditorAgent(null)}
        onSaved={handlePromptSaved}
      />
    </div>
  );
}
