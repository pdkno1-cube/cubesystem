import { create } from 'zustand';
import * as Sentry from '@sentry/nextjs';
import type {
  WorkspaceWithStats,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  ApiError,
} from '@/types/workspace';

interface WorkspaceState {
  workspaces: WorkspaceWithStats[];
  selectedWorkspace: WorkspaceWithStats | null;
  isLoading: boolean;
  error: ApiError | null;
  showArchived: boolean;

  setWorkspaces: (workspaces: WorkspaceWithStats[]) => void;
  setSelectedWorkspace: (workspace: WorkspaceWithStats | null) => void;
  setShowArchived: (show: boolean) => void;

  fetchWorkspaces: (includeArchived?: boolean) => Promise<void>;
  fetchWorkspace: (id: string) => Promise<void>;
  createWorkspace: (data: CreateWorkspaceInput) => Promise<WorkspaceWithStats>;
  updateWorkspace: (id: string, data: UpdateWorkspaceInput) => Promise<void>;
  archiveWorkspace: (id: string) => Promise<void>;
  restoreWorkspace: (id: string) => Promise<void>;
}

async function apiFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<{ data?: T; error?: ApiError }> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const json: unknown = await response.json();
  const result = json as { data?: T; error?: ApiError };

  if (!response.ok) {
    return {
      error: result.error ?? {
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred.',
      },
    };
  }

  return result;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  selectedWorkspace: null,
  isLoading: false,
  error: null,
  showArchived: false,

  setWorkspaces: (workspaces) => { set({ workspaces }); },
  setSelectedWorkspace: (workspace) => { set({ selectedWorkspace: workspace }); },
  setShowArchived: (show) => { set({ showArchived: show }); },

  fetchWorkspaces: async (includeArchived) => {
    set({ isLoading: true, error: null });

    const showArchivedParam = includeArchived ?? get().showArchived;
    const url = showArchivedParam
      ? '/api/workspaces?include_archived=true'
      : '/api/workspaces';

    try {
      const result = await apiFetch<{
        data: WorkspaceWithStats[];
        count: number;
      }>(url);

      if (result.error) {
        set({ isLoading: false, error: result.error });
        return;
      }

      set({
        workspaces: result.data?.data ?? [],
        isLoading: false,
      });
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'workspaces.fetchAll' } });
      set({
        isLoading: false,
        error: {
          code: 'NETWORK_ERROR',
          message: '네트워크 오류가 발생했습니다.',
        },
      });
    }
  },

  fetchWorkspace: async (id) => {
    set({ isLoading: true, error: null });

    try {
      const result = await apiFetch<{ data: WorkspaceWithStats }>(
        `/api/workspaces/${id}`,
      );

      if (result.error) {
        set({ isLoading: false, error: result.error });
        return;
      }

      set({
        selectedWorkspace: result.data?.data ?? null,
        isLoading: false,
      });
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'workspaces.fetchOne' } });
      set({
        isLoading: false,
        error: {
          code: 'NETWORK_ERROR',
          message: '네트워크 오류가 발생했습니다.',
        },
      });
    }
  },

  createWorkspace: async (data) => {
    set({ isLoading: true, error: null });

    // Optimistic: create a temporary workspace entry
    const optimisticId = `temp-${Date.now()}`;
    const optimisticWorkspace: WorkspaceWithStats = {
      id: optimisticId,
      name: data.name,
      slug: data.slug ?? data.name.toLowerCase().replace(/\s+/g, '-'),
      description: data.description ?? null,
      icon_url: data.icon ?? null,
      owner_id: '',
      status: 'active',
      is_active: true,
      settings: { category: data.category, icon: data.icon },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      agent_count: 0,
      active_pipeline_count: 0,
      credit_balance: 0,
      member_count: 1,
      category: data.category,
      icon: data.icon,
    };

    const previousWorkspaces = get().workspaces;
    set({ workspaces: [optimisticWorkspace, ...previousWorkspaces] });

    try {
      const result = await apiFetch<{ data: WorkspaceWithStats }>(
        '/api/workspaces',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      );

      if (result.error) {
        // Rollback optimistic update
        set({
          workspaces: previousWorkspaces,
          isLoading: false,
          error: result.error,
        });
        throw new Error(result.error.message);
      }

      const created = result.data?.data;
      if (!created) {
        set({ workspaces: previousWorkspaces, isLoading: false });
        throw new Error('서버로부터 유효한 응답을 받지 못했습니다.');
      }

      // Replace optimistic entry with real data
      set({
        workspaces: get().workspaces.map((ws) =>
          ws.id === optimisticId ? created : ws,
        ),
        isLoading: false,
      });

      return created;
    } catch (err) {
      set({ workspaces: previousWorkspaces, isLoading: false });
      throw err;
    }
  },

  updateWorkspace: async (id, data) => {
    set({ isLoading: true, error: null });

    const previousWorkspaces = get().workspaces;
    const previousSelected = get().selectedWorkspace;

    // Optimistic update
    set({
      workspaces: get().workspaces.map((ws) =>
        ws.id === id
          ? {
              ...ws,
              ...data,
              settings: data.settings ?? ws.settings,
              updated_at: new Date().toISOString(),
            }
          : ws,
      ),
      selectedWorkspace:
        get().selectedWorkspace?.id === id
          ? {
              ...get().selectedWorkspace!,
              ...data,
              settings: data.settings ?? get().selectedWorkspace!.settings,
              updated_at: new Date().toISOString(),
            }
          : get().selectedWorkspace,
    });

    try {
      const result = await apiFetch<{ data: WorkspaceWithStats }>(
        `/api/workspaces/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        },
      );

      if (result.error) {
        set({
          workspaces: previousWorkspaces,
          selectedWorkspace: previousSelected,
          isLoading: false,
          error: result.error,
        });
        return;
      }

      const updated = result.data?.data;
      if (updated) {
        set({
          workspaces: get().workspaces.map((ws) =>
            ws.id === id ? updated : ws,
          ),
          selectedWorkspace:
            get().selectedWorkspace?.id === id
              ? updated
              : get().selectedWorkspace,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'workspaces.update' } });
      set({
        workspaces: previousWorkspaces,
        selectedWorkspace: previousSelected,
        isLoading: false,
        error: {
          code: 'NETWORK_ERROR',
          message: '네트워크 오류가 발생했습니다.',
        },
      });
    }
  },

  archiveWorkspace: async (id) => {
    set({ isLoading: true, error: null });

    const previousWorkspaces = get().workspaces;

    // Optimistic: mark as archived
    set({
      workspaces: get().workspaces.map((ws) =>
        ws.id === id ? { ...ws, status: 'archived' as const } : ws,
      ),
    });

    try {
      const result = await apiFetch<{ success: boolean }>(
        `/api/workspaces/${id}`,
        { method: 'DELETE' },
      );

      if (result.error) {
        set({
          workspaces: previousWorkspaces,
          isLoading: false,
          error: result.error,
        });
        return;
      }

      // If not showing archived, filter out
      if (!get().showArchived) {
        set({
          workspaces: get().workspaces.filter((ws) => ws.id !== id),
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'workspaces.archive' } });
      set({
        workspaces: previousWorkspaces,
        isLoading: false,
        error: {
          code: 'NETWORK_ERROR',
          message: '네트워크 오류가 발생했습니다.',
        },
      });
    }
  },

  restoreWorkspace: async (id) => {
    set({ isLoading: true, error: null });

    const previousWorkspaces = get().workspaces;

    // Optimistic: mark as active
    set({
      workspaces: get().workspaces.map((ws) =>
        ws.id === id ? { ...ws, status: 'active' as const } : ws,
      ),
    });

    try {
      const result = await apiFetch<{ data: WorkspaceWithStats }>(
        `/api/workspaces/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: 'active' }),
        },
      );

      if (result.error) {
        set({
          workspaces: previousWorkspaces,
          isLoading: false,
          error: result.error,
        });
        return;
      }

      const updated = result.data?.data;
      if (updated) {
        set({
          workspaces: get().workspaces.map((ws) =>
            ws.id === id ? updated : ws,
          ),
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'workspaces.restore' } });
      set({
        workspaces: previousWorkspaces,
        isLoading: false,
        error: {
          code: 'NETWORK_ERROR',
          message: '네트워크 오류가 발생했습니다.',
        },
      });
    }
  },
}));
