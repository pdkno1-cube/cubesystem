import { create } from 'zustand';
import * as Sentry from '@sentry/nextjs';
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

interface AgentFilter {
  status: 'all' | 'pool' | 'active' | 'paused';
  category: string;
}

interface CreateAgentData {
  name: string;
  description?: string | null;
  icon?: string | null;
  category: AgentRow['category'];
  model_provider?: AgentRow['model_provider'];
  model?: string;
  system_prompt: string;
  parameters?: Record<string, unknown>;
  cost_per_run?: number;
}

interface AgentState {
  agents: AgentWithAssignment[];
  filter: AgentFilter;
  isLoading: boolean;
  error: string | null;

  fetchAgents: (filter?: Partial<AgentFilter>) => Promise<void>;
  createAgent: (data: CreateAgentData) => Promise<AgentWithAssignment>;
  assignAgent: (agentId: string, workspaceId: string, posX?: number, posY?: number) => Promise<void>;
  releaseAgent: (agentId: string, workspaceId: string) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<void>;
  setFilter: (filter: Partial<AgentFilter>) => void;
}

async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<{ data?: T; error?: { code: string; message: string } }> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  const json: unknown = await response.json();
  const result = json as {
    data?: T;
    error?: { code: string; message: string };
  };

  if (!response.ok) {
    return {
      error: result.error ?? {
        code: 'UNKNOWN_ERROR',
        message: '알 수 없는 오류가 발생했습니다.',
      },
    };
  }

  return result;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  filter: { status: 'all', category: 'all' },
  isLoading: false,
  error: null,

  fetchAgents: async (filterOverride) => {
    const currentFilter = { ...get().filter, ...filterOverride };
    set({ isLoading: true, error: null });

    try {
      const params = new URLSearchParams();
      if (currentFilter.status !== 'all') {
        params.set('status', currentFilter.status);
      }
      if (currentFilter.category !== 'all') {
        params.set('category', currentFilter.category);
      }

      const queryStr = params.toString();
      const url = `/api/agents${queryStr ? `?${queryStr}` : ''}`;

      const result = await apiFetch<AgentWithAssignment[]>(url);

      if (result.error) {
        set({ isLoading: false, error: result.error.message });
        return;
      }

      set({
        agents: result.data ?? [],
        filter: currentFilter,
        isLoading: false,
      });
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'agents.fetchAll' } });
      set({ isLoading: false, error: '에이전트 목록을 불러오는 데 실패했습니다.' });
    }
  },

  createAgent: async (data) => {
    set({ isLoading: true, error: null });

    try {
      const result = await apiFetch<AgentWithAssignment>('/api/agents', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      if (result.error) {
        set({ isLoading: false, error: result.error.message });
        throw new Error(result.error.message);
      }

      const newAgent = result.data as AgentWithAssignment;

      // Optimistic update: add to list
      set((state) => ({
        agents: [{ ...newAgent, agent_assignments: [] }, ...state.agents],
        isLoading: false,
      }));

      return newAgent;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  assignAgent: async (agentId, workspaceId, posX = 0, posY = 0) => {
    const prevAgents = get().agents;

    // Optimistic update
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              agent_assignments: [
                {
                  id: `temp-${Date.now()}`,
                  agent_id: agentId,
                  workspace_id: workspaceId,
                  assigned_by: '',
                  position_x: posX,
                  position_y: posY,
                  config_override: {},
                  status: 'idle' as const,
                  is_active: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  deleted_at: null,
                },
              ],
            }
          : a
      ),
    }));

    try {
      const result = await apiFetch('/api/agents/assign', {
        method: 'POST',
        body: JSON.stringify({
          agent_id: agentId,
          workspace_id: workspaceId,
          position_x: posX,
          position_y: posY,
        }),
      });

      if (result.error) {
        // Rollback on error
        set({ agents: prevAgents, error: result.error.message });
        return;
      }

      // Re-fetch to get fresh data
      await get().fetchAgents();
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'agents.assign' } });
      set({ agents: prevAgents, error: '에이전트 할당에 실패했습니다.' });
    }
  },

  releaseAgent: async (agentId, workspaceId) => {
    const prevAgents = get().agents;

    // Optimistic update: remove assignment
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              agent_assignments: (a.agent_assignments ?? []).filter(
                (assign) => !(assign.workspace_id === workspaceId && assign.is_active)
              ),
            }
          : a
      ),
    }));

    try {
      const result = await apiFetch('/api/agents/release', {
        method: 'POST',
        body: JSON.stringify({
          agent_id: agentId,
          workspace_id: workspaceId,
        }),
      });

      if (result.error) {
        set({ agents: prevAgents, error: result.error.message });
        return;
      }

      await get().fetchAgents();
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'agents.release' } });
      set({ agents: prevAgents, error: '에이전트 회수에 실패했습니다.' });
    }
  },

  deleteAgent: async (agentId) => {
    const prevAgents = get().agents;

    // Optimistic update
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== agentId),
    }));

    try {
      const result = await apiFetch(`/api/agents/${agentId}`, {
        method: 'DELETE',
      });

      if (result.error) {
        set({ agents: prevAgents, error: result.error.message });
      }
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'agents.delete' } });
      set({ agents: prevAgents, error: '에이전트 삭제에 실패했습니다.' });
    }
  },

  setFilter: (filter) => {
    const newFilter = { ...get().filter, ...filter };
    set({ filter: newFilter });
    get().fetchAgents(newFilter);
  },
}));
