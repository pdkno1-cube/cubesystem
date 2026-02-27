'use client';

import { useState, useCallback } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  MessageSquare,
  Plus,
  Bot,
  CheckCircle2,
  Loader2,
  X,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DebateTimeline } from '@/components/debates/DebateTimeline';
import type { DebateMessage } from '@/components/debates/DebateMessageBubble';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentSummary {
  id: string;
  name: string;
  icon: string | null;
  category: string;
}

interface DebateListItem {
  id: string;
  workspace_id: string;
  topic: string;
  status: string;
  summary: string | null;
  conclusion: string | null;
  created_at: string;
  agents: AgentSummary[];
  message_count: number;
}

interface DebateDetail {
  id: string;
  workspace_id: string;
  topic: string;
  status: string;
  summary: string | null;
  conclusion: string | null;
  created_at: string;
  messages: DebateMessage[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DebatesClientProps {
  initialDebates: DebateListItem[];
  workspaceId: string;
  availableAgents: AgentSummary[];
}

// ---------------------------------------------------------------------------
// Role config
// ---------------------------------------------------------------------------

const ROLE_RING_COLORS: Record<string, string> = {
  optimist: 'ring-green-500',
  pessimist: 'ring-red-500',
  realist: 'ring-blue-500',
  critic: 'ring-amber-500',
};

const CATEGORY_ICON_COLORS: Record<string, string> = {
  planning: 'bg-purple-500',
  writing: 'bg-blue-500',
  marketing: 'bg-pink-500',
  audit: 'bg-amber-500',
  devops: 'bg-green-500',
  ocr: 'bg-cyan-500',
  scraping: 'bg-orange-500',
  analytics: 'bg-indigo-500',
  finance: 'bg-emerald-500',
  general: 'bg-gray-500',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DebatesClient({
  initialDebates,
  workspaceId,
  availableAgents,
}: DebatesClientProps) {
  const [debates, setDebates] = useState<DebateListItem[]>(initialDebates);
  const [selectedDebate, setSelectedDebate] = useState<DebateDetail | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'concluded'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Filtered debates
  const filteredDebates = debates.filter((d) => {
    if (statusFilter !== 'all' && d.status !== statusFilter) {
      return false;
    }
    if (searchTerm && !d.topic.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Fetch debate detail
  const handleSelectDebate = useCallback(async (debateId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/debates/${debateId}`);
      if (!res.ok) {
        throw new Error('Failed to fetch debate detail');
      }
      const json: unknown = await res.json();
      const result = json as { data?: DebateDetail };
      if (result.data) {
        setSelectedDebate(result.data);
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'debates.select' } });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create new debate
  const handleCreateDebate = useCallback(
    async (topic: string, agentIds: string[]) => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/debates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace_id: workspaceId,
            topic,
            agent_ids: agentIds,
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to create debate');
        }

        // Refresh list
        const listRes = await fetch(
          `/api/debates?workspace_id=${workspaceId}`
        );
        if (listRes.ok) {
          const json: unknown = await listRes.json();
          const result = json as { data?: DebateListItem[] };
          setDebates(result.data ?? []);
        }

        setIsCreateOpen(false);
      } catch (err) {
        Sentry.captureException(err, { tags: { context: 'debates.create' } });
      } finally {
        setIsLoading(false);
      }
    },
    [workspaceId]
  );

  const handleBack = useCallback(() => {
    setSelectedDebate(null);
  }, []);

  // Show detail view
  if (selectedDebate) {
    return (
      <div className="animate-fade-in">
        <DebateTimeline debate={selectedDebate} onBack={handleBack} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">다중 페르소나 토론</h2>
          <p className="mt-1 text-sm text-gray-500">
            에이전트들이 다양한 관점에서 토론하는 뷰어
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          새 토론
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="토론 주제 검색..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          {(['all', 'active', 'concluded'] as const).map((status) => {
            const labels: Record<string, string> = {
              all: '전체',
              active: '진행중',
              concluded: '완료',
            };

            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  statusFilter === status
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {labels[status]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : null}

      {/* Debate List */}
      {!isLoading && filteredDebates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-16">
          <MessageSquare className="h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm font-medium text-gray-500">
            {searchTerm || statusFilter !== 'all'
              ? '검색 결과가 없습니다'
              : '아직 토론이 없습니다'}
          </p>
          {!searchTerm && statusFilter === 'all' ? (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              첫 토론 시작하기
            </button>
          ) : null}
        </div>
      ) : null}

      {!isLoading && filteredDebates.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredDebates.map((debate) => (
            <DebateCard
              key={debate.id}
              debate={debate}
              onSelect={handleSelectDebate}
            />
          ))}
        </div>
      ) : null}

      {/* Create Dialog */}
      {isCreateOpen ? (
        <CreateDebateDialog
          availableAgents={availableAgents}
          onClose={() => setIsCreateOpen(false)}
          onCreate={handleCreateDebate}
          isLoading={isLoading}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DebateCard
// ---------------------------------------------------------------------------

interface DebateCardProps {
  debate: DebateListItem;
  onSelect: (debateId: string) => void;
}

function DebateCard({ debate, onSelect }: DebateCardProps) {
  const isConcluded = debate.status === 'concluded';

  return (
    <div
      className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
      onClick={() => void onSelect(debate.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void onSelect(debate.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Topic */}
      <div className="flex items-start justify-between">
        <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">
          {debate.topic}
        </h3>
        <span
          className={cn(
            'ml-2 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium',
            isConcluded
              ? 'bg-gray-100 text-gray-600'
              : 'bg-green-50 text-green-700'
          )}
        >
          {isConcluded ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            <MessageSquare className="h-3 w-3" />
          )}
          {isConcluded ? '완료' : '진행중'}
        </span>
      </div>

      {/* Agent avatars */}
      <div className="mt-3 flex items-center gap-1">
        {debate.agents.slice(0, 4).map((agent, idx) => {
          const iconColor =
            CATEGORY_ICON_COLORS[agent.category] ?? 'bg-gray-500';
          const roles = ['optimist', 'pessimist', 'realist', 'critic'];
          const role = roles[idx % roles.length] ?? 'optimist';
          const roleRingColor = ROLE_RING_COLORS[role] ?? 'ring-gray-400';

          return (
            <div
              key={agent.id}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full ring-2',
                iconColor,
                roleRingColor
              )}
              title={agent.name}
            >
              <Bot className="h-4 w-4 text-white" />
            </div>
          );
        })}
        {debate.agents.length > 4 ? (
          <span className="ml-1 text-xs text-gray-400">
            +{debate.agents.length - 4}
          </span>
        ) : null}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
        <span>{debate.message_count}개 메시지</span>
        <span>{formatDate(debate.created_at)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateDebateDialog
// ---------------------------------------------------------------------------

interface CreateDebateDialogProps {
  availableAgents: AgentSummary[];
  onClose: () => void;
  onCreate: (topic: string, agentIds: string[]) => void;
  isLoading: boolean;
}

function CreateDebateDialog({
  availableAgents,
  onClose,
  onCreate,
  isLoading,
}: CreateDebateDialogProps) {
  const [topic, setTopic] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  const toggleAgent = useCallback((agentId: string) => {
    setSelectedAgentIds((prev) => {
      if (prev.includes(agentId)) {
        return prev.filter((id) => id !== agentId);
      }
      if (prev.length >= 8) {
        return prev;
      }
      return [...prev, agentId];
    });
  }, []);

  const canSubmit = topic.trim().length > 0 && selectedAgentIds.length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">새 토론 시작</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Topic input */}
        <div className="mt-4">
          <label htmlFor="debate-topic" className="mb-1 block text-sm font-medium text-gray-700">
            토론 주제
          </label>
          <input
            id="debate-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: AI 도입에 따른 조직 변화 전략"
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            maxLength={500}
          />
        </div>

        {/* Agent selection */}
        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            참여 에이전트 선택 ({selectedAgentIds.length}/8, 최소 2명)
          </label>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 p-2">
            {availableAgents.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">
                사용 가능한 에이전트가 없습니다.
              </p>
            ) : (
              <div className="space-y-1">
                {availableAgents.map((agent) => {
                  const isSelected = selectedAgentIds.includes(agent.id);
                  const iconColor =
                    CATEGORY_ICON_COLORS[agent.category] ?? 'bg-gray-500';
                  const roles = ['optimist', 'pessimist', 'realist', 'critic'];
                  const roleIdx = selectedAgentIds.indexOf(agent.id);
                  const assignedRole =
                    roleIdx >= 0 ? roles[roleIdx % roles.length] : null;

                  const roleLabels: Record<string, string> = {
                    optimist: '낙관론자',
                    pessimist: '비관론자',
                    realist: '현실주의자',
                    critic: '비평가',
                  };

                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => toggleAgent(agent.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                        isSelected
                          ? 'bg-brand-50 ring-1 ring-brand-200'
                          : 'hover:bg-gray-50'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white',
                          iconColor
                        )}
                      >
                        <Bot className="h-3.5 w-3.5" />
                      </div>
                      <span className="flex-1 truncate text-sm text-gray-700">
                        {agent.name}
                      </span>
                      {assignedRole ? (
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 text-[10px] font-medium',
                            assignedRole === 'optimist'
                              ? 'bg-green-50 text-green-700'
                              : assignedRole === 'pessimist'
                                ? 'bg-red-50 text-red-700'
                                : assignedRole === 'realist'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-amber-50 text-amber-700'
                          )}
                        >
                          {roleLabels[assignedRole] ?? assignedRole}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onCreate(topic.trim(), selectedAgentIds)}
            disabled={!canSubmit || isLoading}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}
            토론 시작
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return isoStr;
  }
}
